/**
 * Decision Register records. One row is a question or the decision that question became.
 * suggestionText and acceptedBy are set when a person accepts a transcript suggestion.
 */

export type DecisionKind = "question" | "decision";
export type DecisionStatus = "outstanding" | "resolved" | "duplicate" | "archive";
/** Type 1 is hard to undo. Type 2 can be reversed. Only decisions carry a type. */
export type DecisionReversibility = "type1" | "type2";
export type DecisionAffect = "requirements" | "direction" | "timeline" | "functionality" | "resources";
export type DecisionSourceKind = "manual" | "document" | "email" | "transcript" | "teams";

export const DECISION_AFFECTS: DecisionAffect[] = ["requirements", "direction", "timeline", "functionality", "resources"];
export const DECISION_STATUSES: DecisionStatus[] = ["outstanding", "resolved", "duplicate", "archive"];

export type DecisionHistoryField =
  | "status"
  | "kind"
  | "assignee"
  | "targetDate"
  | "outcome"
  | "rationale"
  | "workItem"
  | "becameDecision";

export type DecisionHistoryEvent = {
  at: string;
  by: string;
  field: DecisionHistoryField;
  from: string | null;
  to: string | null;
};

export type DecisionComment = {
  commentId: string;
  at: string;
  by: string;
  body: string;
};

export type DecisionSource = {
  kind: DecisionSourceKind;
  quote: string;
  speaker: string;
  location: string;
  /** ISO-8601 when the remark was made. */
  when: string | null;
  documentId: string | null;
};

export type DecisionRecord = {
  decisionId: string;
  projectId: string;
  customerId: string;
  kind: DecisionKind;
  status: DecisionStatus;
  statement: string;
  raisedBy: string;
  /** YYYY-MM-DD. */
  raisedOn: string;
  assigneeIds: string[];
  neededFrom: string;
  /** YYYY-MM-DD. Answer or decide by this date. */
  targetDate: string | null;
  affects: DecisionAffect[];
  blocksWork: boolean;
  /** One Epic, Feature, or Task. */
  issueId: string | null;
  source: DecisionSource | null;
  /** Answer text. Used while kind is question. */
  answer: string;
  outcome: string;
  rationale: string;
  decisionType: DecisionReversibility | null;
  decidedBy: string | null;
  /** YYYY-MM-DD. */
  decidedOn: string | null;
  consulted: string;
  assumptions: string;
  whatWouldChange: string;
  doesNotMean: string;
  duplicateOfId: string | null;
  archiveReason: string;
  /** Original suggested wording, kept when a person edits it. Empty until the suggestion inbox exists. */
  suggestionText: string | null;
  acceptedBy: string | null;
  comments: DecisionComment[];
  history: DecisionHistoryEvent[];
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
};

const KINDS = new Set<DecisionKind>(["question", "decision"]);
const STATUSES = new Set<DecisionStatus>(DECISION_STATUSES);
const TYPES = new Set<DecisionReversibility>(["type1", "type2"]);
const AFFECTS = new Set<DecisionAffect>(DECISION_AFFECTS);
const SOURCE_KINDS = new Set<DecisionSourceKind>(["manual", "document", "email", "transcript", "teams"]);

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function decisionAffectsFromStore(value: unknown): DecisionAffect[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is DecisionAffect => typeof item === "string" && AFFECTS.has(item as DecisionAffect));
}

function historyFromStore(value: unknown): DecisionHistoryEvent[] {
  if (!Array.isArray(value)) return [];
  const fields = new Set<DecisionHistoryField>(["status", "kind", "assignee", "targetDate", "outcome", "rationale", "workItem", "becameDecision"]);
  const events: DecisionHistoryEvent[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.at !== "string" || typeof row.by !== "string" || typeof row.field !== "string" || !fields.has(row.field as DecisionHistoryField)) continue;
    events.push({
      at: row.at,
      by: row.by,
      field: row.field as DecisionHistoryField,
      from: typeof row.from === "string" ? row.from : null,
      to: typeof row.to === "string" ? row.to : null,
    });
  }
  return events;
}

function commentsFromStore(value: unknown): DecisionComment[] {
  if (!Array.isArray(value)) return [];
  const comments: DecisionComment[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    if (typeof row.commentId !== "string" || typeof row.at !== "string" || typeof row.by !== "string" || typeof row.body !== "string") continue;
    comments.push({ commentId: row.commentId, at: row.at, by: row.by, body: row.body });
  }
  return comments;
}

function sourceFromStore(value: unknown): DecisionSource | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.kind !== "string" || !SOURCE_KINDS.has(row.kind as DecisionSourceKind)) return null;
  return {
    kind: row.kind as DecisionSourceKind,
    quote: typeof row.quote === "string" ? row.quote : "",
    speaker: typeof row.speaker === "string" ? row.speaker : "",
    location: typeof row.location === "string" ? row.location : "",
    when: typeof row.when === "string" ? row.when : null,
    documentId: typeof row.documentId === "string" ? row.documentId : null,
  };
}

/** Reads a stored row. Returns null when the identity fields are missing. */
export function decisionFromStore(value: unknown): DecisionRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.decisionId !== "string" || typeof row.projectId !== "string" || typeof row.customerId !== "string") return null;
  if (typeof row.statement !== "string" || typeof row.kind !== "string" || !KINDS.has(row.kind as DecisionKind)) return null;
  const status = typeof row.status === "string" && STATUSES.has(row.status as DecisionStatus) ? (row.status as DecisionStatus) : "outstanding";
  const decisionType = typeof row.decisionType === "string" && TYPES.has(row.decisionType as DecisionReversibility) ? (row.decisionType as DecisionReversibility) : null;
  return {
    decisionId: row.decisionId,
    projectId: row.projectId,
    customerId: row.customerId,
    kind: row.kind as DecisionKind,
    status,
    statement: row.statement,
    raisedBy: typeof row.raisedBy === "string" ? row.raisedBy : "",
    raisedOn: typeof row.raisedOn === "string" ? row.raisedOn : "",
    assigneeIds: Array.isArray(row.assigneeIds) ? row.assigneeIds.filter((id): id is string => typeof id === "string") : [],
    neededFrom: typeof row.neededFrom === "string" ? row.neededFrom : "",
    targetDate: typeof row.targetDate === "string" && isIsoDate(row.targetDate) ? row.targetDate : null,
    affects: decisionAffectsFromStore(row.affects),
    blocksWork: row.blocksWork === true,
    issueId: typeof row.issueId === "string" ? row.issueId : null,
    source: sourceFromStore(row.source),
    answer: typeof row.answer === "string" ? row.answer : "",
    outcome: typeof row.outcome === "string" ? row.outcome : "",
    rationale: typeof row.rationale === "string" ? row.rationale : "",
    decisionType: row.kind === "decision" ? decisionType : null,
    decidedBy: typeof row.decidedBy === "string" ? row.decidedBy : null,
    decidedOn: typeof row.decidedOn === "string" && isIsoDate(row.decidedOn) ? row.decidedOn : null,
    consulted: typeof row.consulted === "string" ? row.consulted : "",
    assumptions: typeof row.assumptions === "string" ? row.assumptions : "",
    whatWouldChange: typeof row.whatWouldChange === "string" ? row.whatWouldChange : "",
    doesNotMean: typeof row.doesNotMean === "string" ? row.doesNotMean : "",
    duplicateOfId: typeof row.duplicateOfId === "string" ? row.duplicateOfId : null,
    archiveReason: typeof row.archiveReason === "string" ? row.archiveReason : "",
    suggestionText: typeof row.suggestionText === "string" ? row.suggestionText : null,
    acceptedBy: typeof row.acceptedBy === "string" ? row.acceptedBy : null,
    comments: commentsFromStore(row.comments),
    history: historyFromStore(row.history),
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
    updatedBy: typeof row.updatedBy === "string" ? row.updatedBy : "",
  };
}

/** Outstanding and the target date is before today (YYYY-MM-DD). */
export function decisionIsOverdue(record: DecisionRecord, today: string): boolean {
  return record.status === "outstanding" && record.targetDate != null && record.targetDate < today;
}

/** Outstanding and marked as blocking the linked work. */
export function decisionIsBlocking(record: DecisionRecord): boolean {
  return record.status === "outstanding" && record.blocksWork;
}

export function decisionCounts(records: DecisionRecord[], today: string): { outstanding: number; overdue: number; blocking: number } {
  let outstanding = 0;
  let overdue = 0;
  let blocking = 0;
  for (const record of records) {
    if (record.status !== "outstanding") continue;
    outstanding += 1;
    if (decisionIsOverdue(record, today)) overdue += 1;
    if (decisionIsBlocking(record)) blocking += 1;
  }
  return { outstanding, overdue, blocking };
}
