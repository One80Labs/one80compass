# Sync worker

This Lambda is separate from the request API. It reads the sync queue, applies GitHub webhooks, and reconciles a customer repository on a schedule.

GitHub is the source of truth for issue title, status, and effort. The worker does not overwrite health or a progress override.

The dev API accepts webhooks at `POST /webhooks/github`. Create a GitHub App with Issues read/write, Metadata read, and Projects read/write. Subscribe to `issues` and `projects_v2_item`. Set these Lambda environment values when the App exists: `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`. Leave them empty until then. The browser never sees those values.

A missing estimate still counts as 1 point in progress and is not written back to GitHub.
