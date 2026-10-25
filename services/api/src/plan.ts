import { adminAccess, canAccessCustomer, type Principal } from "../../../packages/authz/src/index";
import {
  DEFAULT_COLUMNS,
  DEFAULT_DONE_STATUSES,
  type ProjectSettings,
  type SyncMessage,
  type SyncState,
} from "../../../packages/domain/src/index";
import { projectProgress } from "../../../packages/domain/src/progress";
import type { HandlerDeps, HttpResult } from "./router";

type PlanCtx = {
  deps: HandlerDeps;
  principal: Principal;
  method: string;
  path: string;
  body: Record<string, unknown>;
  correlationId: string;
};

/** Plan, progress, and Kanban routes. Returns null when the path is not one of those routes. */
export async function handlePlan(ctx: PlanCtx): Promise<HttpResult | null> {
  const plan = ctx.path.match(/^\/projects\/([^/]+)\/plan$/);
  if (plan && ctx.method === "GET") return getPlan(ctx, decodeURIComponent(plan[1]));
  const settings = ctx.path.match(/^\/projects\/([^/]+)\/github$/);
  if (settings && ctx.method === "PUT") return saveGithub(ctx, decodeURIComponent(settings[1]));
  const sync = ctx.path.match(/^\/projects\/([^/]+)\/sync$/);
  if (sync && ctx.method === "POST") return requestSync(ctx, decodeURIComponent(sync[1]));
  const override = ctx.path.match(/^\/projects\/([^/]+)\/progress-override$/);
  if (override && ctx.method === "POST") return saveOverride(ctx, decodeURIComponent(override[1]));
  const issue = ctx.path.match(/^\/projects\/([^/]+)\/issues\/([^/]+)$/);
  if (issue && ctx.method === "PATCH") return updateIssue(ctx, decodeURIComponent(issue[1]), decodeURIComponent(issue[2]));
  return null;
}

async function getPlan(ctx: PlanCtx, projectId: string): Promise<HttpResult> {
  const project = await readable(ctx, projectId);
  if (!project) return notFound(ctx.correlationId);
  const settings = await ctx.deps.store.getSettings(projectId);
  const issues = await ctx.deps.store.listIssues(projectId);
  const progress = projectProgress(issues, settings?.doneStatuses ?? [...DEFAULT_DONE_STATUSES]);
  const override = await ctx.deps.store.getOverride(projectId);
  return json(200, { settings, sync: await visibleSync(ctx, projectId, project.customerId, settings), issues, progress, override }, ctx.correlationId);
}

async function saveGithub(ctx: PlanCtx, projectId: string): Promise<HttpResult> {
  if (adminAccess(ctx.principal) !== "ok") {
    return json(403, { code: "FORBIDDEN", message: "Administrator access is required.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const project = await ctx.deps.store.getProject(projectId);
  if (!project) return notFound(ctx.correlationId);
  const owner = nameField(ctx.body.owner);
  const repo = nameField(ctx.body.repo);
  const projectNumber = ctx.body.projectNumber;
  if (!owner || !repo || typeof projectNumber !== "number" || !Number.isInteger(projectNumber) || projectNumber < 1) {
    return json(400, { code: "VALIDATION", message: "owner, repo, and projectNumber are required.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const existing = await ctx.deps.store.getSettings(projectId);
  const settings: ProjectSettings = {
    projectId,
    customerId: project.customerId,
    owner,
    repo,
    projectNumber,
    projectNodeId: existing?.projectNodeId ?? null,
    statusFieldName: existing?.statusFieldName ?? "Status",
    effortFieldName: existing?.effortFieldName ?? "Effort",
    statusFieldId: existing?.statusFieldId ?? null,
    effortFieldId: existing?.effortFieldId ?? null,
    statusOptions: existing?.statusOptions ?? [],
    doneStatuses: existing?.doneStatuses ?? [...DEFAULT_DONE_STATUSES],
    columns: existing?.columns ?? [...DEFAULT_COLUMNS],
  };
  await ctx.deps.store.putSettings(settings);
  await ctx.deps.store.putAudit({
    eventId: ctx.deps.newId(),
    customerId: project.customerId,
    projectId,
    actorUserId: ctx.principal.userId,
    action: "github.mapped",
    targetType: "project",
    targetId: projectId,
    before: existing,
    after: { owner, repo, projectNumber },
    at: ctx.deps.now().toISOString(),
    correlationId: ctx.correlationId,
  });
  return json(200, settings, ctx.correlationId);
}

async function requestSync(ctx: PlanCtx, projectId: string): Promise<HttpResult> {
  const project = await readable(ctx, projectId);
  if (!project) return notFound(ctx.correlationId);
  const settings = await ctx.deps.store.getSettings(projectId);
  if (!settings) return json(400, { code: "VALIDATION", message: "Save the GitHub repository before syncing.", correlationId: ctx.correlationId }, ctx.correlationId);
  if (!ctx.deps.githubConfigured) return notConfigured(ctx.correlationId);
  await ctx.deps.store.putSync(syncRow(projectId, project.customerId, "pending", "Sync requested.", ctx.deps.now().toISOString()));
  await ctx.deps.enqueue({ type: "reconcile", projectId });
  return json(202, { accepted: true }, ctx.correlationId);
}

async function saveOverride(ctx: PlanCtx, projectId: string): Promise<HttpResult> {
  const project = await readable(ctx, projectId);
  if (!project) return notFound(ctx.correlationId);
  const explanation = typeof ctx.body.explanation === "string" ? ctx.body.explanation.trim() : "";
  const percent = ctx.body.percent;
  if (!explanation || explanation.length > 500) {
    return json(400, { code: "VALIDATION", message: "An explanation is required.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (typeof percent !== "number" || !Number.isFinite(percent) || percent < 0 || percent > 100) {
    return json(400, { code: "VALIDATION", message: "percent must be from 0 to 100.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const settings = await ctx.deps.store.getSettings(projectId);
  const calculated = projectProgress(await ctx.deps.store.listIssues(projectId), settings?.doneStatuses ?? [...DEFAULT_DONE_STATUSES]);
  const previous = await ctx.deps.store.getOverride(projectId);
  const override = {
    projectId,
    customerId: project.customerId,
    percent,
    explanation,
    calculatedPercent: calculated.percent,
    actorUserId: ctx.principal.userId,
    at: ctx.deps.now().toISOString(),
  };
  await ctx.deps.store.putOverride(override);
  await ctx.deps.store.putAudit({
    eventId: ctx.deps.newId(),
    customerId: project.customerId,
    projectId,
    actorUserId: ctx.principal.userId,
    action: "progress.overridden",
    targetType: "progress",
    targetId: projectId,
    before: previous,
    after: override,
    at: override.at,
    correlationId: ctx.correlationId,
  });
  return json(200, { override, progress: calculated }, ctx.correlationId);
}

async function updateIssue(ctx: PlanCtx, projectId: string, issueId: string): Promise<HttpResult> {
  const project = await readable(ctx, projectId);
  if (!project) return notFound(ctx.correlationId);
  const issue = await ctx.deps.store.getIssue(projectId, issueId);
  if (!issue || issue.customerId !== project.customerId) return notFound(ctx.correlationId);
  if (!ctx.deps.githubConfigured) return notConfigured(ctx.correlationId);
  const change = issueChange(ctx.body);
  if (!change) return json(400, { code: "VALIDATION", message: "Send a title, status, or effort.", correlationId: ctx.correlationId }, ctx.correlationId);
  const idempotencyKey = typeof ctx.body.idempotencyKey === "string" && ctx.body.idempotencyKey.trim() ? ctx.body.idempotencyKey.trim() : ctx.deps.newId();
  await ctx.deps.store.putSync(syncRow(projectId, project.customerId, "pending", "Sending the change to GitHub.", ctx.deps.now().toISOString()));
  const message: SyncMessage = { type: "update-issue", projectId, issueId, idempotencyKey, ...change };
  await ctx.deps.enqueue(message);
  return json(202, { accepted: true, idempotencyKey }, ctx.correlationId);
}

function issueChange(body: Record<string, unknown>): { title?: string; status?: string; effort?: number | null } | null {
  const change: { title?: string; status?: string; effort?: number | null } = {};
  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 200) return null;
    change.title = body.title.trim();
  }
  if ("status" in body) {
    if (typeof body.status !== "string" || !body.status.trim() || body.status.trim().length > 80) return null;
    change.status = body.status.trim();
  }
  if ("effort" in body) {
    if (body.effort === null) change.effort = null;
    else if (typeof body.effort !== "number" || !Number.isFinite(body.effort) || body.effort < 0) return null;
    else change.effort = body.effort;
  }
  return Object.keys(change).length > 0 ? change : null;
}

async function visibleSync(ctx: PlanCtx, projectId: string, customerId: string, settings: ProjectSettings | null): Promise<SyncState> {
  const now = ctx.deps.now().toISOString();
  if (!settings) return syncRow(projectId, customerId, "not_configured", "Add the GitHub repository for this project.", now);
  if (!ctx.deps.githubConfigured) return syncRow(projectId, customerId, "not_configured", "GitHub App is not configured.", now);
  return (await ctx.deps.store.getSync(projectId)) ?? syncRow(projectId, customerId, "ok", null, now);
}

function syncRow(projectId: string, customerId: string, status: SyncState["status"], detail: string | null, updatedAt: string): SyncState {
  return { projectId, customerId, status, detail, updatedAt };
}

async function readable(ctx: PlanCtx, projectId: string) {
  const project = await ctx.deps.store.getProject(projectId);
  if (!project) return null;
  const memberships = await ctx.deps.store.listMembershipsForUser(ctx.principal.userId);
  if (!canAccessCustomer(ctx.principal, project.customerId, memberships)) return null;
  return project;
}

function nameField(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^[A-Za-z0-9_.-]+$/.test(trimmed) ? trimmed : null;
}

function notConfigured(correlationId: string): HttpResult {
  return json(409, { code: "SYNC_NOT_CONFIGURED", message: "GitHub App is not configured.", correlationId }, correlationId);
}

function notFound(correlationId: string): HttpResult {
  return json(404, { code: "NOT_FOUND", message: "Not found.", correlationId }, correlationId);
}

function json(statusCode: number, payload: unknown, correlationId: string): HttpResult {
  const body = payload && typeof payload === "object" ? { ...payload, correlationId } : { correlationId };
  return { statusCode, headers: { "content-type": "application/json", "x-correlation-id": correlationId }, body: JSON.stringify(body) };
}
