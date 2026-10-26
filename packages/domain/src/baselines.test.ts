import { describe, expect, it } from "vitest";
import { baselineSnapshot, baselineVariance, type BaselineTask } from "./baselines";

const live = { inProject: true, archived: false, deletedAt: null };

describe("baselineSnapshot", () => {
  it("keeps an unscheduled task and skips one that has left the plan", () => {
    expect(
      baselineSnapshot([
        { issueId: "B", title: "Rail", startDate: null, finishDate: null, ...live },
        { issueId: "A", title: "Deck", startDate: "2026-10-01", finishDate: "2026-10-05", ...live, inProject: false },
      ]),
    ).toEqual([{ issueId: "B", title: "Rail", startDate: null, finishDate: null }]);
  });
});

describe("baselineVariance", () => {
  const snapshot: BaselineTask[] = [
    { issueId: "open", title: "Deck", startDate: null, finishDate: null },
    { issueId: "kept", title: "Rail", startDate: "2026-10-01", finishDate: "2026-10-03" },
    { issueId: "gone", title: "Paint", startDate: "2026-10-04", finishDate: "2026-10-06" },
  ];

  it("labels added, newly scheduled, and removed tasks without a day-count for a task that already had dates", () => {
    const rows = baselineVariance(
      [
        { issueId: "open", title: "Deck", startDate: "2026-11-01", finishDate: "2026-11-04", ...live },
        { issueId: "kept", title: "Rail", startDate: "2026-10-10", finishDate: "2026-10-12", ...live },
        { issueId: "new", title: "Glass", startDate: null, finishDate: null, ...live },
      ],
      snapshot,
    );
    expect(rows.map((row) => row.kind)).toEqual(["added", "newly_scheduled", "removed"]);
    expect(rows.find((row) => row.issueId === "kept")).toBeUndefined();
    expect(rows.find((row) => row.issueId === "gone")?.title).toBe("Paint");
  });
});
