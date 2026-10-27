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
