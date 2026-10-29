import { addDays, isIsoDate } from "./schedule";
import {
  blockerEdgeFor,
  normalizeLagDays,
  requiredSuccessorFinish,
  requiredSuccessorStart,
  type BlockerEdge,
  type BlockerLinkKind,
} from "./blocker-edge";

export { criticalPath, criticalPathIssueIds } from "./critical-path";
export type { CriticalPathEdge, CriticalPathIssue, CriticalPathResult } from "./critical-path";

/** Hard Blocker scheduling (FS / SS / FF / SF + lag) and soft visual-only Dependency. ADR 0007. */

export const SOFT_DEPENDENCY_KIND = "dependency";

export type { BlockerEdge, BlockerLinkKind, LinkKindEnds } from "./blocker-edge";
export {
  blockerEdgeFor,
  blockerEdgesFromStore,
  linkKindEnds,
  MAX_ABS_LAG_DAYS,
  normalizeBlockerLinkKind,
  normalizeLagDays,
  requiredSuccessorFinish,
  requiredSuccessorStart,
  syncBlockerEdges,
  withBlockerLag,
  withBlockerLinkKind,
} from "./blocker-edge";

type Relationship = { id: string; kind: string; otherIssueId: string };

export type SoftDependencyEdge = {
  successorId: string;
  predecessorId: string;
  relationshipId: string;
};

export type LinkType = "dependency" | "blocker";

export type DependencyIssue = {
  issueId: string;
  title: string;
  startDate: string | null;
  finishDate: string | null;
  predecessorIds: string[];
  /** Optional per-predecessor lag / link-kind. Missing ⇒ FS + 0. */
  blockerEdges?: BlockerEdge[] | null;
  inProject: boolean;
  archived: boolean;
  deletedAt: string | null;
};

export type ProposedShift = {
  issueId: string;
  title: string;
  fromStart: string;
  fromFinish: string;
  toStart: string;
  toFinish: string;
};

export type ScheduleConflict = {
  issueId: string;
  title: string;
  predecessorId: string;
  predecessorTitle: string;
  reason: "overlap" | "unscheduled";
};

type Dates = { start: string | null; finish: string | null };

/** Predecessor ids from soft dependency relationships on one issue. */
export function softDependencyPredecessorIds(relationships: Relationship[] | undefined | null): string[] {
  return (relationships ?? [])
    .filter((relationship) => relationship.kind === SOFT_DEPENDENCY_KIND)
    .map((relationship) => relationship.otherIssueId);
}

/** All soft edges across issues (successor → predecessor). */
export function softDependencyEdges(
  issues: { issueId: string; relationships?: Relationship[] | null }[],
): SoftDependencyEdge[] {
  return issues.flatMap((issue) =>
    (issue.relationships ?? [])
      .filter((relationship) => relationship.kind === SOFT_DEPENDENCY_KIND)
      .map((relationship) => ({
        successorId: issue.issueId,
        predecessorId: relationship.otherIssueId,
        relationshipId: relationship.id,
      })),
  );
}

export function hasSoftDependency(
  relationships: Relationship[] | undefined | null,
  predecessorId: string,
): boolean {
  return (relationships ?? []).some(
    (relationship) =>
      relationship.kind === SOFT_DEPENDENCY_KIND && relationship.otherIssueId === predecessorId,
  );
}

/** Returns a new array with an idempotent soft dependency relationship. */
export function addSoftDependencyRelationship(
  relationships: Relationship[] | undefined | null,
  successorId: string,
  predecessorId: string,
): Relationship[] {
  const next = relationships ?? [];
  if (hasSoftDependency(next, predecessorId)) return [...next];
  return [
    ...next,
    {
      id: `${SOFT_DEPENDENCY_KIND}:${successorId}:${predecessorId}`,
      kind: SOFT_DEPENDENCY_KIND,
      otherIssueId: predecessorId,
    },
  ];
}

export function removeSoftDependencyRelationship(
  relationships: Relationship[] | undefined | null,
  predecessorId: string,
): Relationship[] {
  return (relationships ?? []).filter(
    (relationship) =>
      relationship.kind !== SOFT_DEPENDENCY_KIND || relationship.otherIssueId !== predecessorId,
  );
}

/**
 * True when the successor's dates violate one Hard Blocker edge.
 * Optional lagDays / linkKind match blockerEdges (default FS + 0 = v1 day-after-finish).
 * Soft dependencies never call this.
 */
export function datesOverlapForBlocker(
  predecessor: { finishDate: string | null; startDate?: string | null },
  successor: { startDate: string | null; finishDate?: string | null },
  options?: { lagDays?: number; linkKind?: BlockerLinkKind },
): boolean {
  const linkKind = options?.linkKind ?? "FS";
  const lagDays = normalizeLagDays(options?.lagDays ?? 0);
  const pred = {
    startDate: predecessor.startDate ?? null,
    finishDate: predecessor.finishDate,
  };
  if (linkKind === "FF" || linkKind === "SF") {
    const requiredFinish = requiredSuccessorFinish({ linkKind, lagDays, predecessor: pred });
    if (!requiredFinish || !successor.finishDate || !isIsoDate(successor.finishDate)) return false;
    return successor.finishDate < requiredFinish;
  }
  if (!successor.startDate || !isIsoDate(successor.startDate)) return false;
  const requiredStart = requiredSuccessorStart({ linkKind, lagDays, predecessor: pred });
  if (!requiredStart) return false;
  return successor.startDate < requiredStart;
}

/**
 * Pure link-type conversion. Callers converting to a blocker must run
 * dependencyCycle before applying the result.
 */
export function convertPlanLink(args: {
  successorId: string;
  predecessorId: string;
  from: LinkType;
  to: LinkType;
  predecessorIds: string[];
  relationships: Relationship[];
}): { predecessorIds: string[]; relationships: Relationship[] } | { error: "noop" | "missing" } {
  if (args.from === args.to) return { error: "noop" };

  if (args.from === "dependency") {
    if (!hasSoftDependency(args.relationships, args.predecessorId)) return { error: "missing" };
    return {
      predecessorIds: args.predecessorIds.includes(args.predecessorId)
        ? [...args.predecessorIds]
        : [...args.predecessorIds, args.predecessorId],
      relationships: removeSoftDependencyRelationship(args.relationships, args.predecessorId),
    };
  }

  if (!args.predecessorIds.includes(args.predecessorId)) return { error: "missing" };
  return {
    predecessorIds: args.predecessorIds.filter((id) => id !== args.predecessorId),
    relationships: addSoftDependencyRelationship(
      args.relationships,
      args.successorId,
      args.predecessorId,
    ),
  };
}

function active(issue: DependencyIssue): boolean {
  return issue.inProject && !issue.archived && !issue.deletedAt;
}

function daySpan(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/** Inclusive day count when both ends are scheduled; otherwise null. */
function inclusiveDays(start: string | null | undefined, finish: string | null | undefined): number | null {
  if (!start || !finish || !isIsoDate(start) || !isIsoDate(finish) || finish < start) return null;
  return daySpan(start, finish) + 1;
}

/**
 * Most constraining Hard Blocker on a successor, expressed as an earliest legal start
 * (duration-preserving for FF / SF when successorInclusiveDays is known).
 */
function blockingFinish(
  predecessorIds: string[],
  dates: Map<string, Dates>,
  titles: Map<string, string>,
  edges?: BlockerEdge[] | null,
  successorInclusiveDays?: number | null,
): { requiredStart: string; predecessorId: string; predecessorTitle: string; linkKind: BlockerLinkKind } | null {
  let best: {
    requiredStart: string;
    predecessorId: string;
    predecessorTitle: string;
    linkKind: BlockerLinkKind;
  } | null = null;
  for (const predecessorId of predecessorIds) {
    const predDates = dates.get(predecessorId);
    if (!predDates) continue;
    const edge = blockerEdgeFor(predecessorId, edges);
    let requiredStart = requiredSuccessorStart({
      linkKind: edge.linkKind,
      lagDays: edge.lagDays,
      predecessor: { startDate: predDates.start, finishDate: predDates.finish },
      successorInclusiveDays,
    });
    // Unscheduled successors still need a conflict signal for finish-constrained kinds.
    if (!requiredStart && (edge.linkKind === "FF" || edge.linkKind === "SF")) {
      requiredStart = requiredSuccessorFinish({
        linkKind: edge.linkKind,
        lagDays: edge.lagDays,
        predecessor: { startDate: predDates.start, finishDate: predDates.finish },
      });
    }
    if (!requiredStart) continue;
    if (!best || requiredStart > best.requiredStart) {
      best = {
        requiredStart,
        predecessorId,
        predecessorTitle: titles.get(predecessorId) ?? "A predecessor",
        linkKind: edge.linkKind,
      };
    }
  }
  return best;
}

/** Shifts that would clear a new overlap. Empty when the edit leaves every scheduled successor legal. */
export function dependencyReview(
  issues: DependencyIssue[],
  editedId: string,
  nextStart: string | null,
  nextFinish: string | null,
): ProposedShift[] {
  const rows = issues.filter(active);
  const byId = new Map(rows.map((issue) => [issue.issueId, issue]));
  if (!byId.has(editedId)) return [];
  const titles = new Map(rows.map((issue) => [issue.issueId, issue.title]));
  const dates = new Map<string, Dates>(rows.map((issue) => [issue.issueId, { start: issue.startDate, finish: issue.finishDate }]));
  dates.set(editedId, { start: nextStart, finish: nextFinish });
  const successors = new Map<string, string[]>();
  for (const issue of rows) {
    for (const predecessorId of issue.predecessorIds) {
      if (!byId.has(predecessorId) || predecessorId === issue.issueId) continue;
      const list = successors.get(predecessorId) ?? [];
      list.push(issue.issueId);
      successors.set(predecessorId, list);
    }
  }
  const ordered: string[] = [];
  const seen = new Set<string>([editedId]);
  const queue = [...(successors.get(editedId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
    for (const child of successors.get(id) ?? []) queue.push(child);
  }
  const proposals: ProposedShift[] = [];
  for (const id of ordered) {
    const issue = byId.get(id);
    if (!issue) continue;
    const current = dates.get(id);
    if (!current?.start || !current.finish || !isIsoDate(current.start) || !isIsoDate(current.finish)) continue;
    const duration = inclusiveDays(current.start, current.finish);
    const block = blockingFinish(issue.predecessorIds, dates, titles, issue.blockerEdges, duration);
    if (!block) continue;
    // Finish-constrained rows without duration conversion used finish as requiredStart sentinel above;
    // re-resolve with duration so the proposal preserves length against the finish constraint.
    const requiredStart =
      block.linkKind === "FF" || block.linkKind === "SF"
        ? requiredSuccessorStart({
            linkKind: block.linkKind,
            lagDays: blockerEdgeFor(block.predecessorId, issue.blockerEdges).lagDays,
            predecessor: {
              startDate: dates.get(block.predecessorId)?.start ?? null,
              finishDate: dates.get(block.predecessorId)?.finish ?? null,
            },
            successorInclusiveDays: duration,
          })
        : block.requiredStart;
    if (!requiredStart || current.start >= requiredStart) continue;
    const toStart = requiredStart;
    const toFinish = addDays(current.finish, daySpan(current.start, toStart));
    proposals.push({
      issueId: id,
      title: issue.title,
      fromStart: current.start,
      fromFinish: current.finish,
      toStart,
      toFinish,
    });
    dates.set(id, { start: toStart, finish: toFinish });
  }
  return proposals;
}

/** Overlaps and unscheduled successors on the current plan. */
export function scheduleConflicts(issues: DependencyIssue[]): ScheduleConflict[] {
  const rows = issues.filter(active);
  const dates = new Map<string, Dates>(rows.map((issue) => [issue.issueId, { start: issue.startDate, finish: issue.finishDate }]));
  const titles = new Map(rows.map((issue) => [issue.issueId, issue.title]));
  const conflicts: ScheduleConflict[] = [];
  for (const issue of rows) {
    const duration = inclusiveDays(issue.startDate, issue.finishDate);
    const block = blockingFinish(
      issue.predecessorIds.filter((id) => dates.has(id)),
      dates,
      titles,
      issue.blockerEdges,
      duration,
    );
    if (!block) continue;
    if (!issue.startDate || !issue.finishDate) {
      conflicts.push({
        issueId: issue.issueId,
        title: issue.title,
        predecessorId: block.predecessorId,
        predecessorTitle: block.predecessorTitle,
        reason: "unscheduled",
      });
      continue;
    }
    const edge = blockerEdgeFor(block.predecessorId, issue.blockerEdges);
    const violates =
      edge.linkKind === "FF" || edge.linkKind === "SF"
        ? Boolean(
            issue.finishDate &&
              (() => {
                const requiredFinish = requiredSuccessorFinish({
                  linkKind: edge.linkKind,
                  lagDays: edge.lagDays,
                  predecessor: {
                    startDate: dates.get(block.predecessorId)?.start ?? null,
                    finishDate: dates.get(block.predecessorId)?.finish ?? null,
                  },
                });
                return requiredFinish != null && issue.finishDate < requiredFinish;
              })(),
          )
        : issue.startDate < block.requiredStart;
    if (violates) {
      conflicts.push({
        issueId: issue.issueId,
        title: issue.title,
        predecessorId: block.predecessorId,
        predecessorTitle: block.predecessorTitle,
        reason: "overlap",
      });
    }
  }
  return conflicts;
}
/** True when making predecessorId block successorId would loop, including a task blocking itself. */
export function dependencyCycle(issues: { issueId: string; predecessorIds: string[] }[], successorId: string, predecessorId: string): boolean {
  if (successorId === predecessorId) return true;
  const predecessors = new Map(issues.map((issue) => [issue.issueId, issue.predecessorIds]));
  const seen = new Set<string>();
  const stack = [predecessorId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    if (id === successorId) return true;
    seen.add(id);
    for (const pred of predecessors.get(id) ?? []) stack.push(pred);
  }
  return false;
}
