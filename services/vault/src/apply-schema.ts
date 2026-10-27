import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createVaultDb, type VaultDb } from "./db";

function schemaDir(): string {
  if (typeof __dirname !== "undefined") return __dirname;
  return dirname(fileURLToPath(import.meta.url));
}

export function readSchemaSql(): string {
  return readFileSync(join(schemaDir(), "schema.sql"), "utf8");
}

/** Split schema.sql into executable statements (idempotent DDL). */
export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((part) =>
      part
        .split("\n")
        .map((line) => line.trimEnd())
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((statement) => statement.length > 0);
}

export async function applySchema(db: VaultDb = createVaultDb()): Promise<void> {
  // DDL (including CREATE EXTENSION) is applied statement-by-statement; IF NOT EXISTS makes re-runs safe.
  for (const sql of splitSqlStatements(readSchemaSql())) {
    await db.execute(sql);
  }
}
