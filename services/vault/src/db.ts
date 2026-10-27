import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
  type SqlParameter,
} from "@aws-sdk/client-rds-data";

export type VaultDbConfig = {
  clusterArn: string;
  secretArn: string;
  database: string;
};

export function vaultDbConfigFromEnv(env: NodeJS.ProcessEnv = process.env): VaultDbConfig {
  const clusterArn = env.VAULT_CLUSTER_ARN;
  const secretArn = env.VAULT_SECRET_ARN;
  const database = env.VAULT_DATABASE ?? "vault";
  if (!clusterArn) throw new Error("VAULT_CLUSTER_ARN is required");
  if (!secretArn) throw new Error("VAULT_SECRET_ARN is required");
  return { clusterArn, secretArn, database };
}

export function createVaultDb(config: VaultDbConfig = vaultDbConfigFromEnv(), client = new RDSDataClient({})) {
  const base = {
    resourceArn: config.clusterArn,
    secretArn: config.secretArn,
    database: config.database,
  };

  return {
    async execute(sql: string, parameters?: SqlParameter[], transactionId?: string) {
      return client.send(
        new ExecuteStatementCommand({
          ...base,
          sql,
          parameters,
          transactionId,
        }),
      );
    },
    async beginTransaction() {
      const result = await client.send(new BeginTransactionCommand(base));
      if (!result.transactionId) throw new Error("BeginTransaction returned no transactionId");
      return result.transactionId;
    },
    async commit(transactionId: string) {
      await client.send(new CommitTransactionCommand({ ...base, transactionId }));
    },
    async rollback(transactionId: string) {
      await client.send(new RollbackTransactionCommand({ ...base, transactionId }));
    },
  };
}

export type VaultDb = ReturnType<typeof createVaultDb>;
