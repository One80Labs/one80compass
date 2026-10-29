import { describe, expect, it } from "vitest";
import { criticalPath, criticalPathIssueIds, type CriticalPathIssue } from "./critical-path";

function task(partial: Partial<CriticalPathIssue> & { issueId: string }): CriticalPathIssue {
  return {
    startDate: null,
    finishDate: null,
    predecessorIds: [],
    inProject: true,
    archived: false,
    deletedAt: null,
    ...partial,
  };
}

describe("criticalPath", () => {
  it("marks the whole chain on a single Hard Blocker path", () => {
    const issues = [
      task({ issueId: "A", startDate: "2026-10-01", finishDate: "2026-10-02" }), // 2d
      task({ issueId: "B", startDate: "2026-10-03", finishDate: "2026-10-05", predecessorIds: ["A"] }), // 3d
      task({ issueId: "C", startDate: "2026-10-06", finishDate: "2026-10-06", predecessorIds: ["B"] }), // 1d
    ];
    const result = criticalPath(issues);
    expect([...result.issueIds].sort()).toEqual(["A", "B", "C"]);
    expect(result.edges).toEqual([
      { predecessorId: "B", successorId: "C" },
      { predecessorId: "A", successorId: "B" },
    ]);
  });

  it("picks the longer arm of a diamond", () => {
    // A → B → D  (2 + 2 + 2 = 6)
    // A → C → D  (2 + 5 + 2 = 9)  ← critical
    const issues = [
      task({ issueId: "A", startDate: "2026-10-01", finishDate: "2026-10-02" }),
      task({ issueId: "B", startDate: "2026-10-03", finishDate: "2026-10-04", predecessorIds: ["A"] }),
      task({ issueId: "C", startDate: "2026-10-03", finishDate: "2026-10-07", predecessorIds: ["A"] }),
      task({
        issueId: "D",
        startDate: "2026-10-08",
        finishDate: "2026-10-09",
        predecessorIds: ["B", "C"],
      }),
    ];
    const result = criticalPath(issues);
    expect([...result.issueIds].sort()).toEqual(["A", "C", "D"]);
    expect(result.edges).toEqual(
      expect.arrayContaining([
        { predecessorId: "A", successorId: "C" },
        { predecessorId: "C", successorId: "D" },
      ]),
    );
    expect(result.edges).not.toEqual(expect.arrayContaining([{ predecessorId: "B", successorId: "D" }]));
    expect(result.edges).not.toEqual(expect.arrayContaining([{ predecessorId: "A", successorId: "B" }]));
  });

  it("ignores soft-only relationships (no predecessorIds)", () => {
    // Soft link A→B would not appear as predecessorIds; only A→C is a Hard Blocker.
    const issues = [
      task({ issueId: "A", startDate: "2026-10-01", finishDate: "2026-10-10" }), // 10d
      task({ issueId: "B", startDate: "2026-10-01", finishDate: "2026-10-20" }), // 20d, soft-only to A
      task({ issueId: "C", startDate: "2026-10-11", finishDate: "2026-10-12", predecessorIds: ["A"] }), // 2d
    ];
    const result = criticalPath(issues);
    // Isolated B (20) is longer than A→C (12); soft link never joins them.
    expect([...result.issueIds].sort()).toEqual(["B"]);
    expect(result.edges).toEqual([]);
  });

  it("skips unscheduled tasks without crashing", () => {
    const issues = [
      task({ issueId: "A", startDate: "2026-10-01", finishDate: "2026-10-03" }),
      task({ issueId: "B", predecessorIds: ["A"] }), // unscheduled
      task({ issueId: "C", startDate: "2026-10-05", finishDate: "2026-10-06", predecessorIds: ["B"] }),
    ];
    // B omitted; A and C are disconnected scheduled nodes — longer of the two wins.
    const result = criticalPath(issues);
    expect(result.issueIds).toEqual(["A"]);
    expect(result.edges).toEqual([]);
  });

  it("returns empty on a blocker cycle", () => {
    const issues = [
      task({ issueId: "A", startDate: "2026-10-01", finishDate: "2026-10-02", predecessorIds: ["B"] }),
      task({ issueId: "B", startDate: "2026-10-03", finishDate: "2026-10-04", predecessorIds: ["A"] }),
    ];
    expect(criticalPath(issues)).toEqual({ issueIds: [], edges: [] });
  });

  it("adds lagDays into the path length", () => {
    // Without lag, A→B (2+2=4) beats A→C (2+1=3).
    // With lag 5 on A→C, A→C becomes 2+5+1=8 and wins.
    const issues = [
      task({ issueId: "A", startDate: "2026-10-01", finishDate: "2026-10-02" }),
      task({ issueId: "B", startDate: "2026-10-03", finishDate: "2026-10-04", predecessorIds: ["A"] }),
      task({
        issueId: "C",
        startDate: "2026-10-10",
        finishDate: "2026-10-10",
        predecessorIds: ["A"],
        blockerEdges: [{ predecessorId: "A", linkKind: "FS", lagDays: 5 }],
      }),
    ];
    const result = criticalPath(issues);
    expect([...result.issueIds].sort()).toEqual(["A", "C"]);
    expect(result.edges).toEqual([{ predecessorId: "A", successorId: "C" }]);
  });

  it("exposes issue ids via criticalPathIssueIds", () => {
    const issues = [
      task({ issueId: "A", startDate: "2026-10-01", finishDate: "2026-10-01" }),
      task({ issueId: "B", startDate: "2026-10-02", finishDate: "2026-10-02", predecessorIds: ["A"] }),
    ];
    expect([...criticalPathIssueIds(issues)].sort()).toEqual(["A", "B"]);
  });

  it("ignores inactive and self-edges", () => {
    const issues = [
      task({ issueId: "A", startDate: "2026-10-01", finishDate: "2026-10-05" }),
      task({
        issueId: "B",
        startDate: "2026-10-01",
        finishDate: "2026-10-20",
        predecessorIds: ["A"],
        archived: true,
      }),
      task({ issueId: "C", startDate: "2026-10-06", finishDate: "2026-10-07", predecessorIds: ["A", "C"] }),
    ];
    const result = criticalPath(issues);
    expect([...result.issueIds].sort()).toEqual(["A", "C"]);
    expect(result.edges).toEqual([{ predecessorId: "A", successorId: "C" }]);
  });
});
