import { describe, expect, it } from "vitest";
import { orderedIssues, parentDoneBlocked, parentStatusChanges, rollupTargets, type HierarchyIssue } from "./hierarchy";

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
});
