import { useState } from "react";
import { baselineVariance, type BaselineRecord, type VarianceKind } from "../../../packages/domain/src/baselines";

const varianceLabel: Record<VarianceKind, string> = {
  newly_scheduled: "Newly scheduled",
  added: "Added after baseline",
  removed: "Removed since baseline",
};

type LiveIssue = {
  issueId: string;
  title: string;
  startDate: string | null;
  finishDate: string | null;
  inProject: boolean;
  archived: boolean;
  deletedAt: string | null;
};

/** Baseline 1 is set by an administrator. Later baselines are proposed, then approved or rejected. */
export function BaselinesPanel({
  admin,
  issues,
  baselines,
  busy,
  onCreate,
  onDecide,
}: {
  admin: boolean;
  issues: LiveIssue[];
  baselines: BaselineRecord[];
  busy: boolean;
  onCreate: (explanation: string) => Promise<void>;
  onDecide: (baselineId: string, action: "approve" | "reject", explanation: string) => Promise<void>;
}) {
  const approved = baselines.filter((baseline) => baseline.state === "approved").sort((left, right) => (left.number ?? 0) - (right.number ?? 0));
  const proposed = baselines.find((baseline) => baseline.state === "proposed");
  const original = approved[0];
  const latest = approved[approved.length - 1];
  const [which, setWhich] = useState<"original" | "latest">("latest");
  const selected = which === "original" ? original : latest;
  const rows = selected ? baselineVariance(issues, selected.tasks) : [];

  return (
    <section className="panel">
      <h3>Baselines</h3>
      <p className="copy">
        A baseline keeps the tasks and dates as they are now. An unscheduled task stays unscheduled in the snapshot. An administrator sets Baseline 1. Later baselines are proposed with an explanation and approved or rejected. Removed tasks stay out of the progress calculation.
      </p>
      {approved.length === 0 && <CreateBaseline admin={admin} busy={busy} label="Set Baseline 1" onCreate={onCreate} />}
      {approved.map((baseline) => (
        <article className="milestone" key={baseline.baselineId}>
          <div className="milestone-head">
            <strong>Baseline {baseline.number}</strong>
            <span className="pill good">Approved</span>
          </div>
          <p className="small muted">
            {baseline.createdAt.slice(0, 10)}. {baseline.tasks.length} tasks. {baseline.tasks.filter((task) => !task.startDate || !task.finishDate).length} unscheduled. {baseline.explanation}
          </p>
        </article>
      ))}
      {proposed && (
        <article className="milestone">
          <div className="milestone-head">
            <strong>Proposal</strong>
            <span className="pill orange">Waiting</span>
          </div>
          <p className="small muted">
            {proposed.createdAt.slice(0, 10)}. {proposed.tasks.length} tasks. {proposed.explanation}
          </p>
          {admin ? (
            <DecisionForm busy={busy} onDecide={(action, explanation) => onDecide(proposed.baselineId, action, explanation)} />
          ) : (
            <p className="copy">An administrator approves or rejects this proposal.</p>
          )}
        </article>
      )}
      {approved.length > 0 && !proposed && <CreateBaseline admin={admin} busy={busy} label="Propose a baseline" onCreate={onCreate} />}
      {selected && (
        <div>
          <h3>Comparison</h3>
          {original && latest && original.baselineId !== latest.baselineId && (
            <div className="row">
              <button className={which === "original" ? "btn small primary" : "btn small"} type="button" onClick={() => setWhich("original")}>
                Original
              </button>
              <button className={which === "latest" ? "btn small primary" : "btn small"} type="button" onClick={() => setWhich("latest")}>
                Latest
              </button>
            </div>
          )}
          <p className="small muted">Against Baseline {selected.number}.</p>
          {rows.length === 0 && <p className="copy">No added, removed, or newly scheduled tasks.</p>}
          {rows.map((row) => (
            <p className="small" key={`${row.kind}:${row.issueId}`}>
              <span className="pill">{varianceLabel[row.kind]}</span> {row.title}
              {row.kind === "newly_scheduled" ? ` ${row.currentStart} – ${row.currentFinish}` : ""}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function CreateBaseline({ admin, busy, label, onCreate }: { admin: boolean; busy: boolean; label: string; onCreate: (explanation: string) => Promise<void> }) {
  const [explanation, setExplanation] = useState("");
  if (!admin && label === "Set Baseline 1") return <p className="copy">An administrator sets Baseline 1.</p>;
  return (
    <form
      className="row"
      onSubmit={(event) => {
        event.preventDefault();
        void onCreate(explanation).then(() => setExplanation(""));
      }}
    >
      <label>
        Explanation
        <input value={explanation} onChange={(event) => setExplanation(event.target.value)} required maxLength={500} />
      </label>
      <button className="btn small" type="submit" disabled={busy}>
        {label}
      </button>
    </form>
  );
}

function DecisionForm({ busy, onDecide }: { busy: boolean; onDecide: (action: "approve" | "reject", explanation: string) => Promise<void> }) {
  const [explanation, setExplanation] = useState("");
  return (
    <form
      className="row"
      onSubmit={(event) => {
        event.preventDefault();
        void onDecide("reject", explanation).then(() => setExplanation(""));
      }}
    >
      <button className="btn small primary" type="button" disabled={busy} onClick={() => void onDecide("approve", "")}>
        Approve
      </button>
      <label>
        Reason to reject
        <input value={explanation} onChange={(event) => setExplanation(event.target.value)} maxLength={500} />
      </label>
      <button className="btn small" type="submit" disabled={busy || !explanation.trim()}>
        Reject
      </button>
    </form>
  );
}
