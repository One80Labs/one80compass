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

/** One comment copied from a Decision register record. */
export type IngestDecisionComment = {
  at: string;
  by: string;
  body: string;
};

/** One history event copied from a Decision register record. */
export type IngestDecisionHistoryEvent = {
  at: string;
  by: string;
  field: string;
  from: string | null;
  to: string | null;
};

/** Provenance copied when a register record has a source. */
export type IngestDecisionSource = {
  kind: string;
  quote: string;
  speaker: string;
  location: string;
  when: string | null;
  documentId: string | null;
};

/**
 * Decision register fields ingest copies. Matches Compass DecisionRecord for these keys.
 * sourceId on the vault row is decisionId, never the linked issue id.
 */
export type IngestDecision = {
  decisionId: string;
  projectId: string;
  customerId: string;
  kind: string;
  status: string;
  statement: string;
  raisedBy: string;
  raisedOn: string;
  assigneeIds: string[];
  neededFrom: string;
  targetDate: string | null;
  affects: string[];
  blocksWork: boolean;
  issueId: string | null;
  source: IngestDecisionSource | null;
  answer: string;
  outcome: string;
  rationale: string;
  decisionType: string | null;
  decidedBy: string | null;
  decidedOn: string | null;
  consulted: string;
  assumptions: string;
  whatWouldChange: string;
  doesNotMean: string;
  duplicateOfId: string | null;
  archiveReason: string;
  suggestionText: string | null;
  acceptedBy: string | null;
  comments: IngestDecisionComment[];
  history: IngestDecisionHistoryEvent[];
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
  /** Compass decision register rows for this program. Defaults to []. */
  decisions?: IngestDecision[];
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

  // Register rows are keyed by decisionId. An issue whose type is Decision stays a separate row.
  const acceptedDecisions = (input.decisions ?? []).filter(
    (decision) => decision.customerId === program.customerId && decision.projectId === program.programId,
  );
  const acceptedDecisionIds = new Set(acceptedDecisions.map((decision) => decision.decisionId));
  for (const decision of acceptedDecisions) {
    const body = decisionRegisterBody(decision);
    rows.push({
      ...identity(decision.decisionId),
      table: "decision",
      title: decision.statement,
      body,
      description: body,
    });
    if (decision.issueId) {
      relations.push({
        ...identity(`decided:${decision.decisionId}->${decision.issueId}`),
        kind: "decided",
        fromType: "decision",
        toType: "work_item",
        fromSourceId: decision.decisionId,
        toSourceId: decision.issueId,
      });
    }
    // A survivor that is not in this batch would be a dangling edge.
    if (decision.duplicateOfId && acceptedDecisionIds.has(decision.duplicateOfId)) {
      relations.push({
        ...identity(`supersedes:${decision.duplicateOfId}->${decision.decisionId}`),
        kind: "supersedes",
        fromType: "decision",
        toType: "decision",
        fromSourceId: decision.duplicateOfId,
        toSourceId: decision.decisionId,
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

/**
 * Plain-text body for one Decision register row.
 * Non-empty fields stay in register order, then a Comments section, a History section, and source lines.
 * Omit a section when it has no lines. Null history values render as "(empty)".
 */
export function decisionRegisterBody(decision: IngestDecision): string {
  const blocks: string[] = [];
  const fields = labeledLines([
    ["Kind", decision.kind],
    ["Status", decision.status],
    ["Statement", decision.statement],
    ["Raised by", decision.raisedBy],
    ["Raised on", decision.raisedOn],
    ["Assignees", joinList(decision.assigneeIds)],
    ["Needed from", decision.neededFrom],
    ["Target date", decision.targetDate],
    ["Affects", joinList(decision.affects)],
    ["Blocks work", decision.blocksWork ? "yes" : "no"],
    ["Work item", decision.issueId],
    ["Answer", decision.answer],
    ["Outcome", decision.outcome],
    ["Rationale", decision.rationale],
    ["Decision type", decision.decisionType],
    ["Decided by", decision.decidedBy],
    ["Decided on", decision.decidedOn],
    ["Consulted", decision.consulted],
    ["Assumptions", decision.assumptions],
    ["What would change", decision.whatWouldChange],
    ["Does not mean", decision.doesNotMean],
    ["Duplicate of", decision.duplicateOfId],
    ["Archive reason", decision.archiveReason],
    ["Suggestion", decision.suggestionText],
    ["Accepted by", decision.acceptedBy],
  ]);
  if (fields) blocks.push(fields);

  const comments = sectionLines(
    "Comments",
    (decision.comments ?? []).map((comment) => `- ${comment.at} ${comment.by}: ${comment.body}`),
  );
  if (comments) blocks.push(comments);

  const history = sectionLines(
    "History",
    (decision.history ?? []).map((event) => {
      const from = event.from == null ? "(empty)" : event.from;
      const to = event.to == null ? "(empty)" : event.to;
      return `- ${event.at} ${event.by} ${event.field}: ${from} -> ${to}`;
    }),
  );
  if (history) blocks.push(history);

  if (decision.source) {
    const source = labeledLines([
      ["Source kind", decision.source.kind],
      ["Quote", decision.source.quote],
      ["Speaker", decision.source.speaker],
      ["Location", decision.source.location],
      ["When", decision.source.when],
      ["Source document", decision.source.documentId],
    ]);
    if (source) blocks.push(source);
  }

  return blocks.join("\n\n");
}

function joinList(values: readonly string[] | null | undefined): string {
  return (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0).join(", ");
}

function labeledLines(pairs: ReadonlyArray<readonly [string, string | null | undefined]>): string {
  const lines: string[] = [];
  for (const [label, value] of pairs) {
    const text = (value ?? "").trim();
    if (!text) continue;
    lines.push(`${label}: ${text}`);
  }
  return lines.join("\n");
}

function sectionLines(title: string, lines: string[]): string {
  if (lines.length === 0) return "";
  return [title, ...lines].join("\n");
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
