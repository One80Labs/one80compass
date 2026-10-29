import { describe, expect, it } from "vitest";
import { decisionCounts, decisionFromStore, decisionIsBlocking, decisionIsOverdue, type DecisionRecord } from "./decisions";

function row(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    decisionId: "d1",
    projectId: "p1",
    customerId: "c1",
    kind: "question",
    status: "outstanding",
    statement: "Which vendor?",
    raisedBy: "ada",
    raisedOn: "2026-10-01",
    assigneeIds: ["ada"],
    neededFrom: "",
    targetDate: "2026-10-15",
    affects: ["timeline"],
    blocksWork: true,
    issueId: "issue-1",
    source: null,
    answer: "",
    outcome: "",
    rationale: "",
    decisionType: null,
    decidedBy: null,
    decidedOn: null,
    consulted: "",
    assumptions: "",
    whatWouldChange: "",
    doesNotMean: "",
    duplicateOfId: null,
    archiveReason: "",
    suggestionText: null,
    acceptedBy: null,
    comments: [],
    history: [],
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    updatedBy: "ada",
    ...overrides,
  };
}

describe("decision register", () => {
  it("counts outstanding, overdue, and blocking", () => {
    const records = [
      row(),
      row({ decisionId: "d2", targetDate: "2026-10-29", blocksWork: false }),
      row({ decisionId: "d3", status: "resolved" }),
    ];
    expect(decisionCounts(records, "2026-10-29")).toEqual({ outstanding: 2, overdue: 1, blocking: 1 });
    expect(decisionIsOverdue(records[0], "2026-10-29")).toBe(true);
    expect(decisionIsBlocking(records[1])).toBe(false);
  });

  it("drops a decision type stored on a question", () => {
    const parsed = decisionFromStore({ ...row(), decisionType: "type1" });
    expect(parsed?.decisionType).toBeNull();
    expect(decisionFromStore({ ...row(), kind: "decision", decisionType: "type2" })?.decisionType).toBe("type2");
  });
});
