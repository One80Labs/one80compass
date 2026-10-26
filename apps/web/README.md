# Web

Vite and React. Sign-in uses the Cognito user pool from the dev stack. The browser keeps that session, so a refresh stays signed in. The app sends the ID token. API Gateway checks that token. The dev pool accepts email and password. Set `VITE_MFA_REQUIRED=true` only for a build whose pool requires an authenticator.

An administrator can open and change every project. A Contributor can edit, add, and upload on the projects they can open. View can open those same screens and cannot change them. The members list and the invite form set that access. The API refuses a View change even if a button is shown.

Overview stores health and notes. Documents uploads a file through a short-lived S3 URL, keeps older versions, and restores a soft-deleted file without replacing the current version. New folder creates a folder in the current location, including an empty one. A file can be moved into a folder that already exists.

Plan and Kanban read the GitHub projection. The plan is grouped by Epic. A Feature sits under an Epic, an Issue sits under a Feature or an Epic, and a Sub-issue sits under an Issue. The Workstream issue number is saved with the GitHub mapping and is not a row. Add Epic, Add Feature, Add Issue, and Add Sub-issue create that GitHub issue and parent link. Tasks with no Epic stay in Outside an Epic. The Kanban board stays grouped by status. Each plan row can change the title, status, and effort; the save is sent to GitHub. Dragging a Kanban card onto another column sends that column name as the status. The Kanban pencil opens that same editor in the shared drawer. The drawer heading is the issue title. Description is the GitHub issue body. The drawer shows the first 200 characters until it is expanded. A GitHub sub-issue is indented under its parent in the plan list. That parent becomes Done only when every task under it is Done. The Timeline draws the same date bars as the Gantt. Each Timeline row shows that issue's GitHub status. Clicking that status opens the same GitHub issue editor as the Kanban pencil. Those bars come from each GitHub issue: the Iteration when one is set, otherwise Start and Finish. The Gantt reads and writes GitHub Project date fields named Start and Finish. An Iteration on the GitHub project supplies the date range and the Gantt bar. Dragging a bar moves both dates. Dragging either end changes that date. A dependency is a GitHub blocked-by link. The later task starts the day after the earlier one finishes. If a date change would break that, the plan shows the moves and waits for approval. An administrator sets Baseline 1 from the current tasks, including tasks that have no dates. Later baselines are proposed and then approved or rejected. Comparison marks a task as newly scheduled, added after the baseline, or removed since the baseline. A milestone can be confirmed once every task on it is Done. Reopening that confirmation requires an explanation. The target date is the GitHub due date. The forecast is the latest finish date when every task on the milestone has one. Progress counts leaf issues and treats a missing estimate as 1 without writing that 1 back to GitHub. A manual override requires an explanation. The GitHub App credentials stay on the Lambdas.

Status reports move from draft to review, approval, and publish. Each publish keeps a separate copy. Starting a revision edits a new draft and does not change a published copy.

Audit lists the newest recorded changes for the customer, including who made the change and the prior and new values. It is always in the navigation once a project is selected.

`EditDrawer` in `src/ui.tsx` is the shared right-hand editor for members and plan issues. Its body scrolls, and Save stays on the left of the footer with Cancel on the right. An X in the upper right closes the drawer. The X, Cancel, Escape, and the backdrop close immediately when nothing has changed. If a field differs from the values opened with the drawer, a warning offers Save changes, Close without saving, or Keep editing. `EditRowButton` is the pencil control for the last cell of a table row.

Copy the stack outputs into `apps/web/.env.local`:

```
VITE_USER_POOL_ID=
VITE_USER_POOL_CLIENT_ID=
VITE_API_URL=
```

Then run `npm run dev -w @one80compass/web` and open `http://localhost:5173`.

`npm run deploy:dev` publishes the same build to CloudFront. Open the `SiteUrl` output from the dev stack. The API allows both that address and localhost.
