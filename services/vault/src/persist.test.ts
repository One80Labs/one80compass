import { describe, expect, it } from "vitest";
import type { IngestResult } from "./ingest";
import { listChunks, readAllowlist, saveAllowlist, saveIngestResult } from "./persist";
import type { VaultDb } from "./db";

function fakeDb() {
  const calls: { sql: string; parameters?: unknown; transactionId?: string }[] = [];
  let open = false;
  const db = {
    async execute(sql: string, parameters?: unknown, transactionId?: string) {
      calls.push({ sql, parameters, transactionId });
      if (sql.includes("FROM vault_allowlist") && sql.includes("SELECT")) {
        return {
          $metadata: {},
          records: [
            [{ stringValue: "cust-1" }, { stringValue: "prog-1" }],
          ],
        };
      }
      if (sql.includes("FROM chunk") && sql.includes("SELECT")) {
        return {
          $metadata: {},
          records: [
            [
              { stringValue: "chunk-1" },
              { stringValue: "cust-1" },
              { stringValue: "prog-1" },
              { stringValue: "compass-upload" },
              { stringValue: "doc-1" },
              { stringValue: "ver-1" },
              { stringValue: "compass" },
              { stringValue: "doc-1" },
              { stringValue: "hello" },
              { stringValue: "2026-10-26T00:00:00.000Z" },
            ],
          ],
        };
      }
      return { $metadata: {}, records: [] };
    },
    async beginTransaction() {
      open = true;
      return "tx-1";
    },
    async commit(transactionId: string) {
      expect(transactionId).toBe("tx-1");
      open = false;
    },
    async rollback(transactionId: string) {
      expect(transactionId).toBe("tx-1");
      open = false;
    },
  } as VaultDb;
  return { db, calls, isOpen: () => open };
}

describe("vault persist", () => {
  it("reads allowlist rows", async () => {
    const { db } = fakeDb();
    await expect(readAllowlist(db)).resolves.toEqual([{ customerId: "cust-1", programId: "prog-1" }]);
  });

  it("inserts or deletes allowlist rows", async () => {
    const { db, calls } = fakeDb();
    await saveAllowlist({ customerId: "cust-1", programId: "prog-1" }, true, db);
    expect(calls.at(-1)?.sql).toContain("INSERT INTO vault_allowlist");
    await saveAllowlist({ customerId: "cust-1", programId: "prog-1" }, false, db);
    expect(calls.at(-1)?.sql).toContain("DELETE FROM vault_allowlist");
  });

  it("clears a program then inserts entities, relations, and chunks in a transaction", async () => {
    const { db, calls } = fakeDb();
    const result: IngestResult = {
      rows: [
        {
          table: "program",
          customerId: "cust-1",
          programId: "prog-1",
          sourceType: "compass",
          sourceId: "prog-1",
          recordedAt: "2026-10-26T00:00:00.000Z",
          title: "Demo",
        },
        {
          table: "document",
          customerId: "cust-1",
          programId: "prog-1",
          sourceType: "compass",
          sourceId: "doc-1",
          recordedAt: "2026-10-26T00:00:00.000Z",
          name: "notes.txt",
          sourceLabel: "compass-upload",
          versionId: "ver-1",
        },
      ],
      relations: [],
      chunks: [
        {
          id: "cust-1:prog-1:doc-1:ver-1:0",
          customerId: "cust-1",
          programId: "prog-1",
          sourceType: "compass",
          sourceId: "doc-1",
          recordedAt: "2026-10-26T00:00:00.000Z",
          sourceLabel: "compass-upload",
          documentId: "doc-1",
          versionId: "ver-1",
          body: "hello",
          embedding: Array.from({ length: 1024 }, (_, i) => (i === 0 ? 0.1 : 0)),
        },
      ],
    };
    await saveIngestResult(result, db);
    expect(calls.some((call) => call.sql.includes("DELETE FROM chunk"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("INSERT INTO program"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("INSERT INTO document"))).toBe(true);
    expect(calls.some((call) => call.sql.includes("INSERT INTO chunk"))).toBe(true);
    expect(calls.every((call) => !call.sql.includes("DELETE FROM") || call.transactionId === "tx-1")).toBe(true);
  });

  it("rejects save-rows for a program that is not allowlisted", async () => {
    const { db } = fakeDb();
    await expect(
      saveIngestResult(
        {
          rows: [
            {
              table: "program",
              customerId: "other",
              programId: "prog-9",
              sourceType: "compass",
              sourceId: "prog-9",
              recordedAt: "2026-10-26T00:00:00.000Z",
              title: "Nope",
            },
          ],
          relations: [],
          chunks: [],
        },
        db,
      ),
    ).rejects.toThrow(/not allowlisted/);
  });

  it("lists chunks for one customer and program", async () => {
    const { db, calls } = fakeDb();
    const chunks = await listChunks("cust-1", "prog-1", db);
    expect(calls.at(-1)?.sql).toContain("customer_id = :customer_id AND program_id = :program_id");
    expect(chunks).toEqual([
      {
        id: "chunk-1",
        customerId: "cust-1",
        programId: "prog-1",
        sourceLabel: "compass-upload",
        documentId: "doc-1",
        versionId: "ver-1",
        sourceType: "compass",
        sourceId: "doc-1",
        body: "hello",
        recordedAt: "2026-10-26T00:00:00.000Z",
        embedding: null,
      },
    ]);
  });
});
