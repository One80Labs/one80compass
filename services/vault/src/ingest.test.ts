import { describe, expect, it } from "vitest";
import { deterministicEmbed } from "./embed";
import {
  ingestProgram,
  type IngestDocument,
  type IngestIssue,
  type IngestRisk,
  type IngestVersion,
} from "./ingest";

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
      expect(chunk.id).toBe(
        `${CUSTOMER}:${PROGRAM}:${chunk.documentId}:${chunk.versionId}:0`,
      );
    }
    expect(result.chunks.find((chunk) => chunk.documentId === "doc-upload")?.versionId).toBe("ver-upload");
    expect(result.chunks.find((chunk) => chunk.documentId === "doc-flies")?.sourceLabel).toBe("fireflies");
  });

  it("emits risk, person, and decision rows with tenant keys and natural relations", () => {
    const result = ingestProgram({
      allowlist: [{ customerId: CUSTOMER, programId: PROGRAM }],
      program: { customerId: CUSTOMER, programId: PROGRAM, title: "Alpha" },
      issues: [
        issue({
          issueId: "issue-1",
          title: "Ship vault",
          assignees: [
            { id: "U_ada", login: "ada", name: "Ada" },
            { id: "U_bob", login: "bob", name: null },
          ],
          predecessorIds: ["issue-0"],
        }),
        issue({
          issueId: "issue-dec",
          title: "Choose Aurora",
          description: "Use Serverless v2",
          issueType: "Decision",
          assignees: [{ id: "U_ada", login: "ada", name: "Ada" }],
        }),
      ],
      milestones: [],
      risks: [
        risk({
          riskId: "risk-1",
          title: "Schedule slip",
          description: "Blocked by predecessor",
          notes: "Watch weekly",
          severity: "high",
          issueId: "issue-1",
        }),
        risk({
          riskId: "risk-manual",
          title: "Vendor delay",
          description: "No linked issue",
          issueId: null,
        }),
      ],
      documents: [],
      versions: [],
      recordedAt: RECORDED,
    });

    const riskRow = result.rows.find((row) => row.table === "risk" && row.sourceId === "risk-1");
    expect(riskRow).toMatchObject({
      customerId: CUSTOMER,
      programId: PROGRAM,
      title: "Schedule slip",
      body: "Blocked by predecessor\n\nWatch weekly\n\nSeverity: high",
    });
    expect(result.rows.some((row) => row.table === "risk" && row.sourceId === "risk-manual")).toBe(true);

    const people = result.rows.filter((row) => row.table === "person");
    expect(people).toHaveLength(2);
    expect(people.find((row) => row.sourceId === "U_ada")).toMatchObject({
      name: "Ada",
      customerId: CUSTOMER,
      programId: PROGRAM,
    });
    expect(people.find((row) => row.sourceId === "U_bob")?.name).toBe("bob");

    expect(result.rows.some((row) => row.table === "work_item" && row.sourceId === "issue-dec")).toBe(true);
    expect(result.rows.find((row) => row.table === "decision" && row.sourceId === "issue-dec")).toMatchObject({
      title: "Choose Aurora",
      body: "Use Serverless v2",
      customerId: CUSTOMER,
      programId: PROGRAM,
    });
    expect(result.rows.some((row) => row.table === "decision" && row.sourceId === "issue-1")).toBe(false);

    expect(result.relations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "blocks",
          fromType: "work_item",
          toType: "work_item",
          fromSourceId: "issue-0",
          toSourceId: "issue-1",
        }),
        expect.objectContaining({
          kind: "part_of",
          fromType: "person",
          toType: "work_item",
          fromSourceId: "U_ada",
          toSourceId: "issue-1",
        }),
        expect.objectContaining({
          kind: "part_of",
          fromType: "risk",
          toType: "work_item",
          fromSourceId: "risk-1",
          toSourceId: "issue-1",
        }),
      ]),
    );
    expect(result.relations.some((row) => row.fromSourceId === "risk-manual")).toBe(false);
  });

  it("scopes chunk ids by customer and program so tenants cannot collide on document id", () => {
    const sharedDoc = "shared-doc";
    const sharedVer = "shared-ver";
    const makeInput = (customerId: string, programId: string) => ({
      allowlist: [{ customerId, programId }],
      program: { customerId, programId, title: "Prog" },
      issues: [] as IngestIssue[],
      milestones: [],
      documents: [
        {
          documentId: sharedDoc,
          customerId,
          projectId: programId,
          name: "shared.txt",
          sourceLabel: "compass-upload" as const,
          deletedAt: null,
          currentVersionId: sharedVer,
        },
      ],
      versions: [
        version({
          versionId: sharedVer,
          documentId: sharedDoc,
          text: "Same document id in two tenants.",
        }),
      ],
      recordedAt: RECORDED,
      embed: deterministicEmbed,
    });

    const a = ingestProgram(makeInput("cust-a", "prog-a"));
    const b = ingestProgram(makeInput("cust-b", "prog-b"));
    expect(a.chunks).toHaveLength(1);
    expect(b.chunks).toHaveLength(1);
    expect(a.chunks[0]?.id).toBe(`cust-a:prog-a:${sharedDoc}:${sharedVer}:0`);
    expect(b.chunks[0]?.id).toBe(`cust-b:prog-b:${sharedDoc}:${sharedVer}:0`);
    expect(a.chunks[0]?.id).not.toBe(b.chunks[0]?.id);
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
    assignees: [],
    ...partial,
  };
}

function risk(partial: Partial<IngestRisk> & Pick<IngestRisk, "riskId" | "title">): IngestRisk {
  return {
    description: "",
    notes: "",
    severity: null,
    issueId: null,
    dateCleared: null,
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
