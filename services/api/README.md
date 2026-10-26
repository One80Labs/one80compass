# API

One Lambda behind an HTTP API. API Gateway validates the Cognito ID token before this function runs. The function repeats the membership check.

Routes for the first slice:

- `POST /admin/customers` and `GET /admin/customers`
- `POST /admin/customers/{customerId}/projects`
- `POST /admin/customers/{customerId}/invitations`
- `GET /admin/members` lists each membership with the customer name, the projects that person can open, and Administrator or Employee.
- `PATCH /admin/customers/{customerId}/members/{userId}` sets the display name, sign-in email, and project list. A null project list means every current and future project. Changing an employee email creates the new Cognito user, emails a temporary password when the address is new, and disables the old address when it has no membership left. An administrator email cannot be changed. Administrators can still open every project.
- `GET /admin/customers/{customerId}/audit`
- `POST /admin/projects/{projectId}/applications`
- `GET /me`
- `GET /customers/{customerId}/projects`
- `GET /projects/{projectId}`
- `GET /projects/{projectId}/applications`
- `GET` and `PUT /projects/{projectId}/overview`
- `GET` and `POST /projects/{projectId}/documents`. The list includes folders. A folder path on an older file is shown even when that folder was not created separately.
- `POST /projects/{projectId}/folders` creates a folder in the current parent. `POST .../folders/delete` removes an empty folder.
- `PATCH /projects/{projectId}/documents/{documentId}` moves a file into an existing folder. An empty folder value moves it back to All documents.
- `POST /projects/{projectId}/documents/{documentId}/versions` and `.../complete`
- `GET /projects/{projectId}/documents/{documentId}/download`
- `POST /projects/{projectId}/documents/{documentId}/delete` and `.../restore`
- `GET /customers/{customerId}/audit`
- `GET /projects/{projectId}/plan`
- `PUT /projects/{projectId}/github`
- `POST /projects/{projectId}/sync`
- `POST /projects/{projectId}/progress-override`
- `PATCH /projects/{projectId}/issues/{issueId}` sends title, status, effort, or Start and Finish dates to GitHub. A parent cannot be marked Done while a task under it is still open. Dates are refused until the GitHub project has date fields named Start and Finish. A date that would make a later task start too soon returns `DEPENDENCY_REVIEW` until the request approves those moves or keeps the later dates.
- `POST /projects/{projectId}/issues/{issueId}/predecessors` links a GitHub blocked-by predecessor. `POST .../predecessors/remove` clears that link. A loop is refused.
- `POST /projects/{projectId}/schedule-fields` adds those two date fields. Administrator only.
- `POST /projects/{projectId}/milestones/{milestoneKey}/confirm` confirms a milestone after every task on it is Done. `POST .../reopen` requires an explanation and keeps the earlier confirmation in the history.
- `POST /projects/{projectId}/baselines` sets Baseline 1 when an administrator sends the explanation, or proposes the next baseline after Baseline 1 exists. `POST .../baselines/{baselineId}/approve` and `.../reject` are administrator only. Rejecting requires an explanation. The task list on an approved baseline is not rewritten.
- `POST /webhooks/github` without a Cognito token; it checks the GitHub signature and queues the delivery
- `GET` and `POST /projects/{projectId}/reports`
- `GET` and `PUT /projects/{projectId}/reports/{reportId}`
- `POST /projects/{projectId}/reports/{reportId}/submit`, `/approve`, `/publish`, and `/revise`

Publishing stores an immutable copy. A later revision edits the working draft and leaves that copy unchanged.

A missing or foreign project returns 404. Administrator routes require the `one80-admin` group on a token API Gateway has already verified. The dev pool does not require MFA before that token exists. A customer id in the JSON body is ignored. Uploads are limited to 25 MiB. Restoring a document does not replace its current version.
