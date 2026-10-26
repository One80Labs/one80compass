import { addDays, isIsoDate } from "./schedule";

/** Finish-to-start. A task starts the day after the task that blocks it finishes. ADR 0007. */

export type DependencyIssue = {
  issueId: string;
  title: string;
  startDate: string | null;
  finishDate: string | null;
  predecessorIds: string[];
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

function active(issue: DependencyIssue): boolean {
  return issue.inProject && !issue.archived && !issue.deletedAt;
}

function daySpan(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function blockingFinish(
  predecessorIds: string[],
  dates: Map<string, Dates>,
  titles: Map<string, string>,
): { requiredStart: string; predecessorId: string; predecessorTitle: string } | null {
  let best: { requiredStart: string; predecessorId: string; predecessorTitle: string } | null = null;
  for (const predecessorId of predecessorIds) {
    const finish = dates.get(predecessorId)?.finish;
    if (!finish || !isIsoDate(finish)) continue;
    const requiredStart = addDays(finish, 1);
    if (!best || requiredStart > best.requiredStart) {
      best = { requiredStart, predecessorId, predecessorTitle: titles.get(predecessorId) ?? "A predecessor" };
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
    const block = blockingFinish(issue.predecessorIds, dates, titles);
    const current = dates.get(id);
    if (!block || !current?.start || !current.finish || !isIsoDate(current.start) || !isIsoDate(current.finish)) continue;
    if (current.start >= block.requiredStart) continue;
    const toStart = block.requiredStart;
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
    const block = blockingFinish(
      issue.predecessorIds.filter((id) => dates.has(id)),
      dates,
      titles,
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
    if (issue.startDate < block.requiredStart) {
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
