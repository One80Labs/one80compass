import type { AllowlistEntry } from "./allowlist";
import type { IngestResult, VaultEntityRow, VaultRelationRow } from "./ingest";
import type { VaultChunk } from "./types";
import { EMBEDDING_DIMENSIONS } from "./types";
import { createVaultDb, type VaultDb } from "./db";
import type { SqlParameter } from "@aws-sdk/client-rds-data";

const PROGRAM_TABLES = ["chunk", "relation", "work_item", "milestone", "document", "transcript", "artifact", "program"] as const;
const ENTITY_TABLE_NAMES = ["program", "work_item", "milestone", "document", "transcript", "artifact"] as const;
const ENTITY_TABLES = new Set<string>(ENTITY_TABLE_NAMES);
const DOCUMENT_LIKE_TABLES = new Set<string>(["document", "transcript", "artifact"]);

function str(name: string, value: string | null | undefined): SqlParameter {
  if (value == null) return { name, value: { isNull: true } };
  return { name, value: { stringValue: value } };
}

function entityId(row: VaultEntityRow): string {
  return `${row.customerId}:${row.programId}:${row.table}:${row.sourceId}`;
}

function relationId(row: VaultRelationRow): string {
  return `${row.customerId}:${row.programId}:relation:${row.sourceId}`;
}

/** Read every allowlisted program. */
export async function readAllowlist(db: VaultDb = createVaultDb()): Promise<AllowlistEntry[]> {
  const result = await db.execute("SELECT customer_id, program_id FROM vault_allowlist ORDER BY customer_id, program_id");
  return (result.records ?? []).map((record) => ({
    customerId: String(record[0]?.stringValue ?? ""),
    programId: String(record[1]?.stringValue ?? ""),
  })).filter((entry) => entry.customerId && entry.programId);
}

/** Add or remove one program from the allowlist. */
export async function saveAllowlist(entry: AllowlistEntry, enabled: boolean, db: VaultDb = createVaultDb()): Promise<void> {
  if (enabled) {
    await db.execute(
      `INSERT INTO vault_allowlist (customer_id, program_id)
       VALUES (:customer_id, :program_id)
       ON CONFLICT (customer_id, program_id) DO NOTHING`,
      [str("customer_id", entry.customerId), str("program_id", entry.programId)],
    );
    return;
  }
  await db.execute(
    `DELETE FROM vault_allowlist WHERE customer_id = :customer_id AND program_id = :program_id`,
    [str("customer_id", entry.customerId), str("program_id", entry.programId)],
  );
}

/**
 * Replace vault rows for the programs present in the ingest result.
 * Clears prior rows for each program id so a second ingest does not leave stale chunks.
 */
export async function saveIngestResult(result: IngestResult, db: VaultDb = createVaultDb()): Promise<void> {
  assertSafeIngestResult(result);
  const allowlist = await readAllowlist(db);
  const programs = new Map<string, { customerId: string; programId: string }>();
  for (const row of result.rows) programs.set(`${row.customerId}:${row.programId}`, { customerId: row.customerId, programId: row.programId });
  for (const chunk of result.chunks) programs.set(`${chunk.customerId}:${chunk.programId}`, { customerId: chunk.customerId, programId: chunk.programId });
  for (const relation of result.relations) programs.set(`${relation.customerId}:${relation.programId}`, { customerId: relation.customerId, programId: relation.programId });
  if (programs.size === 0) throw new Error("save-rows requires at least one program row");
  for (const program of programs.values()) {
    if (!allowlist.some((entry) => entry.customerId === program.customerId && entry.programId === program.programId)) {
      throw new Error(`Program ${program.customerId}/${program.programId} is not allowlisted`);
    }
  }

  const transactionId = await db.beginTransaction();
  try {
    for (const program of programs.values()) {
      for (const table of PROGRAM_TABLES) {
        await db.execute(
          `DELETE FROM ${table} WHERE customer_id = :customer_id AND program_id = :program_id`,
          [str("customer_id", program.customerId), str("program_id", program.programId)],
          transactionId,
        );
      }
    }
    for (const row of result.rows) await insertEntity(db, row, transactionId);
    for (const relation of result.relations) await insertRelation(db, relation, transactionId);
    for (const chunk of result.chunks) await insertChunk(db, chunk, transactionId);
    await db.commit(transactionId);
  } catch (error) {
    await db.rollback(transactionId);
    throw error;
  }
}

function assertSafeIngestResult(result: IngestResult): void {
  if (!result || !Array.isArray(result.rows) || !Array.isArray(result.relations) || !Array.isArray(result.chunks)) {
    throw new Error("save-rows result must include rows, relations, and chunks arrays");
  }
  for (const row of result.rows) {
    if (!row.customerId || !row.programId || !ENTITY_TABLES.has(row.table)) {
      throw new Error(`Invalid entity table or tenant for row ${row.sourceId ?? "?"}`);
    }
  }
}

/** Chunks for one customer and program. Embeddings are omitted from the response body list used by drafts. */
export async function listChunks(customerId: string, programId: string, db: VaultDb = createVaultDb()): Promise<VaultChunk[]> {
  const result = await db.execute(
    `SELECT id, customer_id, program_id, source_label, document_id, version_id, source_type, source_id, body, recorded_at
     FROM chunk
     WHERE customer_id = :customer_id AND program_id = :program_id
     ORDER BY id`,
    [str("customer_id", customerId), str("program_id", programId)],
  );
  return (result.records ?? []).map((record) => ({
    id: String(record[0]?.stringValue ?? ""),
    customerId: String(record[1]?.stringValue ?? ""),
    programId: String(record[2]?.stringValue ?? ""),
    sourceLabel: String(record[3]?.stringValue ?? "") as VaultChunk["sourceLabel"],
    documentId: String(record[4]?.stringValue ?? ""),
    versionId: String(record[5]?.stringValue ?? ""),
    sourceType: String(record[6]?.stringValue ?? ""),
    sourceId: String(record[7]?.stringValue ?? ""),
    body: String(record[8]?.stringValue ?? ""),
    recordedAt: String(record[9]?.stringValue ?? ""),
    embedding: null,
  }));
}

async function insertEntity(db: VaultDb, row: VaultEntityRow, transactionId: string): Promise<void> {
  if (!ENTITY_TABLES.has(row.table)) throw new Error(`Unsupported vault entity table: ${String(row.table)}`);
  const id = entityId(row);
  const base = [
    str("id", id),
    str("customer_id", row.customerId),
    str("program_id", row.programId),
    str("source_type", row.sourceType),
    str("source_id", row.sourceId),
    str("recorded_at", row.recordedAt),
  ];
  if (row.table === "program") {
    await db.execute(
      `INSERT INTO program (id, customer_id, program_id, source_type, source_id, recorded_at, title)
       VALUES (:id, :customer_id, :program_id, :source_type, :source_id, :recorded_at::timestamptz, :title)`,
      [...base, str("title", row.title ?? "")],
      transactionId,
    );
    return;
  }
  if (row.table === "work_item") {
    await db.execute(
      `INSERT INTO work_item (id, customer_id, program_id, source_type, source_id, recorded_at, title, body, status, issue_type, start_on, finish_on)
       VALUES (:id, :customer_id, :program_id, :source_type, :source_id, :recorded_at::timestamptz, :title, :body, :status, :issue_type, :start_on::date, :finish_on::date)`,
      [
        ...base,
        str("title", row.title ?? ""),
        str("body", row.description ?? null),
        str("status", row.status ?? ""),
        str("issue_type", row.issueType ?? null),
        str("start_on", row.startDate ?? null),
        str("finish_on", row.finishDate ?? null),
      ],
      transactionId,
    );
    return;
  }
  if (row.table === "milestone") {
    await db.execute(
      `INSERT INTO milestone (id, customer_id, program_id, source_type, source_id, recorded_at, title, due_on)
       VALUES (:id, :customer_id, :program_id, :source_type, :source_id, :recorded_at::timestamptz, :title, :due_on::date)`,
      [...base, str("title", row.title ?? ""), str("due_on", row.dueOn ?? null)],
      transactionId,
    );
    return;
  }
  if (!DOCUMENT_LIKE_TABLES.has(row.table)) throw new Error(`Unsupported vault entity table: ${row.table}`);
  const tableSql =
    row.table === "document"
      ? "document"
      : row.table === "transcript"
        ? "transcript"
        : "artifact";
  await db.execute(
    `INSERT INTO ${tableSql} (id, customer_id, program_id, source_type, source_id, recorded_at, name, source_label, compass_document_id, version_id)
     VALUES (:id, :customer_id, :program_id, :source_type, :source_id, :recorded_at::timestamptz, :name, :source_label, :compass_document_id, :version_id)`,
    [
      ...base,
      str("name", row.name ?? row.title ?? ""),
      str("source_label", row.sourceLabel ?? "other"),
      str("compass_document_id", row.sourceId),
      str("version_id", row.versionId ?? ""),
    ],
    transactionId,
  );
}

async function insertRelation(db: VaultDb, row: VaultRelationRow, transactionId: string): Promise<void> {
  await db.execute(
    `INSERT INTO relation (id, customer_id, program_id, kind, from_type, from_id, to_type, to_id, source_type, source_id, recorded_at)
     VALUES (:id, :customer_id, :program_id, :kind, :from_type, :from_id, :to_type, :to_id, :source_type, :source_id, :recorded_at::timestamptz)`,
    [
      str("id", relationId(row)),
      str("customer_id", row.customerId),
      str("program_id", row.programId),
      str("kind", row.kind),
      str("from_type", "work_item"),
      str("from_id", row.fromSourceId),
      str("to_type", "work_item"),
      str("to_id", row.toSourceId),
      str("source_type", row.sourceType),
      str("source_id", row.sourceId),
      str("recorded_at", row.recordedAt),
    ],
    transactionId,
  );
}

async function insertChunk(db: VaultDb, chunk: VaultChunk, transactionId: string): Promise<void> {
  if (chunk.embedding != null && chunk.embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Chunk embedding must be ${EMBEDDING_DIMENSIONS} floats (got ${chunk.embedding.length})`);
  }
  const embedding =
    chunk.embedding && chunk.embedding.length > 0 ? `[${chunk.embedding.join(",")}]` : null;
  await db.execute(
    `INSERT INTO chunk (id, customer_id, program_id, source_label, document_id, version_id, source_type, source_id, body, embedding, recorded_at)
     VALUES (:id, :customer_id, :program_id, :source_label, :document_id, :version_id, :source_type, :source_id, :body, CAST(:embedding AS vector), :recorded_at::timestamptz)`,
    [
      str("id", chunk.id),
      str("customer_id", chunk.customerId),
      str("program_id", chunk.programId),
      str("source_label", chunk.sourceLabel),
      str("document_id", chunk.documentId),
      str("version_id", chunk.versionId),
      str("source_type", chunk.sourceType),
      str("source_id", chunk.sourceId),
      str("body", chunk.body),
      str("embedding", embedding),
      str("recorded_at", chunk.recordedAt),
    ],
    transactionId,
  );
}
