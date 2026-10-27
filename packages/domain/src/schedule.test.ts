import { describe, expect, it } from "vitest";
import {
  addDays,
  chartRanges,
  currentIterationId,
  datesAfterIterationPick,
  dayOffset,
  expandSpanToFit,
  isIsoDate,
  iterationDisplayDate,
  iterationFinish,
  iterationForDates,
  iterationOptionLabel,
  scheduleRollups,
  scheduledRange,
  scheduleSpan,
  scheduleText,
  shiftSchedule,
} from "./schedule";

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

  it("picks the iteration that contains the new Finish date after a bar drag", () => {
    const iterations = [
      { id: "i1", startDate: "2026-10-24", duration: 14 },
      { id: "i2", startDate: "2026-11-07", duration: 14 },
    ];
    expect(iterationForDates(iterations, "2026-10-27", "2026-11-02")).toBe("i1");
    expect(iterationForDates(iterations, "2026-11-08", "2026-11-14")).toBe("i2");
    expect(iterationForDates(iterations, "2026-10-20", "2026-10-22")).toBeNull();
    expect(iterationForDates(iterations, "2026-10-30", "2026-11-10")).toBe("i2");
  });

  it("finds the iteration that contains today", () => {
    const iterations = [
      { id: "i1", startDate: "2026-10-24", duration: 14 },
      { id: "i2", startDate: "2026-11-07", duration: 14 },
    ];
    expect(currentIterationId(iterations, "2026-10-27")).toBe("i1");
    expect(currentIterationId(iterations, "2026-11-07")).toBe("i2");
    expect(currentIterationId(iterations, "2026-12-01")).toBeNull();
  });

  it("labels an iteration with name and start–finish dates", () => {
    expect(iterationDisplayDate("2026-10-24")).toBe("10.24.2026");
    expect(iterationOptionLabel({ title: "I1", startDate: "2026-10-24", duration: 6 })).toBe("I1: 10.24.2026 - 10.29.2026");
    expect(iterationOptionLabel({ title: "Sprint", startDate: "bad", duration: 6 })).toBe("Sprint");
  });

  it("gives an unscheduled plan a two-week scale and pads a scheduled one, keeping today on the chart", () => {
    expect(scheduleSpan([{ startDate: null, finishDate: null }], "2026-10-26")).toEqual({ origin: "2026-10-25", days: 14 });
    const spanned = scheduleSpan([{ startDate: "2026-10-10", finishDate: "2026-10-12" }], "2026-10-26");
    expect(spanned.origin).toBe("2026-10-09");
    expect(spanned.days).toBe(19);
    expect(dayOffset("2026-10-26", spanned.origin)).toBe(17);
  });

  it("expands the Timeline span when a dragged bar moves past the edges", () => {
    const base = { origin: "2026-10-20", days: 14 };
    expect(expandSpanToFit(base, { startDate: "2026-10-22", finishDate: "2026-10-25" })).toEqual(base);
    expect(expandSpanToFit(base, { startDate: "2026-11-01", finishDate: "2026-11-05" }).days).toBeGreaterThan(base.days);
    expect(expandSpanToFit(base, { startDate: "2026-10-10", finishDate: "2026-10-12" }).origin).toBe("2026-10-07");
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

  it("keeps an Epic and Feature bar when no task is under them", () => {
    const ranges = chartRanges([
      { depth: 0, kind: "epic", startDate: "2026-10-01", finishDate: "2026-10-31" },
      { depth: 1, kind: "feature", startDate: "2026-10-05", finishDate: "2026-10-20" },
    ]);
    expect(ranges.map((range) => (range ? `${range.start} ${range.finish}` : null))).toEqual(["2026-10-01 2026-10-31", "2026-10-05 2026-10-20"]);
  });

  it("draws an Epic and a Feature from the tasks under them", () => {
    const ranges = chartRanges([
      { depth: 0, kind: "epic", startDate: "2026-01-01", finishDate: "2026-12-31" },
      { depth: 1, kind: "feature", startDate: null, finishDate: null },
      { depth: 2, kind: "issue", startDate: "2026-10-26", finishDate: "2026-11-02" },
    ]);
    expect(ranges.map((range) => (range ? `${range.start} ${range.finish}` : null))).toEqual(["2026-10-26 2026-11-02", "2026-10-26 2026-11-02", "2026-10-26 2026-11-02"]);
  });
});

describe("scheduleRollups", () => {
  it("sets Epic and Feature dates from the tasks and subtasks under them", () => {
    const rolled = scheduleRollups(
      [
        { issueId: "e", title: "Epic", parentIssueId: null, number: 1, issueType: "EPIC", startDate: null, finishDate: null },
        { issueId: "f", title: "Feature", parentIssueId: "e", number: 2, issueType: "Feature", startDate: "2026-01-01", finishDate: "2026-01-02" },
        { issueId: "t", title: "Task", parentIssueId: "f", number: 3, issueType: "Task", startDate: "2026-10-26", finishDate: "2026-11-02" },
        { issueId: "s", title: "Subtask", parentIssueId: "t", number: 4, issueType: null, startDate: "2026-11-01", finishDate: "2026-11-10" },
      ],
      null,
    );
    expect(rolled).toEqual([
      { issueId: "e", startDate: "2026-10-26", finishDate: "2026-11-10" },
      { issueId: "f", startDate: "2026-10-26", finishDate: "2026-11-10" },
    ]);
  });

  it("leaves Epic and Feature dates alone until a task or subtask exists", () => {
    const rolled = scheduleRollups(
      [
        { issueId: "e", title: "Epic", parentIssueId: null, number: 1, issueType: "EPIC", startDate: "2026-10-01", finishDate: "2026-10-31" },
        { issueId: "f", title: "Feature", parentIssueId: "e", number: 2, issueType: "Feature", startDate: "2026-10-05", finishDate: "2026-10-20" },
      ],
      null,
    );
    expect(rolled).toEqual([]);
  });

  it("clears a planned Epic date when a task is added without dates", () => {
    const rolled = scheduleRollups(
      [
        { issueId: "e", title: "Epic", parentIssueId: null, number: 1, issueType: "EPIC", startDate: "2026-10-01", finishDate: "2026-10-31" },
        { issueId: "t", title: "Task", parentIssueId: "e", number: 3, issueType: "Task", startDate: null, finishDate: null },
      ],
      null,
    );
    expect(rolled).toEqual([{ issueId: "e", startDate: null, finishDate: null }]);
  });
});
