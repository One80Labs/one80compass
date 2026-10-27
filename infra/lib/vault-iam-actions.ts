/** IAM actions granted to the vault Lambda. Exported for schema tests. */
export const VAULT_LAMBDA_IAM_ACTIONS = [
  "rds-data:ExecuteStatement",
  "rds-data:BatchExecuteStatement",
  "rds-data:BeginTransaction",
  "rds-data:CommitTransaction",
  "rds-data:RollbackTransaction",
  "secretsmanager:GetSecretValue",
  "dynamodb:GetItem",
  "dynamodb:Query",
  "dynamodb:BatchGetItem",
  "s3:GetObject",
  "bedrock:InvokeModel",
] as const;

export type VaultLambdaIamAction = (typeof VAULT_LAMBDA_IAM_ACTIONS)[number];

export function vaultLambdaIamActions(): readonly string[] {
  return VAULT_LAMBDA_IAM_ACTIONS;
}
