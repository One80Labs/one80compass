# @one80compass/authz

Pure membership checks shared by the API. The Cognito token is the only identity source. A customer id in a request body is ignored by callers of these functions.

Platform administrators are the Cognito group `one80-admin`. Their mutations require the token `amr` claim to include `mfa`. Customer employees are membership rows, not a Cognito group.
