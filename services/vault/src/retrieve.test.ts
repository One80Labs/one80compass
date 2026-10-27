import { describe, expect, it } from "vitest";
import { deterministicEmbed } from "./embed";
import { RETRIEVE_SQL, retrieveChunks } from "./retrieve";
import type { VaultChunk } from "./types";

describe("retrieveChunks", () => {
  it("drops another customer's chunk even when its embedding is closest", () => {
    const queryEmbedding = deterministicEmbed("target query about schedules");
    const own = chunk({
      id: "own",
      customerId: "cust-a",
      programId: "prog-a",
      body: "unrelated noise about weather",
      embedding: deterministicEmbed("weather noise"),
    });
    const other = chunk({
      id: "other",
      customerId: "cust-b",
      programId: "prog-a",
      body: "target query about schedules",
      embedding: deterministicEmbed("target query about schedules"),
    });

    const found = retrieveChunks([other, own], {
      customerId: "cust-a",
      programId: "prog-a",
      embedding: queryEmbedding,
      limit: 5,
    });

    expect(found.map((chunk) => chunk.id)).toEqual(["own"]);
    expect(found.some((chunk) => chunk.customerId !== "cust-a")).toBe(false);
  });

  it("ranks remaining chunks by cosine similarity after customer and program filters", () => {
    const queryEmbedding = deterministicEmbed("alpha beta");
    const closer = chunk({
      id: "closer",
      body: "alpha beta",
      embedding: deterministicEmbed("alpha beta"),
    });
    const farther = chunk({
      id: "farther",
      body: "zzzz",
      embedding: deterministicEmbed("zzzz"),
    });
    const wrongProgram = chunk({
      id: "wrong-prog",
      programId: "other",
      body: "alpha beta",
      embedding: deterministicEmbed("alpha beta"),
    });

    const found = retrieveChunks([farther, wrongProgram, closer], {
      customerId: "cust-a",
      programId: "prog-a",
      embedding: queryEmbedding,
      limit: 2,
    });
    expect(found.map((row) => row.id)).toEqual(["closer", "farther"]);
  });
});

describe("RETRIEVE_SQL", () => {
  it("filters by customer_id and program_id before the vector distance operator", () => {
    const whereIdx = RETRIEVE_SQL.indexOf("WHERE");
    expect(whereIdx).toBeGreaterThan(-1);
    const fromWhere = RETRIEVE_SQL.slice(whereIdx);
    const customerIdx = fromWhere.indexOf("customer_id");
    const programIdx = fromWhere.indexOf("program_id");
    const distanceIdx = fromWhere.indexOf("<=>");
    expect(customerIdx).toBeGreaterThan(-1);
    expect(programIdx).toBeGreaterThan(-1);
    expect(distanceIdx).toBeGreaterThan(customerIdx);
    expect(distanceIdx).toBeGreaterThan(programIdx);
  });
});

function chunk(partial: Partial<VaultChunk> & Pick<VaultChunk, "id">): VaultChunk {
  return {
    customerId: "cust-a",
    programId: "prog-a",
    sourceType: "compass",
    sourceId: partial.id,
    recordedAt: "2026-10-26T12:00:00.000Z",
    sourceLabel: "compass-upload",
    documentId: "doc-1",
    versionId: "ver-1",
    body: "",
    embedding: deterministicEmbed(partial.id),
    ...partial,
  };
}
