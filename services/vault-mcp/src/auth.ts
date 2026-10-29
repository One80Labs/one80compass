/**
 * Local admin gate for Cognito ID tokens.
 * Signature verification is left to API Gateway; this only fails fast on
 * missing/malformed claims or a non-admin group.
 */

const ADMIN_GROUP = "one80-admin";

export type AdminSession = {
  email: string;
  adminGroup: boolean;
};

/** Pure base64url decode of the JWT payload segment (no signature check). */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) {
    throw new Error("Invalid JWT: missing payload segment");
  }
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(json) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Invalid JWT: payload is not an object");
    }
    return payload as Record<string, unknown>;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Invalid JWT:")) throw err;
    throw new Error("Invalid JWT: could not decode payload");
  }
}

function readGroups(payload: Record<string, unknown>): string[] {
  const groups = payload["cognito:groups"];
  if (Array.isArray(groups)) return groups.map(String);
  if (typeof groups === "string") return [groups];
  return [];
}

function readEmail(payload: Record<string, unknown>): string {
  const email = payload.email;
  if (typeof email === "string" && email.trim()) return email.trim();
  const username = payload["cognito:username"];
  if (typeof username === "string" && username.trim()) return username.trim();
  throw new Error("Invalid JWT: missing email / cognito:username claim");
}

/**
 * Assert the ID token belongs to a one80-admin user.
 * Returns a session shape for logging / tool handlers.
 */
export function assertAdminToken(idToken: string): AdminSession {
  if (!idToken || typeof idToken !== "string" || !idToken.trim()) {
    throw new Error("Missing Cognito ID token");
  }
  const payload = decodeJwtPayload(idToken.trim());
  const groups = readGroups(payload);
  if (!groups.includes(ADMIN_GROUP)) {
    throw new Error(`Admin access required: cognito:groups must include ${ADMIN_GROUP}`);
  }
  return { email: readEmail(payload), adminGroup: true };
}
