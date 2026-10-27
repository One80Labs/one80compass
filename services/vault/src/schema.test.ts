import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { vaultLambdaIamActions } from "../../../infra/lib/vault-iam-actions";
import { ENTITY_TABLES, RELATION_KINDS, SOURCE_LABELS } from "./types";

const schemaSql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "schema.sql"), "utf8");

describe("vault schema.sql", () => {
  it("enables pgvector and uses vector(1024)", () => {
    expect(schemaSql).toMatch(/CREATE EXTENSION IF NOT EXISTS vector/i);
    expect(schemaSql).toMatch(/vector\(1024\)/);
  });

  it("defines every entity table with customer_id and program_id", () => {
    for (const table of ENTITY_TABLES) {
      expect(schemaSql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i"));
      const block = schemaSql.match(
        new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(([\\s\\S]*?)\\);`, "i"),
      );
      expect(block?.[1], table).toBeTruthy();
      expect(block![1]).toMatch(/\bcustomer_id\b/);
      expect(block![1]).toMatch(/\bprogram_id\b/);
    }
  });

  it("defines allowlist, relation, and chunk tables", () => {
    for (const table of ["vault_allowlist", "relation", "chunk"]) {
      expect(schemaSql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`, "i"));
    }
  });

  it("locks source labels and relation kinds", () => {
    for (const label of SOURCE_LABELS) {
      expect(schemaSql).toContain(`'${label}'`);
    }
    for (const kind of RELATION_KINDS) {
      expect(schemaSql).toContain(`'${kind}'`);
    }
  });
});

describe("vault Lambda IAM", () => {
  it("does not allow DynamoDB writes or the API function", () => {
    const actions = vaultLambdaIamActions();
    for (const write of [
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:BatchWriteItem",
    ]) {
      expect(actions).not.toContain(write);
    }
    expect(actions.join(" ")).not.toMatch(/one80compass-dev-api/i);
    expect(actions).not.toContain("one80compass-dev-api");
  });
});
