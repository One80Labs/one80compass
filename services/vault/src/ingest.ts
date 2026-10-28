import { isAllowlisted, type AllowlistEntry } from "./allowlist";
import { chunkText } from "./chunk-text";
import { deterministicEmbed } from "./embed";
import {
  SOURCE_LABELS,
  type RelationKind,
  type SourceLabel,
  type VaultChunk,
  type VaultIdentity,
} from "./types";

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
  /** Assignees already on the issue; unique people become person rows. */
  assignees?: IngestAssignee[];
};

/** Assignee shape from Compass PlanIssue / GitHubUser. */
export type IngestAssignee = {
  id: string;
  login: string;
  name: string | null;
};

/** Risk register fields ingest needs. Matches Compass RiskRecord for these keys. */
export type IngestRisk = {
  riskId: string;
  title: string;
  description: string;
  notes: string;
  severity: string | null;
  issueId: string | null;
  dateCleared: string | null;
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
  /** Compass risk register rows for this program. Defaults to []. */
  risks?: IngestRisk[];
  documents: IngestDocument[];
  versions: IngestVersion[];
  /** Fixed timestamp so tests do not depend on the clock. */
  recordedAt: string;
  /** Defaults to deterministicEmbed. Production resolves Bedrock then passes numbers. */
  embed?: (text: string) => number[];
};

export type VaultEntityRow = VaultIdentity & {
  table: "program" | "work_item" | "milestone" | "risk" | "decision" | "person" | "document" | "transcript" | "artifact";
  title?: string;
  name?: string;
  description?: string | null;
  body?: string | null;
  status?: string;
  issueType?: string | null;
  startDate?: string | null;
  finishDate?: string | null;
  dueOn?: string | null;
  email?: string | null;
  /** Set on document, transcript, and artifact rows. */
  sourceLabel?: SourceLabel;
  versionId?: string;
};

export type VaultRelationRow = VaultIdentity & {
  kind: RelationKind;
  fromType: "work_item" | "risk" | "decision" | "person" | "milestone" | "program";
  toType: "work_item" | "risk" | "decision" | "person" | "milestone" | "program";
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
  const peopleById = new Map<string, IngestAssignee>();

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

    // Convention: Compass issueType named "Decision" (any case) also lands in decision.
    if (isDecisionIssueType(issue.issueType)) {
      rows.push({
        ...identity(issue.issueId),
        table: "decision",
        title: issue.title,
        body: issue.description,
        description: issue.description,
      });
    }

    for (const predecessorId of issue.predecessorIds) {
      relations.push({
        ...identity(`${predecessorId}->${issue.issueId}`),
        kind: "blocks",
        fromType: "work_item",
        toType: "work_item",
        fromSourceId: predecessorId,
        toSourceId: issue.issueId,
      });
    }

    for (const assignee of issue.assignees ?? []) {
      if (!assignee.id) continue;
      if (!peopleById.has(assignee.id)) peopleById.set(assignee.id, assignee);
      relations.push({
        ...identity(`assignee:${assignee.id}->${issue.issueId}`),
        kind: "part_of",
        fromType: "person",
        toType: "work_item",
        fromSourceId: assignee.id,
        toSourceId: issue.issueId,
      });
    }
  }

  for (const person of peopleById.values()) {
    rows.push({
      ...identity(person.id),
      table: "person",
      name: personName(person),
      email: null,
    });
  }

  for (const milestone of input.milestones) {
    rows.push({
      ...identity(milestone.id),
      table: "milestone",
      title: milestone.title,
      dueOn: milestone.dueOn,
    });
  }

  for (const risk of input.risks ?? []) {
    rows.push({
      ...identity(risk.riskId),
      table: "risk",
      title: risk.title,
      body: riskBody(risk),
      description: riskBody(risk),
    });
    // Linked successor / schedule issue: risk is about that work item.
    if (risk.issueId) {
      relations.push({
        ...identity(`risk:${risk.riskId}->${risk.issueId}`),
        kind: "part_of",
        fromType: "risk",
        toType: "work_item",
        fromSourceId: risk.riskId,
        toSourceId: risk.issueId,
      });
    }
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

/** Issues whose type name is exactly "Decision" (case-insensitive) become decision rows. */
export function isDecisionIssueType(issueType: string | null | undefined): boolean {
  return (issueType ?? "").trim().toLowerCase() === "decision";
}

function personName(person: IngestAssignee): string {
  const named = person.name?.trim();
  if (named) return named;
  const login = person.login?.trim();
  if (login) return login;
  return person.id;
}

function riskBody(risk: IngestRisk): string {
  const parts: string[] = [];
  if (risk.description.trim()) parts.push(risk.description.trim());
  if (risk.notes.trim()) parts.push(risk.notes.trim());
  if (risk.severity) parts.push(`Severity: ${risk.severity}`);
  if (risk.dateCleared) parts.push(`Cleared: ${risk.dateCleared}`);
  return parts.join("\n\n");
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
