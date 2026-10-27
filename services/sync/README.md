# Sync worker

This Lambda is separate from the request API. It reads the sync queue, applies GitHub webhooks, and reconciles a customer repository on a schedule.

GitHub is the source of truth for issue title, description, status, effort, and the Start and Finish date fields. The worker does not overwrite health, a progress override, or a milestone confirmation.

The dev API accepts webhooks at `POST /webhooks/github`. Create a GitHub App with Issues read/write, Metadata read, and organization Projects read/write. In the event list, check **Issues** and **Projects v2 item**. Do not use **Projects v2 status update**; that event is a project health note, not a change to an item's Status field. Install the App on the customer repository. Set `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` on the **sync** Lambda, and `GITHUB_WEBHOOK_SECRET` plus `GITHUB_CONFIGURED=true` on the **API** Lambda. Prefer Secrets Manager for the PEM in stage/prod. Leave them empty until then. The browser never sees those values.

A mapping stores an owner, repository, and project number. Reconciliation uses a repository project with that number when one exists, and otherwise the organization project with that number. Only issues from the mapped repository are stored. Status options from GitHub become the board columns. A number field named Estimate is used when the project has no Effort field.

A missing estimate still counts as 1 point in progress and is not written back to GitHub.

Date fields named Start and Finish are copied on reconcile and written back when a task is scheduled. An administrator can ask the worker to create those fields when they are missing. Clearing a date clears the GitHub field. Issue dependencies are GitHub blocked-by links. An approved schedule writes each moved task before the sync is marked ok.

A Subtask uses GitHub's parent link. Reconciliation also reads the GitHub issue type and the Iteration field. Workstream, EPIC, Feature, and Task are those type names. A Subtask has no type. When every active task under a parent is Done, this worker sets that parent to the project's Done status. When one of those tasks leaves Done, the parent moves to the first column that is not Done. Each of those writes is audited as `issue.parent_status`.

A project whose `recordSource` is `compass` is left alone. Reconciliation, webhooks, and queued GitHub writes skip it.

`importCompass` copies that stored projection into Compass records. It keeps title, description, status, type, parent, effort, dates, iteration, milestone, assignees, comments, and predecessors, and adds a `blocks` relationship for each predecessor that is not already linked. Priority and labels are copied when the projection has them. Catalogs for issue types, milestones, priorities, and labels are the distinct values on those issues. Status options, columns, done statuses, and iterations stay as saved. The function does not call GitHub. An administrator runs it with `POST /projects/{projectId}/import-compass`.

A new Epic, Feature, Task, or Subtask is created in the mapped repository, linked to its parent, and added to the mapped project. Epic uses the organization issue type EPIC, Feature uses Feature, and Task uses Task. If that type is missing, the sync error names it and no type is guessed. The create also writes description, status, effort, iteration, assignee, comments, and Start and Finish. After a create, edit, or reconcile, an Epic or Feature that has a Task or Subtask under it has its Start and Finish rewritten from those tasks. Until then, the dates entered on the Epic or Feature stay.
