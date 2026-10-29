import { describe, expect, it } from "vitest";
import { assertAdminToken, decodeJwtPayload } from "./auth.js";

function fakeJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

describe("decodeJwtPayload", () => {
  it("throws when payload segment is missing", () => {
    expect(() => decodeJwtPayload("only-one-segment")).toThrow(/missing payload segment/i);
    expect(() => decodeJwtPayload("")).toThrow(/missing payload segment/i);
    expect(() => decodeJwtPayload("a.")).toThrow(/missing payload segment/i);
  });

  it("decodes a valid payload", () => {
    const token = fakeJwt({ email: "a@b.co", "cognito:groups": ["one80-admin"] });
    expect(decodeJwtPayload(token)).toEqual({
      email: "a@b.co",
      "cognito:groups": ["one80-admin"],
    });
  });
});

describe("assertAdminToken", () => {
  it("throws when token has missing segments", () => {
    expect(() => assertAdminToken("not-a-jwt")).toThrow(/missing payload segment/i);
  });

  it("throws when cognito:groups lacks one80-admin", () => {
    const token = fakeJwt({
      email: "user@example.com",
      "cognito:groups": ["some-other-group"],
    });
    expect(() => assertAdminToken(token)).toThrow(/one80-admin/i);
  });

  it("throws when cognito:groups is absent", () => {
    const token = fakeJwt({ email: "user@example.com" });
    expect(() => assertAdminToken(token)).toThrow(/one80-admin/i);
  });

  it("returns session when admin group is present", () => {
    const token = fakeJwt({
      email: "admin@example.com",
      "cognito:groups": ["one80-admin", "other"],
    });
    expect(assertAdminToken(token)).toEqual({
      email: "admin@example.com",
      adminGroup: true,
    });
  });

  it("falls back to cognito:username when email is missing", () => {
    const token = fakeJwt({
      "cognito:username": "admin.user",
      "cognito:groups": ["one80-admin"],
    });
    expect(assertAdminToken(token)).toEqual({
      email: "admin.user",
      adminGroup: true,
    });
  });
});
