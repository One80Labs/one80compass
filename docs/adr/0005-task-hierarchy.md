# ADR 0005 — Task hierarchy for R2

GitHub sub-issues are the parent and child relationship. Reconciliation reads `Issue.parent`. A webhook for `parent_issue_added`, `parent_issue_removed`, `sub_issue_added`, or `sub_issue_removed` updates the same link. One80Compass does not invent a second parent field.

A parent is Done when every active task under it is in a Done status. That includes tasks under intermediate parents. The parent's own effort still does not count toward project progress. When the last open task under a parent becomes Done, the sync worker writes the project's Done status onto that parent and onto each ancestor that is now complete. When any of those tasks leaves Done, or a new open sub-issue is added, each Done ancestor moves to the first board column that is not a Done status. If the board has no such column, the parent stays where it is.

A person cannot mark a parent Done while a task under it is still open. The plan and the Kanban board return that parent to its previous column and show the refusal. Automatic parent changes are audited with the task that caused them. The actor on those rows is `github-sync`.

A milestone target date is the GitHub milestone due date. The milestone is ready for confirmation when every active task on it is Done. An employee confirms it. Reopening that confirmation requires an explanation, and the confirmation history stays on the record. A computed forecast is the latest finish date among the milestone's tasks, and only when every one of those tasks has a finish date. Task dates live on the GitHub Project fields Start and Finish. See ADR 0006. Dependency links and baseline snapshots are still later in this release.
