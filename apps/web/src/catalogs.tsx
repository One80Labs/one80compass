import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { IterationChoice, ProjectCatalogs } from "../../../packages/domain/src/index";
import { CATALOG_COLORS } from "../../../packages/domain/src/index";
import { api, putCatalogs } from "./api";
import type { Session } from "./auth";

type NamedRow = { id: string; name: string };
type ColoredRow = { id: string; name: string; color: string | null };
type IterationRow = { id: string; title: string; startDate: string; duration: string };
type MilestoneRow = { id: string; title: string; dueOn: string };

/**
 * Catalog editor for a Compass project. An administrator adds a row and edits its name.
 * Each list starts collapsed. Status rows can be marked Done. Iterations have a start date
 * and a duration in days. Milestones have an optional due date. Save replaces the catalogs.
 */
export function Catalogs({
  projectId,
  session,
  catalogs,
  projectName,
  onSaved,
  onError,
  persist = putCatalogs,
}: {
  projectId: string;
  session: Session;
  catalogs: ProjectCatalogs;
  projectName?: string | null;
  onSaved: () => Promise<void>;
  onError: (message: string | null) => void;
  /** Replaces the API save. The layout preview uses this so the sample does not call the server. */
  persist?: (projectId: string, idToken: string, catalogs: ProjectCatalogs) => Promise<unknown>;
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
  const [labels, setLabels] = useState<ColoredRow[]>(() => catalogs.labels.map(copyColored));
  const [issueTypes, setIssueTypes] = useState<ColoredRow[]>(() => catalogs.issueTypes.map(copyColored));
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
      labels: labels.map(copyColored),
      issueTypes: issueTypes.map(copyColored),
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
      await persist(projectId, session.idToken, next);
      await onSaved();
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="catalog-form" onSubmit={onSubmit}>
      <p className="muted small">
        These lists belong to {projectName?.trim() || "this project"}. Add a row, edit it, and save. Saving replaces the catalogs for this project.
      </p>
      <CatalogSection title="Status" detail="Board columns. Mark Done when work in that status is finished." count={statusOptions.length} unit="status">
        {statusOptions.map((row, index) => (
          <div className="catalog-row status" key={row.id}>
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
            <label className="catalog-done">
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
      </CatalogSection>
      <CatalogSection title="Iterations" detail="Each iteration needs a name, a start date, and a length in days." count={iterations.length} unit="iteration">
        {iterations.map((row, index) => (
          <div className="catalog-row iteration" key={row.id}>
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
      </CatalogSection>
      <ColoredCatalog title="Labels" detail="A color outlines the tag on the issue editor." addLabel="Add label" unit="label" rows={labels} onChange={setLabels} />
      <ColoredCatalog title="Issue types" detail="A color fills that type's bar on the timeline." addLabel="Add issue type" unit="issue type" rows={issueTypes} onChange={setIssueTypes} />
      <NamedCatalog title="Priorities" detail="Choices stored on an issue." addLabel="Add priority" unit="priority" rows={priorityOptions} onChange={setPriorityOptions} />
      <CatalogSection title="Milestones" detail="A name and an optional due date." count={milestones.length} unit="milestone">
        {milestones.map((row, index) => (
          <div className="catalog-row milestone" key={row.id}>
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
      </CatalogSection>
      <button className="btn primary catalog-save" type="submit" disabled={saving}>
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
  detail,
  addLabel,
  unit,
  rows,
  onChange,
}: {
  title: string;
  detail: string;
  addLabel: string;
  unit: string;
  rows: NamedRow[];
  onChange: (rows: NamedRow[]) => void;
}) {
  return (
    <CatalogSection title={title} detail={detail} count={rows.length} unit={unit}>
      {rows.map((row, index) => (
        <div className="catalog-row named" key={row.id}>
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
    </CatalogSection>
  );
}

function ColoredCatalog({
  title,
  detail,
  addLabel,
  unit,
  rows,
  onChange,
}: {
  title: string;
  detail: string;
  addLabel: string;
  unit: string;
  rows: ColoredRow[];
  onChange: (rows: ColoredRow[]) => void;
}) {
  return (
    <CatalogSection title={title} detail={detail} count={rows.length} unit={unit}>
      {rows.map((row, index) => (
        <div className="catalog-row colored" key={row.id}>
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
          <div className="color-choices" role="radiogroup" aria-label={`${title} color`}>
            <button className={row.color ? "color-swatch none" : "color-swatch none selected"} type="button" aria-pressed={!row.color} onClick={() => onChange(replaceAt(rows, index, { ...row, color: null }))}>
              None
            </button>
            {CATALOG_COLORS.map((color) => (
              <button
                key={color.id}
                className={row.color === color.id ? "color-swatch selected" : "color-swatch"}
                type="button"
                style={{ background: color.hex }}
                aria-label={color.name}
                title={color.name}
                aria-pressed={row.color === color.id}
                onClick={() => onChange(replaceAt(rows, index, { ...row, color: color.id }))}
              />
            ))}
          </div>
          <button className="btn small" type="button" onClick={() => onChange(rows.filter((item) => item.id !== row.id))}>
            Remove
          </button>
        </div>
      ))}
      <button className="btn small" type="button" onClick={() => onChange([...rows, blankColored()])}>
        {addLabel}
      </button>
    </CatalogSection>
  );
}

/** One catalog list. Collapsed by default so the page stays scannable. */
function CatalogSection({
  title,
  detail,
  count,
  unit,
  children,
}: {
  title: string;
  detail: string;
  count: number;
  unit: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const bodyId = `catalog-${title.toLowerCase().replace(/\s+/g, "-")}-body`;
  const summary = count === 0 ? "None yet" : `${count} ${unit}${count === 1 ? "" : "s"}`;

  return (
    <section className="catalog-section">
      <button
        type="button"
        className="catalog-section-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="catalog-section-heading">
          <h3>{title}</h3>
          {!open && <span className="muted small">{summary}</span>}
        </span>
        <CatalogExpandIcon expanded={open} />
      </button>
      {open && (
        <div id={bodyId} className="catalog-section-body">
          <p className="muted small">{detail}</p>
          {children}
        </div>
      )}
    </section>
  );
}

function CatalogExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      {expanded ? (
        <path fill="currentColor" d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z" />
      ) : (
        <path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
      )}
    </svg>
  );
}

function copyColored(row: ColoredRow): ColoredRow {
  return { id: row.id, name: row.name.trim(), color: row.color };
}

function blankColored(): ColoredRow {
  return { id: crypto.randomUUID(), name: "", color: null };
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

type PlanCatalogResponse = {
  settings: (ProjectCatalogs & { recordSource?: "github" | "compass" }) | null;
};

/** Settings category for the active Compass project. An administrator edits the lists here. */
export function CatalogSettings({ session, projectId, projectName }: { session: Session; projectId: string | null; projectName: string | null }) {
  const [catalogs, setCatalogs] = useState<ProjectCatalogs | null>(null);
  const [recordSource, setRecordSource] = useState<"github" | "compass" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api<PlanCatalogResponse>(`/projects/${projectId}/plan`, session.idToken)
      .then((plan) => {
        if (cancelled || !plan.settings) return;
        setRecordSource(plan.settings.recordSource ?? "github");
        setCatalogs({
          statusOptions: plan.settings.statusOptions ?? [],
          doneStatuses: plan.settings.doneStatuses ?? [],
          columns: plan.settings.columns ?? [],
          iterations: plan.settings.iterations ?? [],
          labels: plan.settings.labels ?? [],
          issueTypes: plan.settings.issueTypes ?? [],
          priorityOptions: plan.settings.priorityOptions ?? [],
          milestones: plan.settings.milestones ?? [],
        });
        setRevision((current) => current + 1);
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Request failed.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, session.idToken]);

  if (!session.adminGroup) return <p className="copy">An administrator maintains the catalogs for this project.</p>;
  if (!projectId) return <p className="copy">Select a project before editing its catalogs.</p>;
  if (loading && !catalogs) return <p className="copy">Loading catalogs.</p>;
  if (recordSource !== "compass" || !catalogs) {
    return error ? <p className="error">{error}</p> : <p className="copy">Catalogs are available when this project is stored in Compass.</p>;
  }
  return (
    <>
      {error && <p className="error">{error}</p>}
      <Catalogs
        key={revision}
        projectId={projectId}
        session={session}
        projectName={projectName}
        catalogs={catalogs}
        onSaved={async () => setError(null)}
        onError={setError}
      />
    </>
  );
}
