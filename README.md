# One80Compass

Secure multi-customer workspace for One80Labs. The dev app covers sign-in, administration, Overview, documents, a GitHub-backed plan and Kanban, and status reports. The API rejects calls that have no Cognito token. GitHub webhooks are the exception: they must carry a valid signature.

Requirements live in `docs/product/`. Start at `docs/CURSOR_START_HERE.md`. The dev account and runtime choices are in `docs/adr/0001-first-slice-runtime.md`. The current screen reference is `docs/design/`.

## Develop

```bash
npm install
npm test
npm run deploy:dev
```

Deploy uses AWS profile `one80compass` and account `168034219908` in `us-east-2`. It builds the web app and publishes it. After the first deploy, put the stack outputs in `apps/web/.env.local` as described in `apps/web/README.md`, then deploy again so the hosted site has those values. For local work:

```bash
npm run dev -w @one80compass/web
```

The first administrator is `nick@one80labs.com`. Cognito emails a temporary password. Sign-in uses that email and password, then an authenticator. The first time, the sign-in screen shows a secret to add to an authenticator app. That requirement takes effect when `One80Compass-dev` is deployed.

Push this repository to `https://github.com/One80Labs/one80compass.git` at least once an hour while implementation is in progress. Do not commit it to the unrelated course checkout in the home directory.
