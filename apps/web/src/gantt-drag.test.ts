import { describe, expect, it } from "vitest";
import { dayDeltaFromPointer } from "./gantt-drag";

describe("dayDeltaFromPointer", () => {
  it("maps pointer travel to whole days on the chart scale", () => {
    expect(dayDeltaFromPointer(280, 14, 20)).toBe(1);
    expect(dayDeltaFromPointer(280, 14, -40)).toBe(-2);
    expect(dayDeltaFromPointer(0, 14, 20)).toBe(0);
  });
});
