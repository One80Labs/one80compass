import { useEffect, useState } from "react";
import {
  acceptSuggestion,
  dismissSuggestion,
  listSuggestions,
  type DecisionSuggestion,
  type TranscriptAvailability,
} from "./decision-client";
import { ApiError } from "./api";
import { formatWhen } from "./ui";

type IssueChoice = { issueId: string; title: string; keyLabel: string | null };
type PersonChoice = { id: string; name: string };

const MARK_LABEL: Record<DecisionSuggestion["mark"], string> = {
  proposal: "",
  hypothetical: "Hypothetical",
  rejected: "Already rejected",
  discussed: "Only discussed",
};

/**
 * Proposals from labeled Krisp and Fireflies transcripts.
 * Accept writes a Decision Register row. Dismiss does not. Neither creates a plan issue.
 */
export function SuggestionInbox({
  projectId,
  idToken,
  canWrite,
  issues,
  members,
  onAccepted,
}: {
  projectId: string;
  idToken: string;
  canWrite: boolean;
  issues: IssueChoice[];
  members: PersonChoice[];
  onAccepted: () => Promise<void>;
}) {
  const [suggestions, setSuggestions] = useState<DecisionSuggestion[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptAvailability>("ready");
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [statement, setStatement] = useState("");
  const [kind, setKind] = useState<"question" | "decision">("question");
  const [issueId, setIssueId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const openItem = suggestions.find((item) => item.suggestionId === openId) ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setError(null);
    setOpenId(null);
    listSuggestions(projectId, idToken)
      .then((result) => {
        if (!cancelled) {
          setSuggestions(result.suggestions);
          setTranscripts(result.transcripts);
        }
      })
      .catch((caught) => {
        if (cancelled) return;
        setSuggestions([]);
        setError(message(caught));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, idToken]);

  async function reload() {
    const result = await listSuggestions(projectId, idToken);
    setSuggestions(result.suggestions);
    setTranscripts(result.transcripts);
  }

  function startAccept(item: DecisionSuggestion) {
    setError(null);
    setOpenId(item.suggestionId);
    setStatement(item.quote);
    setKind(item.kind);
    setIssueId(item.issueId ?? "");
    setAssigneeId(item.assigneeIds[0] ?? "");
    setTargetDate(item.targetDate ?? "");
  }

  async function saveAccept(item: DecisionSuggestion) {
    if (!statement.trim() || pendingId) return;
    setPendingId(item.suggestionId);
    setError(null);
    try {
      await acceptSuggestion(projectId, idToken, item.suggestionId, {
        statement: statement.trim(),
        kind,
        issueId: issueId || null,
        assigneeIds: assigneeId ? [assigneeId] : [],
        targetDate: targetDate || null,
      });
      setOpenId(null);
      await reload();
      await onAccepted();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPendingId(null);
    }
  }

  async function dismiss(item: DecisionSuggestion) {
    if (pendingId) return;
    setPendingId(item.suggestionId);
    setError(null);
    try {
      await dismissSuggestion(projectId, idToken, item.suggestionId);
      if (openId === item.suggestionId) setOpenId(null);
      await reload();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="decision-assigned suggestion-inbox" aria-label="Suggestions">
      <h2>Suggestions</h2>
      <p className="muted small">
        Proposals from Krisp and Fireflies transcripts. Accept adds a row to the register. Dismiss leaves it off the register.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!loaded ? (
        <p className="muted small">Loading…</p>
      ) : error ? null : suggestions.length === 0 ? (
        <p className="muted small">{emptyTranscriptMessage(transcripts)}</p>
      ) : (
        <div className="table-wrap">
          <table className="decision-table">
            <thead>
              <tr>
                <th scope="col">Quote</th>
                <th scope="col">Kind</th>
                <th scope="col">Work item</th>
                <th scope="col">Assignee</th>
                <th scope="col">Target date</th>
                <th scope="col">Note</th>
                {canWrite && <th scope="col">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {suggestions.map((item) => (
                <tr key={item.suggestionId}>
                  <td className="suggestion-quote">
                    {item.quote}
                    {item.documentName ? <span className="muted small"> {item.documentName}</span> : null}
                  </td>
                  <td>{item.kind === "decision" ? "Decision" : "Question"}</td>
                  <td>{workLabel(item, issues)}</td>
                  <td>{assigneeNames(item, members)}</td>
                  <td>{item.targetDate ? formatWhen(item.targetDate) : "—"}</td>
                  <td>{MARK_LABEL[item.mark]}</td>
                  {canWrite && (
                    <td>
                      <div className="suggestion-actions">
                        {item.acceptable && (
                          <button className="btn primary" type="button" disabled={pendingId !== null} onClick={() => startAccept(item)}>
                            Accept
                          </button>
                        )}
                        <button className="btn" type="button" disabled={pendingId !== null} onClick={() => void dismiss(item)}>
                          {pendingId === item.suggestionId && openId !== item.suggestionId ? "Dismissing" : "Dismiss"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canWrite && openItem && (
        <form
          className="suggestion-accept"
          onSubmit={(event) => {
            event.preventDefault();
            void saveAccept(openItem);
          }}
        >
          <label>
            Statement
            <textarea className="field" value={statement} required onChange={(event) => setStatement(event.target.value)} />
          </label>
          <label>
            Kind
            <select className="field" value={kind} onChange={(event) => setKind(event.target.value === "decision" ? "decision" : "question")}>
              <option value="question">Question</option>
              <option value="decision">Decision</option>
            </select>
          </label>
          <label>
            Work item
            <select className="field" value={issueId} onChange={(event) => setIssueId(event.target.value)}>
              <option value="">No work item</option>
              {issues.map((issue) => (
                <option key={issue.issueId} value={issue.issueId}>
                  {issue.keyLabel ? `${issue.keyLabel} ${issue.title}` : issue.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Assignee
            <select className="field" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Target date
            <input className="field" type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
          </label>
          <div className="suggestion-actions">
            <button className="btn primary" type="submit" disabled={pendingId !== null || !statement.trim()}>
              {pendingId === openItem.suggestionId ? "Accepting" : "Add to register"}
            </button>
            <button className="btn" type="button" onClick={() => setOpenId(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function workLabel(item: DecisionSuggestion, issues: IssueChoice[]): string {
  const issue = item.issueId ? issues.find((choice) => choice.issueId === item.issueId) : undefined;
  if (issue) return issue.keyLabel ? `${issue.keyLabel} ${issue.title}` : issue.title;
  return item.workLabel || "—";
}

function assigneeNames(item: DecisionSuggestion, members: PersonChoice[]): string {
  if (item.assigneeIds.length === 0) return item.assigneeLabel || "—";
  return item.assigneeIds.map((id) => members.find((member) => member.id === id)?.name ?? (item.assigneeLabel || id)).join(", ");
}

function emptyTranscriptMessage(transcripts: TranscriptAvailability): string {
  if (transcripts === "unavailable") return "Suggestions could not be loaded from the vault. Try again in a few minutes.";
  if (transcripts === "not_ingested") return "Labeled transcripts are not in the vault yet. Suggestions show up after vault ingest.";
  return "No suggestions from labeled transcripts.";
}

function message(caught: unknown): string {
  return caught instanceof ApiError || caught instanceof Error ? caught.message : "Request failed.";
}
