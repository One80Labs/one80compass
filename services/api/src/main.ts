import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminGetUserCommand, UsernameExistsException } from "@aws-sdk/client-cognito-identity-provider";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { createHandler } from "./router";
import { DynamoStore } from "./store";

const tableName = required("TABLE_NAME");
const userPoolId = required("USER_POOL_ID");

const store = new DynamoStore(DynamoDBDocumentClient.from(new DynamoDBClient({})), tableName);
const cognito = new CognitoIdentityProviderClient({});

export const handler = createHandler({
  store,
  newId: () => crypto.randomUUID(),
  now: () => new Date(),
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
      return { userId };
    }
  },
});

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
