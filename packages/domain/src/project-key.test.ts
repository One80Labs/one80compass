import { describe, expect, it } from "vitest";
import { issueDisplayKey, normalizeProjectKey } from "./index";

describe("project key helpers", () => {
  it("normalizes 3–4 letter keys to uppercase", () => {
    expect(normalizeProjectKey("comp")).toBe("COMP");
    expect(normalizeProjectKey(" AbC ")).toBe("ABC");
    expect(normalizeProjectKey("TOOL")).toBe("TOOL");
  });

  it("rejects keys that are not 3 or 4 letters", () => {
    expect(normalizeProjectKey("CO")).toBeNull();
    expect(normalizeProjectKey("COMPASS")).toBeNull();
    expect(normalizeProjectKey("C0MP")).toBeNull();
    expect(normalizeProjectKey("")).toBeNull();
    expect(normalizeProjectKey(null)).toBeNull();
  });

  it("formats action-item display keys", () => {
    expect(issueDisplayKey("COMP", 1)).toBe("COMP-1");
    expect(issueDisplayKey("COMP", 12)).toBe("COMP-12");
    expect(issueDisplayKey(null, 1)).toBeNull();
    expect(issueDisplayKey("COMP", null)).toBeNull();
    expect(issueDisplayKey("COMP", 0)).toBeNull();
  });
});
