import { describe, expect, it } from "vitest";
import type { ProjectSettings } from "../../../packages/domain/src/index";
import { chooseProject, readProject } from "./github";

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
  statusOptions: [],
  doneStatuses: ["Done"],
  columns: ["Todo", "In Progress", "Done"],
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
              content: { id: "I_1", number: 1, title: "test", state: "OPEN", repository: { nameWithOwner: "One80Labs/one80compass" } },
              fieldValues: {
                nodes: [
                  { name: "Backlog", field: { name: "Status" } },
                  { number: 3, field: { name: "Estimate" } },
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
          ],
        },
      },
      "organization",
      "2026-10-25T12:00:00.000Z",
    );
    expect(result.settings.columns).toEqual(["Backlog", "Done"]);
    expect(result.settings.effortFieldName).toBe("Estimate");
    expect(result.settings.effortFieldId).toBe("estimate-field");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ title: "test", status: "Backlog", effort: 3 });
  });
});
