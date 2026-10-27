import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createVaultDb, type VaultDb } from "./db";

/** Schema SQL sits next to the bundled handler (copied during CDK bundling). */
function schemaPath(): string {
  return join(__dirname, "schema.sql");
}

export function readSchemaSql(): string {
  return readFileSync(schemaPath(), "utf8");
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
