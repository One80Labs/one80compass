import { describe, expect, it } from "vitest";
import { msUntilSessionExpiry, sessionExpired, SESSION_MAX_MS } from "./auth-session";

describe("absolute session window", () => {
  it("expires exactly at auth_time + SESSION_MAX_MS", () => {
    const authTimeMs = 1_000_000;
    const session = { authTimeMs };
    expect(msUntilSessionExpiry(session, authTimeMs + SESSION_MAX_MS)).toBe(0);
    expect(sessionExpired(session, authTimeMs + SESSION_MAX_MS)).toBe(true);
    expect(sessionExpired(session, authTimeMs + SESSION_MAX_MS - 1)).toBe(false);
  });

  it("reports remaining time before the limit", () => {
    const authTimeMs = 5_000_000;
    expect(msUntilSessionExpiry({ authTimeMs }, authTimeMs + 30 * 60 * 1000)).toBe(SESSION_MAX_MS - 30 * 60 * 1000);
  });
});
