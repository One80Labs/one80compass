# Web

Vite and React. Sign-in uses the Cognito user pool from the dev stack. The browser keeps that session, so a refresh stays signed in. The app sends the ID token. API Gateway checks that token, and the pool requires MFA before Cognito issues it.

Overview stores health and notes. Documents uploads a file through a short-lived S3 URL, keeps older versions, and restores a soft-deleted file without replacing the current version.

Plan and Kanban read the GitHub projection. Each plan row can change the title, status, and effort; the save is sent to GitHub. Progress counts leaf issues and treats a missing estimate as 1 without writing that 1 back to GitHub. A manual override requires an explanation. The GitHub App credentials stay on the Lambdas.

Status reports move from draft to review, approval, and publish. Each publish keeps a separate copy. Starting a revision edits a new draft and does not change a published copy.

Audit lists the newest recorded changes for the customer, including who made the change and the prior and new values. It is always in the navigation once a project is selected.

Copy the stack outputs into `apps/web/.env.local`:

```
VITE_USER_POOL_ID=
VITE_USER_POOL_CLIENT_ID=
VITE_API_URL=
```

Then run `npm run dev -w @one80compass/web` and open `http://localhost:5173`.

`npm run deploy:dev` publishes the same build to CloudFront. Open the `SiteUrl` output from the dev stack. The API allows both that address and localhost.
