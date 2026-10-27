# ADR 0006 — Task dates

GitHub Project date fields named Start and Finish are the source of truth for a task schedule. Reconciliation copies them onto the issue. A date edit is written back to those fields. Clearing a date clears the GitHub field.

An administrator can add the two fields with `POST /projects/{projectId}/schedule-fields` when the project does not already have date fields with those names. A task with no dates stays unscheduled. The Timeline does not invent a bar for it.

The Timeline bar uses the Start and Finish fields. Choosing an iteration copies that iteration's start and end into those fields. Choosing a different iteration later keeps Start and sets Finish to the new iteration end. The dates can still be edited by hand, including by dragging a Timeline bar: the middle moves both dates, and each end resizes Start or Finish. A bar drag writes Start, Finish, and Iteration together; Iteration becomes the catalog iteration that best contains the new Finish (then Start, then largest overlap), or clears when none apply. An Epic or Feature can keep those dates until a Task or Sub-issue is added under it. Then its Start and Finish are replaced by the earliest start and latest finish of those tasks, and those values are written back to the GitHub project. Rollup bars from child tasks are not editable by drag. Iteration, Start, Finish, and Comments are stored on the GitHub project. Each new comment line is the One80Compass user, the date, and the comment.

The milestone forecast is the latest finish date among that milestone's active tasks, and only when every one of those tasks has a finish date. The target date remains the GitHub milestone due date.

Dependency links are GitHub blocked-by relationships. A date change that would make a later task start too soon waits for approval before those tasks move. See ADR 0007. Baseline snapshots are still later in this release.
