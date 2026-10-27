import { adminAccess, canAccessProject, canWriteProject, type Principal } from "../../../packages/authz/src/index";
import {
  DEFAULT_COLUMNS,
  DEFAULT_DONE_STATUSES,
  type IssueChange,
  type IssueRelationship,
  type PlanIssue,
  type ProjectSettings,
  type SyncMessage,
  type SyncState,
} from "../../../packages/domain/src/index";
import { applyPlanOrder, createdIssueType, hasActiveChildren, parentDoneBlocked, planKind, planRows, type PlanKind } from "../../../packages/domain/src/hierarchy";
import { dependencyCycle, dependencyReview, scheduleConflicts } from "../../../packages/domain/src/dependencies";
import { baselineSnapshot, type BaselineRecord } from "../../../packages/domain/src/baselines";
import { tracedComment } from "../../../packages/domain/src/comments";
import { derivedSchedule, isIsoDate } from "../../../packages/domain/src/schedule";
import { milestoneViews } from "../../../packages/domain/src/milestones";
import { projectProgress } from "../../../packages/domain/src/progress";
import { mergeRiskRegister, riskSeverityFromStore, type RiskRecord } from "../../../packages/domain/src/risks";
import { importCompass } from "../../sync/src/import-compass";
import type { HandlerDeps, HttpResult } from "./router";
import { isConditionalCheckFailed } from "./store";

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
  const imported = ctx.path.match(/^\/projects\/([^/]+)\/import-compass$/);
  if (imported && ctx.method === "POST") return importCompassProject(ctx, decodeURIComponent(imported[1]));
  const sync = ctx.path.match(/^\/projects\/([^/]+)\/sync$/);
  if (sync && ctx.method === "POST") return requestSync(ctx, decodeURIComponent(sync[1]));
  const override = ctx.path.match(/^\/projects\/([^/]+)\/progress-override$/);
  if (override && ctx.method === "POST") return saveOverride(ctx, decodeURIComponent(override[1]));
  const scheduleFields = ctx.path.match(/^\/projects\/([^/]+)\/schedule-fields$/);
  if (scheduleFields && ctx.method === "POST") return ensureScheduleFields(ctx, decodeURIComponent(scheduleFields[1]));
  const planItems = ctx.path.match(/^\/projects\/([^/]+)\/plan-items$/);
  if (planItems && ctx.method === "POST") return createPlanItem(ctx, decodeURIComponent(planItems[1]));
  const removePredecessor = ctx.path.match(/^\/projects\/([^/]+)\/issues\/([^/]+)\/predecessors\/remove$/);
  if (removePredecessor && ctx.method === "POST") return setPredecessor(ctx, decodeURIComponent(removePredecessor[1]), decodeURIComponent(removePredecessor[2]), "remove");
  const addPredecessor = ctx.path.match(/^\/projects\/([^/]+)\/issues\/([^/]+)\/predecessors$/);
  if (addPredecessor && ctx.method === "POST") return setPredecessor(ctx, decodeURIComponent(addPredecessor[1]), decodeURIComponent(addPredecessor[2]), "add");
  const deleteIssue = ctx.path.match(/^\/projects\/([^/]+)\/issues\/([^/]+)\/delete$/);
  if (deleteIssue && ctx.method === "POST") return softDeleteIssue(ctx, decodeURIComponent(deleteIssue[1]), decodeURIComponent(deleteIssue[2]));
  const issue = ctx.path.match(/^\/projects\/([^/]+)\/issues\/([^/]+)$/);
  if (issue && ctx.method === "PATCH") return updateIssue(ctx, decodeURIComponent(issue[1]), decodeURIComponent(issue[2]));
  const confirm = ctx.path.match(/^\/projects\/([^/]+)\/milestones\/([^/]+)\/confirm$/);
  if (confirm && ctx.method === "POST") return confirmMilestone(ctx, decodeURIComponent(confirm[1]), decodeURIComponent(confirm[2]));
  const reopen = ctx.path.match(/^\/projects\/([^/]+)\/milestones\/([^/]+)\/reopen$/);
  if (reopen && ctx.method === "POST") return reopenMilestone(ctx, decodeURIComponent(reopen[1]), decodeURIComponent(reopen[2]));
  const baselineReject = ctx.path.match(/^\/projects\/([^/]+)\/baselines\/([^/]+)\/reject$/);
  if (baselineReject && ctx.method === "POST") return decideBaseline(ctx, decodeURIComponent(baselineReject[1]), decodeURIComponent(baselineReject[2]), "rejected");
  const baselineApprove = ctx.path.match(/^\/projects\/([^/]+)\/baselines\/([^/]+)\/approve$/);
  if (baselineApprove && ctx.method === "POST") return decideBaseline(ctx, decodeURIComponent(baselineApprove[1]), decodeURIComponent(baselineApprove[2]), "approved");
  const baselines = ctx.path.match(/^\/projects\/([^/]+)\/baselines$/);
  if (baselines && ctx.method === "POST") return createBaseline(ctx, decodeURIComponent(baselines[1]));
  const risk = ctx.path.match(/^\/projects\/([^/]+)\/risks\/([^/]+)$/);
  if (risk && ctx.method === "PUT") return saveRisk(ctx, decodeURIComponent(risk[1]), decodeURIComponent(risk[2]));
  const planOrder = ctx.path.match(/^\/projects\/([^/]+)\/plan-order$/);
  if (planOrder && ctx.method === "PUT") return savePlanOrder(ctx, decodeURIComponent(planOrder[1]));
  return null;
}

async function getPlan(ctx: PlanCtx, projectId: string): Promise<HttpResult> {
  const project = await readable(ctx, projectId);
  if (!project) return notFound(ctx.correlationId);
  const settings = await ctx.deps.store.getSettings(projectId);
  let issues = await ctx.deps.store.listIssues(projectId);
  // Older rows predate COMP-N keys. Assign once when the project has a key so edit screens can show them.
  if (project.projectKey) {
    issues = await ensureIssueKeyNumbers(ctx.deps, projectId, issues, settings?.workstreamNumber ?? null);
  }
  const doneStatuses = settings?.doneStatuses ?? [...DEFAULT_DONE_STATUSES];
  const progress = projectProgress(issues, doneStatuses);
  const override = await ctx.deps.store.getOverride(projectId);
  const milestones = milestoneViews(issues, await ctx.deps.store.listMilestones(projectId), doneStatuses, ctx.deps.now().toISOString().slice(0, 10));
  const baselines = (await ctx.deps.store.listBaselines(projectId)).sort(baselineOrder);
  const members = settings?.recordSource === "compass" ? await compassMembers(ctx, project.customerId, projectId) : [];
  const risks = mergeRiskRegister(
    await ctx.deps.store.listRisks(projectId),
    scheduleConflicts(
      issues.map((issue) => ({
        issueId: issue.issueId,
        title: issue.title,
        startDate: issue.startDate,
        finishDate: issue.finishDate,
        predecessorIds: issue.predecessorIds ?? [],
        inProject: issue.inProject,
        archived: issue.archived,
        deletedAt: issue.deletedAt,
      })),
    ),
  ).map((row) => ({ ...row, projectId: row.projectId || projectId, customerId: row.customerId || project.customerId }));
  return json(
    200,
    {
      settings,
      projectKey: project.projectKey,
      sync: await visibleSync(ctx, projectId, project.customerId, settings),
      issues,
      progress,
      override,
      milestones,
      baselines,
      risks,
      members,
    },
    ctx.correlationId,
  );
}

/**
 * Allocates keyNumber for plan rows that never received one.
 * Order follows the Timeline (planRows) so numbers stay stable across reloads.
 */
async function ensureIssueKeyNumbers(
  deps: HandlerDeps,
  projectId: string,
  issues: PlanIssue[],
  workstreamNumber: number | null,
): Promise<PlanIssue[]> {
  const missing = issues.filter((issue) => issue.keyNumber == null && issue.inProject && !issue.archived && !issue.deletedAt);
  if (missing.length === 0) return issues;
  const order = planRows(issues, workstreamNumber).map((row) => row.issueId);
  const rank = new Map(order.map((id, index) => [id, index]));
  const queued = [...missing].sort(
    (left, right) => (rank.get(left.issueId) ?? 1e9) - (rank.get(right.issueId) ?? 1e9) || left.title.localeCompare(right.title) || left.issueId.localeCompare(right.issueId),
  );
  const byId = new Map(issues.map((issue) => [issue.issueId, issue]));
  for (const issue of queued) {
    const keyNumber = await deps.store.allocateIssueKeyNumber(projectId);
    const next = { ...issue, keyNumber };
    await deps.store.putIssue(next);
    byId.set(issue.issueId, next);
  }
  return issues.map((issue) => byId.get(issue.issueId) ?? issue);
}

async function compassMembers(ctx: PlanCtx, customerId: string, projectId: string) {
  const rows = await ctx.deps.store.listMembershipsForCustomer(customerId);
  return rows
    .filter((member) => member.projectIds === null || member.projectIds.includes(projectId))
    .map((member) => ({ id: member.userId, login: member.email, name: member.name.trim() || null }));
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
  const workstream = parseWorkstreamNumber(ctx.body, existing?.workstreamNumber ?? null);
  if (workstream === "invalid") {
    return json(400, { code: "VALIDATION", message: "Workstream issue number must be a positive integer.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
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
    startFieldName: existing?.startFieldName ?? "Start",
    finishFieldName: existing?.finishFieldName ?? "Finish",
    startFieldId: existing?.startFieldId ?? null,
    finishFieldId: existing?.finishFieldId ?? null,
    iterationFieldId: existing?.iterationFieldId ?? null,
    iterations: existing?.iterations ?? [],
    commentsFieldId: existing?.commentsFieldId ?? null,
    assignableUsers: existing?.assignableUsers ?? [],
    statusOptions: existing?.statusOptions ?? [],
    doneStatuses: existing?.doneStatuses ?? [...DEFAULT_DONE_STATUSES],
    columns: existing?.columns ?? [...DEFAULT_COLUMNS],
    workstreamNumber: workstream,
    recordSource: existing?.recordSource ?? "github",
    labels: existing?.labels ?? [],
    issueTypes: existing?.issueTypes ?? [],
    priorityOptions: existing?.priorityOptions ?? [],
    milestones: existing?.milestones ?? [],
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

/** Copies the stored GitHub projection into Compass records. Does not call GitHub. */
async function importCompassProject(ctx: PlanCtx, projectId: string): Promise<HttpResult> {
  if (adminAccess(ctx.principal) !== "ok") {
    return json(403, { code: "FORBIDDEN", message: "Administrator access is required.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const project = await ctx.deps.store.getProject(projectId);
  if (!project) return notFound(ctx.correlationId);
  const settings = await ctx.deps.store.getSettings(projectId);
  if (!settings || settings.customerId !== project.customerId) {
    return json(400, { code: "VALIDATION", message: "Save the GitHub repository before importing it into Compass.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (settings.recordSource === "compass") {
    return json(409, { code: "CONFLICT", message: "This project is already imported into Compass.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const imported = importCompass(settings, await ctx.deps.store.listIssues(projectId));
  await ctx.deps.store.putSettings(imported.settings);
  for (const issue of imported.issues) await ctx.deps.store.putIssue(issue);
  return json(200, { settings: imported.settings, issues: imported.issues }, ctx.correlationId);
}

async function requestSync(ctx: PlanCtx, projectId: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  const project = opened;
  if (!project) return notFound(ctx.correlationId);
  const settings = await ctx.deps.store.getSettings(projectId);
  if (!settings) return json(400, { code: "VALIDATION", message: "Save the GitHub repository before syncing.", correlationId: ctx.correlationId }, ctx.correlationId);
  if (settings.recordSource === "compass") {
    return json(409, { code: "COMPASS_OWNED", message: "This project is stored in Compass. GitHub is not updated.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (!ctx.deps.githubConfigured) return notConfigured(ctx.correlationId);
  await ctx.deps.store.putSync(syncRow(projectId, project.customerId, "pending", "Sync requested.", ctx.deps.now().toISOString()));
  await ctx.deps.enqueue({ type: "reconcile", projectId });
  return json(202, { accepted: true }, ctx.correlationId);
}

async function saveOverride(ctx: PlanCtx, projectId: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  const project = opened;
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

async function confirmMilestone(ctx: PlanCtx, projectId: string, milestoneKey: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  const project = opened;
  if (!project) return notFound(ctx.correlationId);
  const view = await milestoneView(ctx, projectId, milestoneKey);
  if (!view) return notFound(ctx.correlationId);
  if (view.state === "confirmed" && !view.workOpen) return json(200, { milestone: view }, ctx.correlationId);
  if (view.state !== "ready") {
    return json(409, { code: "MILESTONE_NOT_READY", message: "This milestone is ready for confirmation only when every task on it is Done.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const existing = await findMilestone(ctx, projectId, view);
  const at = ctx.deps.now().toISOString();
  const record = {
    projectId,
    customerId: project.customerId,
    milestoneKey: view.key,
    title: view.title,
    confirmedAt: at,
    confirmedBy: ctx.principal.userId,
    history: [...(existing?.history ?? []), { action: "confirmed" as const, at, actorUserId: ctx.principal.userId, explanation: null }],
  };
  await ctx.deps.store.putMilestone(record);
  await ctx.deps.store.putAudit({
    eventId: ctx.deps.newId(),
    customerId: project.customerId,
    projectId,
    actorUserId: ctx.principal.userId,
    action: "milestone.confirmed",
    targetType: "milestone",
    targetId: view.key,
    before: existing,
    after: { title: view.title, confirmedAt: at },
    at,
    correlationId: ctx.correlationId,
  });
  const milestone = await milestoneView(ctx, projectId, view.key);
  return json(200, { milestone }, ctx.correlationId);
}

async function reopenMilestone(ctx: PlanCtx, projectId: string, milestoneKey: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  const project = opened;
  if (!project) return notFound(ctx.correlationId);
  const explanation = typeof ctx.body.explanation === "string" ? ctx.body.explanation.trim() : "";
  if (!explanation || explanation.length > 500) {
    return json(400, { code: "VALIDATION", message: "An explanation is required to reopen a milestone.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const view = await milestoneView(ctx, projectId, milestoneKey);
  if (!view) return notFound(ctx.correlationId);
  const existing = await findMilestone(ctx, projectId, view);
  if (!existing?.confirmedAt) {
    return json(409, { code: "MILESTONE_NOT_CONFIRMED", message: "This milestone is not confirmed.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const at = ctx.deps.now().toISOString();
  const record = {
    ...existing,
    title: view.title,
    confirmedAt: null,
    confirmedBy: null,
    history: [...existing.history, { action: "reopened" as const, at, actorUserId: ctx.principal.userId, explanation }],
  };
  await ctx.deps.store.putMilestone(record);
  await ctx.deps.store.putAudit({
    eventId: ctx.deps.newId(),
    customerId: project.customerId,
    projectId,
    actorUserId: ctx.principal.userId,
    action: "milestone.reopened",
    targetType: "milestone",
    targetId: view.key,
    before: { confirmedAt: existing.confirmedAt, confirmedBy: existing.confirmedBy },
    after: { confirmedAt: null, explanation },
    at,
    correlationId: ctx.correlationId,
  });
  const milestone = await milestoneView(ctx, projectId, view.key);
  return json(200, { milestone }, ctx.correlationId);
}

async function milestoneView(ctx: PlanCtx, projectId: string, milestoneKey: string) {
  const settings = await ctx.deps.store.getSettings(projectId);
  const doneStatuses = settings?.doneStatuses ?? [...DEFAULT_DONE_STATUSES];
  const views = milestoneViews(
    await ctx.deps.store.listIssues(projectId),
    await ctx.deps.store.listMilestones(projectId),
    doneStatuses,
    ctx.deps.now().toISOString().slice(0, 10),
  );
  return views.find((item) => item.key === milestoneKey || item.title === milestoneKey) ?? null;
}

async function findMilestone(ctx: PlanCtx, projectId: string, view: { key: string; title: string }) {
  const records = await ctx.deps.store.listMilestones(projectId);
  return records.find((item) => item.milestoneKey === view.key || item.title === view.title) ?? null;
}

async function createPlanItem(ctx: PlanCtx, projectId: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  const project = opened;
  if (!project) return notFound(ctx.correlationId);
  /** Accept legacy queue/API value `subissue` so in-flight create-plan-item messages still apply. */
  const kind = ctx.body.kind === "subissue" ? "subtask" : ctx.body.kind;
  const title = typeof ctx.body.title === "string" ? ctx.body.title.trim() : "";
  if (kind !== "epic" && kind !== "feature" && kind !== "issue" && kind !== "subtask") {
    return json(400, { code: "VALIDATION", message: "kind must be epic, feature, issue, or subtask.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (!title || title.length > 256) return json(400, { code: "VALIDATION", message: "A title is required.", correlationId: ctx.correlationId }, ctx.correlationId);
  const settings = await ctx.deps.store.getSettings(projectId);
  if (!settings) return json(400, { code: "VALIDATION", message: "Save the GitHub repository before adding a row.", correlationId: ctx.correlationId }, ctx.correlationId);
  const issues = await ctx.deps.store.listIssues(projectId);
  const byId = new Map(issues.map((issue) => [issue.issueId, issue]));
  const parentId = typeof ctx.body.parentIssueId === "string" && ctx.body.parentIssueId ? ctx.body.parentIssueId : null;
  const parent = parentId ? byId.get(parentId) : undefined;
  if (parentId && !parent) return json(404, { code: "NOT_FOUND", message: "That parent is not on this plan.", correlationId: ctx.correlationId }, ctx.correlationId);
  const parentKind = parent ? planKind(parent, byId, settings.workstreamNumber) : null;
  const parentNumbered = settings.recordSource === "compass" || parent?.number != null;
  if (kind === "epic" && !settings.workstreamNumber) {
    return json(409, { code: "WORKSTREAM_NOT_SET", message: "Save the Workstream issue number before adding an Epic.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (kind === "feature" && (parentKind !== "epic" || !parentNumbered)) {
    return json(409, { code: "PARENT_REQUIRED", message: "A Feature nests under an Epic that already has a GitHub number.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (kind === "issue" && parent && ((parentKind !== "epic" && parentKind !== "feature") || !parentNumbered)) {
    return json(409, { code: "PARENT_REQUIRED", message: "An Issue nests under an Epic or a Feature.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (kind === "issue" && !parent && !settings.workstreamNumber) {
    return json(409, { code: "WORKSTREAM_NOT_SET", message: "Save the Workstream issue number, or choose an Epic or Feature.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (kind === "subtask" && (parentKind !== "issue" || !parentNumbered)) {
    return json(409, { code: "PARENT_REQUIRED", message: "A Subtask nests under an Issue.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const rest = { ...ctx.body };
  delete rest.kind;
  delete rest.title;
  delete rest.parentIssueId;
  const fieldKeys = ["description", "status", "effort", "startDate", "finishDate", "iterationId", "assigneeId", "comment"];
  const sentFields = fieldKeys.some((key) => key in rest);
  const fields = issueChange(rest);
  if (sentFields && !fields) return json(400, { code: "VALIDATION", message: "Check the description, status, effort, dates, iteration, assignee, and comment.", correlationId: ctx.correlationId }, ctx.correlationId);
  const compassExtra = settings.recordSource === "compass" ? readCompassExtra(rest) : { ok: true as const, value: {} };
  if (!compassExtra.ok) return json(400, { code: "VALIDATION", message: "Check the priority, labels, and relationships.", correlationId: ctx.correlationId }, ctx.correlationId);
  const change: IssueChange & { comment?: string } = fields ?? {};
  const start = change.startDate ?? null;
  const finish = change.finishDate ?? null;
  if (start && finish && finish < start) {
    return json(400, { code: "VALIDATION", message: "The finish date cannot be before the start date.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if ((change.startDate !== undefined || change.finishDate !== undefined) && settings.recordSource !== "compass" && (!settings.startFieldId || !settings.finishFieldId)) {
    return json(409, { code: "DATES_NOT_CONFIGURED", message: "Add Start and Finish date fields on the GitHub project before scheduling a task.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (change.iterationId) {
    if (settings.iterations.length > 0 && !settings.iterations.some((item) => item.id === change.iterationId)) {
      return json(400, { code: "VALIDATION", message: "That iteration is not on the GitHub project.", correlationId: ctx.correlationId }, ctx.correlationId);
    }
  }
  if (change.comment) {
    change.comments = tracedComment(null, await actorLabel(ctx, project.customerId), ctx.deps.now().toISOString().slice(0, 10), change.comment);
    delete change.comment;
  }
  if (!project.projectKey) {
    return json(409, { code: "PROJECT_KEY_REQUIRED", message: "Set a project key in Settings → General before adding plan items.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (settings.recordSource === "compass") return createCompassPlanItem(ctx, project.customerId, settings, issues, kind, title, parent ?? null, change, compassExtra.value);
  if (!ctx.deps.githubConfigured) return notConfigured(ctx.correlationId);
  const idempotencyKey = ctx.deps.newId();
  await ctx.deps.store.putSync(syncRow(projectId, project.customerId, "pending", "Adding the plan row.", ctx.deps.now().toISOString()));
  await ctx.deps.enqueue({
    type: "create-plan-item",
    projectId,
    idempotencyKey,
    kind,
    title,
    parentIssueId: parent?.issueId ?? null,
    workstreamNumber: settings.workstreamNumber,
    ...change,
  });
  await ctx.deps.store.putAudit({
    eventId: ctx.deps.newId(),
    customerId: project.customerId,
    projectId,
    actorUserId: ctx.principal.userId,
    action: "plan.item_requested",
    targetType: "issue",
    targetId: idempotencyKey,
    before: null,
    after: { kind, title, parentIssueId: parent?.issueId ?? null },
    at: ctx.deps.now().toISOString(),
    correlationId: ctx.correlationId,
  });
  return json(202, { accepted: true, idempotencyKey }, ctx.correlationId);
}

async function ensureScheduleFields(ctx: PlanCtx, projectId: string): Promise<HttpResult> {
  if (adminAccess(ctx.principal) !== "ok") {
    return json(403, { code: "FORBIDDEN", message: "Administrator access is required.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const project = await ctx.deps.store.getProject(projectId);
  if (!project) return notFound(ctx.correlationId);
  const settings = await ctx.deps.store.getSettings(projectId);
  if (!settings) return json(400, { code: "VALIDATION", message: "Save the GitHub repository before adding date fields.", correlationId: ctx.correlationId }, ctx.correlationId);
  if (!ctx.deps.githubConfigured) return notConfigured(ctx.correlationId);
  await ctx.deps.store.putSync(syncRow(projectId, project.customerId, "pending", "Adding Start and Finish date fields on GitHub.", ctx.deps.now().toISOString()));
  await ctx.deps.enqueue({ type: "ensure-date-fields", projectId });
  return json(202, { accepted: true }, ctx.correlationId);
}

/**
 * Soft-deletes a leaf plan row (sets deletedAt). Refused when the item still has active children.
 * Body must include confirmation: "DELETE". Does not remove the Dynamo row or call GitHub delete.
 */
async function softDeleteIssue(ctx: PlanCtx, projectId: string, issueId: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  const project = opened;
  if (!project) return notFound(ctx.correlationId);
  const confirmation = typeof ctx.body.confirmation === "string" ? ctx.body.confirmation.trim() : "";
  if (confirmation !== "DELETE") {
    return json(400, { code: "VALIDATION", message: 'Type DELETE to confirm removing this item from the plan.', correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const issues = await ctx.deps.store.listIssues(projectId);
  const issue = issues.find((item) => item.issueId === issueId && item.customerId === project.customerId);
  if (!issue || !issue.inProject || issue.archived || issue.deletedAt) return notFound(ctx.correlationId);
  if (hasActiveChildren(issueId, issues)) {
    return json(
      409,
      { code: "HAS_CHILDREN", message: "Remove or reparent every child before deleting this item.", correlationId: ctx.correlationId },
      ctx.correlationId,
    );
  }
  const now = ctx.deps.now().toISOString();
  const deleted = { ...issue, deletedAt: now, updatedAt: now };
  await ctx.deps.store.putIssue(deleted);
  await auditPlanItem(ctx, project.customerId, projectId, "plan.item_deleted", issueId, auditIssueSnapshot(issue), auditIssueSnapshot(deleted));
  return json(200, { issue: deleted }, ctx.correlationId);
}

async function updateIssue(ctx: PlanCtx, projectId: string, issueId: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  const project = opened;
  if (!project) return notFound(ctx.correlationId);
  const issue = await ctx.deps.store.getIssue(projectId, issueId);
  if (!issue || issue.customerId !== project.customerId) return notFound(ctx.correlationId);
  const parsed = issueChange(ctx.body);
  const settingsForKind = await ctx.deps.store.getSettings(projectId);
  const compass = settingsForKind?.recordSource === "compass";
  const extraResult = compass ? readCompassExtra(ctx.body) : { ok: true as const, value: {} };
  if (!extraResult.ok) return json(400, { code: "VALIDATION", message: "Check the priority, labels, and relationships.", correlationId: ctx.correlationId }, ctx.correlationId);
  // Soft dependencies are Compass-owned relationships; reject a task depending on itself before the local write.
  if (extraResult.value.relationships?.some((relationship) => relationship.kind === "dependency" && relationship.otherIssueId === issueId)) {
    return json(400, { code: "VALIDATION", message: "A task cannot depend on itself.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const parentEdit = compass ? readParent(ctx.body) : "absent";
  if (parentEdit === "invalid") return json(400, { code: "VALIDATION", message: "Choose a parent on this plan.", correlationId: ctx.correlationId }, ctx.correlationId);
  if (!parsed && !hasCompassEdit(extraResult.value) && parentEdit === "absent") {
    return json(400, { code: "VALIDATION", message: "Send a title, description, status, effort, dates, iteration, assignee, or comment.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const change = parsed ?? {};
  const related = await ctx.deps.store.listIssues(projectId);
  if (derivedSchedule(related, settingsForKind?.workstreamNumber ?? null, issue.issueId)) {
    delete change.startDate;
    delete change.finishDate;
  }
  const start = change.startDate !== undefined ? change.startDate : issue.startDate;
  const finish = change.finishDate !== undefined ? change.finishDate : issue.finishDate;
  if (start && finish && finish < start) {
    return json(400, { code: "VALIDATION", message: "The finish date cannot be before the start date.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (change.startDate === issue.startDate) delete change.startDate;
  if (change.finishDate === issue.finishDate) delete change.finishDate;
  if (change.description === issue.description) delete change.description;
  if (change.iterationId === issue.iterationId) delete change.iterationId;
  if (change.assigneeId !== undefined && change.assigneeId === (issue.assignees[0]?.id ?? null) && issue.assignees.length <= 1) delete change.assigneeId;
  if (change.iterationId) {
    const known = (await ctx.deps.store.getSettings(projectId))?.iterations ?? [];
    if (known.length > 0 && !known.some((item) => item.id === change.iterationId)) {
      return json(400, { code: "VALIDATION", message: "That iteration is not on the GitHub project.", correlationId: ctx.correlationId }, ctx.correlationId);
    }
  }
  if (change.comment) {
    change.comments = tracedComment(issue.comments, await actorLabel(ctx, project.customerId), ctx.deps.now().toISOString().slice(0, 10), change.comment);
    delete change.comment;
  }
  if (Object.keys(change).length === 0 && !hasCompassEdit(extraResult.value) && parentEdit === "absent") {
    return json(400, { code: "VALIDATION", message: "Send a title, description, status, effort, dates, iteration, assignee, or comment.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  let resolvedParent: string | null | undefined = parentEdit === "absent" ? undefined : parentEdit;
  if (compass && settingsForKind && resolvedParent !== undefined) {
    const refusal = compassParentRefusal(ctx, settingsForKind, issue, related, resolvedParent);
    if (refusal) return refusal;
    resolvedParent = settleParent(settingsForKind, issue, related, resolvedParent);
  }
  if (compass && extraResult.value.predecessorIds) {
    for (const predecessorId of extraResult.value.predecessorIds) {
      if (dependencyCycle(related, issue.issueId, predecessorId)) {
        return json(409, { code: "DEPENDENCY_CYCLE", message: "That link would make tasks block each other.", correlationId: ctx.correlationId }, ctx.correlationId);
      }
    }
  }
  if (change.status) {
    const settings = await ctx.deps.store.getSettings(projectId);
    const doneStatuses = settings?.doneStatuses ?? [...DEFAULT_DONE_STATUSES];
    if (doneStatuses.includes(change.status) && parentDoneBlocked(issueId, await ctx.deps.store.listIssues(projectId), doneStatuses)) {
      return json(
        409,
        { code: "PARENT_INCOMPLETE", message: "This parent stays open until every task under it is Done.", correlationId: ctx.correlationId },
        ctx.correlationId,
      );
    }
  }
  if (change.startDate !== undefined || change.finishDate !== undefined) {
    const settings = await ctx.deps.store.getSettings(projectId);
    if (settings?.recordSource !== "compass" && (!settings?.startFieldId || !settings.finishFieldId)) {
      return json(
        409,
        { code: "DATES_NOT_CONFIGURED", message: "Add Start and Finish date fields on the GitHub project before scheduling a task.", correlationId: ctx.correlationId },
        ctx.correlationId,
      );
    }
    const decision = ctx.body.dependencyDecision;
    if (decision !== undefined && decision !== "approve" && decision !== "reject") {
      return json(400, { code: "VALIDATION", message: "Approve the later-task moves or keep those dates.", correlationId: ctx.correlationId }, ctx.correlationId);
    }
    const proposals = dependencyReview(await ctx.deps.store.listIssues(projectId), issueId, start, finish);
    if (proposals.length > 0 && decision === undefined) {
      return json(
        409,
        {
          code: "DEPENDENCY_REVIEW",
          message: "This date keeps a later task starting before the previous task finishes. Approve the moves or keep those dates.",
          proposals,
          correlationId: ctx.correlationId,
        },
        ctx.correlationId,
      );
    }
    if (proposals.length > 0 && decision === "approve") {
      if (settings?.recordSource === "compass") return saveCompassIssue(ctx, settings, issue, related, change, extraResult.value, resolvedParent, proposals);
      if (!ctx.deps.githubConfigured) return notConfigured(ctx.correlationId);
      const idempotencyKey = typeof ctx.body.idempotencyKey === "string" && ctx.body.idempotencyKey.trim() ? ctx.body.idempotencyKey.trim() : ctx.deps.newId();
      await ctx.deps.store.putSync(syncRow(projectId, project.customerId, "pending", "Sending the schedule to GitHub.", ctx.deps.now().toISOString()));
      const scheduleChanges = [
        { issueId, ...change },
        ...proposals.map((proposal) => ({ issueId: proposal.issueId, startDate: proposal.toStart, finishDate: proposal.toFinish })),
      ];
      await ctx.deps.enqueue({
        type: "update-schedule",
        projectId,
        idempotencyKey,
        changes: scheduleChanges,
      });
      await auditPlanItem(ctx, project.customerId, projectId, "plan.item_updated", issueId, auditIssueSnapshot(issue), {
        requested: change,
        proposals,
        idempotencyKey,
      });
      return json(202, { accepted: true, idempotencyKey }, ctx.correlationId);
    }
  }
  if (compass && settingsForKind) return saveCompassIssue(ctx, settingsForKind, issue, related, change, extraResult.value, resolvedParent, []);
  if (!ctx.deps.githubConfigured) return notConfigured(ctx.correlationId);
  const idempotencyKey = typeof ctx.body.idempotencyKey === "string" && ctx.body.idempotencyKey.trim() ? ctx.body.idempotencyKey.trim() : ctx.deps.newId();
  await ctx.deps.store.putSync(syncRow(projectId, project.customerId, "pending", "Sending the change to GitHub.", ctx.deps.now().toISOString()));
  const message: SyncMessage = { type: "update-issue", projectId, issueId, idempotencyKey, ...change };
  await ctx.deps.enqueue(message);
  await auditPlanItem(ctx, project.customerId, projectId, "plan.item_updated", issueId, auditIssueSnapshot(issue), { requested: change, idempotencyKey });
  return json(202, { accepted: true, idempotencyKey }, ctx.correlationId);
}

async function setPredecessor(ctx: PlanCtx, projectId: string, issueId: string, action: "add" | "remove"): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  const project = opened;
  if (!project) return notFound(ctx.correlationId);
  const predecessorId = typeof ctx.body.predecessorId === "string" ? ctx.body.predecessorId.trim() : "";
  if (!predecessorId) return json(400, { code: "VALIDATION", message: "Choose the task that has to finish first.", correlationId: ctx.correlationId }, ctx.correlationId);
  const issues = await ctx.deps.store.listIssues(projectId);
  const issue = issues.find((item) => item.issueId === issueId && item.customerId === project.customerId && item.inProject && !item.archived && !item.deletedAt);
  const predecessor = issues.find((item) => item.issueId === predecessorId && item.customerId === project.customerId && item.inProject && !item.archived && !item.deletedAt);
  if (!issue || !predecessor) return notFound(ctx.correlationId);
  if (action === "add" && dependencyCycle(issues, issueId, predecessorId)) {
    return json(409, { code: "DEPENDENCY_CYCLE", message: "That link would make tasks block each other.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (action === "add" && issue.predecessorIds.includes(predecessorId)) return json(200, { predecessorIds: issue.predecessorIds }, ctx.correlationId);
  if (action === "remove" && !issue.predecessorIds.includes(predecessorId)) return json(200, { predecessorIds: issue.predecessorIds }, ctx.correlationId);
  const dependencySettings = await ctx.deps.store.getSettings(projectId);
  if (dependencySettings?.recordSource === "compass") {
    const predecessorIds = action === "add" ? [...issue.predecessorIds, predecessorId] : issue.predecessorIds.filter((id) => id !== predecessorId);
    await ctx.deps.store.putIssue({ ...issue, predecessorIds, updatedAt: ctx.deps.now().toISOString() });
    await auditPlanItem(ctx, project.customerId, projectId, "plan.item_updated", issueId, { predecessorIds: issue.predecessorIds }, { predecessorIds, action, predecessorId });
    return json(200, { predecessorIds }, ctx.correlationId);
  }
  if (!ctx.deps.githubConfigured) return notConfigured(ctx.correlationId);
  const idempotencyKey = typeof ctx.body.idempotencyKey === "string" && ctx.body.idempotencyKey.trim() ? ctx.body.idempotencyKey.trim() : ctx.deps.newId();
  await ctx.deps.store.putSync(syncRow(projectId, project.customerId, "pending", "Sending the dependency to GitHub.", ctx.deps.now().toISOString()));
  await ctx.deps.enqueue({ type: "set-dependency", projectId, issueId, predecessorId, action, idempotencyKey });
  await auditPlanItem(ctx, project.customerId, projectId, "plan.item_updated", issueId, { predecessorIds: issue.predecessorIds }, {
    action,
    predecessorId,
    idempotencyKey,
  });
  return json(202, { accepted: true, idempotencyKey }, ctx.correlationId);
}

async function createBaseline(ctx: PlanCtx, projectId: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  const project = opened;
  if (!project) return notFound(ctx.correlationId);
  const explanation = note(ctx.body.explanation);
  if (!explanation) return json(400, { code: "VALIDATION", message: "An explanation is required.", correlationId: ctx.correlationId }, ctx.correlationId);
  const existing = await ctx.deps.store.listBaselines(projectId);
  const approved = existing.filter((record) => record.state === "approved");
  const now = ctx.deps.now().toISOString();
  const tasks = baselineSnapshot(await ctx.deps.store.listIssues(projectId));
  if (approved.length === 0) {
    if (adminAccess(ctx.principal) !== "ok") {
      return json(403, { code: "FORBIDDEN", message: "An administrator sets Baseline 1.", correlationId: ctx.correlationId }, ctx.correlationId);
    }
    const number = await ctx.deps.store.allocateBaselineNumber(projectId);
    const baseline = baselineRecord(ctx, project.projectId, project.customerId, explanation, tasks, now, {
      number,
      state: "approved",
      decidedAt: now,
      decidedBy: ctx.principal.userId,
    });
    await ctx.deps.store.putBaseline(baseline);
    await auditBaseline(ctx, project.customerId, projectId, "baseline.established", baseline.baselineId, null, baseline);
    return json(200, { baseline }, ctx.correlationId);
  }
  if (existing.some((record) => record.state === "proposed")) {
    return json(409, { code: "BASELINE_PENDING", message: "Approve or reject the open baseline proposal first.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const baseline = baselineRecord(ctx, project.projectId, project.customerId, explanation, tasks, now, {
    number: null,
    state: "proposed",
    decidedAt: null,
    decidedBy: null,
  });
  await ctx.deps.store.putBaseline(baseline);
  await auditBaseline(ctx, project.customerId, projectId, "baseline.proposed", baseline.baselineId, null, baseline);
  return json(200, { baseline }, ctx.correlationId);
}

async function decideBaseline(ctx: PlanCtx, projectId: string, baselineId: string, state: "approved" | "rejected"): Promise<HttpResult> {
  if (adminAccess(ctx.principal) !== "ok") {
    return json(403, { code: "FORBIDDEN", message: "Administrator access is required.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const project = await ctx.deps.store.getProject(projectId);
  if (!project) return notFound(ctx.correlationId);
  const existing = (await ctx.deps.store.listBaselines(projectId)).find((record) => record.baselineId === baselineId);
  if (!existing || existing.customerId !== project.customerId) return notFound(ctx.correlationId);
  if (existing.state !== "proposed") {
    return json(409, { code: "BASELINE_DECIDED", message: "This baseline proposal is already decided.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const rejection = state === "rejected" ? note(ctx.body.explanation) : null;
  if (state === "rejected" && !rejection) {
    return json(400, { code: "VALIDATION", message: "An explanation is required to reject a baseline.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  // Allocate before the conditional put so concurrent approvers never share a number.
  const number = state === "approved" ? await ctx.deps.store.allocateBaselineNumber(projectId) : null;
  const now = ctx.deps.now().toISOString();
  const baseline: BaselineRecord = {
    ...existing,
    state,
    number,
    rejection,
    decidedAt: now,
    decidedBy: ctx.principal.userId,
  };
  try {
    await ctx.deps.store.putBaseline(baseline, { requireState: "proposed" });
  } catch (error) {
    if (isConditionalCheckFailed(error)) {
      return json(409, { code: "BASELINE_DECIDED", message: "This baseline proposal is already decided.", correlationId: ctx.correlationId }, ctx.correlationId);
    }
    throw error;
  }
  await auditBaseline(ctx, project.customerId, projectId, state === "approved" ? "baseline.approved" : "baseline.rejected", baselineId, existing, baseline);
  return json(200, { baseline }, ctx.correlationId);
}

/** Reorder Timeline siblings under one parent. Writers may drag rows; order is Compass-owned. */
async function savePlanOrder(ctx: PlanCtx, projectId: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  const project = opened;
  if (!project) return notFound(ctx.correlationId);
  if (!Array.isArray(ctx.body.orderedIssueIds) || ctx.body.orderedIssueIds.length < 2) {
    return json(400, { code: "VALIDATION", message: "Choose at least two rows to reorder.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const orderedIssueIds = [...new Set(ctx.body.orderedIssueIds.map((id) => String(id).trim()).filter(Boolean))];
  if (orderedIssueIds.length < 2 || orderedIssueIds.length > 200) {
    return json(400, { code: "VALIDATION", message: "Choose at least two rows to reorder.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const issues = await ctx.deps.store.listIssues(projectId);
  const byId = new Map(issues.map((issue) => [issue.issueId, issue]));
  const selected = orderedIssueIds.map((id) => byId.get(id) ?? null);
  if (selected.some((issue) => !issue || !issue.inProject || issue.archived || issue.deletedAt)) {
    return json(400, { code: "VALIDATION", message: "Every row in the order must be an active plan item.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const parentIssueId = selected[0]!.parentIssueId;
  if (selected.some((issue) => issue!.parentIssueId !== parentIssueId)) {
    return json(400, { code: "VALIDATION", message: "Only rows under the same parent can be reordered together.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const now = ctx.deps.now().toISOString();
  const next = applyPlanOrder(selected as PlanIssue[], orderedIssueIds);
  for (const issue of next) {
    await ctx.deps.store.putIssue({ ...issue, planOrder: issue.planOrder ?? null, updatedAt: now });
  }
  await ctx.deps.store.putAudit({
    eventId: ctx.deps.newId(),
    customerId: project.customerId,
    projectId,
    actorUserId: ctx.principal.userId,
    action: "plan.reordered",
    targetType: "project",
    targetId: projectId,
    before: { parentIssueId, orderedIssueIds: selected.map((issue) => issue!.issueId) },
    after: { parentIssueId, orderedIssueIds },
    at: now,
    correlationId: ctx.correlationId,
  });
  return json(200, { orderedIssueIds }, ctx.correlationId);
}

/** Administrators edit risk register fields. Schedule-linked ids are accepted before the first save. */
async function saveRisk(ctx: PlanCtx, projectId: string, riskId: string): Promise<HttpResult> {
  if (adminAccess(ctx.principal) !== "ok") {
    return json(403, { code: "FORBIDDEN", message: "Administrator access is required.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (!riskId || riskId.length > 200) {
    return json(400, { code: "VALIDATION", message: "Check the risk id.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const project = await ctx.deps.store.getProject(projectId);
  if (!project) return notFound(ctx.correlationId);
  const title = typeof ctx.body.title === "string" ? ctx.body.title.trim() : "";
  if (!title || title.length > 200) {
    return json(400, { code: "VALIDATION", message: "A risk name is required.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const severity = ctx.body.severity === null || ctx.body.severity === "" ? null : riskSeverityFromStore(ctx.body.severity);
  if (ctx.body.severity != null && ctx.body.severity !== "" && severity == null) {
    return json(400, { code: "VALIDATION", message: "Choose a severity.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const description = typeof ctx.body.description === "string" ? ctx.body.description.trim() : "";
  const notes = typeof ctx.body.notes === "string" ? ctx.body.notes.trim() : "";
  if (description.length > 4000 || notes.length > 4000) {
    return json(400, { code: "VALIDATION", message: "Description and notes must stay under 4000 characters.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const dateClearedRaw = ctx.body.dateCleared;
  const dateCleared =
    dateClearedRaw == null || dateClearedRaw === ""
      ? null
      : typeof dateClearedRaw === "string" && isIsoDate(dateClearedRaw)
        ? dateClearedRaw
        : "invalid";
  if (dateCleared === "invalid") {
    return json(400, { code: "VALIDATION", message: "Date cleared must be YYYY-MM-DD.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const existing = (await ctx.deps.store.listRisks(projectId)).find((row) => row.riskId === riskId) ?? null;
  const issueId =
    typeof ctx.body.issueId === "string" && ctx.body.issueId
      ? ctx.body.issueId
      : existing?.issueId ?? (riskId.startsWith("schedule:") ? riskId.split(":")[1] ?? null : null);
  const predecessorId =
    typeof ctx.body.predecessorId === "string" && ctx.body.predecessorId
      ? ctx.body.predecessorId
      : existing?.predecessorId ?? (riskId.startsWith("schedule:") ? riskId.split(":")[2] ?? null : null);
  const record: RiskRecord = {
    riskId,
    projectId,
    customerId: project.customerId,
    title,
    severity,
    description,
    dateCleared,
    notes,
    issueId: issueId || null,
    predecessorId: predecessorId || null,
    updatedAt: ctx.deps.now().toISOString(),
    updatedBy: ctx.principal.userId,
  };
  await ctx.deps.store.putRisk(record);
  await ctx.deps.store.putAudit({
    eventId: ctx.deps.newId(),
    customerId: project.customerId,
    projectId,
    actorUserId: ctx.principal.userId,
    action: "risk.updated",
    targetType: "risk",
    targetId: riskId,
    before: existing,
    after: record,
    at: record.updatedAt,
    correlationId: ctx.correlationId,
  });
  return json(200, { risk: record }, ctx.correlationId);
}

function baselineRecord(
  ctx: PlanCtx,
  projectId: string,
  customerId: string,
  explanation: string,
  tasks: BaselineRecord["tasks"],
  now: string,
  decision: Pick<BaselineRecord, "number" | "state" | "decidedAt" | "decidedBy">,
): BaselineRecord {
  return {
    baselineId: ctx.deps.newId(),
    projectId,
    customerId,
    explanation,
    rejection: null,
    tasks,
    createdAt: now,
    createdBy: ctx.principal.userId,
    ...decision,
  };
}

function baselineOrder(left: BaselineRecord, right: BaselineRecord): number {
  const rank = { approved: 0, proposed: 1, rejected: 2 };
  return rank[left.state] - rank[right.state] || (left.number ?? 999) - (right.number ?? 999) || left.createdAt.localeCompare(right.createdAt);
}

function parseWorkstreamNumber(body: Record<string, unknown>, current: number | null): number | null | "invalid" {
  if (!("workstreamNumber" in body)) return current;
  const value = body.workstreamNumber;
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) return "invalid";
  return value;
}

function note(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500) return null;
  return trimmed;
}

/** Append-only plan change: who, when, issue id, and prior/new state (or requested patch). */
async function auditPlanItem(ctx: PlanCtx, customerId: string, projectId: string, action: string, issueId: string, before: unknown, after: unknown): Promise<void> {
  await ctx.deps.store.putAudit({
    eventId: ctx.deps.newId(),
    customerId,
    projectId,
    actorUserId: ctx.principal.userId,
    action,
    targetType: "issue",
    targetId: issueId,
    before,
    after,
    at: ctx.deps.now().toISOString(),
    correlationId: ctx.correlationId,
  });
}

async function auditBaseline(ctx: PlanCtx, customerId: string, projectId: string, action: string, baselineId: string, before: BaselineRecord | null, after: BaselineRecord) {
  await ctx.deps.store.putAudit({
    eventId: ctx.deps.newId(),
    customerId,
    projectId,
    actorUserId: ctx.principal.userId,
    action,
    targetType: "baseline",
    targetId: baselineId,
    before,
    after,
    at: ctx.deps.now().toISOString(),
    correlationId: ctx.correlationId,
  });
}

function issueChange(body: Record<string, unknown>): (IssueChange & { comment?: string }) | null {
  const change: IssueChange & { comment?: string } = {};
  if ("title" in body) {
    if (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 200) return null;
    change.title = body.title.trim();
  }
  if ("description" in body) {
    if (body.description === null) change.description = null;
    else if (typeof body.description !== "string" || body.description.length > 65000) return null;
    else change.description = body.description.trim() ? body.description : null;
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
  if (!dateField(body, "startDate", change) || !dateField(body, "finishDate", change)) return null;
  if (!idField(body, "iterationId", change) || !idField(body, "assigneeId", change)) return null;
  if ("comment" in body) {
    if (typeof body.comment !== "string") return null;
    const text = body.comment.replace(/\s+/g, " ").trim();
    if (!text || text.length > 2000) return null;
    change.comment = text;
  }
  return Object.keys(change).length > 0 ? change : null;
}

function idField(body: Record<string, unknown>, key: "iterationId" | "assigneeId", change: IssueChange): boolean {
  if (!(key in body)) return true;
  if (body[key] === null) {
    change[key] = null;
    return true;
  }
  if (typeof body[key] !== "string" || !body[key].trim() || body[key].trim().length > 100) return false;
  change[key] = body[key].trim();
  return true;
}

async function actorLabel(ctx: PlanCtx, customerId: string): Promise<string> {
  const membership = (await ctx.deps.store.listMembershipsForUser(ctx.principal.userId)).find((item) => item.customerId === customerId);
  const name = membership?.name.trim();
  if (name) return name;
  const email = membership?.email.trim() || ctx.principal.email?.trim();
  return email || ctx.principal.userId;
}

function dateField(
  body: Record<string, unknown>,
  key: "startDate" | "finishDate",
  change: { startDate?: string | null; finishDate?: string | null },
): boolean {
  if (!(key in body)) return true;
  if (body[key] === null) {
    change[key] = null;
    return true;
  }
  if (typeof body[key] !== "string" || !isIsoDate(body[key])) return false;
  change[key] = body[key];
  return true;
}

type CompassPatch = {
  priority?: string | null;
  labels?: string[];
  relationships?: IssueRelationship[];
  issueType?: string | null;
  milestone?: string | null;
  predecessorIds?: string[];
  assigneeIds?: string[];
};

type PlanKindName = "epic" | "feature" | "issue" | "subtask";

/** Compass projects write the plan row here. GitHub projects keep the enqueue path. */
async function createCompassPlanItem(
  ctx: PlanCtx,
  customerId: string,
  settings: ProjectSettings,
  issues: PlanIssue[],
  kind: PlanKindName,
  title: string,
  parent: PlanIssue | null,
  change: IssueChange,
  extra: CompassPatch,
): Promise<HttpResult> {
  const now = ctx.deps.now().toISOString();
  const parentIssueId = kind === "epic" || (kind === "issue" && !parent) ? workstreamParentId(issues, settings.workstreamNumber) : parent?.issueId ?? null;
  const keyNumber = await ctx.deps.store.allocateIssueKeyNumber(settings.projectId);
  const created = applyLocalIssue(
    {
      issueId: ctx.deps.newId(),
      itemId: null,
      projectId: settings.projectId,
      customerId,
      number: null,
      keyNumber,
      title,
      description: null,
      status: "",
      effort: null,
      issueState: "open",
      archived: false,
      deletedAt: null,
      parentIssueId,
      issueType: createdIssueType(kind),
      milestone: null,
      milestoneId: null,
      milestoneDueOn: null,
      startDate: null,
      finishDate: null,
      iterationTitle: null,
      iterationStart: null,
      iterationDuration: null,
      iterationId: null,
      assignees: [],
      comments: null,
      priority: null,
      labels: [],
      relationships: [],
      predecessorIds: [],
      planOrder: null,
      inProject: true,
      updatedAt: now,
    },
    change,
    settings,
    extra,
    now,
  );
  await ctx.deps.store.putIssue(created);
  await ctx.deps.store.putAudit({
    eventId: ctx.deps.newId(),
    customerId,
    projectId: settings.projectId,
    actorUserId: ctx.principal.userId,
    action: "plan.item_created",
    targetType: "issue",
    targetId: created.issueId,
    before: null,
    after: { kind, title, parentIssueId },
    at: now,
    correlationId: ctx.correlationId,
  });
  return json(201, { issue: created }, ctx.correlationId);
}

/** Writes the edited issue and any dependency shifts. Does not enqueue a GitHub mutation. */
async function saveCompassIssue(
  ctx: PlanCtx,
  settings: ProjectSettings,
  issue: PlanIssue,
  issues: PlanIssue[],
  change: IssueChange,
  extra: CompassPatch,
  parentIssueId: string | null | undefined,
  proposals: { issueId: string; toStart: string; toFinish: string }[],
): Promise<HttpResult> {
  const now = ctx.deps.now().toISOString();
  const next = applyLocalIssue(issue, change, settings, { ...extra, parentIssueId }, now);
  if (extra.assigneeIds) {
    const memberships = await ctx.deps.store.listMembershipsForCustomer(settings.customerId);
    next.assignees = extra.assigneeIds.map((id) => {
      const member = memberships.find((item) => item.userId === id);
      const known = settings.assignableUsers.find((user) => user.id === id);
      if (member) return { id, login: member.email || id, name: member.name.trim() || known?.name || null };
      return known ?? { id, login: id, name: null };
    });
  }
  await ctx.deps.store.putIssue(next);
  await auditPlanItem(ctx, settings.customerId, settings.projectId, "plan.item_updated", issue.issueId, auditIssueSnapshot(issue), auditIssueSnapshot(next));
  for (const proposal of proposals) {
    const later = issues.find((item) => item.issueId === proposal.issueId);
    if (!later || later.issueId === issue.issueId) continue;
    const shifted = { ...later, startDate: proposal.toStart, finishDate: proposal.toFinish, updatedAt: now };
    await ctx.deps.store.putIssue(shifted);
    await auditPlanItem(ctx, settings.customerId, settings.projectId, "plan.item_updated", later.issueId, auditIssueSnapshot(later), {
      ...auditIssueSnapshot(shifted),
      shiftedByIssueId: issue.issueId,
    });
  }
  return json(200, { issue: next }, ctx.correlationId);
}

/** Compact plan fields for audit before/after (avoids dumping every GitHub projection field). */
function auditIssueSnapshot(issue: PlanIssue): Record<string, unknown> {
  return {
    title: issue.title,
    description: issue.description,
    status: issue.status,
    effort: issue.effort,
    parentIssueId: issue.parentIssueId,
    issueType: issue.issueType,
    startDate: issue.startDate,
    finishDate: issue.finishDate,
    iterationId: issue.iterationId,
    assignees: issue.assignees,
    comments: issue.comments,
    priority: issue.priority,
    labels: issue.labels,
    relationships: issue.relationships,
    predecessorIds: issue.predecessorIds,
    milestone: issue.milestone,
    planOrder: issue.planOrder,
  };
}

function applyLocalIssue(issue: PlanIssue, change: IssueChange, settings: ProjectSettings, extra: CompassPatch & { parentIssueId?: string | null }, now: string): PlanIssue {
  const next: PlanIssue = { ...issue, updatedAt: now };
  if (change.title !== undefined) next.title = change.title;
  if (change.description !== undefined) next.description = change.description;
  if (change.status !== undefined) next.status = change.status;
  if (change.effort !== undefined) next.effort = change.effort;
  if (change.startDate !== undefined) next.startDate = change.startDate;
  if (change.finishDate !== undefined) next.finishDate = change.finishDate;
  if (change.comments !== undefined) next.comments = change.comments;
  if (change.iterationId !== undefined) {
    const iteration = change.iterationId ? settings.iterations.find((item) => item.id === change.iterationId) : undefined;
    next.iterationId = change.iterationId;
    next.iterationTitle = iteration?.title ?? null;
    next.iterationStart = iteration?.startDate ?? null;
    next.iterationDuration = iteration?.duration ?? null;
  }
  if (change.assigneeId !== undefined && extra.assigneeIds === undefined) {
    if (!change.assigneeId) next.assignees = [];
    else {
      const known = settings.assignableUsers.find((user) => user.id === change.assigneeId);
      next.assignees = [known ?? { id: change.assigneeId, login: change.assigneeId, name: null }];
    }
  }
  if (extra.assigneeIds !== undefined) next.assignees = extra.assigneeIds.map((id) => settings.assignableUsers.find((user) => user.id === id) ?? { id, login: id, name: null });
  if (extra.priority !== undefined) next.priority = extra.priority;
  if (extra.labels !== undefined) next.labels = extra.labels;
  if (extra.relationships !== undefined) next.relationships = extra.relationships;
  if (extra.parentIssueId !== undefined) next.parentIssueId = extra.parentIssueId;
  if (extra.issueType !== undefined) next.issueType = extra.issueType;
  if (extra.milestone !== undefined) {
    const known = extra.milestone ? settings.milestones.find((item) => item.id === extra.milestone || item.title === extra.milestone) : undefined;
    next.milestone = known?.title ?? extra.milestone;
    next.milestoneId = known?.id ?? null;
    next.milestoneDueOn = known?.dueOn ?? null;
  }
  if (extra.predecessorIds !== undefined) next.predecessorIds = extra.predecessorIds;
  return next;
}

function readCompassExtra(body: Record<string, unknown>): { ok: true; value: CompassPatch } | { ok: false } {
  const value: CompassPatch = {};
  if ("priority" in body) {
    if (body.priority === null) value.priority = null;
    else if (typeof body.priority !== "string" || !body.priority.trim() || body.priority.trim().length > 80) return { ok: false };
    else value.priority = body.priority.trim();
  }
  if ("labels" in body) {
    if (!Array.isArray(body.labels) || body.labels.length > 50) return { ok: false };
    const labels: string[] = [];
    for (const label of body.labels) {
      if (typeof label !== "string" || !label.trim() || label.trim().length > 80) return { ok: false };
      labels.push(label.trim());
    }
    value.labels = [...new Set(labels)];
  }
  if ("relationships" in body) {
    if (!Array.isArray(body.relationships) || body.relationships.length > 100) return { ok: false };
    const relationships: IssueRelationship[] = [];
    for (const entry of body.relationships) {
      if (!entry || typeof entry !== "object") return { ok: false };
      const record = entry as Record<string, unknown>;
      const id = typeof record.id === "string" ? record.id.trim() : "";
      const kind = typeof record.kind === "string" ? record.kind.trim() : "";
      const otherIssueId = typeof record.otherIssueId === "string" ? record.otherIssueId.trim() : "";
      if (!id || !kind || !otherIssueId || id.length > 200 || kind.length > 80 || otherIssueId.length > 200) return { ok: false };
      relationships.push({ id, kind, otherIssueId });
    }
    value.relationships = relationships;
  }
  if ("issueType" in body) {
    if (body.issueType === null || body.issueType === "") value.issueType = null;
    else if (typeof body.issueType !== "string" || !body.issueType.trim() || body.issueType.trim().length > 80) return { ok: false };
    else value.issueType = body.issueType.trim();
  }
  if ("milestone" in body) {
    if (body.milestone === null || body.milestone === "") value.milestone = null;
    else if (typeof body.milestone !== "string" || !body.milestone.trim() || body.milestone.trim().length > 120) return { ok: false };
    else value.milestone = body.milestone.trim();
  }
  if ("predecessorIds" in body) {
    if (!Array.isArray(body.predecessorIds) || body.predecessorIds.length > 40) return { ok: false };
    const ids: string[] = [];
    for (const id of body.predecessorIds) {
      if (typeof id !== "string" || !id.trim() || id.trim().length > 200) return { ok: false };
      ids.push(id.trim());
    }
    value.predecessorIds = [...new Set(ids)];
  }
  if ("assigneeIds" in body) {
    if (!Array.isArray(body.assigneeIds) || body.assigneeIds.length > 30) return { ok: false };
    const ids: string[] = [];
    for (const id of body.assigneeIds) {
      if (typeof id !== "string" || !id.trim() || id.trim().length > 200) return { ok: false };
      ids.push(id.trim());
    }
    value.assigneeIds = [...new Set(ids)];
  }
  return { ok: true, value };
}

function hasCompassEdit(value: CompassPatch): boolean {
  return (
    value.priority !== undefined ||
    value.labels !== undefined ||
    value.relationships !== undefined ||
    value.issueType !== undefined ||
    value.milestone !== undefined ||
    value.predecessorIds !== undefined ||
    value.assigneeIds !== undefined
  );
}

function readParent(body: Record<string, unknown>): string | null | "absent" | "invalid" {
  if (!("parentIssueId" in body)) return "absent";
  if (body.parentIssueId === null || body.parentIssueId === "") return null;
  if (typeof body.parentIssueId !== "string" || !body.parentIssueId.trim() || body.parentIssueId.trim().length > 200) return "invalid";
  return body.parentIssueId.trim();
}

function compassParentRefusal(ctx: PlanCtx, settings: ProjectSettings, issue: PlanIssue, issues: PlanIssue[], parentId: string | null): HttpResult | null {
  if (parentId === issue.issueId || (parentId && parentLoop(issues, issue.issueId, parentId))) {
    return json(409, { code: "PARENT_REQUIRED", message: "That parent would nest this row under itself.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const parent = parentId ? issues.find((item) => item.issueId === parentId && item.inProject && !item.archived && !item.deletedAt) : undefined;
  if (parentId && !parent) return notFound(ctx.correlationId);
  const byId = new Map(issues.map((item) => [item.issueId, item]));
  const kind = declaredKind(issue, byId, settings.workstreamNumber);
  const parentKind = parent ? planKind(parent, byId, settings.workstreamNumber) : null;
  const rule = parentRule(kind, parentKind, Boolean(parent), settings.workstreamNumber);
  if (rule === "WORKSTREAM_NOT_SET") {
    const message = kind === "issue" ? "Save the Workstream issue number, or choose an Epic or Feature." : "Save the Workstream issue number before adding an Epic.";
    return json(409, { code: "WORKSTREAM_NOT_SET", message, correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (rule === "PARENT_REQUIRED") return json(409, { code: "PARENT_REQUIRED", message: parentMessage(kind), correlationId: ctx.correlationId }, ctx.correlationId);
  return null;
}

function settleParent(settings: ProjectSettings, issue: PlanIssue, issues: PlanIssue[], parentId: string | null): string | null {
  if (parentId) return parentId;
  const byId = new Map(issues.map((item) => [item.issueId, item]));
  const kind = declaredKind(issue, byId, settings.workstreamNumber);
  if (kind === "epic" || kind === "issue") return workstreamParentId(issues, settings.workstreamNumber);
  return null;
}

function declaredKind(issue: PlanIssue, byId: Map<string, PlanIssue>, workstreamNumber: number | null): PlanKindName {
  const typeName = issue.issueType?.trim().toLowerCase() ?? "";
  if (typeName === "epic") return "epic";
  if (typeName === "feature") return "feature";
  if (typeName === "task") return "issue";
  return planKind(issue, byId, workstreamNumber) === "subtask" ? "subtask" : "issue";
}

function parentRule(kind: PlanKindName, parentKind: PlanKind | null, hasParent: boolean, workstreamNumber: number | null): "WORKSTREAM_NOT_SET" | "PARENT_REQUIRED" | null {
  if (kind === "epic") {
    if (!workstreamNumber) return "WORKSTREAM_NOT_SET";
    if (hasParent && parentKind !== "workstream") return "PARENT_REQUIRED";
    return null;
  }
  if (kind === "feature") return parentKind === "epic" ? null : "PARENT_REQUIRED";
  if (kind === "subtask") return parentKind === "issue" ? null : "PARENT_REQUIRED";
  if (!hasParent) return workstreamNumber ? null : "WORKSTREAM_NOT_SET";
  if (parentKind !== "epic" && parentKind !== "feature" && parentKind !== "workstream") return "PARENT_REQUIRED";
  return null;
}

function parentMessage(kind: PlanKindName): string {
  if (kind === "feature") return "A Feature nests under an Epic.";
  if (kind === "subtask") return "A Subtask nests under an Issue.";
  if (kind === "issue") return "An Issue nests under an Epic or a Feature.";
  return "An Epic stays under the Workstream.";
}

function parentLoop(issues: PlanIssue[], issueId: string, parentId: string): boolean {
  const parents = new Map(issues.map((item) => [item.issueId, item.parentIssueId]));
  const seen = new Set<string>();
  let current: string | null = parentId;
  while (current) {
    if (current === issueId || seen.has(current)) return true;
    seen.add(current);
    current = parents.get(current) ?? null;
  }
  return false;
}

function workstreamParentId(issues: PlanIssue[], workstreamNumber: number | null): string | null {
  if (workstreamNumber == null) return null;
  const match = issues.find((item) => item.number === workstreamNumber && item.inProject && !item.archived && !item.deletedAt);
  return match?.issueId ?? null;
}

async function visibleSync(ctx: PlanCtx, projectId: string, customerId: string, settings: ProjectSettings | null): Promise<SyncState> {
  const now = ctx.deps.now().toISOString();
  if (!settings) return syncRow(projectId, customerId, "not_configured", "Add the GitHub repository for this project.", now);
  if (settings.recordSource === "compass") return (await ctx.deps.store.getSync(projectId)) ?? syncRow(projectId, customerId, "ok", null, now);
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
  if (!canAccessProject(ctx.principal, project, memberships)) return null;
  return project;
}

async function openForWrite(ctx: PlanCtx, projectId: string) {
  const project = await readable(ctx, projectId);
  if (!project) return null;
  const memberships = await ctx.deps.store.listMembershipsForUser(ctx.principal.userId);
  if (!canWriteProject(ctx.principal, project, memberships)) return "view" as const;
  return project;
}

function viewOnly(correlationId: string): HttpResult {
  return json(403, { code: "VIEW_ONLY", message: "View access can open this project and cannot change it.", correlationId }, correlationId);
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
