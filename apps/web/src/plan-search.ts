/** Minimum characters before Project plan type-ahead search runs (except pure key numbers). */
export const PLAN_SEARCH_MIN = 3;

export type PlanSearchIssue = {
  issueId: string;
  title: string;
  status: string;
  number: number | null;
  /** Per-project sequence used in COMP-N keys. */
  keyNumber?: number | null;
  parentIssueId: string | null;
  issueType: string | null;
};

/** True when the query is long enough to run type-ahead (or is a key number). */
export function planSearchIsActive(query: string): boolean {
  const needle = query.trim();
  if (!needle) return false;
  if (/^\d+$/.test(needle)) return true;
  return needle.length >= PLAN_SEARCH_MIN;
}

/**
 * Title, status, type, GitHub number, or action-item key.
 * Keys match case-insensitively as COMP-31, COMP31, or 31 (exact key number).
 */
export function matchPlanIssues<T extends PlanSearchIssue>(
  issues: T[],
  query: string,
  projectKey: string | null | undefined = null,
): T[] {
  const raw = query.trim();
  if (!planSearchIsActive(raw)) return [];
  const needle = raw.toLowerCase();
  const keyPrefix = typeof projectKey === "string" ? projectKey.trim().toLowerCase() : "";
  const digitsOnly = /^\d+$/.test(needle);

  return issues.filter((issue) => {
    // Pure digits target key / GitHub numbers only (avoid "3" matching "R3" in titles).
    if (digitsOnly) {
      if (issue.keyNumber != null && String(issue.keyNumber) === needle) return true;
      if (issue.number != null && String(issue.number) === needle) return true;
      return false;
    }
    if (issue.title.toLowerCase().includes(needle)) return true;
    if (issue.status.toLowerCase().includes(needle)) return true;
    if (issue.issueType?.toLowerCase().includes(needle)) return true;
    if (issue.number != null && String(issue.number).includes(needle)) return true;
    if (matchesActionItemKey(issue.keyNumber ?? null, keyPrefix, needle)) return true;
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

function matchesActionItemKey(keyNumber: number | null, projectKeyLower: string, needleLower: string): boolean {
  if (keyNumber == null || !Number.isInteger(keyNumber) || keyNumber < 1) return false;
  if (!projectKeyLower) return false;
  const num = String(keyNumber);
  const withHyphen = `${projectKeyLower}-${num}`;
  const withoutHyphen = `${projectKeyLower}${num}`;
  const compactNeedle = needleLower.replace(/-/g, "");
  return needleLower === withHyphen || compactNeedle === withoutHyphen;
}
