import { describe, expect, it } from "vitest";
import { parseSuggestionMarks } from "../../../packages/domain/src/suggestions";
import { chunkText } from "./chunk-text";

describe("chunkText suggestion marks", () => {
  it("keeps a suggestion longer than the chunk limit in one piece", () => {
    const quote = "a".repeat(1200);
    const text = `[suggestion kind=question]${quote}[/suggestion]`;
    const chunks = chunkText(text, "text/plain", "standup.txt");
    const rejoined = chunks.join("\n");
    expect(parseSuggestionMarks("doc-1", rejoined).map((mark) => mark.quote)).toEqual([quote]);
  });

  it("does not cut a suggestion that starts near the end of a chunk", () => {
    const quote = "c".repeat(200);
    const text = `${"b".repeat(900)} [suggestion kind=decision]${quote}[/suggestion] ${"d".repeat(900)}`;
    const chunks = chunkText(text, "text/plain", "standup.txt");
    const rejoined = chunks.join("\n");
    expect(parseSuggestionMarks("doc-1", rejoined).map((mark) => mark.quote)).toEqual([quote]);
    expect(chunks.some((chunk) => chunk.includes("[suggestion") && !chunk.includes("[/suggestion]"))).toBe(false);
  });
});
