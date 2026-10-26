import { adminAccess, type Principal } from "../../../packages/authz/src/index";
import type { IterationChoice, ProjectCatalogs, ProjectSettings } from "../../../packages/domain/src/index";
import { isIsoDate } from "../../../packages/domain/src/schedule";
import type { HandlerDeps, HttpResult } from "./router";

type CatalogCtx = {
  deps: HandlerDeps;
  principal: Principal;
  method: string;
  path: string;
  body: Record<string, unknown>;
  correlationId: string;
};

const ID_MAX = 100;
const NAME_MAX = 80;
const LIST_MAX = 100;
const DURATION_MAX = 3650;

/**
 * `PUT /projects/:projectId/catalogs` replaces the Compass catalogs on a project.
 * Returns null when the path is not that route. Wired beside the plan routes.
 */
export async function handleCatalogs(ctx: CatalogCtx): Promise<HttpResult | null> {
  const match = ctx.path.match(/^\/projects\/([^/]+)\/catalogs$/);
  if (!match || ctx.method !== "PUT") return null;
  return saveCatalogs(ctx, decodeURIComponent(match[1]));
}

async function saveCatalogs(ctx: CatalogCtx, projectId: string): Promise<HttpResult> {
  const forbidden = requireAdmin(ctx);
  if (forbidden) return forbidden;
  const project = await ctx.deps.store.getProject(projectId);
  if (!project) return notFound(ctx.correlationId);
  const existing = await ctx.deps.store.getSettings(projectId);
  if (!existing || existing.recordSource !== "compass") {
    return json(
      409,
      {
        code: "CONFLICT",
        message: "Catalogs can be edited only when the project record source is Compass.",
        correlationId: ctx.correlationId,
      },
      ctx.correlationId,
    );
  }
  const catalogs = parseCatalogs(ctx.body);
  if (!catalogs) {
    return json(
      400,
      {
        code: "VALIDATION",
        message: "Each catalog row needs an id and a name. An iteration needs a start date and a duration in days. A milestone due date is optional.",
        correlationId: ctx.correlationId,
      },
      ctx.correlationId,
    );
  }
  const settings: ProjectSettings = { ...existing, ...catalogs };
  await ctx.deps.store.putSettings(settings);
  await audit(ctx, project.customerId, projectId, "catalogs.updated", projectId, catalogSlice(existing), catalogs);
  return json(200, settings, ctx.correlationId);
}

/** Same audit row the other project routes write: actor, time, and correlation id come from the request. */
async function audit(
  ctx: CatalogCtx,
  customerId: string,
  projectId: string,
  action: string,
  targetId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await ctx.deps.store.putAudit({
    eventId: ctx.deps.newId(),
    customerId,
    projectId,
    actorUserId: ctx.principal.userId,
    action,
    targetType: "project",
    targetId,
    before,
    after,
    at: ctx.deps.now().toISOString(),
    correlationId: ctx.correlationId,
  });
}

function catalogSlice(settings: ProjectSettings): ProjectCatalogs {
  return {
    statusOptions: settings.statusOptions,
    doneStatuses: settings.doneStatuses,
    columns: settings.columns,
    iterations: settings.iterations,
    labels: settings.labels,
    issueTypes: settings.issueTypes,
    priorityOptions: settings.priorityOptions,
    milestones: settings.milestones,
  };
}

function parseCatalogs(body: Record<string, unknown>): ProjectCatalogs | null {
  const statusOptions = namedRows(body.statusOptions);
  const doneStatuses = nameList(body.doneStatuses);
  const columns = nameList(body.columns);
  const iterations = iterationRows(body.iterations);
  const labels = namedRows(body.labels);
  const issueTypes = namedRows(body.issueTypes);
  const priorityOptions = namedRows(body.priorityOptions);
  const milestones = milestoneRows(body.milestones);
  if (!statusOptions || !doneStatuses || !columns || !iterations || !labels || !issueTypes || !priorityOptions || !milestones) return null;
  if (doneStatuses.some((name) => !statusOptions.some((option) => option.name === name))) return null;
  return { statusOptions, doneStatuses, columns, iterations, labels, issueTypes, priorityOptions, milestones };
}

function namedRows(value: unknown): { id: string; name: string }[] | null {
  if (!Array.isArray(value) || value.length > LIST_MAX) return null;
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const rows: { id: string; name: string }[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    const id = boundedText(record.id, ID_MAX);
    const name = boundedText(record.name, NAME_MAX);
    if (!id || !name || seenIds.has(id) || seenNames.has(name)) return null;
    seenIds.add(id);
    seenNames.add(name);
    rows.push({ id, name });
  }
  return rows;
}

function nameList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > LIST_MAX) return null;
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const entry of value) {
    const name = boundedText(entry, NAME_MAX);
    if (!name || seen.has(name)) return null;
    seen.add(name);
    rows.push(name);
  }
  return rows;
}

function iterationRows(value: unknown): IterationChoice[] | null {
  if (!Array.isArray(value) || value.length > LIST_MAX) return null;
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const rows: IterationChoice[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    const id = boundedText(record.id, ID_MAX);
    const title = boundedText(record.title, NAME_MAX);
    const startDate = typeof record.startDate === "string" && isIsoDate(record.startDate) ? record.startDate : null;
    const duration = record.duration;
    if (!id || !title || !startDate || seenIds.has(id) || seenTitles.has(title)) return null;
    if (typeof duration !== "number" || !Number.isInteger(duration) || duration < 1 || duration > DURATION_MAX) return null;
    seenIds.add(id);
    seenTitles.add(title);
    rows.push({ id, title, startDate, duration });
  }
  return rows;
}

function milestoneRows(value: unknown): { id: string; title: string; dueOn: string | null }[] | null {
  if (!Array.isArray(value) || value.length > LIST_MAX) return null;
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const rows: { id: string; title: string; dueOn: string | null }[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    const id = boundedText(record.id, ID_MAX);
    const title = boundedText(record.title, NAME_MAX);
    if (!id || !title || seenIds.has(id) || seenTitles.has(title)) return null;
    let dueOn: string | null;
    if (record.dueOn == null || record.dueOn === "") dueOn = null;
    else if (typeof record.dueOn === "string" && isIsoDate(record.dueOn)) dueOn = record.dueOn;
    else return null;
    seenIds.add(id);
    seenTitles.add(title);
    rows.push({ id, title, dueOn });
  }
  return rows;
}

function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

/** Same administrator check as `requireAdmin` in router.ts. */
function requireAdmin(ctx: CatalogCtx): HttpResult | null {
  const access = adminAccess(ctx.principal);
  if (access === "ok") return null;
  if (access === "mfa_required") {
    return json(403, { code: "MFA_REQUIRED", message: "Administrator actions require MFA.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  return json(403, { code: "FORBIDDEN", message: "Administrator access is required.", correlationId: ctx.correlationId }, ctx.correlationId);
}

function notFound(correlationId: string): HttpResult {
  return json(404, { code: "NOT_FOUND", message: "Not found.", correlationId }, correlationId);
}

function json(statusCode: number, payload: unknown, correlationId: string): HttpResult {
  const body = payload && typeof payload === "object" ? { ...payload, correlationId } : { correlationId };
  return { statusCode, headers: { "content-type": "application/json", "x-correlation-id": correlationId }, body: JSON.stringify(body) };
}
