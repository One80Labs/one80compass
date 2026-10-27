import { describe, expect, it } from "vitest";
import {
  SOFT_DEPENDENCY_KIND,
  addSoftDependencyRelationship,
  convertPlanLink,
  datesOverlapForBlocker,
  dependencyCycle,
  dependencyReview,
  hasSoftDependency,
  removeSoftDependencyRelationship,
  scheduleConflicts,
  softDependencyEdges,
  softDependencyPredecessorIds,
  type DependencyIssue,
} from "./dependencies";

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

  it("ignores soft dependency relationships", () => {
    const issues = [
      task({ issueId: "A", startDate: "2026-10-01", finishDate: "2026-10-10" }),
      task({ issueId: "B", startDate: "2026-10-06", finishDate: "2026-10-08" }),
    ];
    const withSoftRelationships = issues.map((issue) => ({
      ...issue,
      relationships:
        issue.issueId === "B"
          ? [{ id: "dependency:B:A", kind: SOFT_DEPENDENCY_KIND, otherIssueId: "A" }]
          : [],
    }));
    expect(scheduleConflicts(withSoftRelationships)).toEqual(scheduleConflicts(issues));
    expect(dependencyReview(withSoftRelationships, "A", "2026-10-01", "2026-10-12")).toEqual([]);
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

describe("soft dependency helpers", () => {
  const relationships = [
    { id: "dependency:B:A", kind: SOFT_DEPENDENCY_KIND, otherIssueId: "A" },
    { id: "related:B:C", kind: "related", otherIssueId: "C" },
  ];

  it("reads soft predecessors and edges only", () => {
    expect(softDependencyPredecessorIds(relationships)).toEqual(["A"]);
    expect(softDependencyPredecessorIds(null)).toEqual([]);
    expect(softDependencyEdges([{ issueId: "B", relationships }, { issueId: "C" }])).toEqual([
      { successorId: "B", predecessorId: "A", relationshipId: "dependency:B:A" },
    ]);
    expect(hasSoftDependency(relationships, "A")).toBe(true);
    expect(hasSoftDependency(relationships, "C")).toBe(false);
  });

  it("adds idempotently without mutating and removes only the matching soft link", () => {
    const added = addSoftDependencyRelationship(relationships, "B", "D");
    expect(added).toEqual([
      ...relationships,
      { id: "dependency:B:D", kind: SOFT_DEPENDENCY_KIND, otherIssueId: "D" },
    ]);
    expect(addSoftDependencyRelationship(relationships, "B", "A")).toEqual(relationships);
    expect(addSoftDependencyRelationship(undefined, "B", "A")).toEqual([
      { id: "dependency:B:A", kind: SOFT_DEPENDENCY_KIND, otherIssueId: "A" },
    ]);
    expect(removeSoftDependencyRelationship(relationships, "A")).toEqual([relationships[1]]);
    expect(relationships).toHaveLength(2);
  });

  it("detects blocker date overlap only when both dates are valid", () => {
    expect(
      datesOverlapForBlocker(
        { finishDate: "2026-10-10" },
        { startDate: "2026-10-10" },
      ),
    ).toBe(true);
    expect(
      datesOverlapForBlocker(
        { finishDate: "2026-10-10" },
        { startDate: "2026-10-11" },
      ),
    ).toBe(false);
    expect(datesOverlapForBlocker({ finishDate: null }, { startDate: "2026-10-11" })).toBe(false);
  });
});

describe("convertPlanLink", () => {
  const relationship = {
    id: "dependency:B:A",
    kind: SOFT_DEPENDENCY_KIND,
    otherIssueId: "A",
  };

  it("converts a soft dependency to a blocker", () => {
    expect(
      convertPlanLink({
        successorId: "B",
        predecessorId: "A",
        from: "dependency",
        to: "blocker",
        predecessorIds: ["C"],
        relationships: [relationship],
      }),
    ).toEqual({ predecessorIds: ["C", "A"], relationships: [] });
  });

  it("converts a blocker to a soft dependency", () => {
    expect(
      convertPlanLink({
        successorId: "B",
        predecessorId: "A",
        from: "blocker",
        to: "dependency",
        predecessorIds: ["A", "C"],
        relationships: [],
      }),
    ).toEqual({ predecessorIds: ["C"], relationships: [relationship] });
  });

  it("reports no-op and missing source links", () => {
    const common = {
      successorId: "B",
      predecessorId: "A",
      predecessorIds: [],
      relationships: [],
    };
    expect(convertPlanLink({ ...common, from: "dependency", to: "dependency" })).toEqual({
      error: "noop",
    });
    expect(convertPlanLink({ ...common, from: "dependency", to: "blocker" })).toEqual({
      error: "missing",
    });
    expect(convertPlanLink({ ...common, from: "blocker", to: "dependency" })).toEqual({
      error: "missing",
    });
  });
});
