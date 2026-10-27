import { describe, expect, it } from "vitest";
import { matchPlanIssues, planSearchIsActive, planSearchKeepIds } from "./plan-search";

const issues = [
  {
    issueId: "epic-1",
    title: "R3 — AI & Automation",
    status: "In progress",
    number: 10,
    keyNumber: 1,
    parentIssueId: null,
    issueType: "EPIC",
  },
  {
    issueId: "feat-1",
    title: "Staff vault MCP for Cursor and Claude",
    status: "Ready",
    number: 11,
    keyNumber: 31,
    parentIssueId: "epic-1",
    issueType: "Feature",
  },
  {
    issueId: "task-1",
    title: "Document Cursor and Claude MCP registration",
    status: "Backlog",
    number: 12,
    keyNumber: 12,
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

  it("matches action-item keys with hyphen, without hyphen, or by number only", () => {
    expect(planSearchIsActive("31")).toBe(true);
    expect(matchPlanIssues(issues, "Comp-31", "COMP").map((issue) => issue.issueId)).toEqual(["feat-1"]);
    expect(matchPlanIssues(issues, "comp31", "COMP").map((issue) => issue.issueId)).toEqual(["feat-1"]);
    expect(matchPlanIssues(issues, "COMP-31", "comp").map((issue) => issue.issueId)).toEqual(["feat-1"]);
    expect(matchPlanIssues(issues, "31", "COMP").map((issue) => issue.issueId)).toEqual(["feat-1"]);
    expect(matchPlanIssues(issues, "3", "COMP").map((issue) => issue.issueId)).toEqual([]);
    expect(matchPlanIssues(issues, "12", "COMP").map((issue) => issue.issueId)).toEqual(["task-1"]);
  });
});
