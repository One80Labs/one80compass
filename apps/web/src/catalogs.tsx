import { useState, type FormEvent } from "react";
import type { IterationChoice, ProjectCatalogs } from "../../../packages/domain/src/index";
import { putCatalogs } from "./api";
import type { Session } from "./auth";

type NamedRow = { id: string; name: string };
type IterationRow = { id: string; title: string; startDate: string; duration: string };
type MilestoneRow = { id: string; title: string; dueOn: string };

/**
 * Catalog editor for a Compass project. An administrator adds a row and edits its name.
 * Status rows can be marked Done. Iterations have a start date and a duration in days.
 * Milestones have an optional due date. Save replaces the catalogs.
 */
export function Catalogs({
  projectId,
  session,
  catalogs,
  onSaved,
  onError,
}: {
  projectId: string;
  session: Session;
  catalogs: ProjectCatalogs;
  onSaved: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [statusOptions, setStatusOptions] = useState<NamedRow[]>(() => catalogs.statusOptions.map(copyNamed));
  const [doneIds, setDoneIds] = useState<string[]>(() =>
    catalogs.statusOptions.filter((option) => catalogs.doneStatuses.includes(option.name)).map((option) => option.id),
  );
  const [iterations, setIterations] = useState<IterationRow[]>(() =>
    catalogs.iterations.map((iteration) => ({
      id: iteration.id,
      title: iteration.title,
      startDate: iteration.startDate,
      duration: String(iteration.duration),
    })),
  );
  const [labels, setLabels] = useState<NamedRow[]>(() => catalogs.labels.map(copyNamed));
  const [issueTypes, setIssueTypes] = useState<NamedRow[]>(() => catalogs.issueTypes.map(copyNamed));
  const [priorityOptions, setPriorityOptions] = useState<NamedRow[]>(() => catalogs.priorityOptions.map(copyNamed));
  const [milestones, setMilestones] = useState<MilestoneRow[]>(() =>
    catalogs.milestones.map((milestone) => ({ id: milestone.id, title: milestone.title, dueOn: milestone.dueOn ?? "" })),
  );
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextIterations = normalizeIterations(iterations);
    if (!nextIterations) {
      onError("Each iteration needs a name, a start date, and a whole number of days.");
      return;
    }
    const next: ProjectCatalogs = {
      statusOptions: statusOptions.map(copyNamed),
      doneStatuses: statusOptions.filter((option) => doneIds.includes(option.id)).map((option) => option.name.trim()),
      columns: statusOptions.map((option) => option.name.trim()),
      iterations: nextIterations,
      labels: labels.map(copyNamed),
      issueTypes: issueTypes.map(copyNamed),
      priorityOptions: priorityOptions.map(copyNamed),
      milestones: milestones.map((milestone) => ({
        id: milestone.id,
        title: milestone.title.trim(),
        dueOn: milestone.dueOn || null,
      })),
    };
    if (!uniqueNames(next)) {
      onError("Names in each catalog have to be unique.");
      return;
    }
    onError(null);
    setSaving(true);
    try {
      await putCatalogs(projectId, session.idToken, next);
      await onSaved();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h2>Catalogs</h2>
      <p className="muted small">
        These lists belong to this Compass project. Add a row and edit its name. Mark a status Done when work in that status is finished. Saving replaces the catalogs.
      </p>
      <section>
        <h3 className="section-title">Status</h3>
        {statusOptions.map((row, index) => (
          <div className="row" key={row.id}>
            <label>
              Name
              <input
                className="field"
                value={row.name}
                maxLength={80}
                required
                onChange={(event) => setStatusOptions(replaceAt(statusOptions, index, { ...row, name: event.target.value }))}
              />
            </label>
            <label className="row">
              <input
                type="checkbox"
                checked={doneIds.includes(row.id)}
                onChange={(event) => setDoneIds(event.target.checked ? [...doneIds, row.id] : doneIds.filter((id) => id !== row.id))}
              />
              Done
            </label>
            <button className="btn small" type="button" onClick={() => removeStatus(row.id)}>
              Remove
            </button>
          </div>
        ))}
        <button className="btn small" type="button" onClick={() => setStatusOptions([...statusOptions, blankNamed()])}>
          Add status
        </button>
      </section>
      <section>
        <h3 className="section-title">Iterations</h3>
        {iterations.map((row, index) => (
          <div className="row" key={row.id}>
            <label>
              Name
              <input
                className="field"
                value={row.title}
                maxLength={80}
                required
                onChange={(event) => setIterations(replaceAt(iterations, index, { ...row, title: event.target.value }))}
              />
            </label>
            <label>
              Start
              <input
                className="field"
                type="date"
                value={row.startDate}
                required
                onChange={(event) => setIterations(replaceAt(iterations, index, { ...row, startDate: event.target.value }))}
              />
            </label>
            <label>
              Duration in days
              <input
                className="field"
                value={row.duration}
                inputMode="numeric"
                required
                onChange={(event) => setIterations(replaceAt(iterations, index, { ...row, duration: event.target.value }))}
              />
            </label>
            <button className="btn small" type="button" onClick={() => setIterations(iterations.filter((item) => item.id !== row.id))}>
              Remove
            </button>
          </div>
        ))}
        <button
          className="btn small"
          type="button"
          onClick={() => setIterations([...iterations, { id: crypto.randomUUID(), title: "", startDate: "", duration: "" }])}
        >
          Add iteration
        </button>
      </section>
      <NamedCatalog title="Labels" addLabel="Add label" rows={labels} onChange={setLabels} />
      <NamedCatalog title="Issue types" addLabel="Add issue type" rows={issueTypes} onChange={setIssueTypes} />
      <NamedCatalog title="Priorities" addLabel="Add priority" rows={priorityOptions} onChange={setPriorityOptions} />
      <section>
        <h3 className="section-title">Milestones</h3>
        {milestones.map((row, index) => (
          <div className="row" key={row.id}>
            <label>
              Name
              <input
                className="field"
                value={row.title}
                maxLength={80}
                required
                onChange={(event) => setMilestones(replaceAt(milestones, index, { ...row, title: event.target.value }))}
              />
            </label>
            <label>
              Due date
              <input
                className="field"
                type="date"
                value={row.dueOn}
                onChange={(event) => setMilestones(replaceAt(milestones, index, { ...row, dueOn: event.target.value }))}
              />
            </label>
            <button className="btn small" type="button" onClick={() => setMilestones(milestones.filter((item) => item.id !== row.id))}>
              Remove
            </button>
          </div>
        ))}
        <button className="btn small" type="button" onClick={() => setMilestones([...milestones, { id: crypto.randomUUID(), title: "", dueOn: "" }])}>
          Add milestone
        </button>
      </section>
      <button className="btn" type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save catalogs"}
      </button>
    </form>
  );

  function removeStatus(id: string) {
    setStatusOptions(statusOptions.filter((item) => item.id !== id));
    setDoneIds(doneIds.filter((doneId) => doneId !== id));
  }
}

function NamedCatalog({
  title,
  addLabel,
  rows,
  onChange,
}: {
  title: string;
  addLabel: string;
  rows: NamedRow[];
  onChange: (rows: NamedRow[]) => void;
}) {
  return (
    <section>
      <h3 className="section-title">{title}</h3>
      {rows.map((row, index) => (
        <div className="row" key={row.id}>
          <label>
            Name
            <input
              className="field"
              value={row.name}
              maxLength={80}
              required
              onChange={(event) => onChange(replaceAt(rows, index, { ...row, name: event.target.value }))}
            />
          </label>
          <button className="btn small" type="button" onClick={() => onChange(rows.filter((item) => item.id !== row.id))}>
            Remove
          </button>
        </div>
      ))}
      <button className="btn small" type="button" onClick={() => onChange([...rows, blankNamed()])}>
        {addLabel}
      </button>
    </section>
  );
}

function copyNamed(row: NamedRow): NamedRow {
  return { id: row.id, name: row.name.trim() };
}

function blankNamed(): NamedRow {
  return { id: crypto.randomUUID(), name: "" };
}

function replaceAt<T>(rows: T[], index: number, next: T): T[] {
  return rows.map((row, rowIndex) => (rowIndex === index ? next : row));
}

function normalizeIterations(rows: IterationRow[]): IterationChoice[] | null {
  const next: IterationChoice[] = [];
  for (const row of rows) {
    const title = row.title.trim();
    const duration = Number(row.duration);
    if (!title || !row.startDate || !Number.isInteger(duration) || duration < 1) return null;
    next.push({ id: row.id, title, startDate: row.startDate, duration });
  }
  return next;
}

function uniqueNames(catalogs: ProjectCatalogs): boolean {
  const lists = [
    catalogs.statusOptions.map((row) => row.name),
    catalogs.iterations.map((row) => row.title),
    catalogs.labels.map((row) => row.name),
    catalogs.issueTypes.map((row) => row.name),
    catalogs.priorityOptions.map((row) => row.name),
    catalogs.milestones.map((row) => row.title),
  ];
  return lists.every((names) => new Set(names).size === names.length && names.every((name) => name.length > 0));
}
