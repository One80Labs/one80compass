import { canAccessProject, canWriteProject, type Principal } from "../../../packages/authz/src/index";
import type { ReportVersion, StatusReport } from "../../../packages/domain/src/index";
import type { HandlerDeps, HttpResult } from "./router";

type ReportCtx = {
  deps: HandlerDeps;
  principal: Principal;
  method: string;
  path: string;
  body: Record<string, unknown>;
  correlationId: string;
};

/** Draft, review, approve, and publish. A published copy is a new immutable version. */
export async function handleReports(ctx: ReportCtx): Promise<HttpResult | null> {
  const collection = ctx.path.match(/^\/projects\/([^/]+)\/reports$/);
  if (collection && ctx.method === "GET") return listReports(ctx, decodeURIComponent(collection[1]));
  if (collection && ctx.method === "POST") return createReport(ctx, decodeURIComponent(collection[1]));
  const action = ctx.path.match(/^\/projects\/([^/]+)\/reports\/([^/]+)\/(submit|approve|publish|revise)$/);
  if (action && ctx.method === "POST") {
    return transition(ctx, decodeURIComponent(action[1]), decodeURIComponent(action[2]), action[3]);
  }
  const one = ctx.path.match(/^\/projects\/([^/]+)\/reports\/([^/]+)$/);
  if (one && ctx.method === "GET") return getReport(ctx, decodeURIComponent(one[1]), decodeURIComponent(one[2]));
  if (one && ctx.method === "PUT") return updateReport(ctx, decodeURIComponent(one[1]), decodeURIComponent(one[2]));
  return null;
}

async function listReports(ctx: ReportCtx, projectId: string): Promise<HttpResult> {
  const project = await readable(ctx, projectId);
  if (!project) return notFound(ctx.correlationId);
  const reports = await ctx.deps.store.listReports(projectId);
  return json(200, { reports }, ctx.correlationId);
}

async function createReport(ctx: ReportCtx, projectId: string): Promise<HttpResult> {
  const project = await writable(ctx, projectId);
  if (project === "view") return viewOnly(ctx.correlationId);
  if (!project) return notFound(ctx.correlationId);
  const title = text(ctx.body.title, 200);
  if (!title) return validation(ctx.correlationId, "title is required.");
  if (typeof ctx.body.body === "string" && ctx.body.body.length > 20000) return validation(ctx.correlationId, "body is too long.");
  const body = text(ctx.body.body, 20000) ?? "";
  const now = ctx.deps.now().toISOString();
  const report: StatusReport = {
    reportId: ctx.deps.newId(),
    projectId,
    customerId: project.customerId,
    title,
    body,
    status: "draft",
    updatedAt: now,
    createdAt: now,
  };
  await ctx.deps.store.createReport(report);
  await audit(ctx, project.customerId, projectId, "report.drafted", report.reportId, null, { title, status: "draft" });
  return json(201, report, ctx.correlationId);
}

async function getReport(ctx: ReportCtx, projectId: string, reportId: string): Promise<HttpResult> {
  const report = await visible(ctx, projectId, reportId);
  if (!report) return notFound(ctx.correlationId);
  const versions = await ctx.deps.store.listReportVersions(reportId);
  return json(200, { report, versions }, ctx.correlationId);
}

async function updateReport(ctx: ReportCtx, projectId: string, reportId: string): Promise<HttpResult> {
  const report = await visible(ctx, projectId, reportId);
  if (!report) return notFound(ctx.correlationId);
  const allowed = await writable(ctx, projectId);
  if (allowed === "view") return viewOnly(ctx.correlationId);
  if (report.status !== "draft") return conflict(ctx.correlationId, "Only a draft can be edited. Start a revision to change a published report.");
  if (typeof ctx.body.body === "string" && ctx.body.body.length > 20000) return validation(ctx.correlationId, "body is too long.");
  const title = "title" in ctx.body ? text(ctx.body.title, 200) : report.title;
  const body = "body" in ctx.body ? text(ctx.body.body, 20000) ?? "" : report.body;
  if (!title) return validation(ctx.correlationId, "title is required.");
  const next = { ...report, title, body, updatedAt: ctx.deps.now().toISOString() };
  await ctx.deps.store.putReport(next);
  await audit(ctx, report.customerId, projectId, "report.updated", reportId, { title: report.title, body: report.body }, { title, body });
  return json(200, next, ctx.correlationId);
}

async function transition(ctx: ReportCtx, projectId: string, reportId: string, action: string): Promise<HttpResult> {
  const report = await visible(ctx, projectId, reportId);
  if (!report) return notFound(ctx.correlationId);
  const allowed = await writable(ctx, projectId);
  if (allowed === "view") return viewOnly(ctx.correlationId);
  const now = ctx.deps.now().toISOString();
  if (action === "submit" && report.status === "draft") return saveStatus(ctx, report, "in_review", "report.submitted", now);
  if (action === "approve" && report.status === "in_review") return saveStatus(ctx, report, "approved", "report.approved", now);
  if (action === "revise" && report.status === "published") return saveStatus(ctx, report, "draft", "report.revised", now);
  if (action === "publish" && report.status === "approved") {
    const version: ReportVersion = {
      versionId: ctx.deps.newId(),
      reportId,
      projectId,
      customerId: report.customerId,
      title: report.title,
      body: report.body,
      publishedAt: now,
      publishedBy: ctx.principal.userId,
    };
    await ctx.deps.store.putReportVersion(version);
    if (ctx.deps.putReportText) {
      await ctx.deps.putReportText(
        `customers/${report.customerId}/projects/${projectId}/reports/${reportId}/versions/${version.versionId}.md`,
        report.body,
      );
    }
    const published = { ...report, status: "published" as const, updatedAt: now };
    await ctx.deps.store.putReport(published);
    await audit(ctx, report.customerId, projectId, "report.published", reportId, { status: report.status }, { status: "published", versionId: version.versionId });
    return json(200, { report: published, version }, ctx.correlationId);
  }
  return conflict(ctx.correlationId, "That report action is not available from the current status.");
}

async function saveStatus(ctx: ReportCtx, report: StatusReport, status: StatusReport["status"], action: string, now: string): Promise<HttpResult> {
  const next = { ...report, status, updatedAt: now };
  await ctx.deps.store.putReport(next);
  await audit(ctx, report.customerId, report.projectId, action, report.reportId, { status: report.status }, { status });
  return json(200, next, ctx.correlationId);
}

async function audit(ctx: ReportCtx, customerId: string, projectId: string, action: string, targetId: string, before: unknown, after: unknown): Promise<void> {
  await ctx.deps.store.putAudit({
    eventId: ctx.deps.newId(),
    customerId,
    projectId,
    actorUserId: ctx.principal.userId,
    action,
    targetType: "report",
    targetId,
    before,
    after,
    at: ctx.deps.now().toISOString(),
    correlationId: ctx.correlationId,
  });
}

async function visible(ctx: ReportCtx, projectId: string, reportId: string): Promise<StatusReport | null> {
  const project = await readable(ctx, projectId);
  if (!project) return null;
  const report = await ctx.deps.store.getReport(reportId);
  if (!report || report.projectId !== projectId || report.customerId !== project.customerId) return null;
  return report;
}

async function readable(ctx: ReportCtx, projectId: string) {
  const project = await ctx.deps.store.getProject(projectId);
  if (!project) return null;
  const memberships = await ctx.deps.store.listMembershipsForUser(ctx.principal.userId);
  if (!canAccessProject(ctx.principal, project, memberships)) return null;
  return project;
}

async function writable(ctx: ReportCtx, projectId: string) {
  const project = await readable(ctx, projectId);
  if (!project) return null;
  const memberships = await ctx.deps.store.listMembershipsForUser(ctx.principal.userId);
  if (!canWriteProject(ctx.principal, project, memberships)) return "view" as const;
  return project;
}

function viewOnly(correlationId: string): HttpResult {
  return json(403, { code: "VIEW_ONLY", message: "View access can open this project and cannot change it.", correlationId }, correlationId);
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function validation(correlationId: string, message: string): HttpResult {
  return json(400, { code: "VALIDATION", message, correlationId }, correlationId);
}

function conflict(correlationId: string, message: string): HttpResult {
  return json(409, { code: "CONFLICT", message, correlationId }, correlationId);
}

function notFound(correlationId: string): HttpResult {
  return json(404, { code: "NOT_FOUND", message: "Not found.", correlationId }, correlationId);
}

function json(statusCode: number, payload: unknown, correlationId: string): HttpResult {
  const body = payload && typeof payload === "object" ? { ...payload, correlationId } : { correlationId };
  return { statusCode, headers: { "content-type": "application/json", "x-correlation-id": correlationId }, body: JSON.stringify(body) };
}
