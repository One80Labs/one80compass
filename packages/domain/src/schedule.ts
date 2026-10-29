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

/** Inclusive day count from origin through the last day shown. At least a week, so an empty plan still has a scale. Always includes today so the Today marker has a home. */
export function scheduleSpan(dates: { startDate: string | null; finishDate: string | null }[], today: string): { origin: string; days: number } {
  const taskStamps = dates.flatMap((item) => [item.startDate, item.finishDate].filter((value): value is string => Boolean(value && isIsoDate(value))));
  if (taskStamps.length === 0) {
    const origin = isIsoDate(today) ? addDays(today, -1) : "2026-01-01";
    return { origin, days: 14 };
  }
  const stamps = [...taskStamps, ...(isIsoDate(today) ? [today] : [])];
  const sorted = [...stamps].sort();
  const origin = addDays(sorted[0], -1);
  const end = addDays(sorted[sorted.length - 1], 2);
  const days = Math.max(7, Math.round((Date.parse(end) - Date.parse(origin)) / 86_400_000));
  return { origin, days };
}

/** Widen a Timeline span so a dragged bar (plus padding) stays on the chart. */
export function expandSpanToFit(
  span: { origin: string; days: number },
  range: { startDate: string; finishDate: string },
  padDays = 3,
): { origin: string; days: number } {
  if (!isIsoDate(span.origin) || !(span.days > 0) || !isIsoDate(range.startDate) || !isIsoDate(range.finishDate) || range.finishDate < range.startDate) {
    return span;
  }
  let origin = span.origin;
  let last = addDays(span.origin, span.days - 1);
  if (range.startDate < origin) origin = addDays(range.startDate, -padDays);
  if (range.finishDate > last) last = addDays(range.finishDate, padDays);
  const days = Math.max(span.days, Math.round((Date.parse(last) - Date.parse(origin)) / 86_400_000) + 1);
  return { origin, days };
}

/** Whole days from origin to date. Null when either value is not an ISO date. */
export function dayOffset(date: string, origin: string): number | null {
  if (!isIsoDate(date) || !isIsoDate(origin)) return null;
  return Math.round((Date.parse(date) - Date.parse(origin)) / 86_400_000);
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

/** Dropdown label: `I1: 10-24-2026 - 10-29-2026`. Falls back to the title when dates are missing. */
export function iterationOptionLabel(item: { title: string; startDate: string; duration: number }): string {
  const end = iterationFinish(item.startDate, item.duration);
  if (!end || !isIsoDate(item.startDate)) return item.title;
  return `${item.title}: ${iterationDisplayDate(item.startDate)} - ${iterationDisplayDate(end)}`;
}

/**
 * Calendar date people see: mm-dd-yyyy. A leading YYYY-MM-DD is enough, so timestamps format too.
 * Invalid calendar days are left unchanged. Stored values and date inputs stay YYYY-MM-DD.
 */
export function displayDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return value;
  const iso = `${match[1]}-${match[2]}-${match[3]}`;
  if (!isIsoDate(iso)) return value;
  return `${match[2]}-${match[3]}-${match[1]}`;
}

/** ISO date as mm-dd-yyyy for iteration dropdowns. */
export function iterationDisplayDate(iso: string): string {
  return displayDate(iso);
}

export type IterationWindow = { id: string; startDate: string; duration: number };

/** Local calendar day as YYYY-MM-DD (not UTC). Use this for “today” in Current iteration. */
export function localIsoDate(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * Current iteration: today's local calendar date falls on or between that iteration's Start and Finish.
 * Finish is the inclusive last day (`startDate + duration - 1`). When more than one window contains
 * today, the latest Start wins. Null when none match.
 */
export function currentIterationId(iterations: IterationWindow[], today: string): string | null {
  if (!isIsoDate(today)) return null;
  let best: { id: string; startDate: string } | null = null;
  for (const item of iterations) {
    const end = iterationFinish(item.startDate, item.duration);
    if (!end || !item.id || !isIsoDate(item.startDate)) continue;
    if (today < item.startDate || today > end) continue;
    if (!best || item.startDate >= best.startDate) best = { id: item.id, startDate: item.startDate };
  }
  return best?.id ?? null;
}

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
  return `${displayDate(range.start)} – ${displayDate(range.finish)}`;
}

type ChartRow = { depth: number; kind?: string } & Parameters<typeof scheduledRange>[0];

/** An Epic or Feature can keep its own dates until a Task or Subtask is under it. */
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
 * Start and Finish for one Epic or Feature once a Task or Subtask is under it.
 * Null when that parent still has no Task or Subtask, so its own dates stay.
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
