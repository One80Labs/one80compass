import { describe, expect, it } from "vitest";
import {
  KANBAN_ASSIGNEE_ALL,
  KANBAN_ASSIGNEE_UNASSIGNED,
  KANBAN_DEFAULT_ISSUE_TYPES,
  KANBAN_ITERATION_ALL,
  KANBAN_ITERATION_CURRENT,
  KANBAN_ITERATION_NONE,
  matchesKanbanFilters,
  resolveIterationFilter,
  toggleIssueType,
  type KanbanFilterIssue,
} from "./kanban-filters";

const iterations = [
  { id: "i1", title: "Sprint 1", startDate: "2026-10-20", duration: 14 },
  { id: "i2", title: "Sprint 2", startDate: "2026-11-03", duration: 14 },
];

function issue(partial: Partial<KanbanFilterIssue> & Pick<KanbanFilterIssue, "issueId" | "title">): KanbanFilterIssue {
  return {
    parentIssueId: null,
    number: null,
    issueType: "Task",
    status: "To Do",
    iterationId: "i1",
    assignees: [],
    ...partial,
  };
}

describe("kanban filters", () => {
  it("resolves Current to the iteration that contains today", () => {
    expect(resolveIterationFilter(KANBAN_ITERATION_CURRENT, iterations, "2026-10-27")).toBe("i1");
    expect(resolveIterationFilter(KANBAN_ITERATION_CURRENT, iterations, "2026-11-10")).toBe("i2");
    expect(resolveIterationFilter(KANBAN_ITERATION_CURRENT, iterations, "2026-12-01")).toBeNull();
    expect(resolveIterationFilter(KANBAN_ITERATION_NONE, iterations, "2026-10-27")).toBeNull();
    expect(resolveIterationFilter(KANBAN_ITERATION_ALL, iterations, "2026-10-27")).toBe(KANBAN_ITERATION_ALL);
  });

  it("defaults to Task and Subtask and can toggle types", () => {
    expect(KANBAN_DEFAULT_ISSUE_TYPES).toEqual(["Task", "Subtask"]);
    expect(toggleIssueType(["Task", "Subtask"], "EPIC")).toEqual(["EPIC", "Task", "Subtask"]);
    expect(toggleIssueType(["Task", "Subtask"], "Task")).toEqual(["Subtask"]);
  });

  it("keeps tasks in the current iteration and hides epics by default", () => {
    const rows = [
      issue({ issueId: "epic", title: "Billing", issueType: "EPIC", iterationId: "i1" }),
      issue({ issueId: "task", title: "Invoice", issueType: "Task", parentIssueId: "epic", iterationId: "i1" }),
      issue({ issueId: "other", title: "Later", issueType: "Task", iterationId: "i2" }),
      issue({ issueId: "sub", title: "Detail", issueType: null, parentIssueId: "task", iterationId: "i1" }),
      issue({ issueId: "open", title: "Backlog", issueType: "Task", iterationId: null }),
    ];
    const matched = matchesKanbanFilters(
      rows,
      {
        iteration: KANBAN_ITERATION_CURRENT,
        assignee: KANBAN_ASSIGNEE_ALL,
        issueTypes: KANBAN_DEFAULT_ISSUE_TYPES,
        query: "",
        today: "2026-10-27",
      },
      iterations,
      null,
    );
    expect(matched.map((row) => row.issueId)).toEqual(["task", "sub"]);
  });

  it("filters by assignee and unassigned", () => {
    const rows = [
      issue({ issueId: "a", title: "Ada work", assignees: [{ id: "U_ada", login: "ada", name: "Ada" }] }),
      issue({ issueId: "b", title: "Open", assignees: [] }),
    ];
    expect(
      matchesKanbanFilters(
        rows,
        { iteration: KANBAN_ITERATION_ALL, assignee: "U_ada", issueTypes: KANBAN_DEFAULT_ISSUE_TYPES, query: "", today: "2026-10-27" },
        iterations,
        null,
      ).map((row) => row.issueId),
    ).toEqual(["a"]);
    expect(
      matchesKanbanFilters(
        rows,
        {
          iteration: KANBAN_ITERATION_ALL,
          assignee: KANBAN_ASSIGNEE_UNASSIGNED,
          issueTypes: KANBAN_DEFAULT_ISSUE_TYPES,
          query: "",
          today: "2026-10-27",
        },
        iterations,
        null,
      ).map((row) => row.issueId),
    ).toEqual(["b"]);
  });
});
