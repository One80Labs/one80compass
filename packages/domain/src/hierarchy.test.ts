import { describe, expect, it } from "vitest";
import {
  applyPlanOrder,
  createdIssueType,
  hasActiveChildren,
  orderedIssues,
  parentDoneBlocked,
  parentStatusChanges,
  planBands,
  planKind,
  planRows,
  rollupTargets,
  type HierarchyIssue,
} from "./hierarchy";

const done = ["Done"];

function issue(partial: Partial<HierarchyIssue> & { issueId: string }): HierarchyIssue {
  return {
    parentIssueId: null,
    status: "Ready",
    archived: false,
    deletedAt: null,
    inProject: true,
    ...partial,
  };
}

describe("hasActiveChildren", () => {
  it("is true only while an active child still points at the parent", () => {
    const rows = [
      issue({ issueId: "epic" }),
      issue({ issueId: "task", parentIssueId: "epic" }),
      issue({ issueId: "gone", parentIssueId: "epic", deletedAt: "2026-10-27T00:00:00.000Z" }),
    ];
    expect(hasActiveChildren("epic", rows)).toBe(true);
    expect(hasActiveChildren("task", rows)).toBe(false);
    rows[1].deletedAt = "2026-10-27T00:00:00.000Z";
    expect(hasActiveChildren("epic", rows)).toBe(false);
  });
});

describe("parent status", () => {
  it("marks a parent Done when every task under it is Done", () => {
    const changes = parentStatusChanges(
      [
        issue({ issueId: "parent", status: "Ready" }),
        issue({ issueId: "child", parentIssueId: "parent", status: "Done" }),
      ],
      done,
      "Done",
      "Backlog",
      "child",
    );
    expect(changes).toEqual([{ issueId: "parent", from: "Ready", to: "Done", initiatingIssueId: "child" }]);
  });

  it("rolls the same rule up to a grandparent and leaves an open branch alone", () => {
    const changes = parentStatusChanges(
      [
        issue({ issueId: "grand", status: "Ready" }),
        issue({ issueId: "parent", parentIssueId: "grand", status: "Ready" }),
        issue({ issueId: "child", parentIssueId: "parent", status: "Done" }),
        issue({ issueId: "other", status: "Ready" }),
      ],
      done,
      "Done",
      "Backlog",
      null,
    );
    expect(changes.map((change) => change.issueId).sort()).toEqual(["grand", "parent"]);
  });

  it("moves a Done parent back to the first column that is not Done", () => {
    const changes = parentStatusChanges(
      [
        issue({ issueId: "parent", status: "Done" }),
        issue({ issueId: "open", parentIssueId: "parent", status: "Ready" }),
        issue({ issueId: "closed", parentIssueId: "parent", status: "Done" }),
      ],
      done,
      "Done",
      "Backlog",
      "open",
    );
    expect(changes).toEqual([{ issueId: "parent", from: "Done", to: "Backlog", initiatingIssueId: "open" }]);
  });

  it("does not invent a column when the board has nowhere to reopen", () => {
    expect(rollupTargets(["Done"], ["Done"]).reopenStatus).toBeNull();
    const changes = parentStatusChanges(
      [issue({ issueId: "parent", status: "Done" }), issue({ issueId: "child", parentIssueId: "parent", status: "Ready" })],
      done,
      "Done",
      null,
      null,
    );
    expect(changes).toEqual([]);
  });

  it("ignores a parent link that is archived, deleted, or outside this project", () => {
    const issues = [
      issue({ issueId: "parent", status: "Done" }),
      issue({ issueId: "archived", parentIssueId: "parent", status: "Ready", archived: true }),
      issue({ issueId: "gone", parentIssueId: "parent", status: "Ready", deletedAt: "2026-10-26T00:00:00.000Z" }),
      issue({ issueId: "other-project", parentIssueId: "parent", status: "Ready", inProject: false }),
    ];
    expect(parentDoneBlocked("parent", issues, done)).toBe(false);
    expect(parentStatusChanges(issues, done, "Done", "Backlog", null)).toEqual([]);
  });

  it("blocks marking a parent Done while a descendant is open", () => {
    const issues = [
      issue({ issueId: "grand" }),
      issue({ issueId: "parent", parentIssueId: "grand", status: "Done" }),
      issue({ issueId: "child", parentIssueId: "parent", status: "Ready" }),
    ];
    expect(parentDoneBlocked("grand", issues, done)).toBe(true);
    expect(parentDoneBlocked("child", issues, done)).toBe(false);
    expect(parentDoneBlocked("missing", issues, done)).toBe(false);
  });

  it("stops on a cycle", () => {
    const issues = [
      issue({ issueId: "a", parentIssueId: "b", status: "Done" }),
      issue({ issueId: "b", parentIssueId: "a", status: "Ready" }),
    ];
    expect(parentStatusChanges(issues, done, "Done", "Backlog", null)).toEqual([]);
  });
});

describe("orderedIssues", () => {
  it("places each child under its parent", () => {
    const ordered = orderedIssues([
      { issueId: "child", parentIssueId: "parent", title: "Child" },
      { issueId: "parent", parentIssueId: null, title: "Parent" },
      { issueId: "root", parentIssueId: null, title: "Alpha" },
    ]);
    expect(ordered.map((issue) => [issue.title, issue.depth])).toEqual([
      ["Alpha", 0],
      ["Parent", 0],
      ["Child", 1],
    ]);
  });

  it("orders siblings by planOrder before title", () => {
    const ordered = orderedIssues([
      { issueId: "b", parentIssueId: "parent", title: "Alpha", planOrder: 1 },
      { issueId: "a", parentIssueId: "parent", title: "Zulu", planOrder: 0 },
      { issueId: "parent", parentIssueId: null, title: "Parent", planOrder: 0 },
    ]);
    expect(ordered.map((issue) => issue.issueId)).toEqual(["parent", "a", "b"]);
    // applyPlanOrder only rewrites planOrder; array order stays until the next orderedIssues/planRows pass.
    expect(applyPlanOrder(ordered, ["b", "a"]).map((issue) => [issue.issueId, issue.planOrder])).toEqual([
      ["parent", 0],
      ["a", 1],
      ["b", 0],
    ]);
    expect(orderedIssues(applyPlanOrder(ordered, ["b", "a"])).map((issue) => issue.issueId)).toEqual(["parent", "b", "a"]);
  });
});

describe("planRows planOrder", () => {
  it("keeps manual task order under a feature", () => {
    const rows = planRows(
      [
        { issueId: "epic", title: "R3", parentIssueId: null, number: 1, issueType: "Epic", planOrder: 0 },
        { issueId: "feature", title: "MCP", parentIssueId: "epic", number: 2, issueType: "Feature", planOrder: 0 },
        { issueId: "docs", title: "Document Cursor and Claude MCP registration", parentIssueId: "feature", number: 3, issueType: "Task", planOrder: 1 },
        { issueId: "tools", title: "MCP tools for allowlist ingest and chunk search", parentIssueId: "feature", number: 4, issueType: "Task", planOrder: 0 },
      ],
      null,
    );
    expect(rows.filter((row) => row.kind === "issue").map((row) => row.issueId)).toEqual(["tools", "docs"]);
  });
});

describe("createdIssueType", () => {
  it("uses EPIC, Feature, and Task, and leaves a subtask untyped", () => {
    expect(createdIssueType("epic")).toBe("EPIC");
    expect(createdIssueType("feature")).toBe("Feature");
    expect(createdIssueType("issue")).toBe("Task");
    expect(createdIssueType("subtask")).toBeNull();
  });
});

describe("planBands", () => {
  const node = (partial: { issueId: string; title: string; parentIssueId: string | null; number: number; issueType: string | null }) => partial;

  it("nests a feature and a direct issue under an epic and keeps a fixed indent", () => {
    const issues = [
      node({ issueId: "ws", title: "Work", parentIssueId: null, number: 10, issueType: "Workstream" }),
      node({ issueId: "epic", title: "Billing", parentIssueId: "ws", number: 11, issueType: "Epic" }),
      node({ issueId: "issue", title: "Invoice", parentIssueId: "epic", number: 12, issueType: null }),
      node({ issueId: "feature", title: "Payments", parentIssueId: "epic", number: 13, issueType: "Feature" }),
      node({ issueId: "child", title: "Charge", parentIssueId: "issue", number: 14, issueType: null }),
      node({ issueId: "loose", title: "Note", parentIssueId: null, number: 15, issueType: null }),
    ];
    const byId = new Map(issues.map((issue) => [issue.issueId, issue]));
    expect(planKind(issues[3], byId, 10)).toBe("feature");
    expect(planKind(issues[4], byId, 10)).toBe("subtask");
    const bands = planBands(issues, 10);
    expect(bands.map((band) => band.title)).toEqual(["Billing", "Outside an Epic"]);
    expect(bands[0].rows.map((row) => [row.title, row.depth])).toEqual([
      ["Billing", 0],
      ["Payments", 1],
      ["Invoice", 2],
      ["Charge", 3],
    ]);
    expect(bands[1].rows.map((row) => row.title)).toEqual(["Note"]);
    expect(bands[0].rows.some((row) => row.issueId === "ws")).toBe(false);
  });

  it("treats a GitHub type named EPIC as an Epic band", () => {
    const bands = planBands(
      [
        node({ issueId: "epic", title: "EPIC #1", parentIssueId: "ws", number: 2, issueType: "EPIC" }),
        node({ issueId: "feature", title: "Feature #1", parentIssueId: "epic", number: 3, issueType: "Feature" }),
        node({ issueId: "task", title: "Task #1", parentIssueId: "feature", number: 1, issueType: "Task" }),
        node({ issueId: "ws", title: "Workstream #1", parentIssueId: null, number: 4, issueType: "Workstream" }),
      ],
      null,
    );
    expect(bands.map((band) => band.title)).toEqual(["EPIC #1"]);
    expect(bands[0].rows.map((row) => [row.title, row.kind])).toEqual([
      ["EPIC #1", "epic"],
      ["Feature #1", "feature"],
      ["Task #1", "issue"],
    ]);
  });
});
