import { describe, expect, it } from "vitest";
import { milestoneViews, type MilestoneIssue, type MilestoneRecord } from "./milestones";

const done = ["Done"];
const today = "2026-10-26";

function issue(partial: Partial<MilestoneIssue> & { milestone: string; status: string }): MilestoneIssue {
  return {
    milestoneId: null,
    milestoneDueOn: null,
    finishDate: null,
    inProject: true,
    archived: false,
    deletedAt: null,
    ...partial,
  };
}

describe("milestoneViews", () => {
  it("stays open while a task on the milestone is not Done", () => {
    const [view] = milestoneViews([issue({ milestone: "Phase 1", status: "Ready" })], [], done, today);
    expect(view).toMatchObject({ key: "title:Phase 1", state: "open", workOpen: true, forecastDate: null, late: false });
  });

  it("is ready for confirmation when every task is Done, and late when the GitHub due date has passed", () => {
    const [view] = milestoneViews(
      [issue({ milestone: "Phase 1", milestoneId: "M_1", milestoneDueOn: "2026-10-01", status: "Done" })],
      [],
      done,
      today,
    );
    expect(view).toMatchObject({ key: "M_1", state: "ready", late: true, targetDate: "2026-10-01", workOpen: false });
  });

  it("keeps a confirmation until someone reopens it, even if a task is open again", () => {
    const record: MilestoneRecord = {
      projectId: "p",
      customerId: "c",
      milestoneKey: "M_1",
      title: "Phase 1",
      confirmedAt: "2026-10-20T00:00:00.000Z",
      confirmedBy: "user-a",
      history: [{ action: "confirmed", at: "2026-10-20T00:00:00.000Z", actorUserId: "user-a", explanation: null }],
    };
    const [view] = milestoneViews(
      [issue({ milestone: "Phase 1", milestoneId: "M_1", milestoneDueOn: "2026-12-01", status: "Ready" })],
      [record],
      done,
      today,
    );
    expect(view.state).toBe("confirmed");
    expect(view.workOpen).toBe(true);
    expect(view.late).toBe(false);
    expect(view.history).toHaveLength(1);
  });

  it("forecasts the latest finish date only when every task on the milestone has one", () => {
    const scheduled = milestoneViews(
      [
        issue({ milestone: "Phase 1", milestoneId: "M_1", status: "Ready", finishDate: "2026-11-02" }),
        issue({ milestone: "Phase 1", milestoneId: "M_1", status: "Ready", finishDate: "2026-11-15" }),
      ],
      [],
      done,
      today,
    );
    expect(scheduled[0].forecastDate).toBe("2026-11-15");
    const partial = milestoneViews(
      [
        issue({ milestone: "Phase 1", milestoneId: "M_1", status: "Ready", finishDate: "2026-11-02" }),
        issue({ milestone: "Phase 1", milestoneId: "M_1", status: "Ready" }),
      ],
      [],
      done,
      today,
    );
    expect(partial[0].forecastDate).toBeNull();
  });

  it("ignores archived tasks and milestones with no active task", () => {
    expect(milestoneViews([issue({ milestone: "Phase 1", status: "Done", archived: true })], [], done, today)).toEqual([]);
  });
});
