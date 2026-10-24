import { describe, expect, it } from "vitest";
import { adminAccess, canAccessCustomer, parseClaimList, principalFromClaims, type Principal } from "./index";

const admin: Principal = { userId: "admin-1", groups: ["one80-admin"], mfa: true };
const adminNoMfa: Principal = { userId: "admin-1", groups: ["one80-admin"], mfa: false };
const employee: Principal = { userId: "user-a", groups: [], mfa: false };

describe("parseClaimList", () => {
  it("reads a JSON group array", () => {
    expect(parseClaimList('["one80-admin"]')).toEqual(["one80-admin"]);
  });

  it("reads a single group value", () => {
    expect(parseClaimList("one80-admin")).toEqual(["one80-admin"]);
  });
});

describe("principalFromClaims", () => {
  it("rejects a missing subject", () => {
    expect(principalFromClaims({})).toBeNull();
  });

  it("marks MFA from the amr claim", () => {
    const principal = principalFromClaims({ sub: "u1", amr: '["authenticated","mfa"]', "cognito:groups": "one80-admin" });
    expect(principal).toMatchObject({ userId: "u1", mfa: true, groups: ["one80-admin"] });
  });
});

describe("adminAccess", () => {
  it("allows an administrator who completed MFA", () => {
    expect(adminAccess(admin)).toBe("ok");
  });

  it("allows an administrator ID token, which has no amr claim", () => {
    expect(adminAccess(adminNoMfa)).toBe("ok");
  });

  it("rejects an employee", () => {
    expect(adminAccess(employee)).toBe("forbidden");
  });
});

describe("canAccessCustomer", () => {
  it("allows a member of that customer only", () => {
    const memberships = [{ customerId: "cust-a", userId: "user-a" }];
    expect(canAccessCustomer(employee, "cust-a", memberships)).toBe(true);
    expect(canAccessCustomer(employee, "cust-b", memberships)).toBe(false);
  });

  it("allows a platform administrator without a membership row", () => {
    expect(canAccessCustomer(admin, "cust-b", [])).toBe(true);
    expect(canAccessCustomer(adminNoMfa, "cust-b", [])).toBe(true);
  });
});
