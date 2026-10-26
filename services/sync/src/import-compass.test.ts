import { describe, expect, it } from "vitest";
import type { PlanIssue, ProjectSettings } from "../../../packages/domain/src/index";
import { importCompass } from "./import-compass";

const settings: ProjectSettings = {
  projectId: "proj-1",
  customerId: "cust-1",
  owner: "One80Labs",
  repo: "one80compass",
  projectNumber: 1,
  projectNodeId: "PVT_1",
  statusFieldName: "Status",
  effortFieldName: "Effort",
  statusFieldId: "status-field",
  effortFieldId: "effort-field",
  startFieldName: "Start",
  finishFieldName: "Finish",
  startFieldId: "start-field",
  finishFieldId: "finish-field",
  statusOptions: [{ id: "ready", name: "Ready" }, { id: "done", name: "Done" }],
  doneStatuses: ["Done"],
  columns: ["Ready", "Done"],
  workstreamNumber: 10,
  iterationFieldId: "iter-field",
  iterations: [{ id: "iter-1", title: "Sprint 1", startDate: "2026-10-01", duration: 14 }],
  commentsFieldId: "comments-field",
  assignableUsers: [{ id: "U_1", login: "ada", name: "Ada" }],
  recordSource: "github",
  labels: [],
  issueTypes: [],
  priorityOptions: [],
  milestones: [],
};

function issue(partial: Partial<PlanIssue> & Pick<PlanIssue, "issueId" | "title">): PlanIssue {
  return {
    itemId: null,
    projectId: "proj-1",
    customerId: "cust-1",
    number: null,
    description: null,
    status: "",
    effort: null,
    issueState: "open",
    archived: false,
    deletedAt: null,
    parentIssueId: null,
    issueType: null,
    milestone: null,
    milestoneId: null,
    milestoneDueOn: null,
    startDate: null,
    finishDate: null,
    iterationTitle: null,
    iterationStart: null,
    iterationDuration: null,
    iterationId: null,
    assignees: [],
    comments: null,
    predecessorIds: [],
    priority: null,
    labels: [],
    relationships: [],
    inProject: true,
    updatedAt: "2026-10-26T12:00:00.000Z",
    ...partial,
  };
}

describe("importCompass", () => {
  it("keeps the stored projection and marks the project as Compass-owned", () => {
    const parent = issue({ issueId: "I_parent", number: 11, title: "Billing", status: "Ready", issueType: "Epic" });
    const child = issue({
      issueId: "I_child",
      number: 12,
      title: "Charge card",
      description: "Take payment",
      status: "Ready",
      issueType: "Task",
      parentIssueId: "I_parent",
      effort: 3,
      startDate: "2026-10-06",
      finishDate: "2026-10-08",
      iterationTitle: "Sprint 1",
      iterationStart: "2026-10-01",
      iterationDuration: 14,
      iterationId: "iter-1",
      milestone: "Phase 1",
      milestoneId: "M_1",
      milestoneDueOn: "2026-11-02",
      assignees: [{ id: "U_1", login: "ada", name: "Ada" }],
      comments: "Ada 2026-10-01 Ready for review",
      predecessorIds: ["I_other", "I_parent"],
      priority: "P1",
      labels: ["risk"],
      relationships: [{ id: "rel-parent", kind: "blocks", otherIssueId: "I_parent" }],
    });

    const imported = importCompass(settings, [parent, child]);

    expect(imported.issues[1]).toMatchObject({
      title: "Charge card",
      description: "Take payment",
      status: "Ready",
      issueType: "Task",
      parentIssueId: "I_parent",
      effort: 3,
      startDate: "2026-10-06",
      finishDate: "2026-10-08",
      iterationTitle: "Sprint 1",
      iterationStart: "2026-10-01",
      iterationDuration: 14,
      iterationId: "iter-1",
      milestone: "Phase 1",
      milestoneId: "M_1",
      milestoneDueOn: "2026-11-02",
      assignees: [{ id: "U_1", login: "ada", name: "Ada" }],
      comments: "Ada 2026-10-01 Ready for review",
      predecessorIds: ["I_other", "I_parent"],
      priority: "P1",
      labels: ["risk"],
      relationships: [
        { id: "rel-parent", kind: "blocks", otherIssueId: "I_parent" },
        { id: "blocks:I_child:I_other", kind: "blocks", otherIssueId: "I_other" },
      ],
    });
    expect(imported.settings.recordSource).toBe("compass");
    expect(imported.settings.statusOptions).toEqual(settings.statusOptions);
    expect(imported.settings.columns).toEqual(["Ready", "Done"]);
    expect(imported.settings.doneStatuses).toEqual(["Done"]);
    expect(imported.settings.iterations).toEqual(settings.iterations);
    expect(imported.settings.issueTypes).toEqual([{ id: "Epic", name: "Epic", color: null }, { id: "Task", name: "Task", color: null }]);
    expect(imported.settings.milestones).toEqual([{ id: "M_1", title: "Phase 1", dueOn: "2026-11-02" }]);
    expect(imported.settings.priorityOptions).toEqual([{ id: "P1", name: "P1" }]);
    expect(imported.settings.labels).toEqual([{ id: "risk", name: "risk", color: null }]);
    expect(settings.recordSource).toBe("github");
  });
});
