/**
 * Remarks marked inside a Krisp or Fireflies transcript.
 * A proposal can be accepted onto the Decision Register. The other marks cannot.
 */

export type SuggestionMark = "proposal" | "hypothetical" | "rejected" | "discussed";

export type ParsedSuggestion = {
  suggestionId: string;
  documentId: string;
  quote: string;
  kind: "question" | "decision";
  mark: SuggestionMark;
  /** Work-item label from the transcript, before it is matched to a plan issue. */
  workLabel: string;
  /** Person label from the transcript, before it is matched to a project member. */
  assigneeLabel: string;
  /** YYYY-MM-DD, or null when the transcript omitted a usable date. */
  targetDate: string | null;
  speaker: string;
  /** Where the remark sits in the transcript, such as a timestamp. */
  location: string;
};

const BLOCK = /\[suggestion\b([^\]]*)\]([\s\S]*?)\[\/suggestion\]/gi;

/** Reads every suggestion mark in one transcript. Unmarked text is ignored. */
export function parseSuggestionMarks(documentId: string, text: string): ParsedSuggestion[] {
  const found: ParsedSuggestion[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(BLOCK)) {
    const attrs = readAttrs(match[1] ?? "");
    const kind = attrs.kind === "decision" ? "decision" : attrs.kind === "question" ? "question" : null;
    const quote = (match[2] ?? "").trim();
    if (!kind || !quote) continue;
    const mark = readMark(attrs.label);
    const workLabel = attrs.work ?? "";
    const assigneeLabel = attrs.assignee ?? "";
    const targetDate = isIsoDate(attrs.date ?? "") ? attrs.date : null;
    const suggestionId = suggestionIdentity(documentId, quote, kind, mark, workLabel, assigneeLabel, targetDate ?? "");
    if (seen.has(suggestionId)) continue;
    seen.add(suggestionId);
    found.push({
      suggestionId,
      documentId,
      quote,
      kind,
      mark,
      workLabel,
      assigneeLabel,
      targetDate,
      speaker: attrs.speaker ?? "",
      location: attrs.at ?? "",
    });
  }
  return found;
}

export function suggestionIsAcceptable(mark: SuggestionMark): boolean {
  return mark === "proposal";
}

function readAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /(\w+)=(?:"([^"]*)"|(\S+))/g;
  for (const match of raw.matchAll(pattern)) {
    attrs[match[1].toLowerCase()] = (match[2] ?? match[3] ?? "").trim();
  }
  return attrs;
}

function readMark(value: string | undefined): SuggestionMark {
  const text = (value ?? "").trim().toLowerCase();
  if (!text || text === "proposal") return "proposal";
  if (text === "hypothetical") return "hypothetical";
  if (text === "rejected" || text === "already-rejected") return "rejected";
  return "discussed";
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Stable id for the same remark in the same file. Editing the quote starts a new id. */
function suggestionIdentity(
  documentId: string,
  quote: string,
  kind: string,
  mark: string,
  work: string,
  assignee: string,
  date: string,
): string {
  const text = [documentId, kind, mark, work, assignee, date, quote].join("\u0001");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `sug-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
