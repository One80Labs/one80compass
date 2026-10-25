import { describe, expect, it } from "vitest";
import type { PlanIssue, ProjectSettings } from "../../../packages/domain/src/index";
import { applyGithubDelivery } from "./apply";

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
  statusOptions: [],
  doneStatuses: ["Done"],
  columns: ["Todo", "In Progress", "Done"],
};

describe("applyGithubDelivery", () => {
  it("updates the title GitHub owns and leaves effort alone", () => {
    const current: PlanIssue[] = [
      {
        issueId: "I_1",
        itemId: "PVTI_1",
        projectId: "proj-1",
        customerId: "cust-1",
        number: 4,
        title: "Old",
        status: "Todo",
        effort: 5,
        issueState: "open",
        archived: false,
        deletedAt: null,
        parentIssueId: null,
        milestone: null,
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
  });

  it("copies a GitHub milestone title and clears it when GitHub removes the milestone", () => {
    const added = applyGithubDelivery(
      [],
      settings,
      "issues",
      {
        action: "opened",
        repository: { name: "bridge", owner: { login: "one80labs" } },
        issue: { node_id: "I_2", number: 2, title: "Deck", state: "open", milestone: { title: "Phase 1" } },
      },
      "2026-10-24T12:00:00.000Z",
    );
    expect(added?.[0].milestone).toBe("Phase 1");
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

  it("ignores a different repository", () => {
    const next = applyGithubDelivery([], settings, "issues", { repository: { name: "other", owner: { login: "one80labs" } }, issue: { node_id: "I_1" } }, "2026-10-24T12:00:00.000Z");
    expect(next).toBeNull();
  });
});
