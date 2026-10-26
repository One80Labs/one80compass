import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { orderedIssues } from "../../../packages/domain/src/hierarchy";
import type { ProposedShift } from "../../../packages/domain/src/dependencies";
import { scheduleConflicts } from "../../../packages/domain/src/dependencies";
import type { MilestoneView } from "../../../packages/domain/src/milestones";
import { api, ApiError } from "./api";
import type { Session } from "./auth";
import type { BaselineRecord } from "../../../packages/domain/src/baselines";
import { GanttChart } from "./gantt";
import { BaselinesPanel } from "./baselines";
import { usePortal } from "./shell";
import { EditDrawer, EditRowButton, Notice, PageHead, Pill, Tabs } from "./ui";

type PlanIssue = {
  issueId: string;
  title: string;
  status: string;
  effort: number | null;
  number: number | null;
  parentIssueId: string | null;
  startDate: string | null;
  finishDate: string | null;
  predecessorIds: string[];
  inProject?: boolean;
  archived?: boolean;
  deletedAt?: string | null;
};
type IssueEdit = { title: string; status: string; effort: number | null; startDate?: string | null; finishDate?: string | null };
type PlanResponse = {
  settings: {
    owner: string;
    repo: string;
    projectNumber: number;
    columns: string[];
    startFieldId: string | null;
    finishFieldId: string | null;
  } | null;
  sync: { status: string; detail: string | null };
  issues: PlanIssue[];
  progress: { label: string; defaultedIssueIds: string[] };
  override: { percent: number; explanation: string; calculatedPercent: number | null } | null;
  milestones: MilestoneView[];
  baselines: BaselineRecord[];
};

const defaultColumns = ["Todo", "In Progress", "Done"];

export function PlanPage({ session }: { session: Session | null }) {
  const plan = usePlan(session);
  const { projectId = "" } = useParams();
  const name = usePortal().projects.find((item) => item.projectId === projectId)?.name ?? "this project";
  const [tab, setTab] = useState("Timeline view");
  const [notice, setNotice] = useState(false);
  const columns = plan.data?.settings?.columns?.length ? plan.data.settings.columns : defaultColumns;
  const issues = plan.data?.issues ?? [];
  const done = issues.filter((issue) => issue.status === "Done").length;
  return (
    <>
      <PageHead
        title="Project plan."
        subtitle={`Milestones, phases, and tasks for ${name}.`}
        action={
          <button className="btn primary" type="button" onClick={() => setNotice(true)}>
            Add milestone
          </button>
        }
      />
      <PlanStatus plan={plan} session={session} />
      {plan.data && <MilestonePanel session={session} projectId={projectId} milestones={plan.data.milestones ?? []} onReload={plan.reload} />}
      <Tabs label="Plan" tabs={["Timeline view", "Gantt", "List view", "Dependencies", "Baselines"]} value={tab} onChange={setTab} />
      {tab === "Timeline view" && (
        <div>
          {columns.map((column) => {
            const rows = issues.filter((issue) => issue.status === column);
            const width = issues.length === 0 ? 0 : Math.round((rows.length / issues.length) * 100);
            return (
              <div className={`phase ${rows.length ? "active" : ""}`} key={column}>
                <div className="phase-head">
                  <div>
                    <strong>{column}</strong>
                    <br />
                    <small>Dates are edited on the Gantt tab</small>
                  </div>
                  <div className="phase-score">
                    <span>
                      {rows.length} of {issues.length} tasks
                    </span>
                    <div className="progressline">
                      <span style={{ width: `${width}%` }} />
                    </div>
                    <strong>{width}%</strong>
                  </div>
                </div>
                {rows.length > 0 && (
                  <div className="phase-tasks">
                    {rows.map((issue) => (
                      <div className="taskline" key={issue.issueId}>
                        <span className={`status-icon ${issue.status === "Done" ? "done" : issue.status === "In Progress" ? "review" : ""}`}>
                          {issue.status === "Done" ? "●" : issue.status === "In Progress" ? "◐" : "○"}
                        </span>
                        {issue.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {issues.length === 0 && <p className="copy">No issues yet. Connect the GitHub project. Title, status, and effort can be edited in List view after the issues load.</p>}
          {plan.data && <p className="muted small">Calculated progress: {plan.data.progress.label}. Done tasks: {done}.</p>}
          <p className="copy">
            A parent task comes from a GitHub sub-issue. It is marked Done when every task under it is Done, and it moves back to the first column that is not Done when one of those tasks leaves Done.
          </p>
        </div>
      )}
      {tab === "Gantt" && (
        <GanttChart
          issues={issues}
          datesReady={Boolean(plan.data?.settings?.startFieldId && plan.data.settings.finishFieldId)}
          admin={Boolean(session?.adminGroup)}
          busy={plan.busy}
          onSchedule={(issueId, startDate, finishDate) => plan.schedule(issueId, startDate, finishDate)}
          onEnsureFields={() => plan.ensureFields()}
          conflictIds={overlapIds(issues)}
        />
      )}
      {tab === "List view" && plan.data && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Issue</th>
                <th>Status</th>
                <th>Effort</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orderedIssues(plan.data.issues).map((issue) => (
                <IssueRow
                  key={issue.issueId}
                  issue={issue}
                  depth={issue.depth}
                  columns={columns}
                  defaulted={plan.data?.progress.defaultedIssueIds.includes(issue.issueId) ?? false}
                  onSave={plan.saveIssue}
                />
              ))}
            </tbody>
          </table>
          {plan.data.issues.length === 0 && <div className="empty">No issues yet. Connect the GitHub project and wait for sync.</div>}
        </div>
      )}
      {tab === "Dependencies" && <DependenciesPanel issues={issues} busy={plan.busy} onLink={plan.linkPredecessor} />}
      {tab === "Baselines" && (
        <BaselinesPanel
          admin={Boolean(session?.adminGroup)}
          issues={issues.map((issue) => ({
            issueId: issue.issueId,
            title: issue.title,
            startDate: issue.startDate,
            finishDate: issue.finishDate,
            inProject: issue.inProject !== false,
            archived: Boolean(issue.archived),
            deletedAt: issue.deletedAt ?? null,
          }))}
          baselines={plan.data?.baselines ?? []}
          busy={plan.busy}
          onCreate={(explanation) => plan.createBaseline(explanation)}
          onDecide={(baselineId, action, explanation) => plan.decideBaseline(baselineId, action, explanation)}
        />
      )}
      {plan.review && (
        <div className="dialog-layer">
          <div className="dialog" role="dialog" aria-labelledby="dependency-review-title">
            <h2 id="dependency-review-title">Later tasks are affected</h2>
            <p>Approving moves each task below so it starts the day after the task it depends on. Keeping the later dates leaves the overlap on the plan.</p>
            <ul>
              {plan.review.proposals.map((proposal) => (
                <li key={proposal.issueId}>
                  {proposal.title} moves from {proposal.fromStart} – {proposal.fromFinish} to {proposal.toStart} – {proposal.toFinish}.
                </li>
              ))}
            </ul>
            <div className="dialog-actions">
              <button className="btn primary" type="button" disabled={plan.busy} onClick={() => void plan.decide("approve")}>
                Approve the moves
              </button>
              <button className="btn" type="button" disabled={plan.busy} onClick={() => void plan.decide("reject")}>
                Keep the later dates
              </button>
              <button className="btn" type="button" disabled={plan.busy} onClick={plan.clearReview}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {notice && (
        <Notice
          title="Add milestone"
          body="Milestones are created in GitHub. After every task on a milestone is Done, confirm it here. Reopening a confirmation requires an explanation."
          onClose={() => setNotice(false)}
        />
      )}
    </>
  );
}

export function KanbanPage({ session }: { session: Session | null }) {
  const plan = usePlan(session);
  const { projectId = "" } = useParams();
  const name = usePortal().projects.find((item) => item.projectId === projectId)?.name ?? "this project";
  const [filter, setFilter] = useState("All tasks");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState(false);
  const [editing, setEditing] = useState<PlanIssue | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, string>>({});
  const attempts = useRef<Record<string, number>>({});
  const columns = plan.data?.settings?.columns?.length ? plan.data.settings.columns : defaultColumns;
  let issues = plan.data?.issues.filter((issue) => issue.title.toLowerCase().includes(query.toLowerCase())) ?? [];
  if (filter !== "All tasks") issues = [];

  function shownStatus(issue: PlanIssue): string {
    return pending[issue.issueId] ?? issue.status;
  }

  useEffect(() => {
    if (!plan.data) return;
    setPending((current) => {
      let changed = false;
      const next = { ...current };
      for (const [issueId, status] of Object.entries(current)) {
        const issue = plan.data?.issues.find((item) => item.issueId === issueId);
        const rejected = plan.data?.sync.status === "failed" && issue != null && issue.status !== status;
        if (!issue || issue.status === status || rejected) {
          delete next[issueId];
          delete attempts.current[issueId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [plan.data]);

  useEffect(() => {
    const ids = Object.keys(pending);
    if (!session || ids.length === 0) return;
    const timer = window.setTimeout(() => {
      const giveUp = ids.some((id) => (attempts.current[id] ?? 0) >= 8);
      for (const id of ids) attempts.current[id] = (attempts.current[id] ?? 0) + 1;
      if (giveUp) {
        setPending((current) => {
          const next = { ...current };
          for (const id of ids) {
            if ((attempts.current[id] ?? 0) > 8) {
              delete next[id];
              delete attempts.current[id];
            }
          }
          return next;
        });
        plan.setError("GitHub has not confirmed the new status yet. Refresh the board in a moment.");
        return;
      }
      plan.reload().catch((caught) => plan.setError(message(caught)));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [pending, plan.data, session]);

  async function place(issueId: string, status: string) {
    const issue = plan.data?.issues.find((item) => item.issueId === issueId);
    if (!issue || (pending[issueId] ?? issue.status) === status) return;
    attempts.current[issueId] = 0;
    setPending((current) => ({ ...current, [issueId]: status }));
    try {
      await plan.move(issueId, status);
    } catch (caught) {
      delete attempts.current[issueId];
      setPending((current) => {
        const next = { ...current };
        delete next[issueId];
        return next;
      });
      plan.setError(message(caught));
    }
  }

  function startDrag(event: DragEvent<HTMLElement>, issue: PlanIssue) {
    const target = event.target as HTMLElement;
    if (target.closest("button, a")) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.setData("text/plain", issue.issueId);
    event.dataTransfer.effectAllowed = "move";
    setDraggingId(issue.issueId);
  }

  function dropOn(event: DragEvent<HTMLElement>, column: string) {
    event.preventDefault();
    const issueId = event.dataTransfer.getData("text/plain");
    setDraggingId(null);
    setOverColumn(null);
    if (issueId) void place(issueId, column);
  }

  return (
    <>
      <PageHead
        title="Kanban board."
        subtitle={`Track and manage project work for ${name}.`}
        action={
          <button className="btn primary" type="button" onClick={() => setNotice(true)}>
            Add task
          </button>
        }
      />
      <PlanStatus plan={plan} session={session} />
      <div className="toolbar">
        {["All tasks", "My tasks", "Due this week"].map((item) => (
          <button key={item} className={filter === item ? "btn small primary" : "btn small"} type="button" onClick={() => setFilter(item)}>
            {item}
          </button>
        ))}
        <input type="search" value={query} placeholder="Search tasks…" aria-label="Search tasks" onChange={(event) => setQuery(event.target.value)} />
      </div>
      {filter === "My tasks" && <p className="muted small">Assignees are not stored on tasks yet, so My tasks has nothing to show.</p>}
      {filter === "Due this week" && <p className="muted small">Due dates are not stored on tasks yet, so Due this week has nothing to show.</p>}
      <div className="kanban">
        {columns.map((column) => {
          const rows = issues.filter((issue) => shownStatus(issue) === column);
          return (
            <section
              className={overColumn === column ? "kanban-col over" : "kanban-col"}
              key={column}
              aria-label={column}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (overColumn !== column) setOverColumn(column);
              }}
              onDrop={(event) => dropOn(event, column)}
            >
              <div className="kanban-header">
                <span>{column}</span>
                <span>{rows.length}</span>
              </div>
              {rows.map((issue) => (
                <article
                  className={draggingId === issue.issueId ? "kanban-card dragging" : "kanban-card"}
                  key={issue.issueId}
                  draggable
                  aria-roledescription="draggable"
                  aria-label={`${issue.title}, ${shownStatus(issue)}. Drag to another column to change status.`}
                  onDragStart={(event) => startDrag(event, issue)}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOverColumn(null);
                  }}
                >
                  <div className="kanban-card-head">
                    <strong>{issue.title}</strong>
                    <EditRowButton label={`Edit ${issue.title}`} onClick={() => setEditing(issue)} />
                  </div>
                  <Pill tone="blue">{issue.effort == null ? "Unestimated" : `${issue.effort} pts`}</Pill>
                  <div className="kanban-foot">
                    <span>{scheduleLabel(issue)}</span>
                  </div>
                </article>
              ))}
            </section>
          );
        })}
      </div>
      {notice && (
        <Notice
          title="Add task"
          body="Tasks are created in the connected GitHub project. This board can change status, title, and effort for issues that already exist. It does not add a local-only task."
          onClose={() => setNotice(false)}
        />
      )}
      {editing && (
        <IssueDrawer
          key={editing.issueId}
          issue={editing}
          columns={columns}
          onClose={() => setEditing(null)}
          onSave={async (issueId, change) => {
            await plan.saveIssue(issueId, change);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function PlanStatus({ plan, session }: { plan: ReturnType<typeof usePlan>; session: Session | null }) {
  const { projectId = "" } = useParams();
  return (
    <>
      {!session && <p>Sign in to open this project.</p>}
      {plan.error && <p className="error">{plan.error}</p>}
      {plan.data && (
        <div className="row">
          <p className="muted small">
            Sync: {plan.data.sync.status}
            {plan.data.sync.detail ? ` — ${plan.data.sync.detail}` : ""}
            {plan.data.override ? ` Override: ${plan.data.override.percent}% (${plan.data.override.explanation}).` : ""}
          </p>
          {session && plan.data.settings && (
            <button className="btn small" type="button" onClick={() => plan.sync().catch((caught) => plan.setError(message(caught)))}>
              Sync from GitHub
            </button>
          )}
        </div>
      )}
      {plan.data && session?.adminGroup && (
        <GithubForm projectId={projectId} session={session} settings={plan.data.settings} onSaved={plan.reload} onError={plan.setError} />
      )}
      {session && plan.data && (
        <form
          className="toolbar"
          onSubmit={(event) => {
            plan.override(event).catch((caught) => plan.setError(message(caught)));
          }}
        >
          <label>
            Override percent
            <input value={plan.percent} onChange={(event) => plan.setPercent(event.target.value)} inputMode="decimal" required />
          </label>
          <label>
            Explanation
            <input value={plan.explanation} onChange={(event) => plan.setExplanation(event.target.value)} required />
          </label>
          <button className="btn" type="submit">
            Save override
          </button>
        </form>
      )}
    </>
  );
}

function IssueDrawer({
  issue,
  columns,
  onClose,
  onSave,
}: {
  issue: PlanIssue;
  columns: string[];
  onClose: () => void;
  onSave: (issueId: string, change: IssueEdit) => Promise<void>;
}) {
  const [title, setTitle] = useState(issue.title);
  const [status, setStatus] = useState(issue.status);
  const [effort, setEffort] = useState(issue.effort == null ? "" : String(issue.effort));
  const [startDate, setStartDate] = useState(issue.startDate ?? "");
  const [finishDate, setFinishDate] = useState(issue.finishDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const choices = columns.includes(status) || !status ? columns : [status, ...columns];

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = effort.trim() === "" ? null : Number(effort);
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
      setError("Effort must be a number that is zero or more.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(issue.issueId, {
        title,
        status,
        effort: parsed,
        ...(startDate !== (issue.startDate ?? "") ? { startDate: startDate || null } : {}),
        ...(finishDate !== (issue.finishDate ?? "") ? { finishDate: finishDate || null } : {}),
      });
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditDrawer title={issue.number ? `Issue #${issue.number}` : "Edit issue"} onClose={onClose} onSubmit={onSubmit} saving={saving}>
      <p>Title, status, effort, and dates are sent to GitHub. Estimate is used when the project has no Effort field. Start and Finish are the date fields. A parent stays open until every task under it is Done.</p>
      <label>
        Title
        <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} />
      </label>
      <label>
        Status
        <select className="field" value={status} onChange={(event) => setStatus(event.target.value)} required>
          {!status && <option value="">No status</option>}
          {choices.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label>
        Effort
        <input className="field" value={effort} onChange={(event) => setEffort(event.target.value)} inputMode="decimal" placeholder="Unestimated" />
      </label>
      <label>
        Start
        <input className="field" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
      </label>
      <label>
        Finish
        <input className="field" type="date" value={finishDate} onChange={(event) => setFinishDate(event.target.value)} />
      </label>
      {error && <p className="error">{error}</p>}
    </EditDrawer>
  );
}

function IssueRow({
  issue,
  depth,
  columns,
  defaulted,
  onSave,
}: {
  issue: PlanIssue;
  depth: number;
  columns: string[];
  defaulted: boolean;
  onSave: (issueId: string, change: { title: string; status: string; effort: number | null }) => Promise<void>;
}) {
  const [title, setTitle] = useState(issue.title);
  const [status, setStatus] = useState(issue.status);
  const [effort, setEffort] = useState(issue.effort == null ? "" : String(issue.effort));
  const choices = columns.includes(status) || !status ? columns : [status, ...columns];
  return (
    <tr>
      <td style={{ paddingLeft: 12 + depth * 18 }}>
        <label>
          {depth > 0 ? "Subtask" : issue.number ? `#${issue.number}` : "Title"}
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
          {defaulted ? " Estimate defaults to 1 until you save a number." : ""}
        </label>
      </td>
      <td>
        <Pill tone={status === "Done" ? "good" : status === "In Progress" ? "orange" : "blue"}>{status || "No status"}</Pill>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            {!status && <option value="">No status</option>}
            {choices.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </td>
      <td>
        <label>
          Effort
          <input value={effort} onChange={(event) => setEffort(event.target.value)} inputMode="decimal" />
        </label>
      </td>
      <td>
        <button
          className="btn small"
          type="button"
          onClick={() => {
            const parsed = effort.trim() === "" ? null : Number(effort);
            onSave(issue.issueId, { title, status, effort: parsed }).catch(() => undefined);
          }}
        >
          Save
        </button>
      </td>
    </tr>
  );
}

function GithubForm({
  projectId,
  session,
  settings,
  onSaved,
  onError,
}: {
  projectId: string;
  session: Session;
  settings: PlanResponse["settings"];
  onSaved: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [owner, setOwner] = useState(settings?.owner ?? "");
  const [repo, setRepo] = useState(settings?.repo ?? "");
  const [projectNumber, setProjectNumber] = useState(settings ? String(settings.projectNumber) : "");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        onError(null);
        try {
          await api(`/projects/${projectId}/github`, session.idToken, {
            method: "PUT",
            body: { owner, repo, projectNumber: Number(projectNumber) },
          });
          await onSaved();
        } catch (caught) {
          onError(message(caught));
        }
      }}
    >
      <h2>GitHub project</h2>
      <p className="muted small">
        For the current test board use owner One80Labs, repository one80compass, and project number 1. That board is an organization project. Issues are read from the repository named here. Columns follow the GitHub Status field, and Estimate is used when Effort is absent.
      </p>
      <label>
        Owner
        <input value={owner} onChange={(event) => setOwner(event.target.value)} required />
      </label>
      <label>
        Repository
        <input value={repo} onChange={(event) => setRepo(event.target.value)} required />
      </label>
      <label>
        Project number
        <input value={projectNumber} onChange={(event) => setProjectNumber(event.target.value)} inputMode="numeric" required />
      </label>
      <button className="btn" type="submit">Save GitHub mapping</button>
    </form>
  );
}

function usePlan(session: Session | null) {
  const { projectId = "" } = useParams();
  const [data, setData] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ issueId: string; body: Record<string, unknown>; proposals: ProposedShift[] } | null>(null);
  const [percent, setPercent] = useState("");
  const [explanation, setExplanation] = useState("");

  async function reload() {
    if (!session) return;
    const result = await api<PlanResponse>(`/projects/${projectId}/plan`, session.idToken);
    setData(result);
  }

  async function poll(match: (result: PlanResponse) => boolean) {
    if (!session) return;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const result = await api<PlanResponse>(`/projects/${projectId}/plan`, session.idToken);
      setData(result);
      if (result.sync.status === "failed") throw new Error(result.sync.detail ?? "GitHub did not accept the change.");
      if (match(result)) return;
    }
    throw new Error("GitHub has not confirmed the change yet. Refresh the plan in a moment.");
  }

  function openReview(caught: unknown, issueId: string, body: Record<string, unknown>): boolean {
    if (!(caught instanceof ApiError) || caught.code !== "DEPENDENCY_REVIEW" || !Array.isArray(caught.payload.proposals)) return false;
    setReview({ issueId, body, proposals: caught.payload.proposals as ProposedShift[] });
    return true;
  }

  async function patchIssue(issueId: string, body: Record<string, unknown>, proposals: ProposedShift[]) {
    if (!session) return;
    await api(`/projects/${projectId}/issues/${issueId}`, session.idToken, {
      method: "PATCH",
      body: { ...body, idempotencyKey: crypto.randomUUID() },
    });
    await poll((result) => {
      const row = result.issues.find((item) => item.issueId === issueId);
      const startOk = body.startDate === undefined || row?.startDate === body.startDate;
      const finishOk = body.finishDate === undefined || row?.finishDate === body.finishDate;
      const shifted = proposals.every((proposal) => {
        const later = result.issues.find((item) => item.issueId === proposal.issueId);
        return later?.startDate === proposal.toStart && later.finishDate === proposal.toFinish;
      });
      return Boolean(startOk && finishOk && shifted);
    });
  }

  useEffect(() => {
    if (!session) return;
    reload().catch((caught) => setError(message(caught)));
  }, [projectId, session]);

  return {
    data,
    error,
    setError,
    busy,
    review,
    clearReview() {
      setReview(null);
    },
    percent,
    setPercent,
    explanation,
    setExplanation,
    reload,
    async saveIssue(issueId: string, change: IssueEdit) {
      if (!session) return;
      setError(null);
      if (change.effort != null && (!Number.isFinite(change.effort) || change.effort < 0)) {
        const text = "Effort must be a number that is zero or more.";
        setError(text);
        throw new Error(text);
      }
      try {
        if (change.startDate !== undefined || change.finishDate !== undefined) {
          await patchIssue(issueId, change, []);
        } else {
          await api(`/projects/${projectId}/issues/${issueId}`, session.idToken, {
            method: "PATCH",
            body: { ...change, idempotencyKey: crypto.randomUUID() },
          });
          await reload();
        }
      } catch (caught) {
        if (openReview(caught, issueId, change)) return;
        setError(message(caught));
        throw caught;
      }
    },
    async move(issueId: string, status: string) {
      if (!session) return;
      setError(null);
      await api(`/projects/${projectId}/issues/${issueId}`, session.idToken, {
        method: "PATCH",
        body: { status, idempotencyKey: crypto.randomUUID() },
      });
      await reload();
    },
    async schedule(issueId: string, startDate: string, finishDate: string) {
      if (!session) return;
      setError(null);
      setBusy(true);
      try {
        await patchIssue(issueId, { startDate, finishDate }, []);
      } catch (caught) {
        if (openReview(caught, issueId, { startDate, finishDate })) return;
        setError(message(caught));
        throw caught;
      } finally {
        setBusy(false);
      }
    },
    async decide(decision: "approve" | "reject") {
      if (!session || !review) return;
      setError(null);
      setBusy(true);
      try {
        await patchIssue(review.issueId, { ...review.body, dependencyDecision: decision }, decision === "approve" ? review.proposals : []);
        setReview(null);
      } catch (caught) {
        setError(message(caught));
      } finally {
        setBusy(false);
      }
    },
    async linkPredecessor(issueId: string, predecessorId: string, action: "add" | "remove") {
      if (!session) return;
      setError(null);
      setBusy(true);
      try {
        const path = action === "add" ? "predecessors" : "predecessors/remove";
        await api(`/projects/${projectId}/issues/${issueId}/${path}`, session.idToken, { method: "POST", body: { predecessorId } });
        await poll((result) => {
          const row = result.issues.find((item) => item.issueId === issueId);
          const linked = row?.predecessorIds.includes(predecessorId) ?? false;
          return action === "add" ? linked : !linked;
        });
      } catch (caught) {
        setError(message(caught));
      } finally {
        setBusy(false);
      }
    },
    async createBaseline(explanation: string) {
      if (!session) return;
      setError(null);
      setBusy(true);
      try {
        await api(`/projects/${projectId}/baselines`, session.idToken, { method: "POST", body: { explanation } });
        await reload();
      } catch (caught) {
        setError(message(caught));
        throw caught;
      } finally {
        setBusy(false);
      }
    },
    async decideBaseline(baselineId: string, action: "approve" | "reject", explanation: string) {
      if (!session) return;
      setError(null);
      setBusy(true);
      try {
        await api(`/projects/${projectId}/baselines/${encodeURIComponent(baselineId)}/${action}`, session.idToken, {
          method: "POST",
          body: { explanation },
        });
        await reload();
      } catch (caught) {
        setError(message(caught));
        throw caught;
      } finally {
        setBusy(false);
      }
    },
    async ensureFields() {
      if (!session) return;
      setError(null);
      setBusy(true);
      try {
        await api(`/projects/${projectId}/schedule-fields`, session.idToken, { method: "POST", body: {} });
        await poll((result) => Boolean(result.settings?.startFieldId && result.settings.finishFieldId));
      } catch (caught) {
        setError(message(caught));
        throw caught;
      } finally {
        setBusy(false);
      }
    },
    async sync() {
      if (!session) return;
      setError(null);
      await api(`/projects/${projectId}/sync`, session.idToken, { method: "POST" });
      for (let attempt = 0; attempt < 6; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 700));
        const result = await api<PlanResponse>(`/projects/${projectId}/plan`, session.idToken);
        setData(result);
        if (result.sync.status !== "pending") return;
      }
    },
    async override(event: FormEvent) {
      event.preventDefault();
      if (!session) return;
      setError(null);
      await api(`/projects/${projectId}/progress-override`, session.idToken, {
        method: "POST",
        body: { percent: Number(percent), explanation },
      });
      setPercent("");
      setExplanation("");
      await reload();
    },
  };
}

function message(caught: unknown): string {
  return caught instanceof Error || caught instanceof ApiError ? caught.message : "Request failed.";
}

function scheduleLabel(issue: { startDate: string | null; finishDate: string | null }): string {
  if (issue.startDate && issue.finishDate) return `${issue.startDate} – ${issue.finishDate}`;
  return issue.startDate ?? issue.finishDate ?? "Not scheduled";
}

function dependencyIssues(issues: PlanIssue[]) {
  return issues.map((issue) => ({
    issueId: issue.issueId,
    title: issue.title,
    startDate: issue.startDate,
    finishDate: issue.finishDate,
    predecessorIds: issue.predecessorIds ?? [],
    inProject: true,
    archived: false,
    deletedAt: null,
  }));
}

function overlapIds(issues: PlanIssue[]): string[] {
  return scheduleConflicts(dependencyIssues(issues))
    .filter((conflict) => conflict.reason === "overlap")
    .map((conflict) => conflict.issueId);
}

function DependenciesPanel({
  issues,
  busy,
  onLink,
}: {
  issues: PlanIssue[];
  busy: boolean;
  onLink: (issueId: string, predecessorId: string, action: "add" | "remove") => Promise<void>;
}) {
  const rows = orderedIssues(issues).map((issue) => ({ ...issue, predecessorIds: issue.predecessorIds ?? [] }));
  const conflicts = scheduleConflicts(dependencyIssues(rows));
  return (
    <section className="panel">
      <h3>Dependencies</h3>
      <p className="copy">
        A later task is blocked by an earlier task in GitHub. It starts the day after that task finishes. A date change asks before those later tasks move.
      </p>
      {rows.length === 0 && <p className="copy">No issues yet. Connect the GitHub project.</p>}
      {rows.map((issue) => {
        const predecessors = rows.filter((item) => issue.predecessorIds.includes(item.issueId));
        const choices = rows.filter((item) => item.issueId !== issue.issueId && !issue.predecessorIds.includes(item.issueId));
        const notes = conflicts.filter((conflict) => conflict.issueId === issue.issueId);
        return (
          <article className="milestone" key={issue.issueId}>
            <strong>{issue.title}</strong>
            {predecessors.length === 0 && <p className="small muted">No predecessor.</p>}
            {predecessors.map((predecessor) => (
              <p className="small" key={predecessor.issueId}>
                After {predecessor.title}.{" "}
                <button className="btn small" type="button" disabled={busy} onClick={() => void onLink(issue.issueId, predecessor.issueId, "remove")}>
                  Remove
                </button>
              </p>
            ))}
            {notes.map((note) => (
              <p className="small" key={note.predecessorId}>
                {note.reason === "overlap" ? `Starts before ${note.predecessorTitle} finishes.` : `Not scheduled after ${note.predecessorTitle}.`}
              </p>
            ))}
            <PredecessorForm choices={choices} busy={busy} onAdd={(predecessorId) => onLink(issue.issueId, predecessorId, "add")} />
          </article>
        );
      })}
    </section>
  );
}

function PredecessorForm({
  choices,
  busy,
  onAdd,
}: {
  choices: { issueId: string; title: string }[];
  busy: boolean;
  onAdd: (predecessorId: string) => Promise<void>;
}) {
  const [predecessorId, setPredecessorId] = useState("");
  if (choices.length === 0) return null;
  return (
    <form
      className="row"
      onSubmit={(event) => {
        event.preventDefault();
        if (!predecessorId) return;
        void onAdd(predecessorId).then(() => setPredecessorId(""));
      }}
    >
      <label>
        Predecessor
        <select value={predecessorId} onChange={(event) => setPredecessorId(event.target.value)}>
          <option value="">Choose a task</option>
          {choices.map((choice) => (
            <option key={choice.issueId} value={choice.issueId}>
              {choice.title}
            </option>
          ))}
        </select>
      </label>
      <button className="btn small" type="submit" disabled={busy || !predecessorId}>
        Add predecessor
      </button>
    </form>
  );
}

const milestoneLabel = { open: "Open", ready: "Ready for confirmation", confirmed: "Confirmed" };

/** GitHub milestones on this project, with confirmation once every task on the milestone is Done. */
export function MilestonePanel({
  session,
  projectId,
  milestones,
  onReload,
}: {
  session: Session | null;
  projectId: string;
  milestones: MilestoneView[];
  onReload: () => Promise<void>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [explanation, setExplanation] = useState("");
  const [pending, setPending] = useState<string | null>(null);

  async function confirm(key: string) {
    if (!session) return;
    setError(null);
    setPending(key);
    try {
      await api(`/projects/${projectId}/milestones/${encodeURIComponent(key)}/confirm`, session.idToken, { method: "POST", body: {} });
      await onReload();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  async function reopen(key: string) {
    if (!session) return;
    setError(null);
    setPending(key);
    try {
      await api(`/projects/${projectId}/milestones/${encodeURIComponent(key)}/reopen`, session.idToken, {
        method: "POST",
        body: { explanation },
      });
      setExplanation("");
      await onReload();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="panel">
      <h3>Milestones</h3>
      <p className="copy">
        A milestone is created in GitHub. It is ready for confirmation when every task on it is Done. The target date is the GitHub due date. The forecast is the latest finish date, and only when every task on the milestone has one.
      </p>
      {error && <p className="error">{error}</p>}
      {milestones.length === 0 && <p className="copy">No GitHub milestones on this project yet.</p>}
      {milestones.map((milestone) => (
        <article className="milestone" key={milestone.key}>
          <div className="milestone-head">
            <strong>{milestone.title}</strong>
            <Pill tone={milestone.state === "confirmed" ? "good" : milestone.late ? "orange" : "blue"}>{milestone.late ? "Late" : milestoneLabel[milestone.state]}</Pill>
          </div>
          <p className="small muted">
            Target {milestone.targetDate ?? "not set"}. Forecast {milestone.forecastDate ?? "not set"}. {milestone.doneCount} done, {milestone.openCount} open.
            {milestone.confirmedAt ? ` Confirmed ${milestone.confirmedAt.slice(0, 10)}.` : ""}
          </p>
          {milestone.state === "confirmed" && milestone.workOpen && (
            <p className="copy">A task on this milestone is open again. Reopen the confirmation and include the reason.</p>
          )}
          {session && milestone.state === "ready" && (
            <button className="btn small" type="button" disabled={pending === milestone.key} onClick={() => confirm(milestone.key)}>
              Confirm milestone
            </button>
          )}
          {session && milestone.state === "confirmed" && (
            <form
              className="row"
              onSubmit={(event) => {
                event.preventDefault();
                void reopen(milestone.key);
              }}
            >
              <label>
                Reason to reopen
                <input value={explanation} onChange={(event) => setExplanation(event.target.value)} required maxLength={500} />
              </label>
              <button className="btn small" type="submit" disabled={pending === milestone.key}>
                Reopen milestone
              </button>
            </form>
          )}
        </article>
      ))}
    </section>
  );
}
