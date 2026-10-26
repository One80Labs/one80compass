/** Parent and child status rules. Spec §4.2. Parents follow their descendant leaves. */

export type HierarchyIssue = {
  issueId: string;
  parentIssueId: string | null;
  status: string;
  archived: boolean;
  deletedAt: string | null;
  inProject: boolean;
};

export type ParentStatusChange = {
  issueId: string;
  from: string;
  to: string;
  initiatingIssueId: string;
};

/** The Done value written back to GitHub, and the first column used when a parent must leave Done. */
export function rollupTargets(doneStatuses: string[], columns: string[]): { doneStatus: string | null; reopenStatus: string | null } {
  const doneStatus = doneStatuses.find((name) => columns.length === 0 || columns.includes(name)) ?? null;
  const reopenStatus = columns.find((name) => !doneStatuses.includes(name)) ?? null;
  return { doneStatus, reopenStatus };
}

/** True when marking this issue Done would hide unfinished work under it. */
export function parentDoneBlocked(issueId: string, issues: HierarchyIssue[], doneStatuses: string[]): boolean {
  const active = activeIssues(issues);
  const children = childMap(active);
  if ((children.get(issueId) ?? []).length === 0) return false;
  return descendantLeaves(issueId, children).some((leaf) => !doneStatuses.includes(leaf.status));
}

/** Status changes for parents whose children no longer match the parent's Done state. */
export function parentStatusChanges(
  issues: HierarchyIssue[],
  doneStatuses: string[],
  doneStatus: string | null,
  reopenStatus: string | null,
  initiatingIssueId: string | null,
): ParentStatusChange[] {
  const active = activeIssues(issues);
  const children = childMap(active);
  const byId = new Map(active.map((issue) => [issue.issueId, issue]));
  const changes: ParentStatusChange[] = [];
  for (const issue of active) {
    if ((children.get(issue.issueId) ?? []).length === 0) continue;
    const leaves = descendantLeaves(issue.issueId, children).sort((left, right) => left.issueId.localeCompare(right.issueId));
    if (leaves.length === 0) continue;
    const leavesDone = leaves.every((leaf) => doneStatuses.includes(leaf.status));
    const parentDone = doneStatuses.includes(issue.status);
    const to = leavesDone && !parentDone ? doneStatus : !leavesDone && parentDone ? reopenStatus : null;
    if (!to || to === issue.status) continue;
    const preferred = initiatingIssueId && isUnder(initiatingIssueId, issue.issueId, byId) ? initiatingIssueId : null;
    changes.push({
      issueId: issue.issueId,
      from: issue.status,
      to,
      initiatingIssueId: preferred ?? leaves.find((leaf) => doneStatuses.includes(leaf.status) === leavesDone)?.issueId ?? leaves[0].issueId,
    });
  }
  return changes;
}

/** Parents first, then each child, with a cycle-safe depth for indentation. */
export function orderedIssues<T extends { issueId: string; parentIssueId: string | null; title: string }>(issues: T[]): Array<T & { depth: number }> {
  const ids = new Set(issues.map((issue) => issue.issueId));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const issue of issues) {
    if (issue.parentIssueId && ids.has(issue.parentIssueId) && issue.parentIssueId !== issue.issueId) {
      const list = children.get(issue.parentIssueId) ?? [];
      list.push(issue);
      children.set(issue.parentIssueId, list);
    } else {
      roots.push(issue);
    }
  }
  const byTitle = (list: T[]) => [...list].sort((left, right) => left.title.localeCompare(right.title) || left.issueId.localeCompare(right.issueId));
  const ordered: Array<T & { depth: number }> = [];
  const seen = new Set<string>();
  const visit = (issue: T, depth: number) => {
    if (seen.has(issue.issueId)) return;
    seen.add(issue.issueId);
    ordered.push({ ...issue, depth });
    for (const child of byTitle(children.get(issue.issueId) ?? [])) visit(child, depth + 1);
  };
  for (const root of byTitle(roots)) visit(root, 0);
  return ordered;
}

function activeIssues(issues: HierarchyIssue[]): HierarchyIssue[] {
  return issues.filter((issue) => issue.inProject && !issue.archived && !issue.deletedAt);
}

function childMap(issues: HierarchyIssue[]): Map<string, HierarchyIssue[]> {
  const ids = new Set(issues.map((issue) => issue.issueId));
  const map = new Map<string, HierarchyIssue[]>();
  for (const issue of issues) {
    if (!issue.parentIssueId || issue.parentIssueId === issue.issueId || !ids.has(issue.parentIssueId)) continue;
    const list = map.get(issue.parentIssueId) ?? [];
    list.push(issue);
    map.set(issue.parentIssueId, list);
  }
  return map;
}

function descendantLeaves(id: string, children: Map<string, HierarchyIssue[]>): HierarchyIssue[] {
  const leaves: HierarchyIssue[] = [];
  const seen = new Set<string>([id]);
  const walk = (current: string) => {
    for (const child of children.get(current) ?? []) {
      if (seen.has(child.issueId)) continue;
      seen.add(child.issueId);
      if ((children.get(child.issueId) ?? []).length === 0) leaves.push(child);
      else walk(child.issueId);
    }
  };
  walk(id);
  return leaves;
}

function isUnder(issueId: string, ancestorId: string, byId: Map<string, HierarchyIssue>): boolean {
  const seen = new Set<string>();
  let current = byId.get(issueId);
  while (current && !seen.has(current.issueId)) {
    if (current.parentIssueId === ancestorId) return true;
    seen.add(current.issueId);
    if (!current.parentIssueId) return false;
    current = byId.get(current.parentIssueId);
  }
  return false;
}
