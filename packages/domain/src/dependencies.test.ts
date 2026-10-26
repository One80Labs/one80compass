import { describe, expect, it } from "vitest";
import { dependencyCycle, dependencyReview, scheduleConflicts, type DependencyIssue } from "./dependencies";

function task(partial: Partial<DependencyIssue> & { issueId: string }): DependencyIssue {
  return {
    title: partial.issueId,
    startDate: null,
    finishDate: null,
    predecessorIds: [],
    inProject: true,
    archived: false,
    deletedAt: null,
    ...partial,
  };
}

describe("dependencyReview", () => {
  it("proposes the smallest shift that starts the later task the day after", () => {
    const issues = [
      task({ issueId: "A", title: "Deck", startDate: "2026-10-01", finishDate: "2026-10-05" }),
      task({ issueId: "B", title: "Rail", startDate: "2026-10-06", finishDate: "2026-10-08", predecessorIds: ["A"] }),
    ];
    expect(dependencyReview(issues, "A", "2026-10-01", "2026-10-10")).toEqual([
      { issueId: "B", title: "Rail", fromStart: "2026-10-06", fromFinish: "2026-10-08", toStart: "2026-10-11", toFinish: "2026-10-13" },
    ]);
  });

  it("leaves a later task alone when it still starts after the new finish", () => {
    const issues = [
      task({ issueId: "A", startDate: "2026-10-01", finishDate: "2026-10-05" }),
      task({ issueId: "B", startDate: "2026-10-20", finishDate: "2026-10-22", predecessorIds: ["A"] }),
    ];
    expect(dependencyReview(issues, "A", "2026-10-01", "2026-10-08")).toEqual([]);
  });

  it("moves a chain from the new predecessor dates", () => {
    const issues = [
      task({ issueId: "A", startDate: "2026-10-01", finishDate: "2026-10-02" }),
      task({ issueId: "B", startDate: "2026-10-03", finishDate: "2026-10-04", predecessorIds: ["A"] }),
      task({ issueId: "C", startDate: "2026-10-05", finishDate: "2026-10-06", predecessorIds: ["B"] }),
    ];
    const proposals = dependencyReview(issues, "A", "2026-10-01", "2026-10-05");
    expect(proposals.map((item) => item.issueId)).toEqual(["B", "C"]);
    expect(proposals[1]).toMatchObject({ toStart: "2026-10-08", toFinish: "2026-10-09" });
  });

  it("does not loop when two tasks block each other", () => {
    const issues = [
      task({ issueId: "A", startDate: "2026-10-01", finishDate: "2026-10-02", predecessorIds: ["B"] }),
      task({ issueId: "B", startDate: "2026-10-01", finishDate: "2026-10-02", predecessorIds: ["A"] }),
    ];
    expect(dependencyReview(issues, "A", "2026-10-01", "2026-10-10").map((item) => item.issueId)).toEqual(["B"]);
  });
});

describe("scheduleConflicts", () => {
  it("flags an overlap and a task that was never scheduled", () => {
    const issues = [
      task({ issueId: "A", title: "Deck", startDate: "2026-10-01", finishDate: "2026-10-10" }),
      task({ issueId: "B", title: "Rail", startDate: "2026-10-06", finishDate: "2026-10-08", predecessorIds: ["A"] }),
      task({ issueId: "C", title: "Paint", predecessorIds: ["A"] }),
    ];
    expect(scheduleConflicts(issues)).toEqual([
      { issueId: "B", title: "Rail", predecessorId: "A", predecessorTitle: "Deck", reason: "overlap" },
      { issueId: "C", title: "Paint", predecessorId: "A", predecessorTitle: "Deck", reason: "unscheduled" },
    ]);
  });
});

describe("dependencyCycle", () => {
  it("rejects a task blocking itself and a loop through another task", () => {
    const issues = [
      { issueId: "A", predecessorIds: [] },
      { issueId: "B", predecessorIds: ["A"] },
    ];
    expect(dependencyCycle(issues, "A", "A")).toBe(true);
    expect(dependencyCycle(issues, "A", "B")).toBe(true);
    expect(dependencyCycle(issues, "B", "A")).toBe(false);
  });
});
