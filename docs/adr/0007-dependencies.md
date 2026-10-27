# ADR 0007 — Task dependencies

One80Compass supports two plan link types:

- A **Hard Blocker** is stored in the successor's `predecessorIds`. Reconciliation reads and writes the corresponding GitHub `blockedBy` link.
- A **soft Dependency** is visual-only. It is stored on the successor as a relationship with `kind: "dependency"` and `otherIssueId` set to the predecessor issue ID. It does not affect scheduling, schedule conflicts, dependency review, or GitHub `blockedBy`.

Hard Blockers are finish-to-start. The later task starts the day after the earlier task finishes. A date edit that would break that rule does not move the later tasks by itself. The plan shows each proposed move. Approving writes those dates to the GitHub Start and Finish fields. Rejecting writes only the task that was edited and leaves the overlap visible. A task with no dates is not given dates by that approval. The dependencies tab shows it as not scheduled.

A task cannot block itself, and a link that would loop through other tasks is refused.

Schedule baselines are portal snapshots. See ADR 0008.

## Follow-ups

- Show dependency details on hover when lines are hidden.
- Support lag and lead time.
- Support start-to-start, finish-to-finish, and start-to-finish links.
- Calculate and display the critical path.
- Optionally auto-reschedule when creating a blocker.
