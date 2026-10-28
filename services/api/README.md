# API

One Lambda behind an HTTP API. API Gateway validates the Cognito ID token before this function runs. The function repeats the membership check.

Routes for the first slice:

- `POST /admin/customers` and `GET /admin/customers`
- `POST /admin/customers/{customerId}/projects`
- `PATCH /admin/projects/{projectId}` renames a project. Administrator only. Body needs `name` (up to 120 characters).
- `POST /admin/customers/{customerId}/invitations` invites a Contributor unless the body sets access to View.
- `GET /admin/members` lists each membership with the customer name, the projects that person can open, and Administrator, Contributor, or View.
- `PATCH /admin/customers/{customerId}/members/{userId}` sets the display name, sign-in email, project list, and access. Access is Contributor or View. A null project list means every current and future project. Changing a member email creates the new Cognito user, emails a temporary password when the address is new, and disables the old address when it has no membership left. An administrator email cannot be changed. Administrators can still open and change every project. A person saved before this change as an employee is read as a Contributor.
- `GET /admin/customers/{customerId}/audit`
- `POST /admin/projects/{projectId}/applications`
- `GET /me`
- `GET /customers/{customerId}/projects`
- `GET /projects/{projectId}`
- `GET /projects/{projectId}/applications`
- `GET` and `PUT /projects/{projectId}/overview`
- `GET` and `POST /projects/{projectId}/documents`. The list includes folders. A folder path on an older file is shown even when that folder was not created separately. Create may set `sourceLabel` to `compass-upload`, `krisp`, `fireflies`, `other`, or null. A null label keeps the file out of the staff vault.
- `POST /projects/{projectId}/folders` creates a folder in the current parent. `POST .../folders/delete` removes an empty folder.
- `PATCH /projects/{projectId}/documents/{documentId}` moves a file into an existing folder, or sets `sourceLabel`. An empty folder value moves it back to All documents.
- `POST /projects/{projectId}/documents/{documentId}/versions` and `.../complete`
- `GET /projects/{projectId}/documents/{documentId}/download`
- `POST /projects/{projectId}/documents/{documentId}/delete` and `.../restore`
- `GET /customers/{customerId}/audit` — members with customer access get event metadata with `before`/`after` redacted; platform admins get full payloads (same as `/admin/.../audit`)
- `GET /projects/{projectId}/plan`
- `PUT /projects/{projectId}/github` saves the owner, repository, project number, and the Workstream issue number. An empty Workstream number clears it.
- `POST /projects/{projectId}/import-compass` copies the stored GitHub projection into Compass-owned issues and catalogs. Administrator only. The request reads DynamoDB and does not call GitHub. A project whose `recordSource` is already `compass` returns 409.
- `PUT /projects/{projectId}/catalogs` replaces status, iterations, labels, issue types, priorities, and milestones. Administrator only. A project whose record source is not Compass returns 409.
- Compass issue edits stay in DynamoDB. The editor can change issue type, parent, milestone, priority, labels, assignees, predecessors, and other relationships. `POST /projects/{projectId}/sync` returns 409 `COMPASS_OWNED` so a GitHub sync cannot replace those fields. `GET /projects/{projectId}/plan` includes `members` for a Compass project.
- `POST /projects/{projectId}/plan-items` creates an Epic, Feature, Issue, or Subtask in GitHub. An Epic nests under the Workstream. A Feature nests under an Epic. An Issue nests under an Epic, a Feature, or the Workstream. A Subtask nests under an Issue. The Workstream number and the parent kind are checked before the request is queued.
- `POST /projects/{projectId}/sync`
- `POST /projects/{projectId}/progress-override`
- `PATCH /projects/{projectId}/issues/{issueId}` sends title, status, effort, or Start and Finish dates to GitHub. A parent cannot be marked Done while a task under it is still open. Dates are refused until the GitHub project has date fields named Start and Finish. A date that would make a later task start too soon returns `DEPENDENCY_REVIEW` until the request approves those moves or keeps the later dates.
- `POST /projects/{projectId}/issues/{issueId}/predecessors` links a GitHub blocked-by predecessor. `POST .../predecessors/remove` clears that link. A loop is refused.
- `POST /projects/{projectId}/schedule-fields` adds those two date fields. Administrator only.
- `POST /projects/{projectId}/milestones/{milestoneKey}/confirm` confirms a milestone after every task on it is Done. `POST .../reopen` requires an explanation and keeps the earlier confirmation in the history.
- `POST /projects/{projectId}/baselines` sets Baseline 1 when an administrator sends the explanation, or proposes the next baseline after Baseline 1 exists. `POST .../baselines/{baselineId}/approve` and `.../reject` are administrator only. Rejecting requires an explanation. The task list on an approved baseline is not rewritten.
- `POST /webhooks/github` without a Cognito token; it checks the GitHub signature and queues the delivery
- `GET` and `POST /projects/{projectId}/reports`
- `POST /projects/{projectId}/reports/draft` builds a cited status draft from vault work items and filed chunks. Administrator only. The body needs `question`. The draft does not change plan issues. Requires `loadVaultChunks` on the handler deps.
- `GET` and `PUT /projects/{projectId}/reports/{reportId}`
- `POST /projects/{projectId}/reports/{reportId}/submit` and `/revise` for project writers; `/approve` and `/publish` are platform-admin only
- `GET /projects/{projectId}/vault-allowlist` returns `{ customerId, programId, enabled }` for whether that project is on the staff vault allowlist. Administrator only.
- `PUT /projects/{projectId}/vault-allowlist` records or clears that project on the staff vault allowlist. Administrator only. The API invokes the vault Lambda; it does not hold the vault secret.
- `POST /projects/{projectId}/vault-ingest` copies the allowlisted program and its filed documents into the vault. Administrator only. Plan and document text are read from DynamoDB and S3; rows are saved through the vault Lambda.
- Auto-ingest (same pipeline, best-effort): after upload complete when the document has a vault `sourceLabel`, or after `sourceLabel` is set to a vault label while a stored current version exists — only when the project is on the vault allowlist. Failures are logged and do not fail the document API.

Publishing stores an immutable copy and, when `putReportText` is wired, also writes that markdown under the documents bucket. A later revision edits the working draft and leaves that copy unchanged.

A missing or foreign project returns 404. A View member who can open the project receives 403 `VIEW_ONLY` on any change. Administrator routes require the `one80-admin` group on a token API Gateway has already verified. The dev pool does not require MFA before that token exists. A customer id in the JSON body is ignored. Uploads are limited to 25 MiB. Restoring a document does not replace its current version.
