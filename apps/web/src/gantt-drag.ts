/** Pixel delta on a Gantt track → whole-day shift for Start/Finish drags. */
export function dayDeltaFromPointer(trackWidthPx: number, spanDays: number, pointerDeltaX: number): number {
  if (!(trackWidthPx > 0) || !(spanDays > 0)) return 0;
  return Math.round((pointerDeltaX / trackWidthPx) * spanDays);
}
