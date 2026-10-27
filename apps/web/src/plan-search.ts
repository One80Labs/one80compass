/** Minimum characters before Project plan type-ahead search runs. */
export const PLAN_SEARCH_MIN = 3;

export type PlanSearchIssue = {
  issueId: string;
  title: string;
  status: string;
  number: number | null;
  parentIssueId: string | null;
  issueType: string | null;
};

/** Title, status, type, or issue number. Empty until three characters are typed. */
export function matchPlanIssues<T extends PlanSearchIssue>(issues: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < PLAN_SEARCH_MIN) return [];
  return issues.filter((issue) => {
    if (issue.title.toLowerCase().includes(needle)) return true;
    if (issue.status.toLowerCase().includes(needle)) return true;
    if (issue.issueType?.toLowerCase().includes(needle)) return true;
    if (issue.number != null && String(issue.number).includes(needle)) return true;
    return false;
  });
}

/** Keep matches and each ancestor so the timeline still shows hierarchy. */
export function planSearchKeepIds<T extends PlanSearchIssue>(issues: T[], matches: T[]): Set<string> {
  const byId = new Map(issues.map((issue) => [issue.issueId, issue]));
  const keep = new Set(matches.map((issue) => issue.issueId));
  for (const match of matches) {
    let parentId = match.parentIssueId;
    while (parentId) {
      keep.add(parentId);
      parentId = byId.get(parentId)?.parentIssueId ?? null;
    }
  }
  return keep;
}
