import { useEffect, useState } from "react";
import { RISK_SEVERITIES, type RiskRegisterRow, type RiskSeverity } from "../../../packages/domain/src/risks";
import { formatWhen } from "./ui";

type Draft = {
  title: string;
  severity: RiskSeverity | "";
  description: string;
  dateCleared: string;
  notes: string;
};

function draftFrom(row: RiskRegisterRow): Draft {
  return {
    title: row.title,
    severity: row.severity ?? "",
    description: row.description,
    dateCleared: row.dateCleared ?? "",
    notes: row.notes,
  };
}

function severityLabel(value: RiskSeverity | null | ""): string {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Project plan risk register. Live blocker conflicts appear automatically; administrators edit the fields. */
export function RiskRegisterPanel({
  admin,
  risks,
  busy,
  onSave,
}: {
  admin: boolean;
  risks: RiskRegisterRow[];
  busy: boolean;
  onSave: (riskId: string, body: {
    title: string;
    severity: RiskSeverity | null;
    description: string;
    dateCleared: string | null;
    notes: string;
    issueId: string | null;
    predecessorId: string | null;
  }) => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(Object.fromEntries(risks.map((row) => [row.riskId, draftFrom(row)])));
  }, [risks]);

  function update(riskId: string, patch: Partial<Draft>) {
    setDrafts((current) => ({ ...current, [riskId]: { ...draftFrom(risks.find((row) => row.riskId === riskId)!), ...current[riskId], ...patch } }));
  }

  async function save(row: RiskRegisterRow) {
    const draft = drafts[row.riskId] ?? draftFrom(row);
    if (!draft.title.trim()) {
      setError("A risk name is required.");
      return;
    }
    setError(null);
    setSavingId(row.riskId);
    try {
      await onSave(row.riskId, {
        title: draft.title.trim(),
        severity: draft.severity || null,
        description: draft.description.trim(),
        dateCleared: draft.dateCleared || null,
        notes: draft.notes.trim(),
        issueId: row.issueId,
        predecessorId: row.predecessorId,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that risk.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="panel">
      <h3>Risk register</h3>
      <p className="copy">
        Hard blocker date conflicts from the Timeline appear here automatically. Soft dependencies do not. Cleared risks stay in this register for history, and their Timeline warning icons are removed. An administrator can edit the risk name, severity, description, date cleared, and notes.
      </p>
      {error && (
        <p className="error small" role="alert">
          {error}
        </p>
      )}
      {risks.length === 0 ? (
        <p className="muted small">No risks on this plan.</p>
      ) : (
        <div className="table-wrap">
          <table className="risk-register-table">
            <thead>
              <tr>
                <th scope="col">Risk</th>
                <th scope="col">Severity</th>
                <th scope="col">Description</th>
                <th scope="col">Date cleared</th>
                <th scope="col">Notes</th>
                {admin && <th scope="col"> </th>}
              </tr>
            </thead>
            <tbody>
              {risks.map((row) => {
                const draft = drafts[row.riskId] ?? draftFrom(row);
                const disabled = busy || savingId === row.riskId || !admin;
                return (
                  <tr key={row.riskId} className={row.status === "cleared" ? "risk-row cleared" : "risk-row"}>
                    <td>
                      {admin ? (
                        <input
                          value={draft.title}
                          disabled={disabled}
                          onChange={(event) => update(row.riskId, { title: event.target.value })}
                          aria-label={`Risk name for ${row.title}`}
                        />
                      ) : (
                        <strong>{row.title}</strong>
                      )}
                      <div className="tiny muted">
                        {row.status === "cleared" ? "Cleared" : "Open"}
                        {row.conflictReason === "overlap"
                          ? " · Dates overlap"
                          : row.conflictReason === "unscheduled"
                            ? " · Not scheduled"
                            : ""}
                      </div>
                    </td>
                    <td>
                      {admin ? (
                        <select
                          value={draft.severity}
                          disabled={disabled}
                          onChange={(event) => update(row.riskId, { severity: event.target.value as RiskSeverity | "" })}
                          aria-label={`Severity for ${row.title}`}
                        >
                          <option value="">—</option>
                          {RISK_SEVERITIES.map((severity) => (
                            <option key={severity} value={severity}>
                              {severityLabel(severity)}
                            </option>
                          ))}
                        </select>
                      ) : (
                        severityLabel(row.severity)
                      )}
                    </td>
                    <td>
                      {admin ? (
                        <textarea
                          value={draft.description}
                          disabled={disabled}
                          rows={3}
                          onChange={(event) => update(row.riskId, { description: event.target.value })}
                          aria-label={`Description for ${row.title}`}
                        />
                      ) : (
                        <span className="small">{row.description || "—"}</span>
                      )}
                    </td>
                    <td>
                      {admin ? (
                        <input
                          type="date"
                          value={draft.dateCleared}
                          disabled={disabled}
                          onChange={(event) => update(row.riskId, { dateCleared: event.target.value })}
                          aria-label={`Date cleared for ${row.title}`}
                        />
                      ) : (
                        row.dateCleared ? formatWhen(row.dateCleared) : "—"
                      )}
                    </td>
                    <td>
                      {admin ? (
                        <textarea
                          value={draft.notes}
                          disabled={disabled}
                          rows={3}
                          onChange={(event) => update(row.riskId, { notes: event.target.value })}
                          aria-label={`Notes for ${row.title}`}
                        />
                      ) : (
                        <span className="small">{row.notes || "—"}</span>
                      )}
                    </td>
                    {admin && (
                      <td className="row-action">
                        <button className="btn small primary" type="button" disabled={disabled} onClick={() => void save(row)}>
                          {savingId === row.riskId ? "Saving…" : "Save"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!admin && risks.length > 0 && <p className="muted small">Only an administrator can edit the risk register.</p>}
    </section>
  );
}
