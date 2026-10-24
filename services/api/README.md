# API

One Lambda behind an HTTP API. API Gateway validates the Cognito ID token before this function runs. The function repeats the membership check.

Routes for the first slice:

- `POST /admin/customers` and `GET /admin/customers`
- `POST /admin/customers/{customerId}/projects`
- `POST /admin/customers/{customerId}/invitations`
- `GET /admin/customers/{customerId}/audit`
- `POST /admin/projects/{projectId}/applications`
- `GET /me`
- `GET /customers/{customerId}/projects`
- `GET /projects/{projectId}`
- `GET /projects/{projectId}/applications`

A missing or foreign project returns 404. Administrator routes return 403 `MFA_REQUIRED` until the token `amr` claim includes `mfa`. A customer id in the JSON body is ignored.
