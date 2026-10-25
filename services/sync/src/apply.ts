import type { PlanIssue, ProjectSettings } from "../../../packages/domain/src/index";

/** Applies one GitHub webhook to the project projection. Portal-owned override and health are untouched. */
export function applyGithubDelivery(
  issues: PlanIssue[],
  settings: ProjectSettings,
  eventName: string,
  payload: unknown,
  now: string,
): PlanIssue[] | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  if (eventName === "issues") return applyIssueEvent(issues, settings, body, now);
  if (eventName === "projects_v2_item") return applyProjectItem(issues, settings, body, now);
  return null;
}

function applyIssueEvent(issues: PlanIssue[], settings: ProjectSettings, body: Record<string, unknown>, now: string): PlanIssue[] | null {
  const repository = record(body.repository);
  const owner = record(repository?.owner)?.login;
  if (typeof owner !== "string" || typeof repository?.name !== "string") return null;
  if (owner.toLowerCase() !== settings.owner.toLowerCase() || repository.name.toLowerCase() !== settings.repo.toLowerCase()) return null;
  const issue = record(body.issue);
  if (!issue) return null;
  const issueId = typeof issue.node_id === "string" ? issue.node_id : null;
  if (!issueId) return null;
  const action = typeof body.action === "string" ? body.action : "";
  const current = issues.find((item) => item.issueId === issueId) ?? blankIssue(settings, issueId, now);
  const next: PlanIssue = {
    ...current,
    number: typeof issue.number === "number" ? issue.number : current.number,
    title: typeof issue.title === "string" ? issue.title : current.title,
    issueState: issue.state === "closed" ? "closed" : "open",
    milestone: "milestone" in issue ? milestoneTitle(issue.milestone) : current.milestone,
    deletedAt: action === "deleted" ? now : action === "opened" || action === "reopened" ? null : current.deletedAt,
    updatedAt: now,
  };
  return upsert(issues, next);
}

function applyProjectItem(issues: PlanIssue[], settings: ProjectSettings, body: Record<string, unknown>, now: string): PlanIssue[] | null {
  const item = record(body.projects_v2_item);
  if (!item) return null;
  if (settings.projectNodeId && item.project_node_id !== settings.projectNodeId) return null;
  if (!settings.projectNodeId) return null;
  const issueId = typeof item.content_node_id === "string" ? item.content_node_id : null;
  if (!issueId) return null;
  const action = typeof body.action === "string" ? body.action : "";
  const current = issues.find((entry) => entry.issueId === issueId) ?? blankIssue(settings, issueId, now);
  const next: PlanIssue = {
    ...current,
    itemId: typeof item.node_id === "string" ? item.node_id : current.itemId,
    inProject: action === "deleted" ? false : true,
    archived: action === "archived" ? true : action === "restored" ? false : current.archived,
    updatedAt: now,
  };
  const changes = record(body.changes);
  const fieldValue = record(changes?.field_value);
  const fieldName = typeof fieldValue?.field_name === "string" ? fieldValue.field_name : "";
  if (fieldName === settings.statusFieldName) next.status = fieldText(fieldValue?.to) ?? next.status;
  if (fieldName === settings.effortFieldName) next.effort = fieldNumber(fieldValue?.to);
  return upsert(issues, next);
}

function blankIssue(settings: ProjectSettings, issueId: string, now: string): PlanIssue {
  return {
    issueId,
    itemId: null,
    projectId: settings.projectId,
    customerId: settings.customerId,
    number: null,
    title: "Untitled",
    status: "",
    effort: null,
    issueState: "open",
    archived: false,
    deletedAt: null,
    parentIssueId: null,
    milestone: null,
    inProject: false,
    updatedAt: now,
  };
}

function upsert(issues: PlanIssue[], next: PlanIssue): PlanIssue[] {
  const index = issues.findIndex((issue) => issue.issueId === next.issueId);
  if (index < 0) return [...issues, next];
  const copy = issues.slice();
  copy[index] = next;
  return copy;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function milestoneTitle(value: unknown): string | null {
  const milestone = record(value);
  return typeof milestone?.title === "string" && milestone.title.trim() ? milestone.title : null;
}

function fieldText(value: unknown): string | null {
  if (typeof value === "string") return value;
  const item = record(value);
  return typeof item?.name === "string" ? item.name : null;
}

function fieldNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null) return null;
  const item = record(value);
  return typeof item?.number === "number" ? item.number : null;
}
