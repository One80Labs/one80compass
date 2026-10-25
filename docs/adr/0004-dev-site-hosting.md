# ADR 0004 — Dev site hosting

The dev React app is a private S3 bucket behind CloudFront. `cdk deploy` publishes `apps/web/dist`, and the stack output `SiteUrl` is the address to open. Localhost stays allowed for development.

Sign-in still uses the Cognito SRP flow in the browser, so the hosted site does not add an OAuth callback. API Gateway and the documents bucket allow both localhost and the CloudFront origin.

Amplify Hosting is the spec’s production direction. This dev stack does not use it, because that connection needs a GitHub authorization that is not set up. Stage and production are still not created.
