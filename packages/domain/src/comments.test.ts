import { describe, expect, it } from "vitest";
import { tracedComment } from "./comments";

describe("tracedComment", () => {
  it("stores the One80Compass user, date, and comment, and keeps earlier lines", () => {
    expect(tracedComment(null, "Kramer", "2026-10-26", "Moved the finish date")).toBe("One80Compass · Kramer · 2026-10-26 · Moved the finish date");
    expect(tracedComment("One80Compass · Kramer · 2026-10-26 · Moved the finish date", "Nick", "2026-10-27", "Confirmed")).toBe(
      "One80Compass · Kramer · 2026-10-26 · Moved the finish date\nOne80Compass · Nick · 2026-10-27 · Confirmed",
    );
  });
});
