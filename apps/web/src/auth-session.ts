/**
 * Absolute signed-in window from Cognito `auth_time` (password/MFA), not idle time.
 * Matches the Cognito app-client refresh token validity (2 hours).
 */
export const SESSION_MAX_MS = 2 * 60 * 60 * 1000;

export type SessionClock = {
  /** Unix ms of Cognito `auth_time` (last interactive authentication). */
  authTimeMs: number;
};

/** Remaining ms until forced sign-out; zero or negative means the session is over. */
export function msUntilSessionExpiry(session: SessionClock, now = Date.now()): number {
  return session.authTimeMs + SESSION_MAX_MS - now;
}

export function sessionExpired(session: SessionClock, now = Date.now()): boolean {
  return msUntilSessionExpiry(session, now) <= 0;
}
