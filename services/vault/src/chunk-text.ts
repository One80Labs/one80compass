const MAX_CHUNK = 1000;

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

function hardSplit(text: string): string[] {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    parts.push(text.slice(i, i + MAX_CHUNK));
  }
  return parts;
}
