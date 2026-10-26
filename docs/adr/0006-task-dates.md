# ADR 0006 — Task dates

GitHub Project date fields named Start and Finish are the source of truth for a task schedule. Reconciliation copies them onto the issue. A date edit is written back to those fields. Clearing a date clears the GitHub field.

An administrator can add the two fields from the Gantt tab when the project does not already have date fields with those names. A task with no dates stays unscheduled. The Gantt does not invent a bar for it.

A bar needs both dates. Dragging the bar moves the start and the finish by the same number of days. Dragging either end changes that one date. The finish cannot move before the start.

The milestone forecast is the latest finish date among that milestone's active tasks, and only when every one of those tasks has a finish date. The target date remains the GitHub milestone due date.

Dependency links are GitHub blocked-by relationships. A date change that would make a later task start too soon waits for approval before those tasks move. See ADR 0007. Baseline snapshots are still later in this release.
