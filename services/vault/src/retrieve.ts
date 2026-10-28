import { expandRelatedEntityIds, type MultiHopQuery, type MultiHopRelation } from "./multi-hop";
import type { VaultChunk } from "./types";

export type { MultiHopQuery, MultiHopRelation };
export { expandRelatedEntityIds };

export type RetrieveQuery = {
  customerId: string;
  programId: string;
  embedding: number[];
  limit: number;
};

/**
 * Filters by customer and program before scoring. A closest embedding from another
 * customer must never win.
 *
 * After primary hits, callers may pass seed entity ids (e.g. work_item source ids) through
 * `expandRelatedEntityIds` for a 1-hop relation expansion in the same tenant — see multi-hop.ts.
 */
export function retrieveChunks(chunks: VaultChunk[], query: RetrieveQuery): VaultChunk[] {
  const scoped = chunks.filter(
    (chunk) => chunk.customerId === query.customerId && chunk.programId === query.programId,
  );
  const ranked = scoped
    .map((chunk) => ({
      chunk,
      score: chunk.embedding ? cosineSimilarity(query.embedding, chunk.embedding) : -Infinity,
    }))
    .sort((left, right) => right.score - left.score);
  return ranked.slice(0, Math.max(0, query.limit)).map((entry) => entry.chunk);
}

/**
 * Postgres retrieval must scope by customer and program before the distance operator.
 * Bound parameters are placeholders for the Data API / driver layer.
 */
export const RETRIEVE_SQL = `
SELECT id, customer_id, program_id, source_label, document_id, version_id, body, embedding
FROM chunk
WHERE customer_id = :customer_id
  AND program_id = :program_id
ORDER BY embedding <=> :embedding
LIMIT :limit
`.trim();

function cosineSimilarity(left: number[], right: number[]): number {
  const n = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < n; i += 1) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }
  if (leftNorm === 0 || rightNorm === 0) return -Infinity;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
