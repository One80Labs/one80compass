import { describe, expect, it } from "vitest";
import { deterministicEmbed } from "./embed";
import { ingestProgram, type IngestDocument, type IngestIssue, type IngestVersion } from "./ingest";

const RECORDED = "2026-10-26T12:00:00.000Z";
const CUSTOMER = "cust-1";
const PROGRAM = "prog-1";

describe("ingestProgram", () => {
  it("copies an allowlisted program with compass-upload and fireflies files into rows and chunks", () => {
    const result = ingestProgram({
      allowlist: [{ customerId: CUSTOMER, programId: PROGRAM }],
      program: { customerId: CUSTOMER, programId: PROGRAM, title: "Alpha" },
      issues: [issue({ issueId: "issue-1", title: "Ship vault" })],
      milestones: [{ id: "ms-1", title: "M1", dueOn: "2026-11-01" }],
      documents: [
        doc({
          documentId: "doc-upload",
          name: "spec.md",
          sourceLabel: "compass-upload",
          currentVersionId: "ver-upload",
        }),
        doc({
          documentId: "doc-flies",
          name: "call.txt",
          sourceLabel: "fireflies",
          currentVersionId: "ver-flies",
        }),
      ],
      versions: [
        version({
          versionId: "ver-upload",
          documentId: "doc-upload",
          fileName: "spec.md",
          contentType: "text/markdown",
          text: "Upload body for the vault.",
        }),
        version({
          versionId: "ver-flies",
          documentId: "doc-flies",
          fileName: "call.txt",
          contentType: "text/plain",
          text: "Fireflies transcript body.",
        }),
      ],
      recordedAt: RECORDED,
      embed: deterministicEmbed,
    });

    expect(result.rows.some((row) => row.table === "work_item" && row.sourceId === "issue-1")).toBe(true);
    expect(result.rows.some((row) => row.table === "document" && row.sourceId === "doc-upload")).toBe(true);
    expect(result.rows.some((row) => row.table === "transcript" && row.sourceId === "doc-flies")).toBe(true);
    expect(result.chunks).toHaveLength(2);
    for (const chunk of result.chunks) {
      expect(chunk.customerId).toBe(CUSTOMER);
      expect(chunk.programId).toBe(PROGRAM);
      expect(chunk.documentId).toBeTruthy();
      expect(chunk.versionId).toBeTruthy();
      expect(chunk.embedding).toHaveLength(1024);
    }
    expect(result.chunks.find((chunk) => chunk.documentId === "doc-upload")?.versionId).toBe("ver-upload");
    expect(result.chunks.find((chunk) => chunk.documentId === "doc-flies")?.sourceLabel).toBe("fireflies");
  });

  it("skips null label, deleted, pending version, and empty projectId files", () => {
    const documents: IngestDocument[] = [
      doc({ documentId: "d-null", sourceLabel: null, currentVersionId: "v-null" }),
      doc({ documentId: "d-del", sourceLabel: "compass-upload", currentVersionId: "v-del", deletedAt: RECORDED }),
      doc({ documentId: "d-pend", sourceLabel: "compass-upload", currentVersionId: "v-pend" }),
      doc({ documentId: "d-empty", sourceLabel: "other", currentVersionId: "v-empty", projectId: "" }),
    ];
    const versions: IngestVersion[] = [
      version({ versionId: "v-null", documentId: "d-null", text: "null label" }),
      version({ versionId: "v-del", documentId: "d-del", text: "deleted" }),
      version({ versionId: "v-pend", documentId: "d-pend", status: "pending", text: "pending" }),
      version({ versionId: "v-empty", documentId: "d-empty", text: "wrong project" }),
    ];
    const result = ingestProgram({
      allowlist: [{ customerId: CUSTOMER, programId: PROGRAM }],
      program: { customerId: CUSTOMER, programId: PROGRAM, title: "Alpha" },
      issues: [],
      milestones: [],
      documents,
      versions,
      recordedAt: RECORDED,
    });
    expect(result.chunks).toEqual([]);
    expect(result.rows.filter((row) => row.table !== "program")).toEqual([]);
  });

  it("returns no rows when the program is not allowlisted", () => {
    const result = ingestProgram({
      allowlist: [{ customerId: CUSTOMER, programId: "other-prog" }],
      program: { customerId: CUSTOMER, programId: PROGRAM, title: "Alpha" },
      issues: [issue({ issueId: "issue-1", title: "Nope" })],
      milestones: [],
      documents: [
        doc({
          documentId: "doc-1",
          sourceLabel: "compass-upload",
          currentVersionId: "ver-1",
        }),
      ],
      versions: [version({ versionId: "ver-1", documentId: "doc-1", text: "secret" })],
      recordedAt: RECORDED,
    });
    expect(result).toEqual({ rows: [], relations: [], chunks: [] });
  });

  it("rejects an empty allowlist", () => {
    const result = ingestProgram({
      allowlist: [],
      program: { customerId: CUSTOMER, programId: PROGRAM, title: "Alpha" },
      issues: [],
      milestones: [],
      documents: [],
      versions: [],
      recordedAt: RECORDED,
    });
    expect(result.rows).toEqual([]);
  });
});

function issue(partial: Partial<IngestIssue> & Pick<IngestIssue, "issueId" | "title">): IngestIssue {
  return {
    description: null,
    status: "Todo",
    issueType: "Task",
    startDate: null,
    finishDate: null,
    predecessorIds: [],
    ...partial,
  };
}

function doc(
  partial: Partial<IngestDocument> & Pick<IngestDocument, "documentId">,
): IngestDocument {
  return {
    customerId: CUSTOMER,
    projectId: PROGRAM,
    name: partial.documentId,
    sourceLabel: "compass-upload",
    deletedAt: null,
    currentVersionId: null,
    ...partial,
  };
}

function version(
  partial: Partial<IngestVersion> & Pick<IngestVersion, "versionId" | "documentId">,
): IngestVersion {
  return {
    contentType: "text/plain",
    fileName: "note.txt",
    status: "stored",
    text: "",
    ...partial,
  };
}
