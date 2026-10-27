/** Kanban board filters for iteration, assignee, and issue type. */

import { planKind, type PlanKind, type PlanNode } from "../../../packages/domain/src/hierarchy";
import { currentIterationId, type IterationWindow } from "../../../packages/domain/src/schedule";

/** Sentinel: resolve to the iteration that contains today. */
export const KANBAN_ITERATION_CURRENT = "current";
/** Sentinel: show every iteration, including unassigned. */
export const KANBAN_ITERATION_ALL = "all";
/** Sentinel: issues with no iteration. */
export const KANBAN_ITERATION_NONE = "none";

export const KANBAN_ASSIGNEE_ALL = "all";
export const KANBAN_ASSIGNEE_UNASSIGNED = "unassigned";

export type KanbanIssueTypeFilter = "EPIC" | "Feature" | "Task" | "Subtask";

export const KANBAN_ISSUE_TYPE_OPTIONS: KanbanIssueTypeFilter[] = ["EPIC", "Feature", "Task", "Subtask"];

/** Default board view: tasks and subtasks only. */
export const KANBAN_DEFAULT_ISSUE_TYPES: KanbanIssueTypeFilter[] = ["Task", "Subtask"];

const KIND_TO_FILTER: Record<Exclude<PlanKind, "workstream">, KanbanIssueTypeFilter> = {
  epic: "EPIC",
  feature: "Feature",
  issue: "Task",
  subtask: "Subtask",
};

export type KanbanFilterIssue = PlanNode & {
  status: string;
  iterationId?: string | null;
  assignees?: { id: string; login: string; name: string | null }[];
};

export type KanbanFilters = {
  /** `current`, `all`, `none`, or an iteration id. */
  iteration: string;
  /** `all`, `unassigned`, or an assignee id. */
  assignee: string;
  issueTypes: KanbanIssueTypeFilter[];
  query: string;
  today: string;
};

export function resolveIterationFilter(iteration: string, iterations: IterationWindow[], today: string): string | null | typeof KANBAN_ITERATION_ALL {
  if (iteration === KANBAN_ITERATION_ALL) return KANBAN_ITERATION_ALL;
  if (iteration === KANBAN_ITERATION_NONE) return null;
  if (iteration === KANBAN_ITERATION_CURRENT) return currentIterationId(iterations, today);
  return iteration;
}

export function matchesKanbanFilters<T extends KanbanFilterIssue>(
  issues: T[],
  filters: KanbanFilters,
  iterations: IterationWindow[],
  workstreamNumber: number | null,
): T[] {
  const byId = new Map(issues.map((issue) => [issue.issueId, issue]));
  const iterationMatch = resolveIterationFilter(filters.iteration, iterations, filters.today);
  const needle = filters.query.trim().toLowerCase();
  const typeSet = new Set(filters.issueTypes);

  return issues.filter((issue) => {
    const kind = planKind(issue, byId, workstreamNumber);
    if (kind === "workstream") return false;
    const typeLabel = KIND_TO_FILTER[kind];
    if (!typeSet.has(typeLabel)) return false;

    if (iterationMatch !== KANBAN_ITERATION_ALL) {
      const issueIteration = issue.iterationId ?? null;
      if (issueIteration !== iterationMatch) return false;
    }

    if (filters.assignee === KANBAN_ASSIGNEE_UNASSIGNED) {
      if ((issue.assignees ?? []).length > 0) return false;
    } else if (filters.assignee !== KANBAN_ASSIGNEE_ALL) {
      if (!(issue.assignees ?? []).some((person) => person.id === filters.assignee)) return false;
    }

    if (needle && !issue.title.toLowerCase().includes(needle)) return false;
    return true;
  });
}

export function toggleIssueType(selected: KanbanIssueTypeFilter[], value: KanbanIssueTypeFilter): KanbanIssueTypeFilter[] {
  if (selected.includes(value)) return selected.filter((item) => item !== value);
  return [...KANBAN_ISSUE_TYPE_OPTIONS.filter((item) => selected.includes(item) || item === value)];
}
