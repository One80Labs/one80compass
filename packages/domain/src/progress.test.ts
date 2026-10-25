import { describe, expect, it } from "vitest";
import { projectProgress, type ProgressIssue } from "./progress";

const done = ["Done"];

function issue(partial: Partial<ProgressIssue> & { issueId: string }): ProgressIssue {
  return {
    parentIssueId: null,
    effort: null,
    status: "Todo",
    archived: false,
    deletedAt: null,
    inProject: true,
    ...partial,
  };
}

describe("projectProgress", () => {
  it("shows no percentage when there are no active leaves", () => {
    expect(projectProgress([], done).label).toBe("Not Started / No Tasks");
    expect(projectProgress([issue({ issueId: "a", archived: true })], done).percent).toBeNull();
  });

  it("counts leaves only and treats a missing estimate as 1", () => {
    const snapshot = projectProgress(
      [
        issue({ issueId: "parent", effort: 99, status: "Done" }),
        issue({ issueId: "child", parentIssueId: "parent", effort: null, status: "Done" }),
        issue({ issueId: "other", effort: 3, status: "Todo" }),
      ],
      done,
    );
    expect(snapshot.percent).toBe(25);
    expect(snapshot.defaultedIssueIds).toEqual(["child"]);
  });

  it("ignores issues that are not on the GitHub project", () => {
    const snapshot = projectProgress([issue({ issueId: "a", inProject: false, status: "Done", effort: 5 })], done);
    expect(snapshot.state).toBe("empty");
  });
});
