# Web

Vite and React. Sign-in uses the Cognito user pool from the dev stack. The app sends the ID token, because that token carries the `amr` claim the API uses for administrator MFA.

Copy the stack outputs into `apps/web/.env.local`:

```
VITE_USER_POOL_ID=
VITE_USER_POOL_CLIENT_ID=
VITE_API_URL=
```

Then run `npm run dev -w @one80compass/web` and open `http://localhost:5173`.
