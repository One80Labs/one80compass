/** Task dates. ADR 0006. A bar needs both dates. The finish cannot move before the start. */

import { planKind, type PlanKind, type PlanNode } from "./hierarchy";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function addDays(iso: string, days: number): string {
  const match = DATE.exec(iso);
  if (!match) return iso;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return date.toISOString().slice(0, 10);
}

/** Inclusive day count from origin through the last day shown. At least a week, so an empty plan still has a scale. */
export function scheduleSpan(dates: { startDate: string | null; finishDate: string | null }[], today: string): { origin: string; days: number } {
  const stamps = dates.flatMap((item) => [item.startDate, item.finishDate].filter((value): value is string => Boolean(value && isIsoDate(value))));
  if (stamps.length === 0) return { origin: isIsoDate(today) ? today : "2026-01-01", days: 14 };
  const sorted = [...stamps].sort();
  const origin = addDays(sorted[0], -1);
  const end = addDays(sorted[sorted.length - 1], 2);
  const days = Math.max(7, Math.round((Date.parse(end) - Date.parse(origin)) / 86_400_000));
  return { origin, days };
}

export type ScheduleEdge = "move" | "start" | "finish";

export function shiftSchedule(
  start: string,
  finish: string,
  edge: ScheduleEdge,
  days: number,
): { startDate: string; finishDate: string } {
  if (edge === "move") return { startDate: addDays(start, days), finishDate: addDays(finish, days) };
  if (edge === "start") {
    const next = addDays(start, days);
    return { startDate: next <= finish ? next : finish, finishDate: finish };
  }
  const next = addDays(finish, days);
  return { startDate: start, finishDate: next >= start ? next : start };
}

/** The last day of a GitHub iteration. Duration is the number of days, including the start date. */
export function iterationFinish(start: string, duration: number): string | null {
  if (!isIsoDate(start) || !Number.isInteger(duration) || duration < 1) return null;
  return addDays(start, duration - 1);
}

export type IterationWindow = { id: string; startDate: string; duration: number };

/**
 * Iteration that fits a Start/Finish range after a Timeline drag.
 * Prefers the iteration that contains Finish, then Start, then the largest overlap. Null when none overlap.
 */
export function iterationForDates(iterations: IterationWindow[], startDate: string, finishDate: string): string | null {
  if (!isIsoDate(startDate) || !isIsoDate(finishDate) || finishDate < startDate) return null;
  const windows = iterations.flatMap((item) => {
    const end = iterationFinish(item.startDate, item.duration);
    if (!end || !item.id) return [];
    return [{ id: item.id, start: item.startDate, end }];
  });
  const containingFinish = windows.find((window) => finishDate >= window.start && finishDate <= window.end);
  if (containingFinish) return containingFinish.id;
  const containingStart = windows.find((window) => startDate >= window.start && startDate <= window.end);
  if (containingStart) return containingStart.id;
  let best: { id: string; overlap: number } | null = null;
  for (const window of windows) {
    const overlapStart = startDate > window.start ? startDate : window.start;
    const overlapEnd = finishDate < window.end ? finishDate : window.end;
    if (overlapEnd < overlapStart) continue;
    const overlap = Math.round((Date.parse(overlapEnd) - Date.parse(overlapStart)) / 86_400_000) + 1;
    if (!best || overlap > best.overlap) best = { id: window.id, overlap };
  }
  return best?.id ?? null;
}

export type ScheduledRange = { start: string; finish: string; fromIteration: boolean };

/** The Timeline bar is the Start and Finish fields. An iteration updates those fields when it is chosen. */
export function scheduledRange(issue: {
  startDate: string | null;
  finishDate: string | null;
}): ScheduledRange | null {
  if (issue.startDate && issue.finishDate && isIsoDate(issue.startDate) && isIsoDate(issue.finishDate) && issue.finishDate >= issue.startDate) {
    return { start: issue.startDate, finish: issue.finishDate, fromIteration: false };
  }
  return null;
}

/**
 * The first iteration choice copies that iteration's start and end into Start and Finish.
 * A later choice keeps Start and sets Finish to the new iteration end.
 * If that end is before Start, Start moves to the new iteration start so the range stays valid.
 */
export function datesAfterIterationPick(input: {
  hadIteration: boolean;
  pickedBefore: boolean;
  startDate: string;
  iterationStart: string;
  iterationEnd: string;
}): { startDate: string; finishDate: string } {
  const firstPick = !input.hadIteration && !input.pickedBefore;
  const start = firstPick || !input.startDate || input.startDate > input.iterationEnd ? input.iterationStart : input.startDate;
  return { startDate: start, finishDate: input.iterationEnd };
}

export function scheduleText(issue: { startDate: string | null; finishDate: string | null }): string {
  const range = scheduledRange(issue);
  if (!range) return "Not scheduled";
  return `${range.start} – ${range.finish}`;
}

type ChartRow = { depth: number; kind?: string } & Parameters<typeof scheduledRange>[0];

/** An Epic or Feature can keep its own dates until a Task or Sub-issue is under it. */
export function datesAreDerived(kind: PlanKind): boolean {
  return kind === "epic" || kind === "feature";
}

type DatedNode = PlanNode & { startDate: string | null; finishDate: string | null };

/** Epic and Feature Start and Finish values that differ from the tasks under them. */
export function scheduleRollups(
  issues: DatedNode[],
  workstreamNumber: number | null,
): { issueId: string; startDate: string | null; finishDate: string | null }[] {
  return issues.flatMap((issue) => {
    const rolled = derivedSchedule(issues, workstreamNumber, issue.issueId);
    if (!rolled || (rolled.startDate === issue.startDate && rolled.finishDate === issue.finishDate)) return [];
    return [{ issueId: issue.issueId, ...rolled }];
  });
}

/**
 * Start and Finish for one Epic or Feature once a Task or Sub-issue is under it.
 * Null when that parent still has no Task or Sub-issue, so its own dates stay.
 */
export function derivedSchedule(
  issues: DatedNode[],
  workstreamNumber: number | null,
  issueId: string,
): { startDate: string | null; finishDate: string | null } | null {
  const byId = new Map(issues.map((issue) => [issue.issueId, issue]));
  const issue = byId.get(issueId);
  if (!issue || !datesAreDerived(planKind(issue, byId, workstreamNumber))) return null;
  const children = new Map<string, DatedNode[]>();
  for (const item of issues) {
    if (!item.parentIssueId || item.parentIssueId === item.issueId) continue;
    const list = children.get(item.parentIssueId) ?? [];
    list.push(item);
    children.set(item.parentIssueId, list);
  }
  return descendantSpan(issueId, children, byId, workstreamNumber);
}

function descendantSpan(
  issueId: string,
  children: Map<string, DatedNode[]>,
  byId: Map<string, DatedNode>,
  workstreamNumber: number | null,
): { startDate: string | null; finishDate: string | null } | null {
  let start: string | null = null;
  let finish: string | null = null;
  let sawTask = false;
  const stack = [...(children.get(issueId) ?? [])];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const child = stack.pop();
    if (!child || seen.has(child.issueId)) continue;
    seen.add(child.issueId);
    stack.push(...(children.get(child.issueId) ?? []));
    if (datesAreDerived(planKind(child, byId, workstreamNumber))) continue;
    sawTask = true;
    const range = scheduledRange(child);
    if (!range) continue;
    if (!start || range.start < start) start = range.start;
    if (!finish || range.finish > finish) finish = range.finish;
  }
  if (!sawTask) return null;
  return { startDate: start, finishDate: finish };
}

/** The bar the Timeline draws. An Epic or Feature with a task under it uses that span. Otherwise it uses its own Start and Finish. */
export function chartRanges(rows: ChartRow[]): (ScheduledRange | null)[] {
  return rows.map((_, index) => chartRange(rows, index));
}

function chartRange(rows: ChartRow[], index: number): ScheduledRange | null {
  const row = rows[index];
  if (row.kind !== "epic" && row.kind !== "feature") return scheduledRange(row);
  let start: string | null = null;
  let finish: string | null = null;
  let sawTask = false;
  for (let child = index + 1; child < rows.length && rows[child].depth > row.depth; child += 1) {
    if (rows[child].kind === "epic" || rows[child].kind === "feature") continue;
    sawTask = true;
    const range = scheduledRange(rows[child]);
    if (!range) continue;
    if (!start || range.start < start) start = range.start;
    if (!finish || range.finish > finish) finish = range.finish;
  }
  if (!sawTask) return scheduledRange(row);
  if (!start || !finish) return null;
  return { start, finish, fromIteration: false };
}

export function barPlacement(start: string, finish: string, origin: string, days: number): { left: string; width: string } {
  const day = 86_400_000;
  const startOffset = Math.round((Date.parse(start) - Date.parse(origin)) / day);
  const length = Math.round((Date.parse(finish) - Date.parse(start)) / day) + 1;
  return { left: `${(Math.max(startOffset, 0) / days) * 100}%`, width: `${(Math.max(length, 1) / days) * 100}%` };
}
