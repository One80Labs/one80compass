# @one80compass/authz

Pure membership checks shared by the API. The Cognito token is the only identity source. A customer id in a request body is ignored by callers of these functions.

Platform administrators are the Cognito group `one80-admin`. The user pool requires software-token MFA before Cognito issues a token. ID tokens do not carry an `amr` claim, so administrator routes trust the verified token plus that group. Customer employees are membership rows, not a Cognito group.
