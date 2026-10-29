# ADR 0007 — Task dependencies

One80Compass supports two plan link types:

- A **Hard Blocker** is stored in the successor's `predecessorIds`. Reconciliation reads and writes the corresponding GitHub `blockedBy` link.
- A **soft Dependency** is visual-only. It is stored on the successor as a relationship with `kind: "dependency"` and `otherIssueId` set to the predecessor issue ID. It does not affect scheduling, schedule conflicts, dependency review, or GitHub `blockedBy`.

Hard Blockers default to finish-to-start (FS): the later task starts the day after the earlier task finishes. Optional per-edge metadata on `blockerEdges` may set `linkKind` (FS / SS / FF / SF) and `lagDays` (positive lag or negative lead). Soft Dependency never uses those fields. A date edit that would break a Hard Blocker constraint does not move later tasks by itself. The plan shows each proposed move. Approving writes those dates to the GitHub Start and Finish fields. Rejecting writes only the task that was edited and leaves the overlap visible. A task with no dates is not given dates by that approval. The dependencies tab shows it as not scheduled.

Link-kind constraint summary (inclusive calendar dates; lag applied after the anchor):

- **FS** — successor start ≥ day after predecessor finish (+ lag).
- **SS** — successor start ≥ predecessor start (+ lag); same day allowed when lag is 0.
- **FF** — successor finish ≥ predecessor finish (+ lag); review shifts preserve duration.
- **SF** — successor finish ≥ predecessor start (+ lag); review shifts preserve duration.

Gantt connectors attach to the matching bar ends (start vs finish) for each kind; soft Dependency lines stay finish→start.

A task cannot block itself, and a link that would loop through other tasks is refused (cycle checks use `predecessorIds` only).

Schedule baselines are portal snapshots. See ADR 0008.

## Follow-ups

- ~~Show dependency details on hover when lines are hidden.~~ Done (Timeline hover-reveal when the global dependency-lines toggle is off).
- ~~Support lag and lead time.~~ Done (`blockerEdges.lagDays`; LinkDialog + Dependencies tab).
- ~~Support start-to-start, finish-to-finish, and start-to-finish links.~~ Done (domain + Gantt anchors + LinkDialog / Dependencies kind picker; coexists with lag on `blockerEdges`).
- ~~Calculate and display the critical path.~~ Done (Timeline **Critical path** toggle; Hard Blocker graph only).
- ~~Optionally auto-reschedule when creating a blocker.~~ Done (opt-in on Blocker create; warn-only remains default).
