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
  if (trimmed.includes(",")) {
    return trimmed
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [trimmed];
}

export function principalFromClaims(claims: Record<string, string> | undefined): Principal | null {
  if (!claims?.sub) return null;
  return {
    userId: claims.sub,
    email: claims.email,
    groups: parseClaimList(claims["cognito:groups"]),
    mfa: parseClaimList(claims.amr).includes("mfa"),
  };
}

export function isPlatformAdmin(principal: Principal): boolean {
  return principal.groups.includes(ADMIN_GROUP);
}

/** Admin mutations require a sign-in that completed MFA. */
export function adminAccess(principal: Principal): "ok" | "mfa_required" | "forbidden" {
  if (!isPlatformAdmin(principal)) return "forbidden";
  if (!principal.mfa) return "mfa_required";
  return "ok";
}

export function canAccessCustomer(
  principal: Principal,
  customerId: string,
  memberships: MembershipRef[],
): boolean {
  if (isPlatformAdmin(principal) && principal.mfa) return true;
  return memberships.some((membership) => membership.customerId === customerId && membership.userId === principal.userId);
}
