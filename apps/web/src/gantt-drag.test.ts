import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SHOW_DEPENDENCY_LINES_KEY,
  dayDeltaFromDayWidth,
  dayDeltaFromPointer,
  dependencyLinkPath,
  hitTestGanttBar,
  nudgeScrollForDrag,
  readShowDependencyLines,
  writeShowDependencyLines,
} from "./gantt-drag";

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

describe("dependencyLinkPath", () => {
  it("builds a non-empty path between finish and start anchors", () => {
    const path = dependencyLinkPath({ x: 40, y: 12 }, { x: 120, y: 48 });

    expect(path).toMatch(/^M 40 12 /);
    expect(path).toContain("120 48");
  });
});

describe("hitTestGanttBar", () => {
  const bars = [
    { issueId: "first", left: 10, top: 20, right: 50, bottom: 40 },
    { issueId: "topmost", left: 30, top: 20, right: 70, bottom: 40 },
  ];

  it("includes bar edges and returns null outside", () => {
    expect(hitTestGanttBar(10, 20, bars)).toBe("first");
    expect(hitTestGanttBar(70, 40, bars)).toBe("topmost");
    expect(hitTestGanttBar(9, 20, bars)).toBeNull();
  });

  it("prefers the last matching bar when boxes overlap", () => {
    expect(hitTestGanttBar(40, 30, bars)).toBe("topmost");
  });
});

describe("dependency-line preference", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to false when localStorage has no saved value", () => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
    });

    expect(readShowDependencyLines()).toBe(false);
  });

  it("persists and reads the visibility setting", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    });

    writeShowDependencyLines(true);

    expect(values.get(SHOW_DEPENDENCY_LINES_KEY)).toBe("true");
    expect(readShowDependencyLines()).toBe(true);
  });
});
