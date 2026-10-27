import { describe, expect, it } from "vitest";
import { matchPlanIssues, planSearchKeepIds } from "./plan-search";

const issues = [
  {
    issueId: "epic-1",
    title: "R3 — AI & Automation",
    status: "In progress",
    number: 10,
    parentIssueId: null,
    issueType: "EPIC",
  },
  {
    issueId: "feat-1",
    title: "Staff vault MCP for Cursor and Claude",
    status: "Ready",
    number: 11,
    parentIssueId: "epic-1",
    issueType: "Feature",
  },
  {
    issueId: "task-1",
    title: "Document Cursor and Claude MCP registration",
    status: "Backlog",
    number: 12,
    parentIssueId: "feat-1",
    issueType: "Task",
  },
];

describe("plan type-ahead search", () => {
  it("does not match until three characters are typed", () => {
    expect(matchPlanIssues(issues, "mc")).toEqual([]);
    expect(matchPlanIssues(issues, "mcp").map((issue) => issue.issueId)).toEqual(["feat-1", "task-1"]);
  });

  it("keeps ancestors of matches for the timeline hierarchy", () => {
    const matches = matchPlanIssues(issues, "registration");
    expect(planSearchKeepIds(issues, matches)).toEqual(new Set(["task-1", "feat-1", "epic-1"]));
  });
});
