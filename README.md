# One80Compass

Secure multi-customer workspace for One80Labs. This repository starts with the first vertical slice: an administrator creates a customer and project, invites an employee, and that employee opens the Overview module. The API rejects calls that have no Cognito token.

Requirements live in `docs/`. The dev account and runtime choices are in `docs/adr/0001-first-slice-runtime.md`.

## Develop

```bash
npm install
npm test
npm run deploy:dev
```

Deploy uses AWS profile `one80compass` and account `168034219908` in `us-east-2`. After deploy, put the stack outputs in `apps/web/.env.local` as described in `apps/web/README.md`, then:

```bash
npm run dev -w @one80compass/web
```

The first administrator is `nick@one80labs.com`. Cognito emails a temporary password. Administrator actions require an authenticator app.

Push this repository to `https://github.com/ndkramer/one80compass.git` at least once an hour while implementation is in progress. Do not commit it to the unrelated course checkout in the home directory.
