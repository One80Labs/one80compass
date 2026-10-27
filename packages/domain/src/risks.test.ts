import { describe, expect, it } from "vitest";
import { activeScheduleConflicts, mergeRiskRegister, scheduleRiskId, type RiskRecord } from "./risks";

function stored(partial: Partial<RiskRecord> & Pick<RiskRecord, "riskId" | "title">): RiskRecord {
  return {
    projectId: "p1",
    customerId: "c1",
    severity: null,
    description: "",
    dateCleared: null,
    notes: "",
    issueId: null,
    predecessorId: null,
    updatedAt: "2026-10-27T00:00:00.000Z",
    updatedBy: "admin",
    ...partial,
  };
}

describe("mergeRiskRegister", () => {
  it("surfaces live blocker conflicts and keeps administrator edits", () => {
    const rows = mergeRiskRegister(
      [
        stored({
          riskId: scheduleRiskId("B", "A"),
          title: "Rail slip",
          severity: "high",
          description: "Needs a new window.",
          notes: "Watch Friday.",
          issueId: "B",
          predecessorId: "A",
        }),
      ],
      [{ issueId: "B", title: "Rail", predecessorId: "A", predecessorTitle: "Deck", reason: "overlap" }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Rail slip",
      severity: "high",
      description: "Needs a new window.",
      notes: "Watch Friday.",
      status: "open",
      conflictReason: "overlap",
    });
  });

  it("keeps a stored schedule risk after the conflict clears", () => {
    const rows = mergeRiskRegister(
      [
        stored({
          riskId: scheduleRiskId("B", "A"),
          title: "Rail",
          dateCleared: "2026-10-28",
          issueId: "B",
          predecessorId: "A",
        }),
      ],
      [],
    );
    expect(rows).toEqual([
      expect.objectContaining({
        riskId: scheduleRiskId("B", "A"),
        status: "cleared",
        conflictReason: null,
        dateCleared: "2026-10-28",
      }),
    ]);
  });

  it("synthesizes an open row for a conflict that has never been edited", () => {
    const rows = mergeRiskRegister(
      [],
      [{ issueId: "C", title: "Paint", predecessorId: "A", predecessorTitle: "Deck", reason: "unscheduled" }],
    );
    expect(rows[0]).toMatchObject({
      riskId: scheduleRiskId("C", "A"),
      title: "Paint",
      status: "open",
      conflictReason: "unscheduled",
      description: 'Blocked by “Deck”, but this task has no start and finish dates.',
    });
  });

  it("hides Timeline icons for cleared schedule risks while keeping the register row", () => {
    const conflicts = [
      { issueId: "B", title: "Rail", predecessorId: "A", predecessorTitle: "Deck", reason: "overlap" as const },
      { issueId: "C", title: "Paint", predecessorId: "A", predecessorTitle: "Deck", reason: "unscheduled" as const },
    ];
    const rows = mergeRiskRegister(
      [
        stored({
          riskId: scheduleRiskId("B", "A"),
          title: "Rail",
          dateCleared: "2026-10-27",
          notes: "Work finished.",
          issueId: "B",
          predecessorId: "A",
        }),
      ],
      conflicts,
    );
    expect(rows.find((row) => row.issueId === "B")).toMatchObject({ status: "cleared", conflictReason: "overlap" });
    expect(activeScheduleConflicts(conflicts, rows)).toEqual([conflicts[1]]);
  });
});
