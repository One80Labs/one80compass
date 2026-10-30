import { expandRelatedEntityIds, type MultiHopRelation } from "./multi-hop";
import type { SourceLabel, VaultChunk, VaultDecisionRow } from "./types";

export type DraftWorkItem = {
  issueId: string;
  title: string;
  status: string;
  issueType: string | null;
  startDate: string | null;
  finishDate: string | null;
  effort: number | null;
  description: string | null;
  /** Optional Compass predecessors; used to build in-memory `blocks` hops when `relations` is omitted. */
  predecessorIds?: string[];
};

export type DraftCitation = {
  sourceLabel: SourceLabel;
  documentId: string;
  versionId: string;
  excerpt: string;
};

export type DraftClaim = {
  text: string;
  workItemId?: string;
  /** Vault decision source id (register decisionId or plan issue id). Not a document citation. */
  decisionId?: string;
  citation?: { sourceLabel: SourceLabel; documentId: string; versionId: string };
};

export type DraftStatusInput = {
  customerId: string;
  programId: string;
  question: string;
  workItems: DraftWorkItem[];
  chunks: VaultChunk[];
  /**
   * Decision-register rows and plan items stored in the vault decision table.
   * Omitted or empty changes nothing. Rows for another customer or program are dropped.
   */
  decisions?: VaultDecisionRow[];
  /**
   * Optional relation edges for 1-hop expansion after primary work-item hits.
   * When omitted, `blocks` edges are derived from each work item's `predecessorIds`.
   */
  relations?: MultiHopRelation[];
};

export type DraftStatusResult = {
  title: string;
  body: string;
  citations: DraftCitation[];
  claims: DraftClaim[];
};

const EMPTY_BODY = "No filed source supports that.";

/** Pure status draft from work items, filed chunks, and decision rows. Does not write issues or plans. */
export function draftStatus(input: DraftStatusInput): DraftStatusResult {
  const kept = input.chunks.filter(
    (chunk) => chunk.customerId === input.customerId && chunk.programId === input.programId,
  );
  const keptDecisions = (input.decisions ?? []).filter(
    (row) => row.customerId === input.customerId && row.programId === input.programId,
  );
  const claims: DraftClaim[] = [];
  const citations: DraftCitation[] = [];
  const claimedWorkItems = new Set<string>();
  const primaryWorkItemIds: string[] = [];

  for (const item of input.workItems) {
    if (!answersQuestion(input.question, workItemHaystack(item))) continue;
    const text = workItemClaimText(item);
    if (!text) continue;
    claims.push({ text, workItemId: item.issueId });
    claimedWorkItems.add(item.issueId);
    primaryWorkItemIds.push(item.issueId);
  }

  for (const chunk of kept) {
    if (!answersQuestion(input.question, chunk.body)) continue;
    const excerpt = excerptOf(chunk.body);
    if (!excerpt) continue;
    const text = fileClaimText(chunk.body, excerpt);
    const citation = {
      sourceLabel: chunk.sourceLabel,
      documentId: chunk.documentId,
      versionId: chunk.versionId,
    };
    claims.push({ text, citation });
    citations.push({ ...citation, excerpt });
  }

  for (const row of keptDecisions) {
    const sourceId = row.sourceId.trim();
    if (!sourceId) continue;
    if (!answersQuestion(input.question, decisionHaystack(row))) continue;
    const text = decisionClaimText(row);
    if (!text) continue;
    claims.push({ text, decisionId: sourceId });
  }

  // 1-hop via filed relations only: related work must already be in workItems (no invented claims).
  const relations = input.relations ?? blockerRelationsFromWorkItems(input);
  const relatedIds = new Set(
    expandRelatedEntityIds({
      customerId: input.customerId,
      programId: input.programId,
      seedIds: primaryWorkItemIds,
      relations,
    }),
  );
  const workById = new Map(input.workItems.map((item) => [item.issueId, item]));
  for (const relatedId of relatedIds) {
    if (claimedWorkItems.has(relatedId)) continue;
    const item = workById.get(relatedId);
    if (!item) continue;
    const base = workItemClaimText(item);
    if (!base) continue;
    const kind = relationKindBetween(relations, primaryWorkItemIds, relatedId) ?? "related";
    claims.push({
      text: `Related (${kind}): ${base}`,
      workItemId: item.issueId,
    });
    claimedWorkItems.add(item.issueId);
  }

  const sourced = claims.filter(hasFiledSource);
  if (sourced.length === 0) {
    return { title: "Status draft", body: EMPTY_BODY, citations: [], claims: [] };
  }

  const lines = sourced.map(claimLine).filter((line): line is string => line != null);
  if (lines.length === 0) {
    return { title: "Status draft", body: EMPTY_BODY, citations: [], claims: [] };
  }

  return { title: "Status draft", body: lines.join("\n"), citations, claims: sourced };
}

function hasFiledSource(claim: DraftClaim): boolean {
  return Boolean(claim.workItemId) || Boolean(claim.decisionId) || Boolean(claim.citation);
}

function claimLine(claim: DraftClaim): string | null {
  if (claim.workItemId) return `${claim.text} [work item ${claim.workItemId}]`;
  if (claim.decisionId) return `${claim.text} [decision ${claim.decisionId}]`;
  if (claim.citation) {
    const { sourceLabel, documentId, versionId } = claim.citation;
    return `${claim.text} [${sourceLabel} ${documentId} ${versionId}]`;
  }
  return null;
}

function blockerRelationsFromWorkItems(input: DraftStatusInput): MultiHopRelation[] {
  const relations: MultiHopRelation[] = [];
  for (const item of input.workItems) {
    for (const predecessorId of item.predecessorIds ?? []) {
      if (!predecessorId) continue;
      relations.push({
        customerId: input.customerId,
        programId: input.programId,
        kind: "blocks",
        fromId: predecessorId,
        toId: item.issueId,
      });
    }
  }
  return relations;
}

function relationKindBetween(
  relations: readonly MultiHopRelation[],
  seeds: readonly string[],
  relatedId: string,
): string | null {
  const seedSet = new Set(seeds);
  for (const edge of relations) {
    if (
      (seedSet.has(edge.fromId) && edge.toId === relatedId) ||
      (seedSet.has(edge.toId) && edge.fromId === relatedId)
    ) {
      return edge.kind;
    }
  }
  return null;
}

function decisionHaystack(row: VaultDecisionRow): string {
  return `${row.title} ${row.body}`;
}

function decisionClaimText(row: VaultDecisionRow): string | null {
  const title = row.title.trim().replace(/\s+/g, " ");
  const body = row.body.trim().replace(/\s+/g, " ");
  const filed = title && body ? `${title}. ${body}` : title || body;
  if (!filed) return null;
  const excerpt = excerptOf(filed);
  if (!excerpt) return null;
  return fileClaimText(filed, excerpt);
}

function workItemHaystack(item: DraftWorkItem): string {
  return [
    item.title,
    item.status,
    item.issueType ?? "",
    item.startDate ?? "",
    item.finishDate ?? "",
    item.effort == null ? "" : String(item.effort),
    item.description ?? "",
  ].join(" ");
}

function workItemClaimText(item: DraftWorkItem): string | null {
  const parts: string[] = [];
  parts.push(`${item.title} is ${item.status}`);
  if (item.issueType) parts.push(`issue type ${item.issueType}`);
  if (item.startDate) parts.push(`starts ${item.startDate}`);
  if (item.finishDate) parts.push(`finishes ${item.finishDate}`);
  if (item.effort != null) parts.push(`effort ${item.effort}`);
  if (item.description?.trim()) parts.push(item.description.trim());
  const text = parts.join("; ");
  return text.trim() ? `${text}.` : null;
}

function fileClaimText(body: string, excerpt: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 280) return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
  return excerpt.endsWith(".") ? excerpt : `${excerpt}.`;
}

function excerptOf(body: string): string {
  const cleaned = body.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return cleaned.length <= 160 ? cleaned : `${cleaned.slice(0, 157).trimEnd()}...`;
}

function answersQuestion(question: string, haystack: string): boolean {
  const tokens = significantTokens(question);
  if (tokens.length === 0) return false;
  const hay = haystack.toLowerCase();
  return tokens.some((token) => hay.includes(token));
}

function significantTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP.has(token));
}

const STOP = new Set([
  "the",
  "and",
  "for",
  "are",
  "was",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "how",
  "does",
  "did",
  "about",
  "with",
  "from",
  "that",
  "this",
  "have",
  "has",
  "had",
  "any",
  "all",
  "our",
  "you",
  "your",
  "status",
  "report",
  "please",
  "tell",
]);
