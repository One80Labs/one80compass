import { describe, expect, it } from "vitest";
import { addDays, chartRanges, datesAfterIterationPick, isIsoDate, iterationFinish, scheduledRange, scheduleSpan, scheduleText, shiftSchedule } from "./schedule";

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

  it("draws the bar from Start and Finish, and copies iteration dates when an iteration is chosen", () => {
    expect(iterationFinish("2026-10-25", 14)).toBe("2026-11-07");
    expect(scheduledRange({ startDate: "2026-10-26", finishDate: "2026-11-02" })).toEqual({
      start: "2026-10-26",
      finish: "2026-11-02",
      fromIteration: false,
    });
    expect(scheduleText({ startDate: null, finishDate: null })).toBe("Not scheduled");
    expect(datesAfterIterationPick({ hadIteration: false, pickedBefore: false, startDate: "2026-01-01", iterationStart: "2026-10-25", iterationEnd: "2026-11-07" })).toEqual({
      startDate: "2026-10-25",
      finishDate: "2026-11-07",
    });
    expect(datesAfterIterationPick({ hadIteration: true, pickedBefore: false, startDate: "2026-10-25", iterationStart: "2026-11-08", iterationEnd: "2026-11-21" })).toEqual({
      startDate: "2026-10-25",
      finishDate: "2026-11-21",
    });
    expect(datesAfterIterationPick({ hadIteration: true, pickedBefore: false, startDate: "2026-12-01", iterationStart: "2026-11-08", iterationEnd: "2026-11-21" })).toEqual({
      startDate: "2026-11-08",
      finishDate: "2026-11-21",
    });
  });

  it("gives an Epic and a Feature the same bar as the task dates under them", () => {
    const ranges = chartRanges([
      { depth: 0, kind: "epic", startDate: null, finishDate: null },
      { depth: 1, kind: "feature", startDate: null, finishDate: null },
      { depth: 2, kind: "issue", startDate: "2026-10-26", finishDate: "2026-11-02" },
    ]);
    expect(ranges.map((range) => (range ? `${range.start} ${range.finish}` : null))).toEqual(["2026-10-26 2026-11-02", "2026-10-26 2026-11-02", "2026-10-26 2026-11-02"]);
  });
});
