export const SOURCE_LABELS = ["compass-upload", "krisp", "fireflies", "other"] as const;
export type SourceLabel = (typeof SOURCE_LABELS)[number];
export const RELATION_KINDS = ["blocks", "mitigates", "evidenced_by", "decided", "supersedes", "part_of"] as const;
export type RelationKind = (typeof RELATION_KINDS)[number];
export const ENTITY_TABLES = ["program", "work_item", "milestone", "risk", "decision", "person", "document", "transcript", "artifact", "status_report"] as const;
export type EntityTable = (typeof ENTITY_TABLES)[number];
export type VaultIdentity = { customerId: string; programId: string; sourceType: string; sourceId: string; recordedAt: string };
export type VaultCitation = { sourceLabel: SourceLabel; documentId: string; versionId: string };
export type VaultChunk = VaultCitation & VaultIdentity & { id: string; body: string; embedding: number[] | null };
/**
 * One vault decision-table row: a Decision register record or a plan item whose issue type is Decision.
 * sourceId is the register decisionId or the plan issue id. No embedding and no document source label.
 */
export type VaultDecisionRow = {
  customerId: string;
  programId: string;
  sourceId: string;
  title: string;
  body: string;
};
export const EMBEDDING_DIMENSIONS = 1024;
