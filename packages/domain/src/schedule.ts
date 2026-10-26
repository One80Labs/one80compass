/** Task dates. ADR 0006. A bar needs both dates. The finish cannot move before the start. */

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

export function shiftSchedule(
  start: string,
  finish: string,
  edge: "move" | "start" | "finish",
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
