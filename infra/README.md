# Infrastructure

Development stack `One80Compass-dev` in account `168034219908`, region `us-east-2`. Deploy only with the `one80compass` AWS profile.

The stack creates Cognito (MFA optional, software token), the `one80-admin` group, an invitation for `nick@one80labs.com`, a DynamoDB table, and an HTTP API whose JWT authorizer runs before the Lambda.

Stage and production are not in this stack. Document versions, GitHub sync, and the sync worker are later releases.
