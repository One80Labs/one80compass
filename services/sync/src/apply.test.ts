import { describe, expect, it } from "vitest";
import type { PlanIssue, ProjectSettings } from "../../../packages/domain/src/index";
import { acceptsGithubSync, applyGithubDelivery, keepStoredPlanFields } from "./apply";

const settings: ProjectSettings = {
  projectId: "proj-1",
  customerId: "cust-1",
  owner: "one80labs",
  repo: "bridge",
  projectNumber: 1,
  projectNodeId: "PVT_1",
  statusFieldName: "Status",
  effortFieldName: "Effort",
  statusFieldId: null,
  effortFieldId: null,
  startFieldName: "Start",
  finishFieldName: "Finish",
  startFieldId: null,
  finishFieldId: null,
  statusOptions: [],
  doneStatuses: ["Done"],
  columns: ["Todo", "In Progress", "Done"],
  workstreamNumber: null,
  iterationFieldId: null,
  iterations: [],
  commentsFieldId: null,
  assignableUsers: [],
  recordSource: "github",
  labels: [],
  issueTypes: [],
  priorityOptions: [],
  milestones: [],
};

describe("applyGithubDelivery", () => {
  it("keeps GitHub sync off a Compass project", () => {
    expect(acceptsGithubSync(settings)).toBe(true);
    expect(acceptsGithubSync({ recordSource: "compass" })).toBe(false);
  });

  it("updates the title GitHub owns and leaves effort alone", () => {
    const current: PlanIssue[] = [
      {
        issueId: "I_1",
        itemId: "PVTI_1",
        projectId: "proj-1",
        customerId: "cust-1",
        number: 4,
        keyNumber: null,
        title: "Old",
        status: "Todo",
        effort: 5,
        issueState: "open",
        archived: false,
        deletedAt: null,
        parentIssueId: null,
        milestone: null,
        milestoneId: null,
        milestoneDueOn: null,
        startDate: null,
        finishDate: null,
        predecessorIds: [],
        issueType: null,
        description: null,
        iterationTitle: null,
        iterationStart: null,
        iterationDuration: null,
        iterationId: null,
        assignees: [],
        comments: null,
        priority: "high",
        labels: ["bug"],
        relationships: [{ id: "rel-1", kind: "blocked_by", otherIssueId: "I_9" }],
        planOrder: null,
        inProject: true,
        updatedAt: "2026-10-24T00:00:00.000Z",
      },
    ];
    const next = applyGithubDelivery(
      current,
      settings,
      "issues",
      { action: "edited", repository: { name: "bridge", owner: { login: "one80labs" } }, issue: { node_id: "I_1", number: 4, title: "New", state: "open" } },
      "2026-10-24T12:00:00.000Z",
    );
    expect(next?.[0].title).toBe("New");
    expect(next?.[0].effort).toBe(5);
    expect(next?.[0].milestone).toBeNull();
    expect(next?.[0].priority).toBe("high");
    expect(next?.[0].labels).toEqual(["bug"]);
    expect(next?.[0].relationships).toEqual([{ id: "rel-1", kind: "blocked_by", otherIssueId: "I_9" }]);
  });

  it("copies a GitHub milestone title and clears it when GitHub removes the milestone", () => {
    const added = applyGithubDelivery(
      [],
      settings,
      "issues",
      {
        action: "opened",
        repository: { name: "bridge", owner: { login: "one80labs" } },
        issue: { node_id: "I_2", number: 2, title: "Deck", state: "open", milestone: { title: "Phase 1", node_id: "M_1", due_on: "2026-11-02T00:00:00Z" } },
      },
      "2026-10-24T12:00:00.000Z",
    );
    expect(added?.[0].milestone).toBe("Phase 1");
    expect(added?.[0].milestoneId).toBe("M_1");
    expect(added?.[0].milestoneDueOn).toBe("2026-11-02");
    const cleared = applyGithubDelivery(
      added ?? [],
      settings,
      "issues",
      {
        action: "demilestoned",
        repository: { name: "bridge", owner: { login: "one80labs" } },
        issue: { node_id: "I_2", number: 2, title: "Deck", state: "open", milestone: null },
      },
      "2026-10-24T13:00:00.000Z",
    );
    expect(cleared?.[0].milestone).toBeNull();
  });

  it("moves status from a project item edit", () => {
    const next = applyGithubDelivery(
      [],
      settings,
      "projects_v2_item",
      {
        action: "edited",
        projects_v2_item: { node_id: "PVTI_1", project_node_id: "PVT_1", content_node_id: "I_9" },
        changes: { field_value: { field_name: "Status", to: { name: "Done" } } },
      },
      "2026-10-24T12:00:00.000Z",
    );
    expect(next?.[0].status).toBe("Done");
    expect(next?.[0].inProject).toBe(true);
  });

  it("records a GitHub subtask parent and clears it", () => {
    const added = applyGithubDelivery(
      [],
      settings,
      "issues",
      {
        action: "parent_issue_added",
        repository: { name: "bridge", owner: { login: "one80labs" } },
        issue: { node_id: "I_child", number: 3, title: "Child", state: "open" },
        parent_issue: { node_id: "I_parent" },
      },
      "2026-10-26T12:00:00.000Z",
    );
    expect(added?.find((issue) => issue.issueId === "I_child")?.parentIssueId).toBe("I_parent");
    const removed = applyGithubDelivery(
      added ?? [],
      settings,
      "issues",
      {
        action: "sub_issue_removed",
        repository: { name: "bridge", owner: { login: "one80labs" } },
        issue: { node_id: "I_parent", number: 1, title: "Parent", state: "open" },
        sub_issue: { node_id: "I_child", number: 3, title: "Child" },
      },
      "2026-10-26T12:05:00.000Z",
    );
    expect(removed?.find((issue) => issue.issueId === "I_child")?.parentIssueId).toBeNull();
  });

  it("ignores a different repository", () => {
    const next = applyGithubDelivery([], settings, "issues", { repository: { name: "other", owner: { login: "one80labs" } }, issue: { node_id: "I_1" } }, "2026-10-24T12:00:00.000Z");
    expect(next).toBeNull();
  });

  it("copies a Start or Finish date from a project field change", () => {
    const next = applyGithubDelivery(
      [],
      settings,
      "projects_v2_item",
      {
        action: "edited",
        projects_v2_item: { node_id: "PVTI_1", project_node_id: "PVT_1", content_node_id: "I_1" },
        changes: { field_value: { field_name: "Finish", to: "2026-11-02" } },
      },
      "2026-10-26T12:00:00.000Z",
    );
    expect(next?.[0].finishDate).toBe("2026-11-02");
    expect(next?.[0].startDate).toBeNull();
  });

  it("keeps stored priority, labels, and relationships when a GitHub replace has none", () => {
    const stored = { ...currentIssue(), deletedAt: "2026-10-27T12:00:00.000Z" };
    const incoming: PlanIssue = { ...stored, title: "From GitHub", priority: null, labels: [], relationships: [], deletedAt: null };
    const kept = keepStoredPlanFields(incoming, stored);
    expect(kept.title).toBe("From GitHub");
    expect(kept.priority).toBe("high");
    expect(kept.labels).toEqual(["bug"]);
    expect(kept.relationships).toEqual([{ id: "rel-1", kind: "blocked_by", otherIssueId: "I_9" }]);
    expect(kept.keyNumber).toBe(stored.keyNumber);
    expect(kept.deletedAt).toBe("2026-10-27T12:00:00.000Z");
    expect(kept.labels).not.toBe(stored.labels);
    expect(keepStoredPlanFields(incoming, undefined)).toEqual(incoming);
  });
});

function currentIssue(): PlanIssue {
  return {
    issueId: "I_1",
    itemId: "PVTI_1",
    projectId: "proj-1",
    customerId: "cust-1",
    number: 4,
    keyNumber: null,
    title: "Old",
    status: "Todo",
    effort: 5,
    issueState: "open",
    archived: false,
    deletedAt: null,
    parentIssueId: null,
    milestone: null,
    milestoneId: null,
    milestoneDueOn: null,
    startDate: null,
    finishDate: null,
    predecessorIds: [],
    issueType: null,
    description: null,
    iterationTitle: null,
    iterationStart: null,
    iterationDuration: null,
    iterationId: null,
    assignees: [],
    comments: null,
    priority: "high",
    labels: ["bug"],
    relationships: [{ id: "rel-1", kind: "blocked_by", otherIssueId: "I_9" }],
    planOrder: null,
    inProject: true,
    updatedAt: "2026-10-24T00:00:00.000Z",
  };
}
