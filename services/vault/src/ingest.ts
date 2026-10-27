import { isAllowlisted, type AllowlistEntry } from "./allowlist";
import { chunkText } from "./chunk-text";
import { deterministicEmbed } from "./embed";
import { SOURCE_LABELS, type SourceLabel, type VaultChunk, type VaultIdentity } from "./types";

/** Plan issue fields ingest needs. Matches Compass PlanIssue shape for these keys. */
export type IngestIssue = {
  issueId: string;
  title: string;
  description: string | null;
  status: string;
  issueType: string | null;
  startDate: string | null;
  finishDate: string | null;
  predecessorIds: string[];
};

export type IngestMilestone = { id: string; title: string; dueOn: string | null };

export type IngestDocument = {
  documentId: string;
  customerId: string;
  projectId: string;
  name: string;
  sourceLabel: SourceLabel | null;
  deletedAt: string | null;
  currentVersionId: string | null;
};

export type IngestVersion = {
  versionId: string;
  documentId: string;
  contentType: string;
  fileName: string;
  status: "pending" | "stored";
  text: string;
};

export type IngestInput = {
  allowlist: AllowlistEntry[];
  program: { customerId: string; programId: string; title: string };
  issues: IngestIssue[];
  milestones: IngestMilestone[];
  documents: IngestDocument[];
  versions: IngestVersion[];
  /** Fixed timestamp so tests do not depend on the clock. */
  recordedAt: string;
  /** Defaults to deterministicEmbed. Production resolves Bedrock then passes numbers. */
  embed?: (text: string) => number[];
};

export type VaultEntityRow = VaultIdentity & {
  table: "program" | "work_item" | "milestone" | "document" | "transcript" | "artifact";
  title?: string;
  name?: string;
  description?: string | null;
  status?: string;
  issueType?: string | null;
  startDate?: string | null;
  finishDate?: string | null;
  dueOn?: string | null;
  /** Set on document, transcript, and artifact rows. */
  sourceLabel?: SourceLabel;
  versionId?: string;
};

export type VaultRelationRow = VaultIdentity & {
  kind: "blocks";
  fromSourceId: string;
  toSourceId: string;
};

export type IngestResult = {
  rows: VaultEntityRow[];
  relations: VaultRelationRow[];
  chunks: VaultChunk[];
};

const LABEL_SET = new Set<string>(SOURCE_LABELS);

/**
 * Copy one allowlisted Compass program into vault rows and chunks.
 * Does not import the AWS SDK and does not write DynamoDB.
 */
export function ingestProgram(input: IngestInput): IngestResult {
  const empty: IngestResult = { rows: [], relations: [], chunks: [] };
  const { program } = input;
  if (!isAllowlisted(input.allowlist, program.customerId, program.programId)) return empty;

  const embed = input.embed ?? deterministicEmbed;
  const identity = (sourceId: string): VaultIdentity => ({
    customerId: program.customerId,
    programId: program.programId,
    sourceType: "compass",
    sourceId,
    recordedAt: input.recordedAt,
  });

  const rows: VaultEntityRow[] = [
    { ...identity(program.programId), table: "program", title: program.title },
  ];
  const relations: VaultRelationRow[] = [];
  const chunks: VaultChunk[] = [];

  for (const issue of input.issues) {
    rows.push({
      ...identity(issue.issueId),
      table: "work_item",
      title: issue.title,
      description: issue.description,
      status: issue.status,
      issueType: issue.issueType,
      startDate: issue.startDate,
      finishDate: issue.finishDate,
    });
    for (const predecessorId of issue.predecessorIds) {
      relations.push({
        ...identity(`${predecessorId}->${issue.issueId}`),
        kind: "blocks",
        fromSourceId: predecessorId,
        toSourceId: issue.issueId,
      });
    }
  }

  for (const milestone of input.milestones) {
    rows.push({
      ...identity(milestone.id),
      table: "milestone",
      title: milestone.title,
      dueOn: milestone.dueOn,
    });
  }

  const versionsById = new Map(input.versions.map((version) => [version.versionId, version]));

  for (const document of input.documents) {
    if (!isFiledDocument(document, program.customerId, program.programId)) continue;
    const versionId = document.currentVersionId as string;
    const version = versionsById.get(versionId);
    if (!version || version.documentId !== document.documentId || version.status !== "stored") continue;

    const label = document.sourceLabel as SourceLabel;
    const table = entityTableForLabel(label);
    rows.push({
      ...identity(document.documentId),
      table,
      name: document.name,
      title: document.name,
      sourceLabel: label,
      versionId,
    });

    const bodies = chunkText(version.text, version.contentType, version.fileName);
    let index = 0;
    for (const body of bodies) {
      chunks.push({
        ...identity(document.documentId),
        // Tenant-scoped PK: avoids cross-tenant collisions on shared document ids.
        id: `${program.customerId}:${program.programId}:${document.documentId}:${versionId}:${index}`,
        sourceLabel: label,
        documentId: document.documentId,
        versionId,
        body,
        embedding: embed(body),
      });
      index += 1;
    }
  }

  return { rows, relations, chunks };
}

function isFiledDocument(
  document: IngestDocument,
  customerId: string,
  programId: string,
): document is IngestDocument & { sourceLabel: SourceLabel; currentVersionId: string } {
  if (document.deletedAt != null) return false;
  if (!document.currentVersionId) return false;
  if (document.projectId !== programId) return false;
  if (document.customerId !== customerId) return false;
  if (!document.sourceLabel || !LABEL_SET.has(document.sourceLabel)) return false;
  return true;
}

function entityTableForLabel(label: SourceLabel): "document" | "transcript" | "artifact" {
  if (label === "compass-upload") return "document";
  if (label === "krisp" || label === "fireflies") return "transcript";
  return "artifact";
}
