# Sync worker

This Lambda is separate from the request API. It reads the sync queue, applies GitHub webhooks, and reconciles a customer repository on a schedule.

GitHub is the source of truth for issue title, status, effort, and the Start and Finish date fields. The worker does not overwrite health, a progress override, or a milestone confirmation.

The dev API accepts webhooks at `POST /webhooks/github`. Create a GitHub App with Issues read/write, Metadata read, and organization Projects read/write. In the event list, check **Issues** and **Projects v2 item**. Do not use **Projects v2 status update**; that event is a project health note, not a change to an item's Status field. Install the App on the customer repository. Set these Lambda environment values when the App exists: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`. Leave them empty until then. The browser never sees those values.

A mapping stores an owner, repository, and project number. Reconciliation uses a repository project with that number when one exists, and otherwise the organization project with that number. Only issues from the mapped repository are stored. Status options from GitHub become the board columns. A number field named Estimate is used when the project has no Effort field.

A missing estimate still counts as 1 point in progress and is not written back to GitHub.

Date fields named Start and Finish are copied on reconcile and written back when a task is scheduled. An administrator can ask the worker to create those fields when they are missing. Clearing a date clears the GitHub field. Issue dependencies are GitHub blocked-by links. An approved schedule writes each moved task before the sync is marked ok.

GitHub sub-issues are the parent link. Reconciliation also reads the GitHub issue type and the Iteration field. Workstream, Epic, and Feature are those type names. Issue and Sub-issue have no type. When every active task under a parent is Done, this worker sets that parent to the project's Done status. When one of those tasks leaves Done, the parent moves to the first column that is not Done. Each of those writes is audited as `issue.parent_status`.

A new Epic, Feature, Issue, or Sub-issue is created in the mapped repository, linked to its parent, and added to the mapped project. Epic and Feature use the organization issue type of that name. If that type is missing, the sync error names it and no type is guessed.
