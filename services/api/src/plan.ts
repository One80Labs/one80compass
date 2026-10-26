import { adminAccess, canAccessProject, canWriteProject, type Principal } from "../../../packages/authz/src/index";
import {
  DEFAULT_COLUMNS,
  DEFAULT_DONE_STATUSES,
  type ProjectSettings,
  type SyncMessage,
  type SyncState,
} from "../../../packages/domain/src/index";
import { parentDoneBlocked, planKind } from "../../../packages/domain/src/hierarchy";
import { dependencyCycle, dependencyReview } from "../../../packages/domain/src/dependencies";
import { baselineSnapshot, type BaselineRecord } from "../../../packages/domain/src/baselines";
import { isIsoDate } from "../../../packages/domain/src/schedule";
import { milestoneViews } from "../../../packages/domain/src/milestones";
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
  const scheduleFields = ctx.path.match(/^\/projects\/([^/]+)\/schedule-fields$/);
  if (scheduleFields && ctx.method === "POST") return ensureScheduleFields(ctx, decodeURIComponent(scheduleFields[1]));
  const planItems = ctx.path.match(/^\/projects\/([^/]+)\/plan-items$/);
  if (planItems && ctx.method === "POST") return createPlanItem(ctx, decodeURIComponent(planItems[1]));
  const removePredecessor = ctx.path.match(/^\/projects\/([^/]+)\/issues\/([^/]+)\/predecessors\/remove$/);
  if (removePredecessor && ctx.method === "POST") return setPredecessor(ctx, decodeURIComponent(removePredecessor[1]), decodeURIComponent(removePredecessor[2]), "remove");
  const addPredecessor = ctx.path.match(/^\/projects\/([^/]+)\/issues\/([^/]+)\/predecessors$/);
  if (addPredecessor && ctx.method === "POST") return setPredecessor(ctx, decodeURIComponent(addPredecessor[1]), decodeURIComponent(addPredecessor[2]), "add");
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
  return null;
}

async function getPlan(ctx: PlanCtx, projectId: string): Promise<HttpResult> {
  const project = await readable(ctx, projectId);
  if (!project) return notFound(ctx.correlationId);
  const settings = await ctx.deps.store.getSettings(projectId);
  const issues = await ctx.deps.store.listIssues(projectId);
  const doneStatuses = settings?.doneStatuses ?? [...DEFAULT_DONE_STATUSES];
  const progress = projectProgress(issues, doneStatuses);
  const override = await ctx.deps.store.getOverride(projectId);
  const milestones = milestoneViews(issues, await ctx.deps.store.listMilestones(projectId), doneStatuses, ctx.deps.now().toISOString().slice(0, 10));
  const baselines = (await ctx.deps.store.listBaselines(projectId)).sort(baselineOrder);
  return json(200, { settings, sync: await visibleSync(ctx, projectId, project.customerId, settings), issues, progress, override, milestones, baselines }, ctx.correlationId);
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
    statusOptions: existing?.statusOptions ?? [],
    doneStatuses: existing?.doneStatuses ?? [...DEFAULT_DONE_STATUSES],
    columns: existing?.columns ?? [...DEFAULT_COLUMNS],
    workstreamNumber: workstream,
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
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  const project = opened;
  if (!project) return notFound(ctx.correlationId);
  const settings = await ctx.deps.store.getSettings(projectId);
  if (!settings) return json(400, { code: "VALIDATION", message: "Save the GitHub repository before syncing.", correlationId: ctx.correlationId }, ctx.correlationId);
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
  const kind = ctx.body.kind;
  const title = typeof ctx.body.title === "string" ? ctx.body.title.trim() : "";
  if (kind !== "epic" && kind !== "feature" && kind !== "issue" && kind !== "subissue") {
    return json(400, { code: "VALIDATION", message: "kind must be epic, feature, issue, or subissue.", correlationId: ctx.correlationId }, ctx.correlationId);
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
  if (kind === "epic" && !settings.workstreamNumber) {
    return json(409, { code: "WORKSTREAM_NOT_SET", message: "Save the Workstream issue number before adding an Epic.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (kind === "feature" && (parentKind !== "epic" || parent?.number == null)) {
    return json(409, { code: "PARENT_REQUIRED", message: "A Feature nests under an Epic that already has a GitHub number.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (kind === "issue" && parent && (parentKind !== "epic" && parentKind !== "feature" || parent.number == null)) {
    return json(409, { code: "PARENT_REQUIRED", message: "An Issue nests under an Epic or a Feature.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (kind === "issue" && !parent && !settings.workstreamNumber) {
    return json(409, { code: "WORKSTREAM_NOT_SET", message: "Save the Workstream issue number, or choose an Epic or Feature.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (kind === "subissue" && (parentKind !== "issue" || parent?.number == null)) {
    return json(409, { code: "PARENT_REQUIRED", message: "A Sub-issue nests under an Issue.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
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

async function updateIssue(ctx: PlanCtx, projectId: string, issueId: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  const project = opened;
  if (!project) return notFound(ctx.correlationId);
  const issue = await ctx.deps.store.getIssue(projectId, issueId);
  if (!issue || issue.customerId !== project.customerId) return notFound(ctx.correlationId);
  const change = issueChange(ctx.body);
  if (!change) return json(400, { code: "VALIDATION", message: "Send a title, description, status, effort, or dates.", correlationId: ctx.correlationId }, ctx.correlationId);
  const start = change.startDate !== undefined ? change.startDate : issue.startDate;
  const finish = change.finishDate !== undefined ? change.finishDate : issue.finishDate;
  if (start && finish && finish < start) {
    return json(400, { code: "VALIDATION", message: "The finish date cannot be before the start date.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  if (change.startDate === issue.startDate) delete change.startDate;
  if (change.finishDate === issue.finishDate) delete change.finishDate;
  if (change.description === issue.description) delete change.description;
  if (Object.keys(change).length === 0) {
    return json(400, { code: "VALIDATION", message: "Send a title, description, status, effort, or dates.", correlationId: ctx.correlationId }, ctx.correlationId);
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
    if (!settings?.startFieldId || !settings.finishFieldId) {
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
      if (!ctx.deps.githubConfigured) return notConfigured(ctx.correlationId);
      const idempotencyKey = typeof ctx.body.idempotencyKey === "string" && ctx.body.idempotencyKey.trim() ? ctx.body.idempotencyKey.trim() : ctx.deps.newId();
      await ctx.deps.store.putSync(syncRow(projectId, project.customerId, "pending", "Sending the schedule to GitHub.", ctx.deps.now().toISOString()));
      await ctx.deps.enqueue({
        type: "update-schedule",
        projectId,
        idempotencyKey,
        changes: [
          { issueId, ...change },
          ...proposals.map((proposal) => ({ issueId: proposal.issueId, startDate: proposal.toStart, finishDate: proposal.toFinish })),
        ],
      });
      return json(202, { accepted: true, idempotencyKey }, ctx.correlationId);
    }
  }
  if (!ctx.deps.githubConfigured) return notConfigured(ctx.correlationId);
  const idempotencyKey = typeof ctx.body.idempotencyKey === "string" && ctx.body.idempotencyKey.trim() ? ctx.body.idempotencyKey.trim() : ctx.deps.newId();
  await ctx.deps.store.putSync(syncRow(projectId, project.customerId, "pending", "Sending the change to GitHub.", ctx.deps.now().toISOString()));
  const message: SyncMessage = { type: "update-issue", projectId, issueId, idempotencyKey, ...change };
  await ctx.deps.enqueue(message);
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
  if (!ctx.deps.githubConfigured) return notConfigured(ctx.correlationId);
  const idempotencyKey = typeof ctx.body.idempotencyKey === "string" && ctx.body.idempotencyKey.trim() ? ctx.body.idempotencyKey.trim() : ctx.deps.newId();
  await ctx.deps.store.putSync(syncRow(projectId, project.customerId, "pending", "Sending the dependency to GitHub.", ctx.deps.now().toISOString()));
  await ctx.deps.enqueue({ type: "set-dependency", projectId, issueId, predecessorId, action, idempotencyKey });
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
    const baseline = baselineRecord(ctx, project.projectId, project.customerId, explanation, tasks, now, {
      number: 1,
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
  const approved = (await ctx.deps.store.listBaselines(projectId)).filter((record) => record.state === "approved");
  const number = state === "approved" ? Math.max(0, ...approved.map((record) => record.number ?? 0)) + 1 : null;
  const now = ctx.deps.now().toISOString();
  const baseline: BaselineRecord = {
    ...existing,
    state,
    number,
    rejection,
    decidedAt: now,
    decidedBy: ctx.principal.userId,
  };
  await ctx.deps.store.putBaseline(baseline);
  await auditBaseline(ctx, project.customerId, projectId, state === "approved" ? "baseline.approved" : "baseline.rejected", baselineId, existing, baseline);
  return json(200, { baseline }, ctx.correlationId);
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

function issueChange(body: Record<string, unknown>): { title?: string; description?: string | null; status?: string; effort?: number | null; startDate?: string | null; finishDate?: string | null } | null {
  const change: { title?: string; description?: string | null; status?: string; effort?: number | null; startDate?: string | null; finishDate?: string | null } = {};
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
  return Object.keys(change).length > 0 ? change : null;
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
