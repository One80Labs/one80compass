# Infrastructure

Development stack `One80Compass-dev` in account `168034219908`, region `us-east-2`. Deploy only with the `one80compass` AWS profile.

The stack creates Cognito with **required** software-token (TOTP) MFA, the `one80-admin` group, an invitation for `nick@one80labs.com`, a DynamoDB table (RETAIN + PITR), a private documents bucket (RETAIN), an HTTP API, a separate sync worker, and a CloudFront site for the React app. API Gateway checks the Cognito token before the API Lambda, except for `POST /webhooks/github`, which checks the GitHub signature instead.

**MFA:** this stack fronts live DNS (`one80compass.ai`). The pool uses `Mfa.REQUIRED` with software-token MFA. Sign-in handles `MFA_SETUP`, so a user who has not enrolled adds an authenticator on the next login. Deploy `One80Compass-dev` for that pool change to take effect. SMS MFA stays off.

The site name is `https://one80compass.ai` (and `www`). CloudFront uses the certificate `arn:aws:acm:us-east-1:168034219908:certificate/c630a40c-640f-43ec-898f-11aec9c02ece`. DNS is Route 53 hosted zone `Z0060300L4EB8CFDVZ1D`.

## Browser CORS origins

Default allow-list includes localhost (`5173`), the CloudFront domain, `https://one80compass.ai`, and `https://www.one80compass.ai`.

- Override with a comma-separated list: `BROWSER_ORIGINS=https://one80compass.ai,https://www.one80compass.ai`
- Prod-only path (no localhost): CDK context `prodOriginsOnly=true` or env `PROD_ORIGINS_ONLY=true`

Example:

```bash
PROD_ORIGINS_ONLY=true npx cdk deploy --profile one80compass
# or
npx cdk deploy -c prodOriginsOnly=true --profile one80compass
```

## GitHub App secrets

Deploy still accepts `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, and `GITHUB_WEBHOOK_SECRET`. The stack always creates Secrets Manager secret `one80compass-dev-github`. When all three env vars are set on the **first** deploy that includes the seed custom resource, CDK writes JSON (`appId`, `privateKey`, `webhookSecret`) once via `PutSecretValue`. Later deploys without those env vars do not clear the secret. Both Lambdas receive `GITHUB_SECRET_ARN`.

- **API** never receives the PEM. It gets `GITHUB_SECRET_ARN` plus optional `GITHUB_WEBHOOK_SECRET` env fallback for signature checks until the API reads the secret.
- **Sync** gets `GITHUB_SECRET_ARN` plus optional `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_ID` env fallbacks until `services/sync` reads the secret ARN.
- If env vars are omitted, the secret is created as an empty JSON shell; fill it afterward:

```bash
aws secretsmanager put-secret-value \
  --secret-id one80compass-dev-github \
  --secret-string '{"appId":"...","privateKey":"-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----","webhookSecret":"..."}' \
  --profile one80compass --region us-east-2
```

Initial seed via CDK `secretObjectValue` is visible in that deploy’s CloudFormation template. Prefer CLI `put-secret-value` after bootstrap, and rotate any key that was ever stored in Lambda environment variables.

Both Lambdas are granted `secretsmanager:GetSecretValue` on the secret. Stack output `GithubSecretArn` echoes the ARN.

Build the web app before deploy so `apps/web/dist` exists. `npm run deploy:dev` from the repository root does that. The site address is the `SiteUrl` stack output. `apps/web/.env.local` must already contain the pool id, client id, and API URL, because those values are copied into the built files.

Alarms notify `nick@one80labs.com` when the API Lambda errors, the sync worker errors, or the sync dead-letter queue has a message. Confirm the SNS subscription email before those alerts arrive. Sync SQS queues and the alert SNS topic use server-side encryption (SSE-SQS / AWS-managed SNS CMK).

Stage and production are not in this stack.

## Rollback

Do not delete the stack to undo a bad deploy. Cognito, DynamoDB, and the documents bucket use `RemovalPolicy.RETAIN` (web/static bucket may still destroy). Deletion no longer wipes plan data or uploads, but orphaned retained resources need manual cleanup.

1. Check out the last known good commit.
2. From `infra`, run `npx cdk deploy --require-approval never --profile one80compass`.
3. CloudFormation rolls a failed update back to the previous template on its own. A successful deploy is undone only by deploying the older commit.

Cognito users survive a template rollback. Data written after the good commit stays in the table until an application change removes it. DynamoDB point-in-time recovery is enabled for restore scenarios.
