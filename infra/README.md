# Infrastructure

Development stack `One80Compass-dev` in account `168034219908`, region `us-east-2`. Deploy only with the `one80compass` AWS profile.

The stack creates Cognito with required software-token MFA, the `one80-admin` group, an invitation for `nick@one80labs.com`, a DynamoDB table, a private documents bucket, an HTTP API, a separate sync worker, and a CloudFront site for the React app. API Gateway checks the Cognito token before the API Lambda, except for `POST /webhooks/github`, which checks the GitHub signature instead.

Build the web app before deploy so `apps/web/dist` exists. `npm run deploy:dev` from the repository root does that. The site address is the `SiteUrl` stack output. `apps/web/.env.local` must already contain the pool id, client id, and API URL, because those values are copied into the built files.

Alarms notify `nick@one80labs.com` when the API Lambda errors, the sync worker errors, or the sync dead-letter queue has a message. Confirm the SNS subscription email before those alerts arrive.

Stage and production are not in this stack.

## Rollback

Do not delete the stack to undo a bad deploy. Deletion removes the dev table and documents bucket.

1. Check out the last known good commit.
2. From `infra`, run `npx cdk deploy --require-approval never --profile one80compass`.
3. CloudFormation rolls a failed update back to the previous template on its own. A successful deploy is undone only by deploying the older commit.

Cognito users survive a template rollback. Data written after the good commit stays in the table until an application change removes it.
