import { describe, expect, it } from "vitest";
import type { ProjectSettings } from "../../../packages/domain/src/index";
import { chooseProject, missingDateFields, readProject } from "./github";

const settings: ProjectSettings = {
  projectId: "proj-1",
  customerId: "cust-1",
  owner: "One80Labs",
  repo: "one80compass",
  projectNumber: 1,
  projectNodeId: null,
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
};

describe("chooseProject", () => {
  it("uses the organization project when the repository has no project with that number", () => {
    const chosen = chooseProject({
      repositoryOwner: {
        projectV2: { id: "PVT_org", items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] }, fields: { nodes: [] } },
        repository: { projectV2: null },
      },
    });
    expect(chosen?.scope).toBe("organization");
    expect(chosen?.project.id).toBe("PVT_org");
  });
});

describe("readProject", () => {
  it("keeps the mapped repository, copies Status columns, and reads Estimate", () => {
    const result = readProject(
      settings,
      {
        id: "PVT_org",
        items: {
          pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            {
              id: "PVTI_1",
              content: {
                id: "I_1",
                number: 1,
                title: "test",
                state: "OPEN",
                repository: { nameWithOwner: "One80Labs/one80compass" },
                parent: { id: "I_parent" },
                milestone: { id: "M_1", title: "Phase 1", dueOn: "2026-11-02" },
              },
              fieldValues: {
                nodes: [
                  { name: "Backlog", field: { name: "Status" } },
                  { number: 3, field: { name: "Estimate" } },
                  { date: "2026-10-26", field: { name: "Start" } },
                  { date: "2026-11-02", field: { name: "Finish" } },
                ],
              },
            },
            {
              id: "PVTI_2",
              content: { id: "I_2", number: 2, title: "other repo", state: "OPEN", repository: { nameWithOwner: "One80Labs/other" } },
            },
          ],
        },
        fields: {
          nodes: [
            {
              id: "status-field",
              name: "Status",
              options: [
                { id: "backlog", name: "Backlog" },
                { id: "done", name: "Done" },
              ],
            },
            { id: "estimate-field", name: "Estimate" },
            { id: "start-field", name: "Start", dataType: "DATE" },
            { id: "finish-field", name: "Finish", dataType: "DATE" },
          ],
        },
      },
      "organization",
      "2026-10-25T12:00:00.000Z",
    );
    expect(result.settings.columns).toEqual(["Backlog", "Done"]);
    expect(result.settings.effortFieldName).toBe("Estimate");
    expect(result.settings.effortFieldId).toBe("estimate-field");
    expect(result.settings.startFieldId).toBe("start-field");
    expect(result.settings.finishFieldId).toBe("finish-field");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      title: "test",
      status: "Backlog",
      effort: 3,
      parentIssueId: "I_parent",
      milestone: "Phase 1",
      milestoneId: "M_1",
      milestoneDueOn: "2026-11-02",
      startDate: "2026-10-26",
      finishDate: "2026-11-02",
    });
  });
});

describe("missingDateFields", () => {
  it("asks only for the date fields the project does not already have", () => {
    expect(missingDateFields([{ name: "Start", dataType: "DATE" }, { name: "Finish", dataType: "TEXT" }])).toEqual(["Finish"]);
    expect(missingDateFields([{ name: "Start", dataType: "DATE" }, { name: "Finish", dataType: "DATE" }])).toEqual([]);
  });
});
