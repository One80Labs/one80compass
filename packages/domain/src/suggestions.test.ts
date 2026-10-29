import { describe, expect, it } from "vitest";
import { parseSuggestionMarks, suggestionIsAcceptable } from "./suggestions";

const transcript = `
Nick: We should keep the home as a list.
[suggestion kind=question work=COMP-79 assignee="Ada Lovelace" date=2026-11-13 speaker=Nick at=00:12:04]
Should the register stay a list?
[/suggestion]
Someone wondered aloud.
[suggestion kind=decision label=hypothetical work="Decision Register"]
We might drop the register.
[/suggestion]
[suggestion kind=question label=rejected]
Do not track questions.
[/suggestion]
[suggestion kind=question label=discussed assignee=Ada]
Only mentioned in passing.
[/suggestion]
Plain notes without a mark stay out.
[suggestion kind=note]Missing a real kind.[/suggestion]
[suggestion kind=question][/suggestion]
`;

describe("parseSuggestionMarks", () => {
  it("reads proposals and withholds hypothetical, rejected, and discussed remarks", () => {
    const marks = parseSuggestionMarks("doc-1", transcript);
    expect(marks.map((mark) => [mark.kind, mark.mark, mark.quote, suggestionIsAcceptable(mark.mark)])).toEqual([
      ["question", "proposal", "Should the register stay a list?", true],
      ["decision", "hypothetical", "We might drop the register.", false],
      ["question", "rejected", "Do not track questions.", false],
      ["question", "discussed", "Only mentioned in passing.", false],
    ]);
    expect(marks[0]).toMatchObject({
      documentId: "doc-1",
      workLabel: "COMP-79",
      assigneeLabel: "Ada Lovelace",
      targetDate: "2026-11-13",
      speaker: "Nick",
      location: "00:12:04",
    });
    expect(marks[1].workLabel).toBe("Decision Register");
    expect(marks[1].targetDate).toBeNull();
  });

  it("keeps the same id when the file is parsed again", () => {
    const first = parseSuggestionMarks("doc-1", transcript);
    const second = parseSuggestionMarks("doc-1", transcript);
    expect(second.map((mark) => mark.suggestionId)).toEqual(first.map((mark) => mark.suggestionId));
    expect(new Set(first.map((mark) => mark.suggestionId)).size).toBe(first.length);
  });

  it("starts a new id when the quote changes", () => {
    const before = parseSuggestionMarks("doc-1", "[suggestion kind=question]Keep the list.[/suggestion]");
    const after = parseSuggestionMarks("doc-1", "[suggestion kind=question]Keep the register a list.[/suggestion]");
    expect(after[0].suggestionId).not.toBe(before[0].suggestionId);
  });
});
