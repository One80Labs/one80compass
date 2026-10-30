import { canAccessProject, canWriteProject, isPlatformAdmin, type Principal } from "../../../packages/authz/src/index";
import {
  DECISION_AFFECTS,
  isIsoDate,
  type DecisionAffect,
  type DecisionComment,
  type DecisionHistoryEvent,
  type DecisionKind,
  type DecisionRecord,
  type DecisionReversibility,
  type DecisionSource,
  type DecisionSourceKind,
} from "../../../packages/domain/src/decisions";
import { parseSuggestionMarks, suggestionIsAcceptable, type ParsedSuggestion, type SuggestionMark } from "../../../packages/domain/src/suggestions";
import type { VaultChunk } from "../../vault/src/types";
import type { HandlerDeps, HttpResult } from "./router";

type DecisionCtx = {
  deps: HandlerDeps;
  principal: Principal;
  method: string;
  path: string;
  body: Record<string, unknown>;
  correlationId: string;
};

type Fields = {
  statement?: string;
  kind?: DecisionKind;
  raisedBy?: string;
  raisedOn?: string;
  assigneeIds?: string[];
  neededFrom?: string;
  targetDate?: string | null;
  affects?: DecisionAffect[];
  blocksWork?: boolean;
  issueId?: string | null;
  source?: DecisionSource | null;
  answer?: string;
  outcome?: string;
  rationale?: string;
  decidedBy?: string | null;
  decidedOn?: string | null;
  consulted?: string;
  assumptions?: string;
  whatWouldChange?: string;
  doesNotMean?: string;
};

type Collected = {
  fields: Fields;
  /** Absent when the client omitted decisionType. Invalid is rejected only on a decision. */
  decisionType: "absent" | "invalid" | DecisionReversibility | null;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const TEXT_MAX = 8000;
const AFFECTS = new Set<DecisionAffect>(DECISION_AFFECTS);
const SOURCE_KINDS = new Set<DecisionSourceKind>(["manual", "document", "email", "transcript", "teams"]);
const TEXT_KEYS = [
  ["raisedBy", "Raised by"],
  ["neededFrom", "Needed from"],
  ["answer", "Answer"],
  ["outcome", "Outcome"],
  ["rationale", "Rationale"],
  ["consulted", "Consulted"],
  ["assumptions", "Assumptions"],
  ["whatWouldChange", "What would change"],
  ["doesNotMean", "Does not mean"],
] as const;

/**
 * Decision register routes. Returns null when the path is not one of them
 * so the main router can keep dispatching.
 */
export async function handleDecisions(ctx: DecisionCtx): Promise<HttpResult | null> {
  const accepted = ctx.path.match(/^\/projects\/([^/]+)\/decision-suggestions\/([^/]+)\/accept$/);
  if (accepted && ctx.method === "POST") return acceptSuggestion(ctx, decodeURIComponent(accepted[1]), decodeURIComponent(accepted[2]));
  const dismissed = ctx.path.match(/^\/projects\/([^/]+)\/decision-suggestions\/([^/]+)\/dismiss$/);
  if (dismissed && ctx.method === "POST") return dismissSuggestion(ctx, decodeURIComponent(dismissed[1]), decodeURIComponent(dismissed[2]));
  const suggestions = ctx.path.match(/^\/projects\/([^/]+)\/decision-suggestions$/);
  if (suggestions && ctx.method === "GET") return listSuggestions(ctx, decodeURIComponent(suggestions[1]));
  const comment = ctx.path.match(/^\/projects\/([^/]+)\/decisions\/([^/]+)\/comments$/);
  if (comment && ctx.method === "POST") return addComment(ctx, decodeURIComponent(comment[1]), decodeURIComponent(comment[2]));
  const duplicate = ctx.path.match(/^\/projects\/([^/]+)\/decisions\/([^/]+)\/duplicate$/);
  if (duplicate && ctx.method === "POST") return markDuplicate(ctx, decodeURIComponent(duplicate[1]), decodeURIComponent(duplicate[2]));
  const archive = ctx.path.match(/^\/projects\/([^/]+)\/decisions\/([^/]+)\/archive$/);
  if (archive && ctx.method === "POST") return archiveDecision(ctx, decodeURIComponent(archive[1]), decodeURIComponent(archive[2]));
  const one = ctx.path.match(/^\/projects\/([^/]+)\/decisions\/([^/]+)$/);
  if (one && ctx.method === "PATCH") return patchDecision(ctx, decodeURIComponent(one[1]), decodeURIComponent(one[2]));
  const list = ctx.path.match(/^\/projects\/([^/]+)\/decisions$/);
  if (list && ctx.method === "GET") return getDecisions(ctx, decodeURIComponent(list[1]));
  if (list && ctx.method === "POST") return createDecision(ctx, decodeURIComponent(list[1]));
  return null;
}

async function getDecisions(ctx: DecisionCtx, projectId: string): Promise<HttpResult> {
  const project = await readable(ctx, projectId);
  if (!project) return notFound(ctx.correlationId);
  const decisions = await ctx.deps.store.listDecisions(projectId);
  return json(200, { decisions }, ctx.correlationId);
}

async function createDecision(ctx: DecisionCtx, projectId: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  if (!opened) return notFound(ctx.correlationId);
  // Duplicate and archive have their own routes. A new row is outstanding.
  if (ctx.body.status !== undefined && ctx.body.status !== "outstanding") {
    return validation(ctx.correlationId, "New rows start as outstanding.");
  }
  const collected = await collectInputs(ctx, projectId);
  if (!collected.ok) return validation(ctx.correlationId, collected.message);
  const { fields, decisionType: sentType } = collected.value;
  if (!fields.statement) return validation(ctx.correlationId, "A statement is required.");
  if (!fields.kind) return validation(ctx.correlationId, "kind must be question or decision.");
  const decisionType = resolveDecisionType(fields.kind, sentType, null);
  if (decisionType === "invalid") return validation(ctx.correlationId, "decisionType must be type1 or type2.");
  const at = ctx.deps.now().toISOString();
  const record = createdRecord(ctx, opened.customerId, projectId, fields, fields.kind, decisionType, at);
  await ctx.deps.store.putDecision(record);
  return json(201, { decision: record }, ctx.correlationId);
}

async function patchDecision(ctx: DecisionCtx, projectId: string, decisionId: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  if (!opened) return notFound(ctx.correlationId);
  const existing = await loadDecision(ctx, projectId, decisionId);
  if (!existing) return notFound(ctx.correlationId);
  const statusRead = readPatchStatus(ctx.body.status);
  if (statusRead === "blocked") return validation(ctx.correlationId, "Archive and duplicate use their own actions.");
  if (statusRead === "invalid") return validation(ctx.correlationId, "status must be outstanding or resolved.");
  const collected = await collectInputs(ctx, projectId);
  if (!collected.ok) return validation(ctx.correlationId, collected.message);
  const { fields, decisionType: sentType } = collected.value;
  const nextKind = fields.kind ?? existing.kind;
  // One row for the life of the item. Promoting keeps this id and records becameDecision.
  // A decision cannot go back to a question.
  if (existing.kind === "decision" && nextKind === "question") {
    return validation(ctx.correlationId, "A decision cannot become a question.");
  }
  const decisionType = resolveDecisionType(nextKind, sentType, existing.decisionType);
  if (decisionType === "invalid") return validation(ctx.correlationId, "decisionType must be type1 or type2.");
  const at = ctx.deps.now().toISOString();
  const by = ctx.principal.userId;
  const nextStatus = statusRead === "absent" ? existing.status : statusRead;
  const next = applyPatch(existing, fields, nextKind, nextStatus, decisionType, at, by);
  await ctx.deps.store.putDecision(next);
  return json(200, { decision: next }, ctx.correlationId);
}

async function addComment(ctx: DecisionCtx, projectId: string, decisionId: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  if (!opened) return notFound(ctx.correlationId);
  const existing = await loadDecision(ctx, projectId, decisionId);
  if (!existing) return notFound(ctx.correlationId);
  const text = typeof ctx.body.body === "string" ? ctx.body.body.trim() : "";
  if (!text) return validation(ctx.correlationId, "A comment is required.");
  if (text.length > TEXT_MAX) return validation(ctx.correlationId, `A comment must be ${TEXT_MAX} characters or fewer.`);
  const at = ctx.deps.now().toISOString();
  // Comments stay on the decision. They do not create a plan issue.
  const comment: DecisionComment = { commentId: ctx.deps.newId(), at, by: ctx.principal.userId, body: text };
  const next: DecisionRecord = {
    ...existing,
    comments: [...existing.comments, comment],
    updatedAt: at,
    updatedBy: ctx.principal.userId,
  };
  await ctx.deps.store.putDecision(next);
  return json(200, { decision: next }, ctx.correlationId);
}

async function markDuplicate(ctx: DecisionCtx, projectId: string, decisionId: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  if (!opened) return notFound(ctx.correlationId);
  const rows = await ctx.deps.store.listDecisions(projectId);
  const existing = rows.find((row) => row.decisionId === decisionId) ?? null;
  if (!existing) return notFound(ctx.correlationId);
  const duplicateOfId = typeof ctx.body.duplicateOfId === "string" ? ctx.body.duplicateOfId.trim() : "";
  if (!duplicateOfId) return validation(ctx.correlationId, "duplicateOfId is required.");
  // The survivor is a different row on this same project.
  if (duplicateOfId === decisionId) return validation(ctx.correlationId, "A row cannot be a duplicate of itself.");
  if (!rows.some((row) => row.decisionId === duplicateOfId)) {
    return validation(ctx.correlationId, "The surviving item must be on this project.");
  }
  const at = ctx.deps.now().toISOString();
  const by = ctx.principal.userId;
  const draft: DecisionRecord = { ...existing, status: "duplicate", duplicateOfId, updatedAt: at, updatedBy: by };
  const next: DecisionRecord = { ...draft, history: [...existing.history, ...historyFor(existing, draft, at, by)] };
  await ctx.deps.store.putDecision(next);
  return json(200, { decision: next }, ctx.correlationId);
}

async function archiveDecision(ctx: DecisionCtx, projectId: string, decisionId: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  if (!opened) return notFound(ctx.correlationId);
  const existing = await loadDecision(ctx, projectId, decisionId);
  if (!existing) return notFound(ctx.correlationId);
  // Contributors can edit, comment, resolve, and mark duplicates. Archive is platform-admin only.
  if (!isPlatformAdmin(ctx.principal)) {
    return json(403, { code: "FORBIDDEN", message: "Administrator access is required.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  const reason = typeof ctx.body.reason === "string" ? ctx.body.reason.trim() : "";
  if (!reason) return validation(ctx.correlationId, "A reason is required to archive.");
  if (reason.length > TEXT_MAX) return validation(ctx.correlationId, `A reason must be ${TEXT_MAX} characters or fewer.`);
  const at = ctx.deps.now().toISOString();
  const by = ctx.principal.userId;
  const draft: DecisionRecord = { ...existing, status: "archive", archiveReason: reason, updatedAt: at, updatedBy: by };
  const next: DecisionRecord = { ...draft, history: [...existing.history, ...historyFor(existing, draft, at, by)] };
  await ctx.deps.store.putDecision(next);
  return json(200, { decision: next }, ctx.correlationId);
}

/**
 * Missing projects and projects the caller cannot open both look like 404.
 * View can read. The caller turns "view" into a 403 before writing.
 */
async function readable(ctx: DecisionCtx, projectId: string) {
  const project = await ctx.deps.store.getProject(projectId);
  if (!project) return null;
  const memberships = await ctx.deps.store.listMembershipsForUser(ctx.principal.userId);
  if (!canAccessProject(ctx.principal, project, memberships)) return null;
  return project;
}

async function openForWrite(ctx: DecisionCtx, projectId: string) {
  const project = await readable(ctx, projectId);
  if (!project) return null;
  const memberships = await ctx.deps.store.listMembershipsForUser(ctx.principal.userId);
  if (!canWriteProject(ctx.principal, project, memberships)) return "view" as const;
  return project;
}

async function loadDecision(ctx: DecisionCtx, projectId: string, decisionId: string): Promise<DecisionRecord | null> {
  const rows = await ctx.deps.store.listDecisions(projectId);
  return rows.find((row) => row.decisionId === decisionId) ?? null;
}

type OpenSuggestion = ParsedSuggestion & {
  issueId: string | null;
  assigneeIds: string[];
  documentName: string;
};

async function listSuggestions(ctx: DecisionCtx, projectId: string): Promise<HttpResult> {
  const project = await readable(ctx, projectId);
  if (!project) return notFound(ctx.correlationId);
  const open = await openSuggestions(ctx, project.customerId, projectId, project.projectKey);
  return json(200, { suggestions: open.suggestions.map(suggestionResponse), transcripts: open.transcripts }, ctx.correlationId);
}

async function acceptSuggestion(ctx: DecisionCtx, projectId: string, suggestionId: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  if (!opened) return notFound(ctx.correlationId);
  const open = await openSuggestions(ctx, opened.customerId, projectId, opened.projectKey);
  const suggestion = open.suggestions.find((item) => item.suggestionId === suggestionId);
  if (!suggestion) return notFound(ctx.correlationId, "That suggestion is not in the inbox.");
  if (!suggestionIsAcceptable(suggestion.mark)) return validation(ctx.correlationId, blockedMarkMessage(suggestion.mark));

  let statement = suggestion.quote;
  if (ctx.body.statement !== undefined) {
    const read = textField(ctx.body.statement, "Statement");
    if (!read.ok) return validation(ctx.correlationId, read.message);
    statement = read.value;
  }
  if (!statement.trim()) return validation(ctx.correlationId, "A statement is required.");
  const kind = ctx.body.kind === undefined ? suggestion.kind : ctx.body.kind === "question" || ctx.body.kind === "decision" ? ctx.body.kind : null;
  if (!kind) return validation(ctx.correlationId, "kind must be question or decision.");
  const issue = ctx.body.issueId === undefined ? { ok: true as const, value: suggestion.issueId } : await readIssueId(ctx, projectId, ctx.body.issueId);
  if (!issue.ok) return validation(ctx.correlationId, issue.message);
  const assignees = ctx.body.assigneeIds === undefined ? { ok: true as const, value: suggestion.assigneeIds } : readAssignees(ctx.body.assigneeIds);
  if (!assignees.ok) return validation(ctx.correlationId, assignees.message);
  const target = ctx.body.targetDate === undefined ? { ok: true as const, value: suggestion.targetDate } : readNullableDate(ctx.body.targetDate, "Target date");
  if (!target.ok) return validation(ctx.correlationId, target.message);

  const document = await ctx.deps.store.getDocument(suggestion.documentId);
  const documentId = document && document.projectId === projectId ? document.documentId : null;
  const at = ctx.deps.now().toISOString();
  const record = createdRecord(
    ctx,
    opened.customerId,
    projectId,
    {
      statement: statement.trim(),
      kind,
      raisedBy: ctx.principal.userId,
      raisedOn: at.slice(0, 10),
      assigneeIds: assignees.value,
      targetDate: target.value,
      issueId: issue.value,
      source: {
        kind: "transcript",
        quote: suggestion.quote,
        speaker: suggestion.speaker,
        location: suggestion.location,
        when: null,
        documentId,
      },
    },
    kind,
    null,
    at,
  );
  record.suggestionText = suggestion.quote;
  record.acceptedBy = ctx.principal.userId;
  await ctx.deps.store.putDecision(record);
  const ledger = await ctx.deps.store.getSuggestionLedger(projectId);
  await ctx.deps.store.putSuggestionLedger(projectId, {
    acceptedIds: [...ledger.acceptedIds, suggestionId],
    dismissedIds: ledger.dismissedIds,
  });
  return json(201, { decision: record }, ctx.correlationId);
}

async function dismissSuggestion(ctx: DecisionCtx, projectId: string, suggestionId: string): Promise<HttpResult> {
  const opened = await openForWrite(ctx, projectId);
  if (opened === "view") return viewOnly(ctx.correlationId);
  if (!opened) return notFound(ctx.correlationId);
  const open = await openSuggestions(ctx, opened.customerId, projectId, opened.projectKey);
  if (!open.suggestions.some((item) => item.suggestionId === suggestionId)) return notFound(ctx.correlationId, "That suggestion is not in the inbox.");
  const ledger = await ctx.deps.store.getSuggestionLedger(projectId);
  await ctx.deps.store.putSuggestionLedger(projectId, {
    acceptedIds: ledger.acceptedIds,
    dismissedIds: [...ledger.dismissedIds, suggestionId],
  });
  return json(200, { suggestionId }, ctx.correlationId);
}

function suggestionResponse(suggestion: OpenSuggestion) {
  return {
    suggestionId: suggestion.suggestionId,
    documentId: suggestion.documentId,
    documentName: suggestion.documentName,
    quote: suggestion.quote,
    kind: suggestion.kind,
    mark: suggestion.mark,
    acceptable: suggestionIsAcceptable(suggestion.mark),
    issueId: suggestion.issueId,
    workLabel: suggestion.workLabel,
    assigneeIds: suggestion.assigneeIds,
    assigneeLabel: suggestion.assigneeLabel,
    targetDate: suggestion.targetDate,
    speaker: suggestion.speaker,
    location: suggestion.location,
  };
}

function blockedMarkMessage(mark: SuggestionMark): string {
  if (mark === "hypothetical") return "This remark is hypothetical. It cannot be accepted as a commitment.";
  if (mark === "rejected") return "This remark was already rejected. It cannot be accepted as a commitment.";
  return "This remark was only discussed. It cannot be accepted as a commitment.";
}

type TranscriptAvailability = "ready" | "unavailable" | "not_ingested";

async function openSuggestions(
  ctx: DecisionCtx,
  customerId: string,
  projectId: string,
  projectKey: string | null,
): Promise<{ suggestions: OpenSuggestion[]; transcripts: TranscriptAvailability }> {
  const [ledger, documents, issues, settings, memberships, loaded] = await Promise.all([
    ctx.deps.store.getSuggestionLedger(projectId),
    ctx.deps.store.listDocuments(projectId),
    ctx.deps.store.listIssues(projectId),
    ctx.deps.store.getSettings(projectId),
    ctx.deps.store.listMembershipsForCustomer(customerId),
    transcriptText(ctx, customerId, projectId),
  ]);
  const texts = loaded.texts;
  const transcripts: TranscriptAvailability =
    loaded.availability === "ready" && texts.size === 0 && documents.some(isFiledTranscript) ? "not_ingested" : loaded.availability;
  const closed = new Set([...ledger.acceptedIds, ...ledger.dismissedIds]);
  const names = new Map(documents.map((document) => [document.documentId, document.name]));
  const works = issues
    .filter((issue) => !issue.deletedAt && !issue.archived)
    .map((issue) => ({ issueId: issue.issueId, title: issue.title, keyNumber: issue.keyNumber }));
  const people = [
    ...memberships.map((member) => ({ id: member.userId, labels: [member.name, member.email] })),
    ...(settings?.assignableUsers ?? []).map((user) => ({ id: user.id, labels: [user.name ?? "", user.login] })),
  ];
  const open: OpenSuggestion[] = [];
  for (const [documentId, text] of texts) {
    for (const mark of parseSuggestionMarks(documentId, text)) {
      if (closed.has(mark.suggestionId)) continue;
      open.push({
        ...mark,
        issueId: matchIssue(mark.workLabel, projectKey, works),
        assigneeIds: matchPeople(mark.assigneeLabel, people),
        documentName: names.get(documentId) ?? "",
      });
    }
  }
  return { suggestions: open, transcripts };
}

/** Krisp or Fireflies file with a stored version. Deleted files are not waiting on ingest. */
function isFiledTranscript(document: { sourceLabel: string | null; deletedAt: string | null; currentVersionId: string | null }): boolean {
  if (document.deletedAt || !document.currentVersionId) return false;
  return document.sourceLabel === "krisp" || document.sourceLabel === "fireflies";
}

async function transcriptText(
  ctx: DecisionCtx,
  customerId: string,
  projectId: string,
): Promise<{ texts: Map<string, string>; availability: TranscriptAvailability }> {
  const load = ctx.deps.loadVaultChunks;
  if (!load) return { texts: new Map(), availability: "unavailable" };
  let chunks: VaultChunk[] = [];
  try {
    chunks = await load(customerId, projectId);
  } catch {
    return { texts: new Map(), availability: "unavailable" };
  }
  const grouped = new Map<string, VaultChunk[]>();
  for (const chunk of chunks) {
    if (chunk.customerId !== customerId || chunk.programId !== projectId) continue;
    if (chunk.sourceLabel !== "krisp" && chunk.sourceLabel !== "fireflies") continue;
    const list = grouped.get(chunk.documentId) ?? [];
    list.push(chunk);
    grouped.set(chunk.documentId, list);
  }
  const texts = new Map<string, string>();
  for (const [documentId, list] of grouped) {
    list.sort((left, right) => chunkIndex(left.id) - chunkIndex(right.id));
    texts.set(documentId, list.map((chunk) => chunk.body).join("\n"));
  }
  return { texts, availability: "ready" };
}

function chunkIndex(id: string): number {
  const last = id.split(":").pop() ?? "";
  const index = Number(last);
  return Number.isInteger(index) ? index : 0;
}

function matchIssue(
  label: string,
  projectKey: string | null,
  issues: { issueId: string; title: string; keyNumber: number | null }[],
): string | null {
  const text = label.trim();
  if (!text) return null;
  const key = projectKey?.trim();
  if (key) {
    const match = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i").exec(text);
    if (match) {
      const number = Number(match[1]);
      const found = issues.find((issue) => issue.keyNumber === number);
      if (found) return found.issueId;
    }
  }
  const titled = issues.find((issue) => issue.title.trim().toLowerCase() === text.toLowerCase());
  return titled?.issueId ?? null;
}

function matchPeople(label: string, people: { id: string; labels: string[] }[]): string[] {
  const text = label.trim().toLowerCase();
  if (!text) return [];
  const ids: string[] = [];
  for (const person of people) {
    if (person.labels.some((item) => item.trim().toLowerCase() === text) && !ids.includes(person.id)) ids.push(person.id);
  }
  return ids;
}

function createdRecord(
  ctx: DecisionCtx,
  customerId: string,
  projectId: string,
  fields: Fields,
  kind: DecisionKind,
  decisionType: DecisionReversibility | null,
  at: string,
): DecisionRecord {
  return {
    decisionId: ctx.deps.newId(),
    projectId,
    customerId,
    kind,
    status: "outstanding",
    statement: fields.statement ?? "",
    raisedBy: fields.raisedBy ?? "",
    raisedOn: fields.raisedOn ?? "",
    assigneeIds: [...(fields.assigneeIds ?? [])],
    neededFrom: fields.neededFrom ?? "",
    targetDate: fields.targetDate ?? null,
    affects: [...(fields.affects ?? [])],
    blocksWork: fields.blocksWork ?? false,
    issueId: fields.issueId ?? null,
    source: fields.source ?? null,
    answer: fields.answer ?? "",
    outcome: fields.outcome ?? "",
    rationale: fields.rationale ?? "",
    decisionType,
    decidedBy: fields.decidedBy ?? null,
    decidedOn: fields.decidedOn ?? null,
    consulted: fields.consulted ?? "",
    assumptions: fields.assumptions ?? "",
    whatWouldChange: fields.whatWouldChange ?? "",
    doesNotMean: fields.doesNotMean ?? "",
    duplicateOfId: null,
    archiveReason: "",
    suggestionText: null,
    acceptedBy: null,
    comments: [],
    history: [],
    createdAt: at,
    updatedAt: at,
    updatedBy: ctx.principal.userId,
  };
}

function applyPatch(
  existing: DecisionRecord,
  fields: Fields,
  kind: DecisionKind,
  status: DecisionRecord["status"],
  decisionType: DecisionReversibility | null,
  at: string,
  by: string,
): DecisionRecord {
  const draft: DecisionRecord = {
    ...existing,
    statement: fields.statement ?? existing.statement,
    kind,
    status,
    raisedBy: fields.raisedBy ?? existing.raisedBy,
    raisedOn: fields.raisedOn ?? existing.raisedOn,
    assigneeIds: [...(fields.assigneeIds ?? existing.assigneeIds)],
    neededFrom: fields.neededFrom ?? existing.neededFrom,
    // Null clears a date or link. A missing key keeps the stored value.
    targetDate: "targetDate" in fields ? (fields.targetDate ?? null) : existing.targetDate,
    affects: [...(fields.affects ?? existing.affects)],
    blocksWork: fields.blocksWork ?? existing.blocksWork,
    issueId: "issueId" in fields ? (fields.issueId ?? null) : existing.issueId,
    source: "source" in fields ? (fields.source ?? null) : existing.source,
    answer: fields.answer ?? existing.answer,
    outcome: fields.outcome ?? existing.outcome,
    rationale: fields.rationale ?? existing.rationale,
    decisionType,
    decidedBy: "decidedBy" in fields ? (fields.decidedBy ?? null) : existing.decidedBy,
    decidedOn: "decidedOn" in fields ? (fields.decidedOn ?? null) : existing.decidedOn,
    consulted: fields.consulted ?? existing.consulted,
    assumptions: fields.assumptions ?? existing.assumptions,
    whatWouldChange: fields.whatWouldChange ?? existing.whatWouldChange,
    doesNotMean: fields.doesNotMean ?? existing.doesNotMean,
    updatedAt: at,
    updatedBy: by,
  };
  return { ...draft, history: [...existing.history, ...historyFor(existing, draft, at, by)] };
}

/**
 * History field names are not always the record names.
 * Assignee ids are joined with a comma. The work-item link is field "workItem".
 * Question → decision is "becameDecision", not "kind", and keeps the same id.
 * Status changes from resolve, duplicate, and archive all go through here.
 */
function historyFor(before: DecisionRecord, after: DecisionRecord, at: string, by: string): DecisionHistoryEvent[] {
  const events: DecisionHistoryEvent[] = [];
  if (before.status !== after.status) events.push({ field: "status", from: before.status, to: after.status, at, by });
  if (before.kind === "question" && after.kind === "decision") {
    events.push({ field: "becameDecision", from: "question", to: "decision", at, by });
  }
  const fromAssignees = before.assigneeIds.join(",");
  const toAssignees = after.assigneeIds.join(",");
  if (fromAssignees !== toAssignees) events.push({ field: "assignee", from: fromAssignees, to: toAssignees, at, by });
  if (before.targetDate !== after.targetDate) events.push({ field: "targetDate", from: before.targetDate, to: after.targetDate, at, by });
  if (before.outcome !== after.outcome) events.push({ field: "outcome", from: before.outcome, to: after.outcome, at, by });
  if (before.rationale !== after.rationale) events.push({ field: "rationale", from: before.rationale, to: after.rationale, at, by });
  if (before.issueId !== after.issueId) events.push({ field: "workItem", from: before.issueId, to: after.issueId, at, by });
  return events;
}

/**
 * Questions never store a reversibility type, even when the client sent one.
 * Decisions may be type1, type2, or null.
 */
function resolveDecisionType(
  kind: DecisionKind,
  sent: Collected["decisionType"],
  current: DecisionReversibility | null,
): DecisionReversibility | null | "invalid" {
  if (kind === "question") return null;
  if (sent === "invalid") return "invalid";
  if (sent === "absent") return current;
  return sent;
}

async function collectInputs(ctx: DecisionCtx, projectId: string): Promise<Parsed<Collected>> {
  const body = ctx.body;
  const fields: Fields = {};

  if (body.statement !== undefined) {
    const read = textField(body.statement, "Statement");
    if (!read.ok) return read;
    if (!read.value) return fail("A statement is required.");
    fields.statement = read.value;
  }

  if (body.kind !== undefined) {
    if (body.kind !== "question" && body.kind !== "decision") return fail("kind must be question or decision.");
    fields.kind = body.kind;
  }

  for (const [key, label] of TEXT_KEYS) {
    if (body[key] === undefined) continue;
    const read = textField(body[key], label);
    if (!read.ok) return read;
    fields[key] = read.value;
  }

  if (body.raisedOn !== undefined) {
    const read = readRaisedOn(body.raisedOn);
    if (!read.ok) return read;
    fields.raisedOn = read.value;
  }
  if (body.targetDate !== undefined) {
    const read = readNullableDate(body.targetDate, "targetDate");
    if (!read.ok) return read;
    fields.targetDate = read.value;
  }
  if (body.decidedOn !== undefined) {
    const read = readNullableDate(body.decidedOn, "decidedOn");
    if (!read.ok) return read;
    fields.decidedOn = read.value;
  }
  if (body.assigneeIds !== undefined) {
    const read = readAssignees(body.assigneeIds);
    if (!read.ok) return read;
    fields.assigneeIds = read.value;
  }
  if (body.affects !== undefined) {
    const read = readAffects(body.affects);
    if (!read.ok) return read;
    fields.affects = read.value;
  }
  if (body.blocksWork !== undefined) {
    if (typeof body.blocksWork !== "boolean") return fail("blocksWork must be true or false.");
    fields.blocksWork = body.blocksWork;
  }
  if (body.issueId !== undefined) {
    const read = await readIssueId(ctx, projectId, body.issueId);
    if (!read.ok) return read;
    fields.issueId = read.value;
  }
  if (body.source !== undefined) {
    const read = await readSource(ctx, projectId, body.source);
    if (!read.ok) return read;
    fields.source = read.value;
  }
  if (body.decidedBy !== undefined) {
    const read = readNullableText(body.decidedBy, "Decided by");
    if (!read.ok) return read;
    fields.decidedBy = read.value;
  }

  return { ok: true, value: { fields, decisionType: readDecisionType(body.decisionType) } };
}

function readPatchStatus(value: unknown): "outstanding" | "resolved" | "absent" | "blocked" | "invalid" {
  if (value === undefined) return "absent";
  if (value === "archive" || value === "duplicate") return "blocked";
  if (value === "outstanding" || value === "resolved") return value;
  return "invalid";
}

function readDecisionType(value: unknown): Collected["decisionType"] {
  if (value === undefined) return "absent";
  if (value === null) return null;
  if (value === "type1" || value === "type2") return value;
  return "invalid";
}

/** Calendar dates only. Empty means not set. isIsoDate checks YYYY-MM-DD. */
function readRaisedOn(value: unknown): Parsed<string> {
  if (value === null || value === "") return { ok: true, value: "" };
  if (typeof value !== "string" || !isIsoDate(value)) return fail("raisedOn must be YYYY-MM-DD.");
  return { ok: true, value };
}

function readNullableDate(value: unknown, label: string): Parsed<string | null> {
  if (value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string" || !isIsoDate(value)) return fail(`${label} must be YYYY-MM-DD.`);
  return { ok: true, value };
}

function readAssignees(value: unknown): Parsed<string[]> {
  if (!Array.isArray(value)) return fail("assigneeIds must be a list of people.");
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) return fail("assigneeIds must be a list of people.");
    const id = item.trim();
    if (!ids.includes(id)) ids.push(id);
  }
  return { ok: true, value: ids };
}

function readAffects(value: unknown): Parsed<DecisionAffect[]> {
  if (!Array.isArray(value)) return fail("affects must be requirements, direction, timeline, functionality, or resources.");
  const affects: DecisionAffect[] = [];
  for (const item of value) {
    if (!isAffect(item)) return fail("affects must be requirements, direction, timeline, functionality, or resources.");
    if (!affects.includes(item)) affects.push(item);
  }
  return { ok: true, value: affects };
}

function isAffect(value: unknown): value is DecisionAffect {
  return typeof value === "string" && AFFECTS.has(value as DecisionAffect);
}

async function readIssueId(ctx: DecisionCtx, projectId: string, value: unknown): Promise<Parsed<string | null>> {
  if (value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return fail("That work item is not on this project.");
  const issueId = value.trim();
  if (!issueId) return { ok: true, value: null };
  const issues = await ctx.deps.store.listIssues(projectId);
  if (!issues.some((issue) => issue.issueId === issueId)) return fail("That work item is not on this project.");
  return { ok: true, value: issueId };
}

async function readSource(ctx: DecisionCtx, projectId: string, value: unknown): Promise<Parsed<DecisionSource | null>> {
  if (value === null) return { ok: true, value: null };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail("Check the source.");
  const row = value as Record<string, unknown>;
  if (!isSourceKind(row.kind)) return fail("Source kind must be manual, document, email, transcript, or teams.");
  const quote = readSourceText(row.quote, "Source quote");
  if (!quote.ok) return quote;
  const speaker = readSourceText(row.speaker, "Source speaker");
  if (!speaker.ok) return speaker;
  const location = readSourceText(row.location, "Source location");
  if (!location.ok) return location;
  if (row.when !== undefined && row.when !== null && typeof row.when !== "string") return fail("Source when must be text or null.");
  if (typeof row.when === "string" && row.when.length > TEXT_MAX) return fail("Source when must be text or null.");
  if (row.documentId !== undefined && row.documentId !== null && typeof row.documentId !== "string") {
    return fail("Source documentId must be text or null.");
  }
  const documentId = typeof row.documentId === "string" && row.documentId.trim() ? row.documentId.trim() : null;
  if (documentId) {
    const document = await ctx.deps.store.getDocument(documentId);
    if (!document || document.projectId !== projectId) return fail("That document is not on this project.");
  }
  return {
    ok: true,
    value: {
      kind: row.kind,
      quote: quote.value,
      speaker: speaker.value,
      location: location.value,
      when: typeof row.when === "string" ? row.when : null,
      documentId,
    },
  };
}

function isSourceKind(value: unknown): value is DecisionSourceKind {
  return typeof value === "string" && SOURCE_KINDS.has(value as DecisionSourceKind);
}

function readSourceText(value: unknown, label: string): Parsed<string> {
  if (value === undefined) return { ok: true, value: "" };
  if (typeof value !== "string") return fail(`${label} must be text.`);
  if (value.length > TEXT_MAX) return fail(`${label} must be ${TEXT_MAX} characters or fewer.`);
  return { ok: true, value };
}

function readNullableText(value: unknown, label: string): Parsed<string | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== "string") return fail(`${label} must be text.`);
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > TEXT_MAX) return fail(`${label} must be ${TEXT_MAX} characters or fewer.`);
  return { ok: true, value: trimmed };
}

function textField(value: unknown, label: string): Parsed<string> {
  if (typeof value !== "string") return fail(`${label} must be text.`);
  const trimmed = value.trim();
  if (trimmed.length > TEXT_MAX) return fail(`${label} must be ${TEXT_MAX} characters or fewer.`);
  return { ok: true, value: trimmed };
}

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function viewOnly(correlationId: string): HttpResult {
  return json(403, { code: "VIEW_ONLY", message: "View access can open this project and cannot change it.", correlationId }, correlationId);
}

function validation(correlationId: string, message: string): HttpResult {
  return json(400, { code: "VALIDATION", message, correlationId }, correlationId);
}

function notFound(correlationId: string, message = "Not found."): HttpResult {
  return json(404, { code: "NOT_FOUND", message, correlationId }, correlationId);
}

function json(statusCode: number, payload: unknown, correlationId: string): HttpResult {
  const body = payload && typeof payload === "object" ? { ...(payload as Record<string, unknown>), correlationId } : { correlationId };
  return { statusCode, headers: { "content-type": "application/json", "x-correlation-id": correlationId }, body: JSON.stringify(body) };
}
