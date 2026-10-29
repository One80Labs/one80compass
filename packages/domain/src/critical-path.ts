/**
 * Critical path on the Hard Blocker DAG (ADR 0007 follow-up).
 *
 * Soft Dependency links never participate. Membership is `predecessorIds` only;
 * optional `blockerEdges.lagDays` add to path length (missing ⇒ 0). Link kind does
 * not change the duration+lag longest-path metric (scheduling anchors are separate).
 *
 * Unscheduled tasks (missing/invalid start or finish) are omitted from the graph —
 * they cannot contribute a schedule span and are never marked critical. A cycle in
 * the blocker graph (refused on write) yields an empty result rather than hanging.
 *
 * Definition: longest path(s) by schedule span =
 *   sum(inclusive day durations of nodes) + sum(lagDays on edges).
 * Equivalent mark: nodes/edges that lie on some root→sink path of that max length.
 */

import { blockerEdgeFor, type BlockerEdge } from "./blocker-edge";
import { isIsoDate } from "./schedule";

export type CriticalPathIssue = {
  issueId: string;
  startDate: string | null;
  finishDate: string | null;
  predecessorIds: string[];
  blockerEdges?: BlockerEdge[] | null;
  inProject?: boolean;
  archived?: boolean;
  deletedAt?: string | null;
};

export type CriticalPathEdge = {
  predecessorId: string;
  successorId: string;
};

export type CriticalPathResult = {
  /** Issue ids on at least one longest Hard Blocker path. */
  issueIds: string[];
  /** Blocker edges that participate in a longest path. */
  edges: CriticalPathEdge[];
};

const EMPTY: CriticalPathResult = { issueIds: [], edges: [] };

function active(issue: CriticalPathIssue): boolean {
  return issue.inProject !== false && !issue.archived && !issue.deletedAt;
}

/** Inclusive calendar days from start through finish. Null when dates are unusable. */
function inclusiveDuration(start: string | null, finish: string | null): number | null {
  if (!start || !finish || !isIsoDate(start) || !isIsoDate(finish) || finish < start) return null;
  return Math.round((Date.parse(finish) - Date.parse(start)) / 86_400_000) + 1;
}

/**
 * Tasks and Hard Blocker edges on the critical path. Soft links are ignored.
 * Unscheduled or inactive rows are skipped. Cycles return an empty set.
 */
export function criticalPath(issues: CriticalPathIssue[]): CriticalPathResult {
  const scheduled = new Map<string, { duration: number; predecessorIds: string[]; edges: BlockerEdge[] | null | undefined }>();
  for (const issue of issues) {
    if (!active(issue)) continue;
    const duration = inclusiveDuration(issue.startDate, issue.finishDate);
    if (duration == null) continue;
    scheduled.set(issue.issueId, {
      duration,
      predecessorIds: issue.predecessorIds ?? [],
      edges: issue.blockerEdges,
    });
  }
  if (scheduled.size === 0) return EMPTY;

  // Adjacency: only Hard Blocker edges whose both ends are scheduled.
  const preds = new Map<string, { id: string; lagDays: number }[]>();
  const succs = new Map<string, { id: string; lagDays: number }[]>();
  for (const id of scheduled.keys()) {
    preds.set(id, []);
    succs.set(id, []);
  }
  for (const [succId, node] of scheduled) {
    for (const predId of node.predecessorIds) {
      if (predId === succId || !scheduled.has(predId)) continue;
      const lagDays = blockerEdgeFor(predId, node.edges).lagDays;
      preds.get(succId)!.push({ id: predId, lagDays });
      succs.get(predId)!.push({ id: succId, lagDays });
    }
  }

  // Kahn topological order; incomplete order ⇒ cycle ⇒ refuse to mark a path.
  const indegree = new Map<string, number>();
  for (const id of scheduled.keys()) indegree.set(id, preds.get(id)?.length ?? 0);
  const queue = [...scheduled.keys()].filter((id) => (indegree.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const edge of succs.get(id) ?? []) {
      const next = (indegree.get(edge.id) ?? 1) - 1;
      indegree.set(edge.id, next);
      if (next === 0) queue.push(edge.id);
    }
  }
  if (order.length !== scheduled.size) return EMPTY;

  // Longest path length ending at each node (duration + lag along the chain).
  const bestIn = new Map<string, number>();
  for (const id of order) {
    const duration = scheduled.get(id)!.duration;
    const incoming = preds.get(id) ?? [];
    if (incoming.length === 0) {
      bestIn.set(id, duration);
      continue;
    }
    let best = -Infinity;
    for (const edge of incoming) {
      best = Math.max(best, (bestIn.get(edge.id) ?? 0) + edge.lagDays + duration);
    }
    bestIn.set(id, best);
  }

  const sinks = [...scheduled.keys()].filter((id) => (succs.get(id) ?? []).length === 0);
  let maxSpan = -Infinity;
  for (const id of sinks) maxSpan = Math.max(maxSpan, bestIn.get(id) ?? -Infinity);
  if (!Number.isFinite(maxSpan) || maxSpan < 0) return EMPTY;

  // Walk backward from max-length sinks along edges that achieve bestIn.
  const criticalIds = new Set<string>();
  const criticalEdges: CriticalPathEdge[] = [];
  const edgeSeen = new Set<string>();
  const stack = sinks.filter((id) => bestIn.get(id) === maxSpan);
  for (const id of stack) criticalIds.add(id);
  while (stack.length > 0) {
    const succId = stack.pop()!;
    const duration = scheduled.get(succId)!.duration;
    const target = (bestIn.get(succId) ?? 0) - duration;
    for (const edge of preds.get(succId) ?? []) {
      if ((bestIn.get(edge.id) ?? 0) + edge.lagDays !== target) continue;
      const key = `${edge.id}>${succId}`;
      if (!edgeSeen.has(key)) {
        edgeSeen.add(key);
        criticalEdges.push({ predecessorId: edge.id, successorId: succId });
      }
      if (!criticalIds.has(edge.id)) {
        criticalIds.add(edge.id);
        stack.push(edge.id);
      }
    }
  }

  return {
    issueIds: [...criticalIds],
    edges: criticalEdges,
  };
}

/** Convenience: issue ids on the critical path as a Set. */
export function criticalPathIssueIds(issues: CriticalPathIssue[]): Set<string> {
  return new Set(criticalPath(issues).issueIds);
}
