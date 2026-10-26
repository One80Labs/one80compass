import { describe, expect, it } from "vitest";
import { addDays, isIsoDate, iterationFinish, scheduledRange, scheduleSpan, scheduleText, shiftSchedule } from "./schedule";

describe("schedule", () => {
  it("rejects a calendar date that does not exist", () => {
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-10-26")).toBe(true);
  });

  it("moves both dates together and refuses to put the finish before the start", () => {
    expect(addDays("2026-10-26", 3)).toBe("2026-10-29");
    expect(shiftSchedule("2026-10-01", "2026-10-05", "move", 2)).toEqual({ startDate: "2026-10-03", finishDate: "2026-10-07" });
    expect(shiftSchedule("2026-10-01", "2026-10-05", "start", 10)).toEqual({ startDate: "2026-10-05", finishDate: "2026-10-05" });
    expect(shiftSchedule("2026-10-01", "2026-10-05", "finish", -10)).toEqual({ startDate: "2026-10-01", finishDate: "2026-10-01" });
  });

  it("gives an unscheduled plan a two-week scale and pads a scheduled one", () => {
    expect(scheduleSpan([{ startDate: null, finishDate: null }], "2026-10-26")).toEqual({ origin: "2026-10-26", days: 14 });
    expect(scheduleSpan([{ startDate: "2026-10-10", finishDate: "2026-10-12" }], "2026-10-26").origin).toBe("2026-10-09");
  });

  it("uses an iteration span of fourteen days and otherwise the Start and Finish fields", () => {
    expect(iterationFinish("2026-10-25", 14)).toBe("2026-11-07");
    expect(
      scheduledRange({ startDate: "2026-10-26", finishDate: "2026-11-02", iterationStart: "2026-10-25", iterationDuration: 14 }),
    ).toEqual({ start: "2026-10-25", finish: "2026-11-07", fromIteration: true });
    expect(scheduleText({ startDate: null, finishDate: null, iterationTitle: "Iteration 1", iterationStart: "2026-10-25", iterationDuration: 14 })).toBe(
      "Iteration 1 · 2026-10-25 – 2026-11-07",
    );
  });
});
