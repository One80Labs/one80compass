/** Immutable schedule snapshots. Spec §4.3. A task with no dates is stored that way. */

export type BaselineTask = {
  issueId: string;
  title: string;
  startDate: string | null;
  finishDate: string | null;
};

export type BaselineState = "proposed" | "approved" | "rejected";

export type BaselineRecord = {
  baselineId: string;
  projectId: string;
  customerId: string;
  /** Null until an administrator approves the proposal. Baseline 1 is approved when it is created. */
  number: number | null;
  state: BaselineState;
  explanation: string;
  rejection: string | null;
  tasks: BaselineTask[];
  createdAt: string;
  createdBy: string;
  decidedAt: string | null;
  decidedBy: string | null;
};

export type VarianceKind = "newly_scheduled" | "added" | "removed";

export type VarianceRow = {
  issueId: string;
  title: string;
  kind: VarianceKind;
  baselineStart: string | null;
  baselineFinish: string | null;
  currentStart: string | null;
  currentFinish: string | null;
};

type SnapshotIssue = BaselineTask & {
  inProject: boolean;
  archived: boolean;
  deletedAt: string | null;
};

function active(issue: { inProject: boolean; archived: boolean; deletedAt: string | null }): boolean {
  return issue.inProject && !issue.archived && !issue.deletedAt;
}

function scheduled(start: string | null, finish: string | null): boolean {
  return Boolean(start && finish);
}

/** Active tasks only. Missing dates stay null. */
export function baselineSnapshot(issues: SnapshotIssue[]): BaselineTask[] {
  return issues
    .filter(active)
    .map((issue) => ({
      issueId: issue.issueId,
      title: issue.title,
      startDate: issue.startDate,
      finishDate: issue.finishDate,
    }))
    .sort((left, right) => left.title.localeCompare(right.title) || left.issueId.localeCompare(right.issueId));
}

/**
 * Newly scheduled means the baseline had no dates and the task now has both.
 * A task that already had dates does not get a day-count variance.
 */
export function baselineVariance(current: SnapshotIssue[], snapshot: BaselineTask[]): VarianceRow[] {
  const live = current.filter(active);
  const prior = new Map(snapshot.map((task) => [task.issueId, task]));
  const rows: VarianceRow[] = [];
  for (const issue of live) {
    const baseline = prior.get(issue.issueId);
    if (!baseline) {
      rows.push({
        issueId: issue.issueId,
        title: issue.title,
        kind: "added",
        baselineStart: null,
        baselineFinish: null,
        currentStart: issue.startDate,
        currentFinish: issue.finishDate,
      });
      continue;
    }
    if (!scheduled(baseline.startDate, baseline.finishDate) && scheduled(issue.startDate, issue.finishDate)) {
      rows.push({
        issueId: issue.issueId,
        title: issue.title,
        kind: "newly_scheduled",
        baselineStart: baseline.startDate,
        baselineFinish: baseline.finishDate,
        currentStart: issue.startDate,
        currentFinish: issue.finishDate,
      });
    }
  }
  const liveIds = new Set(live.map((issue) => issue.issueId));
  for (const task of snapshot) {
    if (liveIds.has(task.issueId)) continue;
    rows.push({
      issueId: task.issueId,
      title: task.title,
      kind: "removed",
      baselineStart: task.startDate,
      baselineFinish: task.finishDate,
      currentStart: null,
      currentFinish: null,
    });
  }
  const order: Record<VarianceKind, number> = { added: 0, newly_scheduled: 1, removed: 2 };
  return rows.sort((left, right) => order[left.kind] - order[right.kind] || left.title.localeCompare(right.title));
}
