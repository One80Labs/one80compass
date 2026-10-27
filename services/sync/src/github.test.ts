import { describe, expect, it, vi } from "vitest";
import type { ProjectSettings } from "../../../packages/domain/src/index";
import {
  assertIssueConnectionsComplete,
  chooseProject,
  loadAllProjectItems,
  missingDateFields,
  PROJECT_ITEMS_MAX_PAGES,
  PROJECT_ITEMS_PAGE_SIZE,
  readProject,
} from "./github";

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
  recordSource: "github",
  labels: [{ id: "L1", name: "Bug", color: null }],
  issueTypes: [],
  priorityOptions: [{ id: "P1", name: "High" }],
  milestones: [],
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
      priority: null,
      labels: [],
      relationships: [],
      planOrder: null,
    });
    expect(result.settings.recordSource).toBe("github");
    expect(result.settings.labels).toEqual([{ id: "L1", name: "Bug", color: null }]);
    expect(result.settings.priorityOptions).toEqual([{ id: "P1", name: "High" }]);
  });
});

describe("missingDateFields", () => {
  it("asks only for the date fields the project does not already have", () => {
    expect(missingDateFields([{ name: "Start", dataType: "DATE" }, { name: "Finish", dataType: "TEXT" }])).toEqual(["Finish"]);
    expect(missingDateFields([{ name: "Start", dataType: "DATE" }, { name: "Finish", dataType: "DATE" }])).toEqual([]);
  });
});

describe("loadAllProjectItems", () => {
  it("pages until hasNextPage is false and keeps every node", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({
        pageInfo: { hasNextPage: true, endCursor: "c2" },
        nodes: [{ id: "PVTI_2" }],
      })
      .mockResolvedValueOnce({
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [{ id: "PVTI_3" }],
      });

    const nodes = await loadAllProjectItems(
      {
        pageInfo: { hasNextPage: true, endCursor: "c1" },
        nodes: [{ id: "PVTI_1" }],
      },
      fetchPage,
    );

    expect(nodes.map((item) => item.id)).toEqual(["PVTI_1", "PVTI_2", "PVTI_3"]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(fetchPage).toHaveBeenNthCalledWith(1, "c1");
    expect(fetchPage).toHaveBeenNthCalledWith(2, "c2");
  });

  it("fails loudly when the safety max would truncate results", async () => {
    const fetchPage = vi.fn(async (cursor: string) => ({
      pageInfo: { hasNextPage: true, endCursor: `${cursor}-next` },
      nodes: [{ id: `item-${cursor}` }],
    }));

    await expect(
      loadAllProjectItems(
        {
          pageInfo: { hasNextPage: true, endCursor: "c0" },
          nodes: [{ id: "first" }],
        },
        fetchPage,
        3,
      ),
    ).rejects.toThrow(/exceeded 3 pages/);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("uses a generous default max that covers ~10k items", () => {
    expect(PROJECT_ITEMS_PAGE_SIZE).toBe(100);
    expect(PROJECT_ITEMS_MAX_PAGES).toBe(100);
  });
});

describe("assertIssueConnectionsComplete", () => {
  it("allows complete assignees and blockedBy pages", () => {
    expect(() =>
      assertIssueConnectionsComplete([
        {
          id: "PVTI_1",
          content: {
            id: "I_1",
            number: 1,
            assignees: { pageInfo: { hasNextPage: false }, nodes: [{ id: "U1", login: "a", name: null }] },
            blockedBy: { pageInfo: { hasNextPage: false }, nodes: [{ id: "I_2" }] },
          },
        },
      ]),
    ).not.toThrow();
  });

  it("fails when assignees were truncated", () => {
    expect(() =>
      assertIssueConnectionsComplete([
        {
          content: {
            number: 42,
            assignees: { pageInfo: { hasNextPage: true }, nodes: [] },
          },
        },
      ]),
    ).toThrow(/issue #42.*assignees/);
  });

  it("fails when blockedBy was truncated", () => {
    expect(() =>
      assertIssueConnectionsComplete([
        {
          content: {
            number: 7,
            blockedBy: { pageInfo: { hasNextPage: true }, nodes: [] },
          },
        },
      ]),
    ).toThrow(/issue #7.*blocked-by/);
  });
});
