/** Pixel delta on a Gantt track → whole-day shift for Start/Finish drags. */
export function dayDeltaFromPointer(trackWidthPx: number, spanDays: number, pointerDeltaX: number): number {
  if (!(trackWidthPx > 0) || !(spanDays > 0)) return 0;
  return dayDeltaFromDayWidth(trackWidthPx / spanDays, pointerDeltaX);
}

/** Same as dayDeltaFromPointer when the day width is locked for the length of a drag. */
export function dayDeltaFromDayWidth(dayWidthPx: number, pointerDeltaX: number): number {
  if (!(dayWidthPx > 0)) return 0;
  return Math.round(pointerDeltaX / dayWidthPx);
}

/** Nudge a horizontal scroller when the pointer is near either edge during a Gantt drag. */
export function nudgeScrollForDrag(scrollEl: HTMLElement, clientX: number, edgePx = 48, stepPx = 28): void {
  const rect = scrollEl.getBoundingClientRect();
  if (clientX >= rect.right - edgePx) scrollEl.scrollLeft += stepPx;
  if (clientX <= rect.left + edgePx) scrollEl.scrollLeft -= stepPx;
}

/** A chart-local point used to join two Gantt bars. */
export type GanttLinkAnchor = { x: number; y: number };

/** A Gantt bar's client-coordinate bounds for pointer hit-testing. */
export type GanttBarHit = {
  issueId: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Build an orthogonal SVG path from a predecessor's finish to a successor's start. */
export function dependencyLinkPath(from: GanttLinkAnchor, to: GanttLinkAnchor): string {
  const exitX = from.x + 12;
  const entryX = to.x - 12;

  if (entryX >= exitX) {
    const bendX = (exitX + entryX) / 2;
    return `M ${from.x} ${from.y} L ${bendX} ${from.y} L ${bendX} ${to.y} L ${to.x} ${to.y}`;
  }

  const middleY = (from.y + to.y) / 2;
  return `M ${from.x} ${from.y} L ${exitX} ${from.y} L ${exitX} ${middleY} L ${entryX} ${middleY} L ${entryX} ${to.y} L ${to.x} ${to.y}`;
}

/** Return the last (visually topmost) bar containing the client-coordinate point. */
export function hitTestGanttBar(clientX: number, clientY: number, bars: GanttBarHit[]): string | null {
  for (let index = bars.length - 1; index >= 0; index -= 1) {
    const bar = bars[index];
    if (clientX >= bar.left && clientX <= bar.right && clientY >= bar.top && clientY <= bar.bottom) {
      return bar.issueId;
    }
  }
  return null;
}

/** Browser preference controlling whether dependency lines are visible. */
export const SHOW_DEPENDENCY_LINES_KEY = "one80.plan.showDependencyLines";

/** Read the dependency-line preference. Missing or inaccessible storage defaults to hidden. */
export function readShowDependencyLines(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SHOW_DEPENDENCY_LINES_KEY) === "true";
  } catch {
    return false;
  }
}

/** Persist the dependency-line visibility preference when browser storage is available. */
export function writeShowDependencyLines(show: boolean): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SHOW_DEPENDENCY_LINES_KEY, String(show));
    }
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}
