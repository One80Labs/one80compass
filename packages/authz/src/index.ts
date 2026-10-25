/** Server-side membership checks. A client-supplied customer id is never authorization. */

export const ADMIN_GROUP = "one80-admin";

export type Principal = {
  userId: string;
  email?: string;
  groups: string[];
  mfa: boolean;
};

export type MembershipRef = {
  customerId: string;
  userId: string;
};

export function parseClaimList(value: string | undefined): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return trimmed
        .slice(1, -1)
        .split(/[\s,]+/)
        .map((part) => part.trim())
        .filter(Boolean);
    }
  }
  if (trimmed.includes(",") || trimmed.includes(" ")) {
    return trimmed
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [trimmed];
}

export function indicatesMfa(value: string | undefined): boolean {
  return parseClaimList(value).some((part) => part.toLowerCase().includes("mfa"));
}

export function principalFromClaims(claims: Record<string, string> | undefined): Principal | null {
  if (!claims?.sub) return null;
  return {
    userId: claims.sub,
    email: claims.email,
    groups: parseClaimList(claims["cognito:groups"]),
    mfa: indicatesMfa(claims.amr),
  };
}

export function isPlatformAdmin(principal: Principal): boolean {
  return principal.groups.includes(ADMIN_GROUP);
}

/**
 * Administrator routes require the Cognito group `one80-admin`.
 * The dev pool does not require MFA. Stage and production must require a
 * software token before Cognito issues a token. The ID token that API Gateway
 * validates does not include an `amr` claim, so this check does not look for
 * `mfa` inside the token.
 */
export function adminAccess(principal: Principal): "ok" | "mfa_required" | "forbidden" {
  if (!isPlatformAdmin(principal)) return "forbidden";
  return "ok";
}

export function canAccessCustomer(
  principal: Principal,
  customerId: string,
  memberships: MembershipRef[],
): boolean {
  if (isPlatformAdmin(principal)) return true;
  return memberships.some((membership) => membership.customerId === customerId && membership.userId === principal.userId);
}
