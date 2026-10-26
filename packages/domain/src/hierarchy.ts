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

export type PlanKind = "workstream" | "epic" | "feature" | "issue" | "subissue";

export type PlanNode = {
  issueId: string;
  title: string;
  parentIssueId: string | null;
  number: number | null;
  issueType: string | null;
};

const PLAN_INDENT: Record<PlanKind, number> = { workstream: 0, epic: 0, feature: 1, issue: 2, subissue: 3 };

/** Epic, Feature, and Workstream come from the GitHub issue type. Issue and Sub-issue do not have one. */
export function planKind<T extends PlanNode>(issue: T, byId: Map<string, T>, workstreamNumber: number | null, seen = new Set<string>()): PlanKind {
  if (seen.has(issue.issueId)) return "issue";
  seen.add(issue.issueId);
  if (issue.issueType === "Workstream" || (workstreamNumber != null && issue.number === workstreamNumber)) return "workstream";
  if (issue.issueType === "Epic") return "epic";
  if (issue.issueType === "Feature") return "feature";
  const parent = issue.parentIssueId ? byId.get(issue.parentIssueId) : undefined;
  if (!parent || parent.issueId === issue.issueId) return "issue";
  const parentKind = planKind(parent, byId, workstreamNumber, seen);
  return parentKind === "issue" || parentKind === "subissue" ? "subissue" : "issue";
}

export type PlanBand<T> = { key: string; title: string; rows: Array<T & { kind: PlanKind; depth: number }> };

/**
 * Epics first, then each Feature, then Issues and their Sub-issues.
 * An Issue directly under an Epic stays at indent 2. The Workstream is omitted.
 * Rows with no Epic ancestor follow in one outside band.
 */
export function planRows<T extends PlanNode>(issues: T[], workstreamNumber: number | null): Array<T & { kind: PlanKind; depth: number }> {
  const byId = new Map(issues.map((issue) => [issue.issueId, issue]));
  const visible = issues.flatMap((issue) => {
    const kind = planKind(issue, byId, workstreamNumber);
    if (kind === "workstream") return [];
    return [{ ...issue, kind, depth: PLAN_INDENT[kind] }];
  });
  const ids = new Set(visible.map((issue) => issue.issueId));
  const children = new Map<string, typeof visible>();
  const roots: typeof visible = [];
  for (const issue of visible) {
    if (issue.parentIssueId && ids.has(issue.parentIssueId) && issue.parentIssueId !== issue.issueId) {
      const list = children.get(issue.parentIssueId) ?? [];
      list.push(issue);
      children.set(issue.parentIssueId, list);
    } else {
      roots.push(issue);
    }
  }
  const rank: Record<PlanKind, number> = { feature: 0, issue: 1, subissue: 2, epic: 3, workstream: 4 };
  const orderedChildren = (id: string) =>
    [...(children.get(id) ?? [])].sort(
      (left, right) => rank[left.kind] - rank[right.kind] || left.title.localeCompare(right.title) || left.issueId.localeCompare(right.issueId),
    );
  const byTitle = (list: typeof visible) => [...list].sort((left, right) => left.title.localeCompare(right.title) || left.issueId.localeCompare(right.issueId));
  const ordered: typeof visible = [];
  const seen = new Set<string>();
  const visit = (issue: (typeof visible)[number]) => {
    if (seen.has(issue.issueId)) return;
    seen.add(issue.issueId);
    ordered.push(issue);
    for (const child of orderedChildren(issue.issueId)) visit(child);
  };
  for (const epic of byTitle(roots.filter((issue) => issue.kind === "epic"))) visit(epic);
  for (const row of byTitle(roots.filter((issue) => issue.kind !== "epic"))) visit(row);
  return ordered;
}

export function planBands<T extends PlanNode>(issues: T[], workstreamNumber: number | null): PlanBand<T>[] {
  const rows = planRows(issues, workstreamNumber);
  const byId = new Map(rows.map((issue) => [issue.issueId, issue]));
  const bands: PlanBand<T>[] = [];
  let current: PlanBand<T> | null = null;
  const outside: PlanBand<T>["rows"] = [];
  const underEpic = (issue: (typeof rows)[number]): boolean => {
    const seen = new Set<string>();
    let parentId = issue.parentIssueId;
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      const parent = byId.get(parentId);
      if (!parent) return false;
      if (parent.kind === "epic") return true;
      parentId = parent.parentIssueId;
    }
    return false;
  };
  for (const row of rows) {
    if (row.kind === "epic") {
      current = { key: row.issueId, title: row.title, rows: [row] };
      bands.push(current);
      continue;
    }
    if (current && underEpic(row)) current.rows.push(row);
    else outside.push(row);
  }
  if (outside.length > 0) bands.push({ key: "outside", title: "Outside an Epic", rows: outside });
  return bands;
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
