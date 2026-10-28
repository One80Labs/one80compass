import { describe, expect, it } from "vitest";
import { draftStatus } from "./draft";
import type { VaultChunk } from "./types";

function chunk(partial: Partial<VaultChunk> & Pick<VaultChunk, "id" | "body" | "documentId" | "versionId">): VaultChunk {
  return {
    customerId: "cust-1",
    programId: "prog-1",
    sourceType: "document",
    sourceId: partial.documentId,
    recordedAt: "2026-10-24T12:00:00.000Z",
    sourceLabel: "compass-upload",
    embedding: null,
    ...partial,
  };
}

describe("draftStatus", () => {
  it("cites a matching filed chunk with document and version ids", () => {
    const result = draftStatus({
      customerId: "cust-1",
      programId: "prog-1",
      question: "What did the vendor sign?",
      workItems: [],
      chunks: [
        chunk({
          id: "c1",
          documentId: "doc-9",
          versionId: "ver-3",
          body: "The vendor signed the SOW on Monday.",
        }),
      ],
    });
    expect(result.title).toBe("Status draft");
    expect(result.body).toContain("doc-9");
    expect(result.body).toContain("ver-3");
    expect(result.body).toContain("[compass-upload doc-9 ver-3]");
    expect(result.citations).toEqual([
      {
        sourceLabel: "compass-upload",
        documentId: "doc-9",
        versionId: "ver-3",
        excerpt: "The vendor signed the SOW on Monday.",
      },
    ]);
    expect(result.claims[0]?.citation).toEqual({
      sourceLabel: "compass-upload",
      documentId: "doc-9",
      versionId: "ver-3",
    });
  });

  it("ignores a chunk for another customer", () => {
    const result = draftStatus({
      customerId: "cust-1",
      programId: "prog-1",
      question: "What did the vendor sign?",
      workItems: [],
      chunks: [
        chunk({
          id: "c-other",
          customerId: "cust-other",
          documentId: "doc-secret",
          versionId: "ver-secret",
          body: "The vendor signed the SOW on Monday.",
        }),
      ],
    });
    expect(result.body).toBe("No filed source supports that.");
    expect(result.citations).toEqual([]);
    expect(result.claims).toEqual([]);
  });

  it("returns the empty body when nothing answers the question", () => {
    const result = draftStatus({
      customerId: "cust-1",
      programId: "prog-1",
      question: "What is the launch date for Mars?",
      workItems: [
        {
          issueId: "I_1",
          title: "Pour footing",
          status: "Done",
          issueType: "Task",
          startDate: null,
          finishDate: null,
          effort: 1,
          description: null,
        },
      ],
      chunks: [
        chunk({
          id: "c1",
          documentId: "doc-1",
          versionId: "ver-1",
          body: "Kickoff notes from discovery.",
        }),
      ],
    });
    expect(result.title).toBe("Status draft");
    expect(result.body).toBe("No filed source supports that.");
    expect(result.claims).toEqual([]);
    expect(result.citations).toEqual([]);
    expect(result.body).not.toMatch(/Pour footing|Kickoff|recommend/i);
  });

  it("builds a work item claim only from that item's fields", () => {
    const result = draftStatus({
      customerId: "cust-1",
      programId: "prog-1",
      question: "How is discovery interviews progressing?",
      workItems: [
        {
          issueId: "I_disc",
          title: "Discovery interviews",
          status: "In Progress",
          issueType: "Task",
          startDate: "2026-10-01",
          finishDate: null,
          effort: 3,
          description: "Talk to stakeholders",
        },
      ],
      chunks: [],
    });
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.workItemId).toBe("I_disc");
    expect(result.body).toContain("[work item I_disc]");
    expect(result.claims[0]?.text).toContain("Discovery interviews");
    expect(result.claims[0]?.text).toContain("In Progress");
  });

  it("hops to a filed predecessor blocker after a primary work-item hit", () => {
    const result = draftStatus({
      customerId: "cust-1",
      programId: "prog-1",
      question: "How is pavement pour progressing?",
      workItems: [
        {
          issueId: "I_pour",
          title: "Pavement pour",
          status: "Blocked",
          issueType: "Task",
          startDate: null,
          finishDate: null,
          effort: null,
          description: null,
          predecessorIds: ["I_permit"],
        },
        {
          issueId: "I_permit",
          title: "Permit approval",
          status: "In Progress",
          issueType: "Task",
          startDate: null,
          finishDate: null,
          effort: null,
          description: null,
        },
      ],
      chunks: [],
    });
    expect(result.claims.map((claim) => claim.workItemId)).toEqual(["I_pour", "I_permit"]);
    expect(result.body).toContain("Related (blocks):");
    expect(result.body).toContain("Permit approval");
    expect(result.body).toContain("[work item I_permit]");
  });

  it("does not hop across tenants even when relations point at a seed id", () => {
    const result = draftStatus({
      customerId: "cust-1",
      programId: "prog-1",
      question: "How is pavement pour progressing?",
      workItems: [
        {
          issueId: "I_pour",
          title: "Pavement pour",
          status: "Blocked",
          issueType: "Task",
          startDate: null,
          finishDate: null,
          effort: null,
          description: null,
        },
        {
          issueId: "I_secret",
          title: "Secret blocker",
          status: "Todo",
          issueType: "Task",
          startDate: null,
          finishDate: null,
          effort: null,
          description: null,
        },
      ],
      relations: [
        {
          customerId: "cust-other",
          programId: "prog-1",
          kind: "blocks",
          fromId: "I_secret",
          toId: "I_pour",
        },
      ],
      chunks: [],
    });
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.workItemId).toBe("I_pour");
    expect(result.body).not.toContain("Secret blocker");
  });

  it("no-ops hop expansion when relations are empty", () => {
    const result = draftStatus({
      customerId: "cust-1",
      programId: "prog-1",
      question: "How is pavement pour progressing?",
      workItems: [
        {
          issueId: "I_pour",
          title: "Pavement pour",
          status: "Blocked",
          issueType: "Task",
          startDate: null,
          finishDate: null,
          effort: null,
          description: null,
        },
        {
          issueId: "I_permit",
          title: "Permit approval",
          status: "In Progress",
          issueType: "Task",
          startDate: null,
          finishDate: null,
          effort: null,
          description: null,
        },
      ],
      relations: [],
      chunks: [],
    });
    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.workItemId).toBe("I_pour");
    expect(result.body).not.toContain("Permit approval");
  });
});
