const MAX_CHUNK = 1000;

/** A complete suggestion mark. Chunking must not cut the opening or closing tag. */
const SUGGESTION_BLOCK = /\[suggestion\b[\s\S]*?\[\/suggestion\]/gi;

const TEXT_EXTENSIONS = [".md", ".txt", ".csv", ".json"];

/**
 * True when the file can contribute vault text. Unknown binary types contribute nothing.
 */
export function isTextContent(contentType: string, fileName: string): boolean {
  const type = contentType.trim().toLowerCase();
  if (type.startsWith("text/")) return true;
  if (type === "application/json") return true;
  const lower = fileName.trim().toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Split text into chunks of at most 1000 characters on paragraph boundaries.
 * Non-text content types return no chunks. Does not invent text.
 */
export function chunkText(text: string, contentType: string, fileName: string): string[] {
  if (!isTextContent(contentType, fileName)) return [];
  if (!text) return [];
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const piece = paragraph;
    if (!piece && !current) continue;
    if (!current) {
      // A single paragraph longer than the limit is hard-split.
      if (piece.length <= MAX_CHUNK) {
        current = piece;
      } else {
        chunks.push(...hardSplit(piece));
      }
      continue;
    }
    const candidate = `${current}\n\n${piece}`;
    if (candidate.length <= MAX_CHUNK) {
      current = candidate;
      continue;
    }
    chunks.push(current);
    if (piece.length <= MAX_CHUNK) {
      current = piece;
    } else {
      chunks.push(...hardSplit(piece));
      current = "";
    }
  }
  if (current) chunks.push(current);
  return chunks.filter((chunk) => chunk.length > 0);
}

/**
 * Split a long paragraph on the size limit, but keep each `[suggestion]…[/suggestion]`
 * block in one piece. A block longer than the limit becomes one oversized chunk so
 * rejoining chunks cannot insert a character inside the tag.
 */
function hardSplit(text: string): string[] {
  const spans = suggestionSpans(text);
  const parts: string[] = [];
  let index = 0;
  while (index < text.length) {
    let end = Math.min(index + MAX_CHUNK, text.length);
    const span = spans.find((item) => item.start < end && item.end > end);
    if (span) {
      end = span.start > index ? span.start : span.end;
    }
    if (end <= index) end = Math.min(index + MAX_CHUNK, text.length);
    parts.push(text.slice(index, end));
    index = end;
  }
  return parts.filter((part) => part.length > 0);
}

function suggestionSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  for (const match of text.matchAll(SUGGESTION_BLOCK)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length });
  }
  return spans;
}
