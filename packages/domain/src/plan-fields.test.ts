import { describe, expect, it } from "vitest";
import {
  catalogIssueTypesFromStore,
  catalogLabelsFromStore,
  catalogMilestonesFromStore,
  labelIdsFromStore,
  priorityFromStore,
  priorityOptionsFromStore,
  recordSourceFromStore,
  relationshipsFromStore,
} from "./index";

describe("stored plan field defaults", () => {
  it("treats a missing record source as github and keeps compass", () => {
    expect(recordSourceFromStore(undefined)).toBe("github");
    expect(recordSourceFromStore(null)).toBe("github");
    expect(recordSourceFromStore("github")).toBe("github");
    expect(recordSourceFromStore("other")).toBe("github");
    expect(recordSourceFromStore("compass")).toBe("compass");
  });

  it("turns missing catalogs, label ids, and relationships into empty arrays", () => {
    expect(catalogLabelsFromStore(undefined)).toEqual([]);
    expect(catalogIssueTypesFromStore(null)).toEqual([]);
    expect(priorityOptionsFromStore("Status")).toEqual([]);
    expect(catalogMilestonesFromStore(undefined)).toEqual([]);
    expect(labelIdsFromStore(undefined)).toEqual([]);
    expect(relationshipsFromStore(null)).toEqual([]);
  });

  it("keeps complete catalog rows and drops rows that have no id or name", () => {
    expect(catalogLabelsFromStore([{ id: "L1", name: "Bug" }, { id: " ", name: "Skip" }, "nope"])).toEqual([{ id: "L1", name: "Bug", color: null }]);
    expect(catalogIssueTypesFromStore([{ id: "T1", name: "Task", color: "olive" }, { id: "T2", name: "Epic", color: "nope" }])).toEqual([
      { id: "T1", name: "Task", color: "olive" },
      { id: "T2", name: "Epic", color: null },
    ]);
    expect(priorityOptionsFromStore([{ id: "P1", name: "High" }])).toEqual([{ id: "P1", name: "High" }]);
    expect(
      catalogMilestonesFromStore([
        { id: "M1", title: "Phase 1", dueOn: "2026-11-02" },
        { id: "M2", title: "Phase 2", dueOn: "next week" },
        { id: "M3", title: "" },
      ]),
    ).toEqual([
      { id: "M1", title: "Phase 1", dueOn: "2026-11-02" },
      { id: "M2", title: "Phase 2", dueOn: null },
    ]);
  });

  it("turns a missing priority into null and keeps a stored priority", () => {
    expect(priorityFromStore(undefined)).toBeNull();
    expect(priorityFromStore(null)).toBeNull();
    expect(priorityFromStore("")).toBeNull();
    expect(priorityFromStore("  ")).toBeNull();
    expect(priorityFromStore(1)).toBeNull();
    expect(priorityFromStore(" high ")).toBe("high");
  });

  it("keeps label ids and relationships that have the required text", () => {
    expect(labelIdsFromStore(["bug", " ", "bug", 4])).toEqual(["bug"]);
    expect(relationshipsFromStore([{ id: "rel-1", kind: "blocked_by", otherIssueId: "I_9" }, { id: "rel-2", kind: "", otherIssueId: "I_8" }])).toEqual([
      { id: "rel-1", kind: "blocked_by", otherIssueId: "I_9" },
    ]);
  });
});
