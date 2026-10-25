# Sync worker

This Lambda is separate from the request API. It reads the sync queue, applies GitHub webhooks, and reconciles a customer repository on a schedule.

GitHub is the source of truth for issue title, status, and effort. The worker does not overwrite health or a progress override.

The dev API accepts webhooks at `POST /webhooks/github`. Create a GitHub App with Issues read/write, Metadata read, and organization Projects read/write. In the event list, check **Issues** and **Projects v2 item**. Do not use **Projects v2 status update**; that event is a project health note, not a change to an item's Status field. Install the App on the customer repository. Set these Lambda environment values when the App exists: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`. Leave them empty until then. The browser never sees those values.

A mapping stores an owner, repository, and project number. Reconciliation uses a repository project with that number when one exists, and otherwise the organization project with that number. Only issues from the mapped repository are stored. Status options from GitHub become the board columns. A number field named Estimate is used when the project has no Effort field.

A missing estimate still counts as 1 point in progress and is not written back to GitHub.
