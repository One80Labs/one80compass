/**
 * Runtime config for the staff vault MCP server.
 * Never reads Aurora credentials — all vault I/O goes through the portal admin API.
 */
export type VaultMcpConfig = {
  /** Portal API base URL, e.g. https://….execute-api.us-east-2.amazonaws.com */
  apiBaseUrl: string;
  /** Cognito ID token for a one80-admin user. */
  idToken: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): VaultMcpConfig {
  const apiBaseUrl = (env.ONE80COMPASS_API_URL ?? "").trim().replace(/\/$/, "");
  const idToken = (env.ONE80COMPASS_ID_TOKEN ?? "").trim();
  if (!apiBaseUrl) throw new Error("ONE80COMPASS_API_URL is required (portal API base URL).");
  if (!idToken) throw new Error("ONE80COMPASS_ID_TOKEN is required (Cognito ID token for a one80-admin user).");
  return { apiBaseUrl, idToken };
}
