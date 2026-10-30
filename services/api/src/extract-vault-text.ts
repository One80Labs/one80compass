import { Workbook, type CellValue } from "exceljs";
import mammoth from "mammoth";
import { isTextContent } from "../../vault/src/chunk-text";

type ParsedAddress = { text?: string };
type ParsedMail = {
  from?: ParsedAddress;
  to?: ParsedAddress | ParsedAddress[];
  subject?: string;
  text?: string;
  html?: string | false;
};

type MailParserModule = {
  simpleParser?: (source: Buffer) => Promise<ParsedMail>;
  default?: { simpleParser: (source: Buffer) => Promise<ParsedMail> };
};

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type MarkdownConverter = {
  convertToMarkdown: (input: { buffer: Buffer }) => Promise<{ value: string }>;
};

/**
 * Text the vault may chunk for one stored object.
 * `contentType` is `text/*` when `text` is searchable. The Documents object is not rewritten.
 */
export type VaultText = {
  contentType: string;
  text: string;
};

/**
 * Read vault text from stored bytes. Plain text, markdown, CSV, and JSON are decoded as UTF-8.
 * `.xlsx` becomes CSV (one block per sheet, saved cell values). `.docx` and `.eml` become Markdown.
 * Images, video, `.xls`, `.doc`, and `.msg` yield an empty string. A parse failure yields an empty string and does not throw.
 */
export async function extractVaultText(bytes: Uint8Array, contentType: string, fileName: string): Promise<VaultText> {
  const original = { contentType, text: "" };
  try {
    if (isExcel(contentType, fileName)) {
      const text = await excelToCsv(bytes);
      return text ? { contentType: "text/csv", text } : original;
    }
    if (isDocx(contentType, fileName)) {
      const text = await docxToMarkdown(bytes);
      return text ? { contentType: "text/markdown", text } : original;
    }
    if (isEml(contentType, fileName)) {
      const text = await emailToMarkdown(bytes);
      return text ? { contentType: "text/markdown", text } : original;
    }
    if (isTextContent(contentType, fileName)) {
      return { contentType, text: decodeUtf8(bytes) };
    }
  } catch {
    return original;
  }
  return original;
}

function isExcel(contentType: string, fileName: string): boolean {
  return extensionOf(fileName) === ".xlsx" || mediaType(contentType) === XLSX_TYPE;
}

function isDocx(contentType: string, fileName: string): boolean {
  return extensionOf(fileName) === ".docx" || mediaType(contentType) === DOCX_TYPE;
}

function isEml(contentType: string, fileName: string): boolean {
  return extensionOf(fileName) === ".eml" || mediaType(contentType) === "message/rfc822";
}

function mediaType(contentType: string): string {
  return contentType.trim().toLowerCase().split(";")[0]?.trim() ?? "";
}

function extensionOf(fileName: string): string {
  const base = fileName.trim().toLowerCase().split(/[/\\]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot) : "";
}

function decodeUtf8(bytes: Uint8Array): string {
  const text = Buffer.from(bytes).toString("utf8");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

async function excelToCsv(bytes: Uint8Array): Promise<string> {
  const workbook = new Workbook();
  // exceljs declares Buffer as ArrayBuffer, which disagrees with the Node Buffer generic.
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<Workbook["xlsx"]["load"]>[0]);
  const blocks: string[] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        while (cells.length < colNumber - 1) cells.push("");
        cells.push(csvEscape(cellToString(cell.value)));
      });
      if (cells.some((cell) => cell.length > 0)) rows.push(cells.join(","));
    });
    if (rows.length === 0) return;
    const name = sheet.name.replace(/\s+/g, " ").trim() || "Sheet";
    blocks.push(`# ${name}\n\n${rows.join("\n")}`);
  });
  return blocks.join("\n\n");
}

function cellToString(value: CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text ?? "").join("");
    }
    if ("result" in value && value.result !== undefined) return cellToString(value.result as CellValue);
    if ("text" in value && typeof value.text === "string") return value.text;
  }
  return "";
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

async function docxToMarkdown(bytes: Uint8Array): Promise<string> {
  const convert = mammoth as unknown as MarkdownConverter;
  const result = await convert.convertToMarkdown({ buffer: Buffer.from(bytes) });
  return unescapeMarkdown(result.value).trim();
}

/** Mammoth escapes sentence punctuation. Vault search should see the words as written. */
function unescapeMarkdown(value: string): string {
  return value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1");
}

async function emailToMarkdown(bytes: Uint8Array): Promise<string> {
  const loaded = (await import("mailparser")) as MailParserModule;
  const parse = loaded.simpleParser ?? loaded.default?.simpleParser;
  if (!parse) throw new Error("mailparser did not load.");
  const mail = await parse(Buffer.from(bytes));
  const header = [
    `**From:** ${addressLine(mail.from)}`,
    `**To:** ${addressLine(mail.to)}`,
    `**Subject:** ${mail.subject ?? ""}`,
  ].join("\n");
  const plain = (mail.text ?? "").trim();
  const body = plain || (typeof mail.html === "string" ? htmlToPlain(mail.html) : "");
  return body ? `${header}\n\n${body}` : header.trim();
}

function addressLine(value: ParsedAddress | ParsedAddress[] | undefined): string {
  if (!value) return "";
  if (Array.isArray(value)) return value.map((item) => item.text ?? "").filter((item) => item.length > 0).join(", ");
  return value.text ?? "";
}

function htmlToPlain(html: string): string {
  const stripped = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|table|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(stripped).replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}
