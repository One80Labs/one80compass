# ADR 0001 — First slice runtime

One80Compass dev runs in AWS account `168034219908`, region `us-east-2`, deployed with CLI profile `one80compass`.

The first slice is a Vite React app, an HTTP API, one Node.js Lambda, Cognito, and one DynamoDB table. API Gateway validates the Cognito ID token before the Lambda runs. The Lambda checks customer membership again. The user pool requires software-token MFA before it issues a token. Administrator routes then require the `one80-admin` group. Cognito does not put an `amr` claim on the ID token, so the API does not look for one.

There is no existing Lambda application to wrap. Module tiles open in-app routes. The only module in this slice is Overview.

GitHub sync, documents, Kanban, and status reports are later issues. Stage and production stacks are not created yet.
