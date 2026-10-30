import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";
import { chunkText } from "../../vault/src/chunk-text";
import { extractVaultText } from "./extract-vault-text";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("extractVaultText", () => {
  it("turns an xlsx workbook into csv text and leaves the caller to keep the original bytes", async () => {
    const workbook = new Workbook();
    const plan = workbook.addWorksheet("Plan");
    plan.addRow(["Task", "Owner"]);
    plan.addRow(["Launch", "Ada, Inc"]);
    plan.getCell("A3").value = { formula: "1+1", result: 2 };
    workbook.addWorksheet("Empty");
    const notes = workbook.addWorksheet("Notes");
    notes.addRow(["See plan"]);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());

    const extracted = await extractVaultText(bytes, XLSX_TYPE, "plan.xlsx");

    expect(extracted.contentType).toBe("text/csv");
    expect(extracted.text).toBe('# Plan\n\nTask,Owner\nLaunch,"Ada, Inc"\n2\n\n# Notes\n\nSee plan');
    expect(chunkText(extracted.text, extracted.contentType, "plan.xlsx").length).toBeGreaterThan(0);
    expect(extracted.text).not.toContain("Empty");
  });

  it("turns a docx file into markdown", async () => {
    const extracted = await extractVaultText(docxBytes("The launch moved."), DOCX_TYPE, "status.docx");
    expect(extracted.contentType).toBe("text/markdown");
    expect(extracted.text).toContain("The launch moved.");
  });

  it("turns a plain email into markdown with headers", async () => {
    const raw = [
      "From: Ada <ada@example.com>",
      "To: Bo <bo@example.com>",
      "Subject: Launch slip",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "The date moved to Friday.",
    ].join("\r\n");
    const extracted = await extractVaultText(Buffer.from(raw), "message/rfc822", "note.eml");
    expect(extracted.contentType).toBe("text/markdown");
    expect(extracted.text).toContain("**From:** \"Ada\" <ada@example.com>");
    expect(extracted.text).toContain("**To:** \"Bo\" <bo@example.com>");
    expect(extracted.text).toContain("**Subject:** Launch slip");
    expect(extracted.text).toContain("The date moved to Friday.");
  });

  it("reads an html-only email body", async () => {
    const raw = [
      "From: Ada <ada@example.com>",
      "To: Bo <bo@example.com>",
      "Subject: Notes",
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      "<p>The launch &amp; crew moved.</p>",
    ].join("\r\n");
    const extracted = await extractVaultText(Buffer.from(raw), "application/octet-stream", "notes.eml");
    expect(extracted.text).toContain("The launch & crew moved.");
  });

  it("decodes stored text and keeps that content type", async () => {
    const extracted = await extractVaultText(Buffer.from("\uFEFFalpha"), "text/plain", "notes.txt");
    expect(extracted).toEqual({ contentType: "text/plain", text: "alpha" });
  });

  it("returns no text for screenshots, old excel, and a broken workbook", async () => {
    await expect(extractVaultText(Buffer.from("png"), "image/png", "shot.png")).resolves.toEqual({
      contentType: "image/png",
      text: "",
    });
    await expect(extractVaultText(Buffer.from("old"), "application/vnd.ms-excel", "legacy.xls")).resolves.toEqual({
      contentType: "application/vnd.ms-excel",
      text: "",
    });
    await expect(extractVaultText(Buffer.from("not a workbook"), XLSX_TYPE, "broken.xlsx")).resolves.toEqual({
      contentType: XLSX_TYPE,
      text: "",
    });
  });
});

function docxBytes(paragraph: string): Uint8Array {
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p></w:body>
</w:document>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  return zipStored([
    { name: "[Content_Types].xml", data: Buffer.from(types) },
    { name: "_rels/.rels", data: Buffer.from(rels) },
    { name: "word/document.xml", data: Buffer.from(document) },
  ]);
}

function zipStored(files: { name: string; data: Buffer }[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localRecord = Buffer.concat([local, name, file.data]);
    locals.push(localRecord);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += localRecord.length;
  }
  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, centralDir, end]));
}

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
