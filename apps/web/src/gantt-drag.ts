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

/** Which horizontal end of a Gantt bar a connector attaches to. */
export type GanttBarSide = "start" | "finish";

/**
 * Orthogonal SVG path between two bar anchors.
 * Defaults to finish→start (FS / soft Dependency). Pass sides for SS / FF / SF:
 * stub exits outward from `fromSide` and approaches `toSide` from outside the bar.
 */
export function dependencyLinkPath(
  from: GanttLinkAnchor,
  to: GanttLinkAnchor,
  fromSide: GanttBarSide = "finish",
  toSide: GanttBarSide = "start",
): string {
  const stub = 12;
  const exitX = from.x + (fromSide === "finish" ? stub : -stub);
  const entryX = to.x + (toSide === "start" ? -stub : stub);

  // Prefer a simple mid bend when the exit sits left of the entry (typical FS forward link).
  if (exitX <= entryX) {
    const bendX = (exitX + entryX) / 2;
    return `M ${from.x} ${from.y} L ${exitX} ${from.y} L ${bendX} ${from.y} L ${bendX} ${to.y} L ${entryX} ${to.y} L ${to.x} ${to.y}`;
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

/** Browser preference controlling whether critical-path highlighting is visible. */
export const SHOW_CRITICAL_PATH_KEY = "one80.plan.showCriticalPath";

/** Read the critical-path preference. Missing or inaccessible storage defaults to hidden. */
export function readShowCriticalPath(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(SHOW_CRITICAL_PATH_KEY) === "true";
  } catch {
    return false;
  }
}

/** Persist the critical-path highlight preference when browser storage is available. */
export function writeShowCriticalPath(show: boolean): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SHOW_CRITICAL_PATH_KEY, String(show));
    }
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

/** Minimal edge shape for hover filtering (blocker or soft dependency). */
export type GanttDependencyEdge = {
  predecessorId: string;
  successorId: string;
};

/** True when the issue is either endpoint of the edge. */
export function edgeTouchesIssue(edge: GanttDependencyEdge, issueId: string): boolean {
  return edge.predecessorId === issueId || edge.successorId === issueId;
}

/**
 * Edges that touch the given issue as predecessor or successor.
 * Used when the global dependency-line toggle is OFF: hover reveals only this bar's connectors.
 */
export function filterEdgesTouchingIssue<T extends GanttDependencyEdge>(edges: readonly T[], issueId: string): T[] {
  return edges.filter((edge) => edgeTouchesIssue(edge, issueId));
}

/**
 * Other issue ids linked to `issueId` via the given edges (predecessors and successors).
 * Used to emphasize linked bars during hover reveal without turning the global toggle on.
 */
export function linkedIssueIdsForHover(edges: readonly GanttDependencyEdge[], issueId: string): Set<string> {
  const ids = new Set<string>();
  for (const edge of edges) {
    if (edge.predecessorId === issueId) ids.add(edge.successorId);
    else if (edge.successorId === issueId) ids.add(edge.predecessorId);
  }
  return ids;
}
