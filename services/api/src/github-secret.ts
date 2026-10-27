import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

/** Shape stored in Secrets Manager (`GITHUB_SECRET_ARN`) and mirrored by deploy bootstrap. */
export type GithubSecretPayload = {
  appId: string;
  privateKey: string;
  webhookSecret: string;
};

let cached: Promise<GithubSecretPayload> | null = null;

/**
 * Loads GitHub App credentials. Prefers Secrets Manager when `GITHUB_SECRET_ARN` is set;
 * falls back to Lambda environment for local/bootstrap.
 */
export function loadGithubSecret(): Promise<GithubSecretPayload> {
  if (!cached) cached = readGithubSecret();
  return cached;
}

/** Test helper: clear the process-wide cache between cases. */
export function resetGithubSecretCache(): void {
  cached = null;
}

async function readGithubSecret(): Promise<GithubSecretPayload> {
  const arn = process.env.GITHUB_SECRET_ARN?.trim();
  if (arn) {
    const client = new SecretsManagerClient({});
    const result = await client.send(new GetSecretValueCommand({ SecretId: arn }));
    const raw = result.SecretString ?? "";
    if (!raw) throw new Error("GITHUB_SECRET_ARN returned an empty secret.");
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("GITHUB_SECRET_ARN must be a JSON object with appId, privateKey, webhookSecret.");
    }
    const record = parsed as Record<string, unknown>;
    return {
      appId: typeof record.appId === "string" ? record.appId : "",
      privateKey: normalizePem(typeof record.privateKey === "string" ? record.privateKey : ""),
      webhookSecret: typeof record.webhookSecret === "string" ? record.webhookSecret : "",
    };
  }
  return {
    appId: process.env.GITHUB_APP_ID ?? "",
    privateKey: normalizePem(process.env.GITHUB_APP_PRIVATE_KEY ?? ""),
    webhookSecret: process.env.GITHUB_WEBHOOK_SECRET ?? "",
  };
}

function normalizePem(value: string): string {
  return value.replace(/\\n/g, "\n");
}
