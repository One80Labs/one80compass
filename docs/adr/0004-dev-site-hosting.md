# ADR 0004 — Dev site hosting

The dev React app is a private S3 bucket behind CloudFront. `cdk deploy` publishes `apps/web/dist`, and the stack output `SiteUrl` is the address to open. Localhost stays allowed for development.

Sign-in still uses the Cognito SRP flow in the browser, so the hosted site does not add an OAuth callback. API Gateway and the documents bucket allow localhost, the CloudFront origin, `https://one80compass.ai`, and `https://www.one80compass.ai`.

The custom names use a certificate in `us-east-1` and a Route 53 hosted zone. The domain registrar is GoDaddy. Public DNS stays on GoDaddy until its nameservers are changed to the Route 53 delegation set. This address still serves the dev stack.

Amplify Hosting is the spec’s production direction. This dev stack does not use it, because that connection needs a GitHub authorization that is not set up. Stage and production are still not created.
