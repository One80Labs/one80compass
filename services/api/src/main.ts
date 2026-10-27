import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminDisableUserCommand, AdminEnableUserCommand, AdminGetUserCommand, ListUsersInGroupCommand, UsernameExistsException } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { MAX_UPLOAD_BYTES } from "../../../packages/domain/src/index";
import { createFileSigner } from "./files";
import { createHandler } from "./router";
import { DynamoStore } from "./store";
import { createLoadVaultChunks, createObjectTextReader, createVaultIngestDeps } from "./vault-client";

const tableName = required("TABLE_NAME");
const userPoolId = required("USER_POOL_ID");
const bucketName = required("BUCKET_NAME");
const queueUrl = process.env.SYNC_QUEUE_URL ?? "";
const vaultFunctionName = process.env.VAULT_FUNCTION_NAME ?? "";
const files = createFileSigner(bucketName);
const readObjectText = createObjectTextReader(bucketName);
const sqs = new SQSClient({});
const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
/** API never loads the GitHub App private key; infra sets GITHUB_CONFIGURED when sync has credentials. */
const githubConfigured = process.env.GITHUB_CONFIGURED === "true" || Boolean(process.env.GITHUB_APP_ID && webhookSecret);

const store = new DynamoStore(DynamoDBDocumentClient.from(new DynamoDBClient({})), tableName);
const cognito = new CognitoIdentityProviderClient({});
const vault = createVaultIngestDeps({ store, vaultFunctionName, readObjectText });
const loadVaultChunks = createLoadVaultChunks({ vaultFunctionName });

export const handler = createHandler({
  store,
  newId: () => crypto.randomUUID(),
  now: () => new Date(),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? MAX_UPLOAD_BYTES),
  signUpload: files.signUpload,
  signDownload: files.signDownload,
  objectExists: files.objectExists,
  putReportText: files.putReportText,
  vault: vault ?? undefined,
  loadVaultChunks,
  webhookSecret,
  githubConfigured,
  listAdminUserIds: async () => {
    const ids: string[] = [];
    let nextToken: string | undefined;
    do {
      const page = await cognito.send(
        new ListUsersInGroupCommand({ UserPoolId: userPoolId, GroupName: "one80-admin", NextToken: nextToken, Limit: 60 }),
      );
      for (const user of page.Users ?? []) {
        const subject = user.Attributes?.find((attribute) => attribute.Name === "sub")?.Value;
        if (subject) ids.push(subject);
      }
      nextToken = page.NextToken;
    } while (nextToken);
    return ids;
  },
  enqueue: async (message) => {
    if (!queueUrl) throw new Error("SYNC_QUEUE_URL is required.");
    await sqs.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(message) }));
  },
  inviteUser: async (email) => {
    try {
      const created = await cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: userPoolId,
          Username: email,
          UserAttributes: [
            { Name: "email", Value: email },
            { Name: "email_verified", Value: "true" },
          ],
          DesiredDeliveryMediums: ["EMAIL"],
        }),
      );
      const userId = created.User?.Attributes?.find((attribute) => attribute.Name === "sub")?.Value;
      if (!userId) throw new Error("Cognito did not return a subject.");
      return { userId };
    } catch (error) {
      if (!(error instanceof UsernameExistsException)) throw error;
      const existing = await cognito.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }));
      const userId = existing.UserAttributes?.find((attribute) => attribute.Name === "sub")?.Value;
      if (!userId) throw new Error("Cognito did not return a subject.");
      if (existing.Enabled === false) {
        await cognito.send(new AdminEnableUserCommand({ UserPoolId: userPoolId, Username: email }));
      }
      return { userId };
    }
  },
  disableLogin: async (email) => {
    await cognito.send(new AdminDisableUserCommand({ UserPoolId: userPoolId, Username: email }));
  },
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
