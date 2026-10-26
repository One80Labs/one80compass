import type { PlanIssue, ProjectSettings } from "../../../packages/domain/src/index";

/** GitHub webhooks and reconciliation apply only while GitHub still owns the project. */
export function acceptsGithubSync(settings: { recordSource?: string | null }): boolean {
  return settings.recordSource !== "compass";
}

/**
 * GitHub project items have no Compass priority, labels, or relationships.
 * A full replace from reconcile keeps the values already stored for that issue.
 * A new issue, with nothing stored, keeps the incoming empty defaults.
 */
export function keepStoredPlanFields(incoming: PlanIssue, stored: PlanIssue | undefined): PlanIssue {
  if (!stored) return incoming;
  return {
    ...incoming,
    priority: stored.priority,
    labels: [...stored.labels],
    relationships: stored.relationships.map((link) => ({ ...link })),
  };
}

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
  // Spread keeps Compass priority, labels, and relationships. This GitHub payload does not include them.
  const next: PlanIssue = {
    ...current,
    number: typeof issue.number === "number" ? issue.number : current.number,
    title: typeof issue.title === "string" ? issue.title : current.title,
    description: "body" in issue ? (typeof issue.body === "string" && issue.body.trim() ? issue.body : null) : current.description,
    issueState: issue.state === "closed" ? "closed" : "open",
    ...("milestone" in issue
      ? milestoneFields(issue.milestone)
      : { milestone: current.milestone, milestoneId: current.milestoneId, milestoneDueOn: current.milestoneDueOn }),
    deletedAt: action === "deleted" ? now : action === "opened" || action === "reopened" ? null : current.deletedAt,
    parentIssueId: parentLink(action, body, issueId, current.parentIssueId),
    issueType: issueTypeName(issue, current.issueType),
    ...("assignees" in issue ? { assignees: webhookAssignees(issue.assignees) } : {}),
    updatedAt: now,
  };
  let result = upsert(issues, next);
  const sub = record(body.sub_issue);
  const subId = typeof sub?.node_id === "string" ? sub.node_id : null;
  if ((action === "sub_issue_added" || action === "sub_issue_removed") && subId && subId !== issueId) {
    const child = result.find((item) => item.issueId === subId) ?? blankIssue(settings, subId, now);
    const cleared = action === "sub_issue_removed" && child.parentIssueId === issueId;
    result = upsert(result, {
      ...child,
      number: typeof sub?.number === "number" ? sub.number : child.number,
      title: typeof sub?.title === "string" ? sub.title : child.title,
      parentIssueId: action === "sub_issue_added" ? issueId : cleared ? null : child.parentIssueId,
      updatedAt: now,
    });
  }
  return result;
}

function parentLink(action: string, body: Record<string, unknown>, issueId: string, current: string | null): string | null {
  if (action === "parent_issue_removed") return null;
  if (action !== "parent_issue_added") return current;
  const parent = record(body.parent_issue);
  const parentId = typeof parent?.node_id === "string" ? parent.node_id : null;
  return parentId && parentId !== issueId ? parentId : current;
}

function issueTypeName(issue: Record<string, unknown>, current: string | null): string | null {
  if (!("type" in issue)) return current;
  const type = record(issue.type);
  const name = typeof type?.name === "string" ? type.name.trim() : "";
  return name || null;
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
  // Spread keeps Compass priority, labels, and relationships. This GitHub payload does not include them.
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
  if (fieldName === settings.startFieldName) next.startDate = fieldDate(fieldValue?.to);
  if (fieldName === settings.finishFieldName) next.finishDate = fieldDate(fieldValue?.to);
  if (fieldName.toLowerCase() === "iteration") {
    const parsed = iterationFromWebhook(fieldValue?.to);
    if (parsed.iterationStart || fieldValue?.to == null) Object.assign(next, parsed);
  }
  if (fieldName.toLowerCase() === "comments") next.comments = typeof fieldValue?.to === "string" && fieldValue.to.trim() ? fieldValue.to : null;
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
    description: null,
    status: "",
    effort: null,
    issueState: "open",
    archived: false,
    deletedAt: null,
    parentIssueId: null,
    issueType: null,
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
    predecessorIds: [],
    priority: null,
    labels: [],
    relationships: [],
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

function milestoneFields(value: unknown): { milestone: string | null; milestoneId: string | null; milestoneDueOn: string | null } {
  const milestone = record(value);
  const title = typeof milestone?.title === "string" && milestone.title.trim() ? milestone.title.trim() : null;
  if (!title) return { milestone: null, milestoneId: null, milestoneDueOn: null };
  const rawDue = typeof milestone?.due_on === "string" ? milestone.due_on.slice(0, 10) : null;
  return {
    milestone: title,
    milestoneId: typeof milestone?.node_id === "string" && milestone.node_id.trim() ? milestone.node_id : null,
    milestoneDueOn: rawDue && /^\d{4}-\d{2}-\d{2}$/.test(rawDue) ? rawDue : null,
  };
}

function fieldText(value: unknown): string | null {
  if (typeof value === "string") return value;
  const item = record(value);
  return typeof item?.name === "string" ? item.name : null;
}

function iterationFromWebhook(value: unknown): { iterationTitle: string | null; iterationStart: string | null; iterationDuration: number | null; iterationId: string | null } {
  const empty = { iterationTitle: null, iterationStart: null, iterationDuration: null, iterationId: null };
  const iteration = record(value);
  if (!iteration) return empty;
  const rawStart = typeof iteration.start_date === "string" ? iteration.start_date : typeof iteration.startDate === "string" ? iteration.startDate : "";
  const start = /^\d{4}-\d{2}-\d{2}/.test(rawStart) ? rawStart.slice(0, 10) : null;
  const duration = typeof iteration.duration === "number" && Number.isInteger(iteration.duration) && iteration.duration >= 1 ? iteration.duration : null;
  const iterationId = typeof iteration.id === "string" ? iteration.id : typeof iteration.iteration_id === "string" ? iteration.iteration_id : null;
  if (!start || duration == null) return { ...empty, iterationId };
  return { iterationTitle: typeof iteration.title === "string" && iteration.title.trim() ? iteration.title.trim() : null, iterationStart: start, iterationDuration: duration, iterationId };
}

function webhookAssignees(value: unknown): { id: string; login: string; name: string | null }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const person = record(entry);
    const id = typeof person?.node_id === "string" ? person.node_id.trim() : "";
    const login = typeof person?.login === "string" ? person.login.trim() : "";
    if (!id || !login) return [];
    const name = typeof person?.name === "string" && person.name.trim() ? person.name.trim() : null;
    return [{ id, login, name }];
  });
}

function fieldDate(value: unknown): string | null {
  if (typeof value === "string") {
    const date = value.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  }
  const item = record(value);
  return typeof item?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : null;
}

function fieldNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null) return null;
  const item = record(value);
  return typeof item?.number === "number" ? item.number : null;
}
