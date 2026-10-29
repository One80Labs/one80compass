import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { DECISION_AFFECTS, type DecisionAffect, type DecisionRecord, type DecisionSource } from "../../../packages/domain/src/decisions";
import { EditDrawer, formatWhen } from "./ui";

/**
 * One Decision Register panel for add, edit, and history.
 * Promoting a question keeps this record: the parent calls onSave with the same decision id.
 */

export type DecisionDraft = {
  kind: "question" | "decision";
  status: "outstanding" | "resolved";
  statement: string;
  raisedBy: string;
  raisedOn: string;
  assigneeIds: string[];
  neededFrom: string;
  targetDate: string | null;
  affects: DecisionAffect[];
  blocksWork: boolean;
  issueId: string | null;
  source: DecisionSource | null;
  answer: string;
  outcome: string;
  rationale: string;
  decisionType: "type1" | "type2" | null;
  decidedBy: string | null;
  decidedOn: string | null;
  consulted: string;
  assumptions: string;
  whatWouldChange: string;
  doesNotMean: string;
};

type PersonOption = { id: string; name: string };
type IssueOption = { issueId: string; title: string; issueType: string | null; keyLabel: string | null };
type DocumentOption = { documentId: string; fileName: string };

const SOURCE_KINDS: { value: DecisionSource["kind"]; label: string }[] = [
  { value: "manual", label: "Manual" },
  { value: "document", label: "Document" },
  { value: "email", label: "Email" },
  { value: "transcript", label: "Transcript" },
  { value: "teams", label: "Teams" },
];

const AFFECT_LABEL: Record<DecisionAffect, string> = {
  requirements: "Requirements",
  direction: "Direction",
  timeline: "Timeline",
  functionality: "Functionality",
  resources: "Resources",
};

const HISTORY_LABEL: Record<string, string> = {
  status: "Status",
  kind: "Kind",
  assignee: "Assignee",
  targetDate: "Target date",
  outcome: "Outcome",
  rationale: "Rationale",
  workItem: "Work item",
  becameDecision: "Became a decision",
};

const VALUE_LABEL: Record<string, string> = {
  question: "Question",
  decision: "Decision",
  outstanding: "Outstanding",
  resolved: "Resolved",
  duplicate: "Duplicate",
  archive: "Archive",
  type1: "Type 1",
  type2: "Type 2",
};

export function DecisionDrawer(props: {
  record: DecisionRecord | null;
  issues: { issueId: string; title: string; issueType: string | null; keyLabel: string | null }[];
  members: { id: string; name: string }[];
  documents: { documentId: string; fileName: string }[];
  canWrite: boolean;
  canArchive: boolean;
  currentUserId: string;
  siblings: DecisionRecord[];
  onClose: () => void;
  onCreate: (draft: DecisionDraft) => Promise<void>;
  onSave: (decisionId: string, draft: DecisionDraft) => Promise<void>;
  onComment: (decisionId: string, body: string) => Promise<void>;
  onArchive: (decisionId: string, reason: string) => Promise<void>;
  onDuplicate: (decisionId: string, duplicateOfId: string) => Promise<void>;
}): JSX.Element {
  const { record, issues, members, documents, canWrite, canArchive, currentUserId, siblings, onClose, onCreate, onSave, onComment, onArchive, onDuplicate } = props;
  const recordKey = record?.decisionId ?? "new";
  const [seenKey, setSeenKey] = useState(recordKey);
  const [draft, setDraft] = useState(() => toDraft(record, currentUserId));
  const [commentBody, setCommentBody] = useState("");
  const [archiveReason, setArchiveReason] = useState(record?.archiveReason ?? "");
  const [duplicateOfId, setDuplicateOfId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<null | "save" | "comment" | "duplicate" | "archive">(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // EditDrawer disables Save only while saving. Lock that button after each paint when this person cannot write.
  useLayoutEffect(() => {
    if (canWrite) return;
    const saveButton = panelRef.current?.closest("form")?.querySelector('footer button[type="submit"]');
    if (saveButton instanceof HTMLButtonElement) saveButton.disabled = true;
  });

  useEffect(() => {
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);

  if (seenKey !== recordKey) {
    setSeenKey(recordKey);
    setDraft(toDraft(record, currentUserId));
    setCommentBody("");
    setArchiveReason(record?.archiveReason ?? "");
    setDuplicateOfId("");
    setError(null);
    setPending(null);
  }

  const locked = !canWrite;
  const busy = pending !== null;
  const people = ensurePeople(members, [currentUserId, draft.raisedBy, draft.decidedBy ?? "", ...draft.assigneeIds]);
  const workItems = ensureIssues(issues, draft.issueId);
  const files = ensureDocuments(documents, draft.source?.documentId ?? null);
  const source = draft.source ?? emptySource();
  const duplicateChoices = siblings.filter((item) => item.decisionId !== record?.decisionId && item.status !== "archive");
  const documentName = files.find((file) => file.documentId === source.documentId)?.fileName ?? (source.documentId || "No document");
  const title = !record ? "Add question or decision" : record.kind === "decision" ? "Decision" : "Question";

  function patch(partial: Partial<DecisionDraft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function editSource(partial: Partial<DecisionSource>) {
    setDraft((current) => ({ ...current, source: { ...(current.source ?? emptySource()), ...partial } }));
  }

  // Promoting a question sets kind to decision on this same record.
  // The parent calls onSave with the same decision id, so the row is updated in place.
  function changeKind(kind: "question" | "decision") {
    setDraft((current) => ({
      ...current,
      kind,
      decisionType: kind === "decision" ? current.decisionType : null,
    }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!canWrite) {
      setError("You can't change this record.");
      return;
    }
    if (pending) return;
    if (!draft.statement.trim()) {
      setError("Statement is required.");
      return;
    }
    const next = toSave(draft);
    setPending("save");
    setError(null);
    try {
      if (record) await onSave(record.decisionId, next);
      else await onCreate(next);
    } catch (caught) {
      setError(rejectMessage(caught, "Could not save."));
    } finally {
      setPending(null);
    }
  }

  async function submitComment() {
    if (!record || !canWrite || pending) return;
    const body = commentBody.trim();
    if (!body) return;
    setPending("comment");
    setError(null);
    try {
      await onComment(record.decisionId, body);
      setCommentBody("");
    } catch (caught) {
      setError(rejectMessage(caught, "Could not add the comment."));
    } finally {
      setPending(null);
    }
  }

  async function markDuplicate() {
    if (!record || !canWrite || pending || !duplicateOfId) return;
    setPending("duplicate");
    setError(null);
    try {
      await onDuplicate(record.decisionId, duplicateOfId);
    } catch (caught) {
      setError(rejectMessage(caught, "Could not mark the duplicate."));
    } finally {
      setPending(null);
    }
  }

  async function archive() {
    if (!record || !canArchive || pending) return;
    const reason = archiveReason.trim();
    if (!reason) {
      setError("An archive reason is required.");
      return;
    }
    setPending("archive");
    setError(null);
    try {
      await onArchive(record.decisionId, reason);
    } catch (caught) {
      setError(rejectMessage(caught, "Could not archive."));
    } finally {
      setPending(null);
    }
  }

  return (
    <EditDrawer key={recordKey} title={title} onClose={onClose} onSubmit={onSubmit} saving={pending === "save"}>
      <div ref={panelRef}>
        <label>
          Statement
          <textarea className="field" value={draft.statement} onChange={(event) => patch({ statement: event.target.value })} required readOnly={locked} />
        </label>
        {record?.suggestionText != null && (
          <label>
            Original suggestion
            <textarea className="field" value={record.suggestionText} readOnly />
            {record.acceptedBy ? <span className="muted small">Accepted by {personName(members, record.acceptedBy)}</span> : null}
          </label>
        )}
        <label>
          Kind
          <select className="field" value={draft.kind} disabled={locked || record?.kind === "decision"} onChange={(event) => changeKind(event.target.value === "decision" ? "decision" : "question")}>
            {record?.kind !== "decision" && <option value="question">Question</option>}
            <option value="decision">Decision</option>
          </select>
        </label>
        <label>
          Status
          <select className="field" value={draft.status} disabled={locked} onChange={(event) => patch({ status: event.target.value === "resolved" ? "resolved" : "outstanding" })}>
            <option value="outstanding">Outstanding</option>
            <option value="resolved">Resolved</option>
          </select>
        </label>
        {record?.status === "duplicate" && <p>This item is a duplicate{record.duplicateOfId ? ` of ${siblingStatement(siblings, record.duplicateOfId)}` : ""}.</p>}
        {record?.status === "archive" && <p>This item is archived{record.archiveReason ? `: ${record.archiveReason}` : ""}.</p>}
        <label>
          Raised by
          <select className="field" value={draft.raisedBy} disabled={locked} onChange={(event) => patch({ raisedBy: event.target.value })}>
            {draft.raisedBy === "" && <option value="">Choose a person</option>}
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {personLabel(person)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Raised on
          <input className="field" type="date" value={draft.raisedOn} disabled={locked} onChange={(event) => patch({ raisedOn: event.target.value })} />
        </label>
        <fieldset className="choice-list">
          <legend>Assignees</legend>
          {people.length === 0 && <span className="muted small">No project members yet.</span>}
          {people.map((person) => (
            <label key={person.id}>
              <input
                type="checkbox"
                checked={draft.assigneeIds.includes(person.id)}
                disabled={locked}
                onChange={(event) => patch({ assigneeIds: toggleId(draft.assigneeIds, person.id, event.target.checked) })}
              />
              {personLabel(person)}
            </label>
          ))}
        </fieldset>
        <label>
          Needed from
          <input className="field" value={draft.neededFrom} readOnly={locked} onChange={(event) => patch({ neededFrom: event.target.value })} />
        </label>
        <label>
          Target date
          <input className="field" type="date" value={draft.targetDate ?? ""} disabled={locked} onChange={(event) => patch({ targetDate: event.target.value || null })} />
        </label>
        <fieldset className="choice-list">
          <legend>Affects</legend>
          {DECISION_AFFECTS.map((affect) => (
            <label key={affect}>
              <input
                type="checkbox"
                checked={draft.affects.includes(affect)}
                disabled={locked}
                onChange={(event) => patch({ affects: toggleAffect(draft.affects, affect, event.target.checked) })}
              />
              {AFFECT_LABEL[affect]}
            </label>
          ))}
        </fieldset>
        <div className="choice-list">
          <label className="check">
            <input type="checkbox" checked={draft.blocksWork} disabled={locked} onChange={(event) => patch({ blocksWork: event.target.checked })} />
            Blocks the linked work
          </label>
        </div>
        <label>
          Work item
          <select className="field" value={draft.issueId ?? ""} disabled={locked} onChange={(event) => patch({ issueId: event.target.value || null })}>
            <option value="">No work item</option>
            {workItems.map((issue) => (
              <option key={issue.issueId} value={issue.issueId}>
                {workLabel(issue)}
              </option>
            ))}
          </select>
        </label>
        <p>Source</p>
        <label>
          Source kind
          <select className="field" value={source.kind} disabled={locked} onChange={(event) => editSource({ kind: event.target.value as DecisionSource["kind"] })}>
            {SOURCE_KINDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quote
          <textarea className="field" value={source.quote} readOnly={locked} onChange={(event) => editSource({ quote: event.target.value })} />
        </label>
        <label>
          Speaker
          <input className="field" value={source.speaker} readOnly={locked} onChange={(event) => editSource({ speaker: event.target.value })} />
        </label>
        <label>
          Location
          <input className="field" value={source.location} readOnly={locked} onChange={(event) => editSource({ location: event.target.value })} />
        </label>
        <label>
          When
          <input className="field" value={source.when ?? ""} readOnly={locked} placeholder="YYYY-MM-DD or ISO-8601" onChange={(event) => editSource({ when: event.target.value || null })} />
        </label>
        <label>
          Document
          {canWrite ? (
            <select className="field" value={source.documentId ?? ""} onChange={(event) => editSource({ documentId: event.target.value || null })}>
              <option value="">No document</option>
              {files.map((file) => (
                <option key={file.documentId} value={file.documentId}>
                  {file.fileName}
                </option>
              ))}
            </select>
          ) : (
            <input className="field" value={documentName} readOnly />
          )}
        </label>
        {draft.kind === "question" ? (
          <label>
            Answer
            <textarea className="field" value={draft.answer} readOnly={locked} onChange={(event) => patch({ answer: event.target.value })} />
          </label>
        ) : (
          <>
            <label>
              Outcome
              <textarea className="field" value={draft.outcome} readOnly={locked} onChange={(event) => patch({ outcome: event.target.value })} />
            </label>
            <label>
              Rationale
              <textarea className="field" value={draft.rationale} readOnly={locked} onChange={(event) => patch({ rationale: event.target.value })} />
            </label>
            <label>
              Decision type
              <select
                className="field"
                value={draft.decisionType ?? ""}
                disabled={locked}
                onChange={(event) => patch({ decisionType: event.target.value === "type1" || event.target.value === "type2" ? event.target.value : null })}
              >
                <option value="">Not set</option>
                <option value="type1">Type 1 — hard to undo</option>
                <option value="type2">Type 2 — reversible</option>
              </select>
            </label>
            <label>
              Decided by
              <select className="field" value={draft.decidedBy ?? ""} disabled={locked} onChange={(event) => patch({ decidedBy: event.target.value || null })}>
                <option value="">Not set</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {personLabel(person)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Decided on
              <input className="field" type="date" value={draft.decidedOn ?? ""} disabled={locked} onChange={(event) => patch({ decidedOn: event.target.value || null })} />
            </label>
            <label>
              Consulted
              <textarea className="field" value={draft.consulted} readOnly={locked} onChange={(event) => patch({ consulted: event.target.value })} />
            </label>
            <label>
              Assumptions
              <textarea className="field" value={draft.assumptions} readOnly={locked} onChange={(event) => patch({ assumptions: event.target.value })} />
            </label>
            <label>
              What would change this decision
              <textarea className="field" value={draft.whatWouldChange} readOnly={locked} onChange={(event) => patch({ whatWouldChange: event.target.value })} />
            </label>
            <label>
              What this decision does not mean
              <textarea className="field" value={draft.doesNotMean} readOnly={locked} onChange={(event) => patch({ doesNotMean: event.target.value })} />
            </label>
          </>
        )}
        {record && (
          <div className="choice-list">
            <p>History</p>
            {record.history.length === 0 && <p>No history yet.</p>}
            {record.history.map((event, index) => (
              <p key={`${event.at}:${event.field}:${index}`}>
                {HISTORY_LABEL[event.field] ?? event.field} from {showStored(event.from, members)} to {showStored(event.to, members)} by {personName(members, event.by)} at {showWhen(event.at)}
              </p>
            ))}
          </div>
        )}
        {record && canWrite && (
          <div className="choice-list">
            <p>Comments</p>
            {record.comments.length === 0 && <p>No comments yet.</p>}
            {record.comments.map((comment) => (
              <span key={comment.commentId} className="comment-log">
                {personName(members, comment.by)} · {showWhen(comment.at)}
                {"\n"}
                {comment.body}
              </span>
            ))}
          </div>
        )}
        {record && canWrite && (
          <label>
            Add a comment
            <textarea className="field" value={commentBody} placeholder="Add a comment" onChange={(event) => setCommentBody(event.target.value)} />
          </label>
        )}
        {record && canWrite && (
          <button className="btn" type="button" disabled={!canWrite || busy || !commentBody.trim()} onClick={() => void submitComment()}>
            {pending === "comment" ? "Adding comment" : "Add comment"}
          </button>
        )}
        {record && (
          <label>
            Duplicate of
            <select className="field" value={duplicateOfId} disabled={!canWrite || busy} onChange={(event) => setDuplicateOfId(event.target.value)}>
              <option value="">Choose an item</option>
              {duplicateChoices.map((item) => (
                <option key={item.decisionId} value={item.decisionId}>
                  {item.kind === "decision" ? "Decision" : "Question"}: {item.statement}
                </option>
              ))}
            </select>
          </label>
        )}
        {record && (
          <button className="btn" type="button" disabled={!canWrite || busy || !duplicateOfId} onClick={() => void markDuplicate()}>
            {pending === "duplicate" ? "Marking duplicate" : "Mark as duplicate"}
          </button>
        )}
        {record && canArchive && (
          <div className="plan-delete">
            <label>
              Archive reason
              <textarea className="field" value={archiveReason} placeholder="Why this leaves the register" onChange={(event) => setArchiveReason(event.target.value)} />
            </label>
            <button className="btn plan-delete-open" type="button" disabled={busy || !archiveReason.trim()} onClick={() => void archive()}>
              {pending === "archive" ? "Archiving" : "Archive"}
            </button>
          </div>
        )}
        {error && (
          <p className="error" role="alert" ref={errorRef}>
            {error}
          </p>
        )}
      </div>
    </EditDrawer>
  );
}

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function emptySource(): DecisionSource {
  return { kind: "manual", quote: "", speaker: "", location: "", when: null, documentId: null };
}

function toDraft(record: DecisionRecord | null, currentUserId: string): DecisionDraft {
  if (!record) {
    return {
      kind: "question",
      status: "outstanding",
      statement: "",
      raisedBy: currentUserId,
      raisedOn: todayIso(),
      assigneeIds: [],
      neededFrom: "",
      targetDate: null,
      affects: [],
      blocksWork: false,
      issueId: null,
      source: null,
      answer: "",
      outcome: "",
      rationale: "",
      decisionType: null,
      decidedBy: null,
      decidedOn: null,
      consulted: "",
      assumptions: "",
      whatWouldChange: "",
      doesNotMean: "",
    };
  }
  return {
    kind: record.kind,
    status: record.status === "resolved" ? "resolved" : "outstanding",
    statement: record.statement,
    raisedBy: record.raisedBy,
    raisedOn: record.raisedOn,
    assigneeIds: record.assigneeIds,
    neededFrom: record.neededFrom,
    targetDate: record.targetDate,
    affects: record.affects,
    blocksWork: record.blocksWork,
    issueId: record.issueId,
    source: record.source,
    answer: record.answer,
    outcome: record.outcome,
    rationale: record.rationale,
    decisionType: record.kind === "decision" ? record.decisionType : null,
    decidedBy: record.decidedBy,
    decidedOn: record.decidedOn,
    consulted: record.consulted,
    assumptions: record.assumptions,
    whatWouldChange: record.whatWouldChange,
    doesNotMean: record.doesNotMean,
  };
}

function blank(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function cleanSource(source: DecisionSource | null): DecisionSource | null {
  if (!source) return null;
  const quote = source.quote.trim();
  const speaker = source.speaker.trim();
  const location = source.location.trim();
  const when = blank(source.when);
  const documentId = blank(source.documentId);
  if (source.kind === "manual" && !quote && !speaker && !location && !when && !documentId) return null;
  return { kind: source.kind, quote, speaker, location, when, documentId };
}

function toSave(draft: DecisionDraft): DecisionDraft {
  return {
    ...draft,
    statement: draft.statement.trim(),
    targetDate: blank(draft.targetDate),
    issueId: blank(draft.issueId),
    source: cleanSource(draft.source),
    decisionType: draft.kind === "decision" ? draft.decisionType : null,
    decidedBy: blank(draft.decidedBy),
    decidedOn: blank(draft.decidedOn),
  };
}

function toggleId(values: string[], id: string, on: boolean): string[] {
  if (on) return values.includes(id) ? values : [...values, id];
  return values.filter((item) => item !== id);
}

function toggleAffect(values: DecisionAffect[], affect: DecisionAffect, on: boolean): DecisionAffect[] {
  const next = new Set(values);
  if (on) next.add(affect);
  else next.delete(affect);
  return DECISION_AFFECTS.filter((item) => next.has(item));
}

function ensurePeople(members: PersonOption[], ids: string[]): PersonOption[] {
  const seen = new Set(members.map((person) => person.id));
  const extras: PersonOption[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    extras.push({ id, name: id });
  }
  return [...members, ...extras];
}

function ensureIssues(issues: IssueOption[], issueId: string | null): IssueOption[] {
  if (!issueId || issues.some((issue) => issue.issueId === issueId)) return issues;
  return [{ issueId, title: issueId, issueType: null, keyLabel: null }, ...issues];
}

function ensureDocuments(documents: DocumentOption[], documentId: string | null): DocumentOption[] {
  if (!documentId || documents.some((file) => file.documentId === documentId)) return documents;
  return [{ documentId, fileName: documentId }, ...documents];
}

function personName(members: PersonOption[], id: string): string {
  const found = members.find((person) => person.id === id);
  if (!found) return id || "—";
  return found.name.trim() || id;
}

function personLabel(person: PersonOption): string {
  return person.name.trim() || person.id;
}

function workLabel(issue: IssueOption): string {
  if (issue.keyLabel && issue.title) return `${issue.keyLabel} ${issue.title}`;
  return issue.keyLabel || issue.title || issue.issueId;
}

function siblingStatement(siblings: DecisionRecord[], id: string): string {
  return siblings.find((item) => item.decisionId === id)?.statement || id;
}

function showStored(value: string | null, members: PersonOption[]): string {
  if (!value) return "—";
  if (members.some((person) => person.id === value)) return personName(members, value);
  return VALUE_LABEL[value] ?? value;
}

function showWhen(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return formatWhen(value);
}

function rejectMessage(caught: unknown, fallback: string): string {
  return caught instanceof Error && caught.message.trim() ? caught.message.trim() : fallback;
}
