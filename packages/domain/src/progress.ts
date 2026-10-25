/** Effort-weighted progress for active leaf issues. Spec §4.1. */

export type ProgressIssue = {
  issueId: string;
  parentIssueId: string | null;
  effort: number | null;
  status: string;
  archived: boolean;
  deletedAt: string | null;
  inProject: boolean;
};

export type ProgressSnapshot = {
  state: "empty" | "percent";
  label: string;
  percent: number | null;
  defaultedIssueIds: string[];
};

export function projectProgress(issues: ProgressIssue[], doneStatuses: string[]): ProgressSnapshot {
  const active = issues.filter((issue) => issue.inProject && !issue.archived && !issue.deletedAt);
  const parentIds = new Set(active.map((issue) => issue.parentIssueId).filter((id): id is string => Boolean(id)));
  const leaves = active.filter((issue) => !parentIds.has(issue.issueId));
  if (leaves.length === 0) {
    return { state: "empty", label: "Not Started / No Tasks", percent: null, defaultedIssueIds: [] };
  }
  let done = 0;
  let total = 0;
  const defaultedIssueIds: string[] = [];
  for (const issue of leaves) {
    const estimated = typeof issue.effort === "number" && Number.isFinite(issue.effort);
    const points = estimated ? issue.effort! : 1;
    if (!estimated) defaultedIssueIds.push(issue.issueId);
    total += points;
    if (doneStatuses.includes(issue.status)) done += points;
  }
  const percent = total === 0 ? 0 : Math.round((done / total) * 1000) / 10;
  return { state: "percent", label: `${percent}%`, percent, defaultedIssueIds };
}
