import { describe, expect, it } from "vitest";
import { dayDeltaFromDayWidth, dayDeltaFromPointer, nudgeScrollForDrag } from "./gantt-drag";

describe("dayDeltaFromPointer", () => {
  it("maps pointer travel to whole days on the chart scale", () => {
    expect(dayDeltaFromPointer(280, 14, 20)).toBe(1);
    expect(dayDeltaFromPointer(280, 14, -40)).toBe(-2);
    expect(dayDeltaFromPointer(0, 14, 20)).toBe(0);
  });
});

describe("dayDeltaFromDayWidth", () => {
  it("keeps the day size stable while the Timeline expands during a drag", () => {
    expect(dayDeltaFromDayWidth(20, 40)).toBe(2);
    expect(dayDeltaFromDayWidth(20, -20)).toBe(-1);
  });
});

describe("nudgeScrollForDrag", () => {
  it("scrolls when the pointer sits on the scroller edge", () => {
    const el = {
      scrollLeft: 100,
      getBoundingClientRect: () => ({ left: 0, right: 200, top: 0, bottom: 40, width: 200, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    };
    nudgeScrollForDrag(el as HTMLElement, 190, 48, 28);
    expect(el.scrollLeft).toBe(128);
    nudgeScrollForDrag(el as HTMLElement, 10, 48, 28);
    expect(el.scrollLeft).toBe(100);
  });
});
