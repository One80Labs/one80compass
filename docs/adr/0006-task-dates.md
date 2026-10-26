# ADR 0006 — Task dates

GitHub Project date fields named Start and Finish are the source of truth for a task schedule. Reconciliation copies them onto the issue. A date edit is written back to those fields. Clearing a date clears the GitHub field.

An administrator can add the two fields from the Gantt tab when the project does not already have date fields with those names. A task with no dates stays unscheduled. The Gantt does not invent a bar for it.

An Iteration on the GitHub project supplies the bar. The bar runs from the iteration start through its last day. Start and Finish are used when the task has no Iteration. The Timeline and the Gantt draw that same bar. An Epic or Feature with no dates of its own spans the bars of the work under it.

The milestone forecast is the latest finish date among that milestone's active tasks, and only when every one of those tasks has a finish date. The target date remains the GitHub milestone due date.

Dependency links are GitHub blocked-by relationships. A date change that would make a later task start too soon waits for approval before those tasks move. See ADR 0007. Baseline snapshots are still later in this release.
