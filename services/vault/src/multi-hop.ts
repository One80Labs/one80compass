import type { RelationKind } from "./types";

/**
 * Hop rules (v1):
 * - Exactly **1 hop** along relation edges (`fromId` ↔ `toId`). Two-hop expansion is not supported.
 * - Edges must match the query `customerId` **and** `programId`; cross-tenant / cross-program
 *   relations never expand.
 * - Expansion is undirected: a `blocks` edge predecessor→successor yields the other endpoint
 *   from either seed (blocker hop includes the predecessor when the successor is seeded).
 * - Empty `seedIds` or empty in-scope relations → empty related set (no-op).
 * - Seeds themselves are not returned; only neighboring entity ids.
 */
export type MultiHopRelation = {
  customerId: string;
  programId: string;
  kind: RelationKind | string;
  fromId: string;
  toId: string;
};

export type MultiHopQuery = {
  customerId: string;
  programId: string;
  seedIds: readonly string[];
  relations: readonly MultiHopRelation[];
  /** When set, only these relation kinds participate. Default: all kinds. */
  kinds?: readonly string[];
};

/**
 * Pure multi-hop expansion: given seed entity ids and in-memory relations, return related
 * entity ids filtered by tenant. Used by draft (and later retrieve) without inventing rows.
 */
export function expandRelatedEntityIds(query: MultiHopQuery): string[] {
  const seeds = new Set(query.seedIds.filter((id) => id.length > 0));
  if (seeds.size === 0 || query.relations.length === 0) return [];

  const kindFilter = query.kinds?.length ? new Set(query.kinds) : null;
  const related = new Set<string>();

  for (const edge of query.relations) {
    if (edge.customerId !== query.customerId || edge.programId !== query.programId) continue;
    if (kindFilter && !kindFilter.has(edge.kind)) continue;
    if (!edge.fromId || !edge.toId) continue;

    if (seeds.has(edge.fromId) && !seeds.has(edge.toId)) related.add(edge.toId);
    if (seeds.has(edge.toId) && !seeds.has(edge.fromId)) related.add(edge.fromId);
  }

  return [...related];
}

/** Map an ingest / persist relation row onto the multi-hop edge shape. */
export function relationRowToMultiHop(row: {
  customerId: string;
  programId: string;
  kind: string;
  fromSourceId: string;
  toSourceId: string;
}): MultiHopRelation {
  return {
    customerId: row.customerId,
    programId: row.programId,
    kind: row.kind,
    fromId: row.fromSourceId,
    toId: row.toSourceId,
  };
}

/**
 * TODO(Data API): expose `list-relations` from the vault Lambda (same allowlist gate as
 * list-chunks) and pass rows into draft/retrieve. Until then drafts may supply relations
 * in-memory (e.g. from Compass predecessorIds) or omit them (hop is a no-op).
 *
 * SELECT kind, from_id, to_id, customer_id, program_id
 * FROM relation
 * WHERE customer_id = :customer_id AND program_id = :program_id
 */
export const LIST_RELATIONS_SQL = `
SELECT kind, from_id, to_id, customer_id, program_id
FROM relation
WHERE customer_id = :customer_id
  AND program_id = :program_id
`.trim();
