import { useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { planRows, type PlanKind } from "../../../packages/domain/src/hierarchy";
import { addDays, barPlacement, chartRanges, scheduleSpan, shiftSchedule, type ScheduledRange } from "../../../packages/domain/src/schedule";

type GanttIssue = {
  issueId: string;
  title: string;
  parentIssueId: string | null;
  startDate: string | null;
  finishDate: string | null;
  number: number | null;
  issueType: string | null;
  iterationTitle?: string | null;
  iterationStart?: string | null;
  iterationDuration?: number | null;
  kind?: PlanKind;
  depth: number;
};

const DAY = 86_400_000;

/** Gantt for GitHub Start and Finish dates. Drag moves or resizes a bar. Empty tasks stay unscheduled. */
export function GanttChart({
  issues,
  workstreamNumber,
  datesReady,
  admin,
  busy,
  onSchedule,
  onEnsureFields,
  conflictIds,
}: {
  issues: Omit<GanttIssue, "depth">[];
  workstreamNumber: number | null;
  datesReady: boolean;
  admin: boolean;
  busy: boolean;
  onSchedule: (issueId: string, startDate: string, finishDate: string) => Promise<void>;
  onEnsureFields: () => Promise<void>;
  conflictIds: string[];
}) {
  const today = localToday();
  const rows = planRows(
    issues.map((issue) => ({ ...issue, number: issue.number ?? null, issueType: issue.issueType ?? null })),
    workstreamNumber,
  );
  const ranges = chartRanges(rows);
  const span = scheduleSpan(
    ranges.map((range) => ({ startDate: range?.start ?? null, finishDate: range?.finish ?? null })),
    today,
  );
  const marks = [...new Set([0, Math.floor(span.days / 2), Math.max(span.days - 1, 0)])];
  const [draft, setDraft] = useState<{ issueId: string; startDate: string; finishDate: string } | null>(null);

  function beginDrag(event: ReactPointerEvent, issue: GanttIssue, edge: "move" | "start" | "finish") {
    if (!datesReady || !issue.startDate || !issue.finishDate) return;
    event.preventDefault();
    event.stopPropagation();
    const track = (event.currentTarget as HTMLElement).closest(".gantt-track");
    if (!(track instanceof HTMLElement)) return;
    const width = track.getBoundingClientRect().width;
    const originX = event.clientX;
    const start = issue.startDate;
    const finish = issue.finishDate;
    const dayWidth = width / span.days;
    function move(ev: PointerEvent) {
      const delta = Math.round((ev.clientX - originX) / dayWidth);
      setDraft({ issueId: issue.issueId, ...shiftSchedule(start, finish, edge, delta) });
    }
    function up(ev: PointerEvent) {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const delta = Math.round((ev.clientX - originX) / dayWidth);
      setDraft(null);
      if (delta === 0) return;
      const next = shiftSchedule(start, finish, edge, delta);
      void onSchedule(issue.issueId, next.startDate, next.finishDate);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <section className="panel gantt">
      <h3>Gantt</h3>
      <p className="copy">
        Start and Finish are date fields on the GitHub project. An Iteration uses that iteration's dates for the bar. Drag a bar to move both dates when the task has no Iteration. Drag either end to change that date. A task with no dates stays off the chart until both dates are set.
      </p>
      {!datesReady && (
        <p className="copy">
          {admin
            ? "This GitHub project does not have Start and Finish date fields yet."
            : "An administrator needs to add Start and Finish date fields on the GitHub project."}
        </p>
      )}
      {!datesReady && admin && (
        <button className="btn small" type="button" disabled={busy} onClick={() => void onEnsureFields()}>
          Add Start and Finish fields
        </button>
      )}
      <div className="gantt-scale">
        <span />
        <div className="gantt-days">
          {marks.map((offset) => (
            <span key={offset} style={{ left: `${(offset / span.days) * 100}%` }}>
              {addDays(span.origin, offset).slice(5)}
            </span>
          ))}
        </div>
      </div>
      {rows.length === 0 && <p className="copy">No issues yet. Connect the GitHub project.</p>}
      {rows.map((issue, index) => {
        const range = draft?.issueId === issue.issueId ? { start: draft.startDate, finish: draft.finishDate, fromIteration: false } : ranges[index];
        const summary = issue.kind === "epic" || issue.kind === "feature";
        const draggable = Boolean(range && !range.fromIteration && !summary);
        return (
          <div className="gantt-row" key={issue.issueId}>
            <div style={{ paddingLeft: issue.depth * 16 }}>
              <strong>{issue.title}</strong>
              {conflictIds.includes(issue.issueId) && <span className="pill orange">Overlap</span>}
              <div className="muted small">{range ? rangeLabel(issue, range) : "Not scheduled"}</div>
              <DateFields key={`${issue.startDate ?? ""}:${issue.finishDate ?? ""}`} issue={issue} datesReady={datesReady} busy={busy} onSchedule={onSchedule} />
            </div>
            <div className="gantt-track">
              {range && (
                <div
                  className={summary || range.fromIteration ? "gantt-bar rollup" : "gantt-bar"}
                  style={barPlacement(range.start, range.finish, span.origin, span.days)}
                  role="slider"
                  aria-valuemin={0}
                  aria-valuemax={span.days}
                  aria-valuenow={Math.round((Date.parse(range.start) - Date.parse(span.origin)) / DAY)}
                  aria-label={`${issue.title}, ${range.start} to ${range.finish}.`}
                  onPointerDown={(event) => {
                    if (!draggable || !issue.startDate || !issue.finishDate) return;
                    beginDrag(event, { ...issue, startDate: issue.startDate, finishDate: issue.finishDate }, "move");
                  }}
                >
                  {draggable && (
                    <>
                      <span className="gantt-handle" aria-hidden="true" onPointerDown={(event) => issue.startDate && issue.finishDate && beginDrag(event, { ...issue, startDate: issue.startDate, finishDate: issue.finishDate }, "start")} />
                      <span className="gantt-handle" aria-hidden="true" onPointerDown={(event) => issue.startDate && issue.finishDate && beginDrag(event, { ...issue, startDate: issue.startDate, finishDate: issue.finishDate }, "finish")} />
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function DateFields({
  issue,
  datesReady,
  busy,
  onSchedule,
}: {
  issue: GanttIssue;
  datesReady: boolean;
  busy: boolean;
  onSchedule: (issueId: string, startDate: string, finishDate: string) => Promise<void>;
}) {
  const [start, setStart] = useState(issue.startDate ?? "");
  const [finish, setFinish] = useState(issue.finishDate ?? "");
  const [localError, setLocalError] = useState<string | null>(null);
  const unchanged = start === (issue.startDate ?? "") && finish === (issue.finishDate ?? "");

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!start || !finish) {
      setLocalError("Set both a start date and a finish date.");
      return;
    }
    if (finish < start) {
      setLocalError("The finish date cannot be before the start date.");
      return;
    }
    setLocalError(null);
    void onSchedule(issue.issueId, start, finish);
  }

  return (
    <form className="gantt-dates" onSubmit={onSubmit}>
      <label>
        Start
        <input type="date" value={start} onChange={(event) => setStart(event.target.value)} disabled={!datesReady || busy} />
      </label>
      <label>
        Finish
        <input type="date" value={finish} onChange={(event) => setFinish(event.target.value)} disabled={!datesReady || busy} />
      </label>
      <button className="btn small" type="submit" disabled={!datesReady || busy || unchanged}>
        Save dates
      </button>
      {localError && <span className="error">{localError}</span>}
    </form>
  );
}

function localToday(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function rangeLabel(issue: { iterationTitle?: string | null }, range: ScheduledRange): string {
  const dates = `${range.start} – ${range.finish}`;
  return range.fromIteration && issue.iterationTitle ? `${issue.iterationTitle} · ${dates}` : dates;
}
