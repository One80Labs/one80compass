import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { orderedIssues, planBands, planKind, type PlanKind } from "../../../packages/domain/src/hierarchy";
import type { ProposedShift } from "../../../packages/domain/src/dependencies";
import { scheduleConflicts } from "../../../packages/domain/src/dependencies";
import { addDays, barPlacement, chartRanges, datesAfterIterationPick, datesAreDerived, derivedSchedule, iterationFinish, scheduleSpan, scheduleText, type ScheduledRange } from "../../../packages/domain/src/schedule";
import type { MilestoneView } from "../../../packages/domain/src/milestones";
import { api, ApiError } from "./api";
import type { Session } from "./auth";
import type { BaselineRecord } from "../../../packages/domain/src/baselines";
import { BaselinesPanel } from "./baselines";
import { Catalogs } from "./catalogs";
import { CompassIssueDrawer } from "./compass-drawer";
import { usePortal } from "./shell";
import { EditDrawer, EditRowButton, Notice, PageHead, Pill, Tabs } from "./ui";

type PlanIssue = {
  issueId: string;
  title: string;
  description?: string | null;
  status: string;
  effort: number | null;
  number: number | null;
  parentIssueId: string | null;
  issueType: string | null;
  startDate: string | null;
  finishDate: string | null;
  iterationTitle?: string | null;
  iterationStart?: string | null;
  iterationDuration?: number | null;
  iterationId?: string | null;
  assignees?: { id: string; login: string; name: string | null }[];
  comments?: string | null;
  predecessorIds: string[];
  milestone?: string | null;
  milestoneId?: string | null;
  priority?: string | null;
  labels?: string[];
  relationships?: { id: string; kind: string; otherIssueId: string }[];
  inProject?: boolean;
  archived?: boolean;
  deletedAt?: string | null;
};
type IssueEdit = {
  title: string;
  description?: string | null;
  status: string;
  effort: number | null;
  startDate?: string | null;
  finishDate?: string | null;
  iterationId?: string | null;
  assigneeId?: string | null;
  assigneeIds?: string[];
  comment?: string;
  issueType?: string | null;
  parentIssueId?: string | null;
  milestone?: string | null;
  priority?: string | null;
  labels?: string[];
  predecessorIds?: string[];
  relationships?: { id: string; kind: string; otherIssueId: string }[];
};
type IterationChoice = { id: string; title: string; startDate: string; duration: number };
type GitHubUser = { id: string; login: string; name: string | null };
type PlanResponse = {
  settings: {
    owner: string;
    repo: string;
    projectNumber: number;
    workstreamNumber: number | null;
    iterations?: IterationChoice[];
    assignableUsers?: GitHubUser[];
    columns: string[];
    startFieldId: string | null;
    finishFieldId: string | null;
    recordSource?: "github" | "compass";
    statusOptions?: { id: string; name: string }[];
    doneStatuses?: string[];
    labels?: { id: string; name: string }[];
    issueTypes?: { id: string; name: string }[];
    priorityOptions?: { id: string; name: string }[];
    milestones?: { id: string; title: string; dueOn: string | null }[];
  } | null;
  sync: { status: string; detail: string | null };
  issues: PlanIssue[];
  progress: { label: string; defaultedIssueIds: string[] };
  override: { percent: number; explanation: string; calculatedPercent: number | null } | null;
  milestones: MilestoneView[];
  baselines: BaselineRecord[];
  members?: { id: string; login: string; name: string | null }[];
};

const defaultColumns = ["Todo", "In Progress", "Done"];

export function PlanPage({ session }: { session: Session | null }) {
  const plan = usePlan(session);
  const { projectId = "" } = useParams();
  const portal = usePortal();
  const canWrite = portal.canWrite;
  const name = portal.projects.find((item) => item.projectId === projectId)?.name ?? "this project";
  const [tab, setTab] = useState("Timeline view");
  const [notice, setNotice] = useState(false);
  const columns = plan.data?.settings?.columns?.length ? plan.data.settings.columns : defaultColumns;
  const issues = plan.data?.issues ?? [];
  const workstreamNumber = plan.data?.settings?.workstreamNumber ?? null;
  const bands = planBands(issues.map(planNode), workstreamNumber);
  const [addKind, setAddKind] = useState<Exclude<PlanKind, "workstream"> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = issues.find((issue) => issue.issueId === editingId) ?? null;
  const done = issues.filter((issue) => issue.status === "Done").length;
  return (
    <>
      <PageHead
        title="Project plan."
        subtitle={`Milestones, phases, and tasks for ${name}.`}
        action={
          canWrite ? (
            <button className="btn primary" type="button" onClick={() => setNotice(true)}>
              Add milestone
            </button>
          ) : undefined
        }
      />
      <PlanStatus plan={plan} session={session} canWrite={canWrite} />
      {plan.data && <MilestonePanel session={session} projectId={projectId} canWrite={canWrite} milestones={plan.data.milestones ?? []} onReload={plan.reload} />}
      <Tabs label="Plan" tabs={["Timeline view", "Dependencies", "Baselines"]} value={tab} onChange={setTab} />
      {tab === "Timeline view" && (
        <div>
          {plan.data && canWrite && <AddPlanBar onAdd={setAddKind} />}
          <TimelineChart bands={bands} onEdit={canWrite ? setEditingId : null} />
          {issues.length === 0 && <p className="copy">No issues yet. Connect the GitHub project. Title, status, effort, and dates can be edited from a row after the issues load.</p>}
          {plan.data && <p className="muted small">Calculated progress: {plan.data.progress.label}. Done tasks: {done}.</p>}
          <p className="copy">
            The plan is grouped by Epic. Date bars use the Start and Finish fields. An Epic or Feature can keep its own dates until a task or sub-issue is added, and then those dates come from the tasks under it. A parent is marked Done when every task under it is Done, and it moves back to the first column that is not Done when one of those tasks leaves Done.
          </p>
        </div>
      )}
      {tab === "Dependencies" && <DependenciesPanel issues={issues} busy={plan.busy} readOnly={!canWrite} onLink={plan.linkPredecessor} />}
      {tab === "Baselines" && (
        <BaselinesPanel
          admin={Boolean(session?.adminGroup)}
          canWrite={canWrite}
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
      {addKind && (
        <AddPlanDrawer
          kind={addKind}
          issues={issues}
          columns={columns}
          iterations={plan.data?.settings?.iterations ?? []}
          users={plan.data?.settings?.assignableUsers ?? []}
          workstreamNumber={workstreamNumber}
          busy={plan.busy}
          onClose={() => setAddKind(null)}
          onCreate={(kind, title, parentIssueId, draft) => plan.createPlanItem(kind, title, parentIssueId, draft)}
        />
      )}
      {editing && canWrite && plan.data?.settings?.recordSource === "compass" && (
        <CompassIssueDrawer
          key={editing.issueId}
          issue={editing}
          issues={issues}
          catalogs={{
            statusOptions: plan.data.settings.statusOptions ?? [],
            labels: plan.data.settings.labels ?? [],
            issueTypes: plan.data.settings.issueTypes ?? [],
            priorityOptions: plan.data.settings.priorityOptions ?? [],
            milestones: plan.data.settings.milestones ?? [],
          }}
          members={plan.data.members ?? []}
          columns={columns}
          iterations={plan.data.settings.iterations ?? []}
          users={plan.data.settings.assignableUsers ?? []}
          datesDerived={derivedDates(editing, issues, workstreamNumber)}
          summary={summaryIssue(editing, issues, workstreamNumber)}
          derivedStart={rolledDates(editing, issues, workstreamNumber)?.startDate ?? null}
          derivedFinish={rolledDates(editing, issues, workstreamNumber)?.finishDate ?? null}
          onClose={() => setEditingId(null)}
          onSave={async (issueId, change) => {
            await plan.saveIssue(issueId, change);
            setEditingId(null);
          }}
        />
      )}
      {editing && canWrite && plan.data?.settings?.recordSource !== "compass" && (
        <IssueDrawer
          key={editing.issueId}
          issue={editing}
          columns={columns}
          iterations={plan.data?.settings?.iterations ?? []}
          users={plan.data?.settings?.assignableUsers ?? []}
          datesDerived={derivedDates(editing, issues, workstreamNumber)}
          summary={summaryIssue(editing, issues, workstreamNumber)}
          derivedStart={rolledDates(editing, issues, workstreamNumber)?.startDate ?? null}
          derivedFinish={rolledDates(editing, issues, workstreamNumber)?.finishDate ?? null}
          onClose={() => setEditingId(null)}
          onSave={async (issueId, change) => {
            await plan.saveIssue(issueId, change);
            setEditingId(null);
          }}
        />
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
  const portal = usePortal();
  const canWrite = portal.canWrite;
  const name = portal.projects.find((item) => item.projectId === projectId)?.name ?? "this project";
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
          canWrite ? (
            <button className="btn primary" type="button" onClick={() => setNotice(true)}>
              Add task
            </button>
          ) : undefined
        }
      />
      <PlanStatus plan={plan} session={session} canWrite={canWrite} />
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
                if (!canWrite) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                if (overColumn !== column) setOverColumn(column);
              }}
              onDrop={(event) => {
                if (canWrite) dropOn(event, column);
              }}
            >
              <div className="kanban-header">
                <span>{column}</span>
                <span>{rows.length}</span>
              </div>
              {rows.map((issue) => (
                <article
                  className={draggingId === issue.issueId ? "kanban-card dragging" : "kanban-card"}
                  key={issue.issueId}
                  draggable={canWrite}
                  aria-roledescription={canWrite ? "draggable" : undefined}
                  aria-label={canWrite ? `${issue.title}, ${shownStatus(issue)}. Drag to another column to change status.` : `${issue.title}, ${shownStatus(issue)}.`}
                  onDragStart={(event) => startDrag(event, issue)}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setOverColumn(null);
                  }}
                >
                  <div className="kanban-card-head">
                    <strong>{issue.title}</strong>
                    {canWrite && <EditRowButton label={`Edit ${issue.title}`} onClick={() => setEditing(issue)} />}
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
      {editing && canWrite && plan.data?.settings?.recordSource === "compass" && (
        <CompassIssueDrawer
          key={editing.issueId}
          issue={editing}
          issues={plan.data?.issues ?? []}
          catalogs={{
            statusOptions: plan.data.settings.statusOptions ?? [],
            labels: plan.data.settings.labels ?? [],
            issueTypes: plan.data.settings.issueTypes ?? [],
            priorityOptions: plan.data.settings.priorityOptions ?? [],
            milestones: plan.data.settings.milestones ?? [],
          }}
          members={plan.data.members ?? []}
          columns={columns}
          iterations={plan.data.settings.iterations ?? []}
          users={plan.data.settings.assignableUsers ?? []}
          datesDerived={derivedDates(editing, plan.data?.issues ?? [], plan.data?.settings?.workstreamNumber ?? null)}
          summary={summaryIssue(editing, plan.data?.issues ?? [], plan.data?.settings?.workstreamNumber ?? null)}
          derivedStart={rolledDates(editing, plan.data?.issues ?? [], plan.data?.settings?.workstreamNumber ?? null)?.startDate ?? null}
          derivedFinish={rolledDates(editing, plan.data?.issues ?? [], plan.data?.settings?.workstreamNumber ?? null)?.finishDate ?? null}
          onClose={() => setEditing(null)}
          onSave={async (issueId, change) => {
            await plan.saveIssue(issueId, change);
            setEditing(null);
          }}
        />
      )}
      {editing && canWrite && plan.data?.settings?.recordSource !== "compass" && (
        <IssueDrawer
          key={editing.issueId}
          issue={editing}
          columns={columns}
          iterations={plan.data?.settings?.iterations ?? []}
          users={plan.data?.settings?.assignableUsers ?? []}
          datesDerived={derivedDates(editing, plan.data?.issues ?? [], plan.data?.settings?.workstreamNumber ?? null)}
          summary={summaryIssue(editing, plan.data?.issues ?? [], plan.data?.settings?.workstreamNumber ?? null)}
          derivedStart={rolledDates(editing, plan.data?.issues ?? [], plan.data?.settings?.workstreamNumber ?? null)?.startDate ?? null}
          derivedFinish={rolledDates(editing, plan.data?.issues ?? [], plan.data?.settings?.workstreamNumber ?? null)?.finishDate ?? null}
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

function PlanStatus({ plan, session, canWrite }: { plan: ReturnType<typeof usePlan>; session: Session | null; canWrite: boolean }) {
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
          {canWrite && session && plan.data.settings && plan.data.settings.recordSource !== "compass" && (
            <button className="btn small" type="button" onClick={() => plan.sync().catch((caught) => plan.setError(message(caught)))}>
              Sync from GitHub
            </button>
          )}
        </div>
      )}
      {plan.data && session?.adminGroup && (
        <GithubForm projectId={projectId} session={session} settings={plan.data.settings} onSaved={plan.reload} onError={plan.setError} />
      )}
      {plan.data?.settings?.recordSource === "compass" && session?.adminGroup && session && (
        <Catalogs
          key={projectId}
          projectId={projectId}
          session={session}
          catalogs={{
            statusOptions: plan.data.settings.statusOptions ?? [],
            doneStatuses: plan.data.settings.doneStatuses ?? [],
            columns: plan.data.settings.columns,
            iterations: plan.data.settings.iterations ?? [],
            labels: plan.data.settings.labels ?? [],
            issueTypes: plan.data.settings.issueTypes ?? [],
            priorityOptions: plan.data.settings.priorityOptions ?? [],
            milestones: plan.data.settings.milestones ?? [],
          }}
          onSaved={plan.reload}
          onError={plan.setError}
        />
      )}
      {canWrite && session && plan.data && (
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
  iterations,
  users,
  datesDerived,
  summary,
  derivedStart,
  derivedFinish,
  onClose,
  onSave,
}: {
  issue: PlanIssue;
  columns: string[];
  iterations: IterationChoice[];
  users: GitHubUser[];
  datesDerived: boolean;
  summary: boolean;
  derivedStart: string | null;
  derivedFinish: string | null;
  onClose: () => void;
  onSave: (issueId: string, change: IssueEdit) => Promise<void>;
}) {
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description ?? "");
  const [descriptionOpen, setDescriptionOpen] = useState((issue.description ?? "").length <= 200);
  const [status, setStatus] = useState(issue.status);
  const [effort, setEffort] = useState(issue.effort == null ? "" : String(issue.effort));
  const [iterationId, setIterationId] = useState(issue.iterationId ?? "");
  const [pickedIteration, setPickedIteration] = useState(false);
  const [startDate, setStartDate] = useState(issue.startDate ?? "");
  const [finishDate, setFinishDate] = useState(issue.finishDate ?? "");
  const [assigneeId, setAssigneeId] = useState(issue.assignees?.[0]?.id ?? "");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const choices = columns.includes(status) || !status ? columns : [status, ...columns];
  const iterationChoices = iterationOptions(iterations, issue);
  const people = assigneeOptions(users, issue.assignees ?? []);

  function chooseIteration(nextId: string) {
    setIterationId(nextId);
    if (!nextId || datesDerived) return;
    const next = iterationChoices.find((item) => item.id === nextId);
    const end = next ? iterationFinish(next.startDate, next.duration) : null;
    if (!next || !end) return;
    const dates = datesAfterIterationPick({
      hadIteration: Boolean(issue.iterationId),
      pickedBefore: pickedIteration,
      startDate,
      iterationStart: next.startDate,
      iterationEnd: end,
    });
    setStartDate(dates.startDate);
    setFinishDate(dates.finishDate);
    setPickedIteration(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = effort.trim() === "" ? null : Number(effort);
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
      setError("Effort must be a number that is zero or more.");
      return;
    }
    if (!datesDerived && startDate && finishDate && finishDate < startDate) {
      setError("The finish date cannot be before the start date.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(issue.issueId, {
        title,
        description: description.trim() ? description : null,
        status,
        effort: parsed,
        ...(!datesDerived && startDate !== (issue.startDate ?? "") ? { startDate: startDate || null } : {}),
        ...(!datesDerived && finishDate !== (issue.finishDate ?? "") ? { finishDate: finishDate || null } : {}),
        ...(iterationId !== (issue.iterationId ?? "") ? { iterationId: iterationId || null } : {}),
        ...(assigneeId !== (issue.assignees?.[0]?.id ?? "") ? { assigneeId: assigneeId || null } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
      });
    } catch (caught) {
      setError(message(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditDrawer title={title.trim() || issue.title || "Edit issue"} onClose={onClose} onSubmit={onSubmit} saving={saving}>
      <p>
        Title, description, status, effort, iteration, assignee, and comments are sent to GitHub.
        {datesDerived
          ? " Start and Finish come from the tasks and sub-issues under this item."
          : summary
            ? " Choosing an iteration fills Start and Finish. You can still change the dates. Those dates stay until a task or sub-issue is added, and then they come from those items."
            : " Choosing an iteration fills Start and Finish from that iteration. A later iteration keeps Start and sets Finish to the new end date. You can still change the dates."}{" "}
        The timeline bar uses Start and Finish. A comment is stored with your name and the date.
      </p>
      <label>
        Title
        <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} />
      </label>
      <DescriptionField value={description} expanded={descriptionOpen} onExpanded={setDescriptionOpen} onChange={setDescription} />
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
        Iteration
        <select className="field" value={iterationId} onChange={(event) => chooseIteration(event.target.value)}>
          <option value="">No iteration</option>
          {iterationChoices.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Assignee
        <select className="field" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
          <option value="">Unassigned</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name ? `${person.name} (${person.login})` : person.login}
            </option>
          ))}
        </select>
      </label>
      {datesDerived ? (
        <p>
          {derivedStart && derivedFinish ? `Start ${derivedStart}. Finish ${derivedFinish}.` : "No task under this item has both a start and a finish yet."}
        </p>
      ) : (
        <>
          <label>
            Start
            <input className="field" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            Finish
            <input className="field" type="date" value={finishDate} onChange={(event) => setFinishDate(event.target.value)} />
          </label>
        </>
      )}
      <label>
        Comments
        {issue.comments ? <span className="comment-log">{issue.comments}</span> : <span className="muted small">No comments yet.</span>}
        <textarea className="field" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} placeholder="Add a comment" />
      </label>
      {error && <p className="error">{error}</p>}
    </EditDrawer>
  );
}

function derivedDates(issue: PlanIssue, issues: PlanIssue[], workstreamNumber: number | null): boolean {
  return derivedSchedule(issues.map(planNode), workstreamNumber, issue.issueId) !== null;
}

function summaryIssue(issue: PlanIssue, issues: PlanIssue[], workstreamNumber: number | null): boolean {
  const nodes = issues.map(planNode);
  return datesAreDerived(planKind(planNode(issue), new Map(nodes.map((item) => [item.issueId, item])), workstreamNumber));
}

function rolledDates(issue: PlanIssue, issues: PlanIssue[], workstreamNumber: number | null) {
  return derivedSchedule(issues.map(planNode), workstreamNumber, issue.issueId);
}

function iterationOptions(iterations: IterationChoice[], issue: PlanIssue): IterationChoice[] {
  if (!issue.iterationId || iterations.some((item) => item.id === issue.iterationId)) return iterations;
  if (!issue.iterationTitle || !issue.iterationStart || !issue.iterationDuration) return iterations;
  return [{ id: issue.iterationId, title: issue.iterationTitle, startDate: issue.iterationStart, duration: issue.iterationDuration }, ...iterations];
}

function assigneeOptions(users: GitHubUser[], current: GitHubUser[]): GitHubUser[] {
  return [...current.filter((person) => !users.some((item) => item.id === person.id)), ...users];
}

const DESCRIPTION_PREVIEW = 200;

function DescriptionField({
  value,
  expanded,
  onExpanded,
  onChange,
}: {
  value: string;
  expanded: boolean;
  onExpanded: (expanded: boolean) => void;
  onChange: (value: string) => void;
}) {
  const long = value.length > DESCRIPTION_PREVIEW;
  const collapsed = long && !expanded;
  return (
    <label className="description-field">
      <span className="description-heading">
        Description
        {long && (
          <button
            className="icon-button"
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? "Show the first 200 characters" : "Show the rest of the description"}
            onClick={() => onExpanded(!expanded)}
          >
            <ExpandIcon expanded={expanded} />
          </button>
        )}
      </span>
      <textarea
        className="field"
        value={collapsed ? value.slice(0, DESCRIPTION_PREVIEW) : value}
        readOnly={collapsed}
        rows={collapsed ? 4 : Math.min(16, Math.max(6, Math.ceil(value.length / 70)))}
        maxLength={65000}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
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

const kindLabel: Record<PlanKind, string> = {
  workstream: "Workstream",
  epic: "Epic",
  feature: "Feature",
  issue: "Task",
  subissue: "Sub-issue",
};

function planNode(issue: PlanIssue): PlanIssue & { issueType: string | null; number: number | null } {
  return { ...issue, issueType: issue.issueType ?? null, number: issue.number ?? null };
}

function AddPlanBar({ onAdd }: { onAdd: (kind: Exclude<PlanKind, "workstream">) => void }) {
  return (
    <div className="row">
      <button className="btn small" type="button" onClick={() => onAdd("epic")}>
        Add Epic
      </button>
      <button className="btn small" type="button" onClick={() => onAdd("feature")}>
        Add Feature
      </button>
      <button className="btn small" type="button" onClick={() => onAdd("issue")}>
        Add Task
      </button>
      <button className="btn small" type="button" onClick={() => onAdd("subissue")}>
        Add Sub-issue
      </button>
    </div>
  );
}

type PlanDraft = {
  description: string | null;
  status?: string;
  effort: number | null;
  startDate?: string | null;
  finishDate?: string | null;
  iterationId?: string | null;
  assigneeId?: string | null;
  comment?: string;
};

function AddPlanDrawer({
  kind,
  issues,
  columns,
  iterations,
  users,
  workstreamNumber,
  busy,
  onClose,
  onCreate,
}: {
  kind: Exclude<PlanKind, "workstream">;
  issues: PlanIssue[];
  columns: string[];
  iterations: IterationChoice[];
  users: GitHubUser[];
  workstreamNumber: number | null;
  busy: boolean;
  onClose: () => void;
  onCreate: (kind: Exclude<PlanKind, "workstream">, title: string, parentIssueId: string | null, draft: PlanDraft) => Promise<void>;
}) {
  const plansAhead = datesAreDerived(kind);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionOpen, setDescriptionOpen] = useState(true);
  const [status, setStatus] = useState(columns[0] ?? "");
  const [effort, setEffort] = useState("");
  const [iterationId, setIterationId] = useState("");
  const [pickedIteration, setPickedIteration] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [finishDate, setFinishDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [comment, setComment] = useState("");
  const [parentIssueId, setParentIssueId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const nodes = issues.map(planNode);
  const byId = new Map(nodes.map((issue) => [issue.issueId, issue]));
  const parents = nodes.filter((issue) => {
    const rowKind = planKind(issue, byId, workstreamNumber);
    if (kind === "feature") return rowKind === "epic";
    if (kind === "issue") return rowKind === "epic" || rowKind === "feature";
    return rowKind === "issue";
  });

  function chooseIteration(nextId: string) {
    setIterationId(nextId);
    if (!nextId) return;
    const next = iterations.find((item) => item.id === nextId);
    const end = next ? iterationFinish(next.startDate, next.duration) : null;
    if (!next || !end) return;
    const dates = datesAfterIterationPick({
      hadIteration: false,
      pickedBefore: pickedIteration,
      startDate,
      iterationStart: next.startDate,
      iterationEnd: end,
    });
    setStartDate(dates.startDate);
    setFinishDate(dates.finishDate);
    setPickedIteration(true);
  }

  return (
    <EditDrawer
      title={`Add ${kindLabel[kind]}`}
      onClose={onClose}
      saving={busy}
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = effort.trim() === "" ? null : Number(effort);
        if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
          setError("Effort must be a number that is zero or more.");
          return;
        }
        if (startDate && finishDate && finishDate < startDate) {
          setError("The finish date cannot be before the start date.");
          return;
        }
        setError(null);
        const draft: PlanDraft = {
          description: description.trim() ? description : null,
          effort: parsed,
          ...(status ? { status } : {}),
          ...(startDate ? { startDate } : {}),
          ...(finishDate ? { finishDate } : {}),
          ...(iterationId ? { iterationId } : {}),
          ...(assigneeId ? { assigneeId } : {}),
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        };
        void onCreate(kind, title, kind === "epic" ? null : parentIssueId || null, draft).then(onClose, (caught) => setError(message(caught)));
      }}
    >
      <p>
        Title, description, status, effort, iteration, assignee, and comments are sent to GitHub.
        Choosing an iteration fills Start and Finish from that iteration. A later iteration keeps Start and sets Finish to the new end date. You can still change the dates.
        {plansAhead ? " Those dates stay until a task or sub-issue is added under this item, and then they come from those items." : ""} A comment is stored with your name and the date.
      </p>
      <label>
        Title
        <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} />
      </label>
      <DescriptionField value={description} expanded={descriptionOpen} onExpanded={setDescriptionOpen} onChange={setDescription} />
      {kind === "epic" && <p>This Epic nests under the Workstream issue.</p>}
      {kind !== "epic" && (
        <label>
          Parent
          <select className="field" value={parentIssueId} onChange={(event) => setParentIssueId(event.target.value)} required={kind !== "issue"}>
            {kind === "issue" && <option value="">Workstream</option>}
            {parents.map((issue) => (
              <option key={issue.issueId} value={issue.issueId}>
                {issue.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Status
        <select className="field" value={status} onChange={(event) => setStatus(event.target.value)} required={columns.length > 0}>
          {!status && <option value="">No status</option>}
          {columns.map((option) => (
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
        Iteration
        <select className="field" value={iterationId} onChange={(event) => chooseIteration(event.target.value)}>
          <option value="">No iteration</option>
          {iterations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Assignee
        <select className="field" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
          <option value="">Unassigned</option>
          {users.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name ? `${person.name} (${person.login})` : person.login}
            </option>
          ))}
        </select>
      </label>
      <label>
        Start
        <input className="field" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
      </label>
      <label>
        Finish
        <input className="field" type="date" value={finishDate} onChange={(event) => setFinishDate(event.target.value)} />
      </label>
      <label>
        Comments
        <textarea className="field" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} placeholder="Add a comment" />
      </label>
      {error && <p className="error">{error}</p>}
    </EditDrawer>
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
  const [workstreamNumber, setWorkstreamNumber] = useState(settings?.workstreamNumber ? String(settings.workstreamNumber) : "");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        onError(null);
        try {
          await api(`/projects/${projectId}/github`, session.idToken, {
            method: "PUT",
            body: { owner, repo, projectNumber: Number(projectNumber), workstreamNumber: workstreamNumber.trim() ? Number(workstreamNumber) : null },
          });
          await onSaved();
        } catch (caught) {
          onError(message(caught));
        }
      }}
    >
      <h2>GitHub project</h2>
      <p className="muted small">
        For the current test board use owner One80Labs, repository one80compass, and project number 1. That board is an organization project. Issues are read from the repository named here. The Workstream issue number is the plan root. It is not a row. Columns follow the GitHub Status field, and Estimate is used when Effort is absent.
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
      <label>
        Workstream issue number
        <input value={workstreamNumber} onChange={(event) => setWorkstreamNumber(event.target.value)} inputMode="numeric" />
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
      const iterationOk = body.iterationId === undefined || (row?.iterationId ?? null) === body.iterationId;
      const assigneeOk =
        body.assigneeId === undefined ||
        (body.assigneeId === null ? (row?.assignees ?? []).length === 0 : (row?.assignees ?? []).some((person) => person.id === body.assigneeId));
      const commentOk = typeof body.comment !== "string" || (row?.comments ?? "").includes(body.comment);
      const shifted = proposals.every((proposal) => {
        const later = result.issues.find((item) => item.issueId === proposal.issueId);
        return later?.startDate === proposal.toStart && later.finishDate === proposal.toFinish;
      });
      return Boolean(startOk && finishOk && iterationOk && assigneeOk && commentOk && shifted);
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
        await patchIssue(issueId, change, []);
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
    async createPlanItem(kind: Exclude<PlanKind, "workstream">, title: string, parentIssueId: string | null, draft: PlanDraft) {
      if (!session) return;
      const before = new Set((data?.issues ?? []).map((issue) => issue.issueId));
      setError(null);
      setBusy(true);
      try {
        await api(`/projects/${projectId}/plan-items`, session.idToken, { method: "POST", body: { kind, title, parentIssueId, ...draft } });
        await poll((result) => result.issues.some((issue) => issue.title === title && !before.has(issue.issueId)));
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

function scheduleLabel(issue: Parameters<typeof scheduleText>[0]): string {
  return scheduleText(issue);
}

function TimelineChart({
  bands,
  onEdit,
}: {
  bands: {
    key: string;
    title: string;
    rows: {
      issueId: string;
      title: string;
      status: string;
      depth: number;
      kind: PlanKind;
      startDate: string | null;
      finishDate: string | null;
      iterationTitle?: string | null;
      iterationStart?: string | null;
      iterationDuration?: number | null;
    }[];
  }[];
  onEdit: ((issueId: string) => void) | null;
}) {
  const rangesByBand = bands.map((band) => chartRanges(band.rows));
  const span = scheduleSpan(
    rangesByBand.flat().map((range) => ({ startDate: range?.start ?? null, finishDate: range?.finish ?? null })),
    timelineToday(),
  );
  const step = span.days > 90 ? 14 : span.days > 28 ? 7 : Math.max(1, Math.round(span.days / 6));
  const marks: number[] = [];
  for (let offset = 0; offset < span.days; offset += step) marks.push(offset);
  return (
    <div className="timeline-chart">
      <div className="timeline-scale">
        <span className="muted small">Schedule</span>
        <span />
        <div className="gantt-days timeline-days">
          {marks.map((offset) => (
            <span key={offset} style={{ left: `${(offset / span.days) * 100}%` }}>
              {shortDate(addDays(span.origin, offset))}
            </span>
          ))}
        </div>
      </div>
      {bands.map((band, bandIndex) => {
        const ranges = rangesByBand[bandIndex];
        const tasks = band.rows.filter((row) => row.kind === "issue" || row.kind === "subissue");
        const bandDone = tasks.filter((row) => row.status === "Done").length;
        const width = tasks.length === 0 ? 0 : Math.round((bandDone / tasks.length) * 100);
        const epic = band.rows[0]?.kind === "epic" ? band.rows[0] : null;
        const header = epic ? ranges[0] : unionRange(ranges);
        const rows =
          band.key === "outside"
            ? band.rows.map((row, index) => ({ row, range: ranges[index] }))
            : band.rows.flatMap((row, index) => (row.kind === "epic" ? [] : [{ row, range: ranges[index] }]));
        return (
          <div className="phase active" key={band.key}>
            <div className="timeline-row">
              <div>
                <div className="taskline">
                  <strong>{band.title}</strong>
                </div>
                <div className="phase-score">
                  <span>
                    {bandDone} of {tasks.length} tasks Done
                  </span>
                  <div className="progressline">
                    <span style={{ width: `${width}%` }} />
                  </div>
                  <strong>{width}%</strong>
                </div>
              </div>
              <div className="timeline-status">
                {epic && <TimelineStatus title={epic.title} status={epic.status} issueId={epic.issueId} onEdit={onEdit} />}
              </div>
              <ScheduleBar range={header} span={span} summary />
            </div>
            {rows.length > 0 && (
              <div className="phase-tasks">
                {rows.map(({ row, range }) => (
                  <div className="timeline-row" key={row.issueId}>
                    <div className="taskline" style={{ paddingLeft: row.depth * 16 }}>
                      <span className={`status-icon ${row.status === "Done" ? "done" : row.status === "In Progress" ? "review" : ""}`}>
                        {row.status === "Done" ? "●" : row.status === "In Progress" ? "◐" : "○"}
                      </span>
                      <span>{row.title}</span>
                    </div>
                    <div className="timeline-status">
                      <TimelineStatus title={row.title} status={row.status} issueId={row.issueId} onEdit={onEdit} />
                    </div>
                    <ScheduleBar range={range} span={span} summary={row.kind === "feature" || row.kind === "epic" || Boolean(range?.fromIteration)} />
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScheduleBar({
  range,
  span,
  summary,
}: {
  range: ScheduledRange | null;
  span: { origin: string; days: number };
  summary: boolean;
}) {
  const label = range ? `${range.start} to ${range.finish}` : "Not scheduled";
  return (
    <div className="gantt-track" aria-label={label}>
      {range && <div className={summary ? "gantt-bar rollup" : "gantt-bar"} style={barPlacement(range.start, range.finish, span.origin, span.days)} title={label} />}
    </div>
  );
}

function unionRange(ranges: (ScheduledRange | null)[]): ScheduledRange | null {
  const present = ranges.flatMap((range) => (range ? [range] : []));
  if (present.length === 0) return null;
  return {
    start: present.reduce((earliest, range) => (range.start < earliest ? range.start : earliest), present[0].start),
    finish: present.reduce((latest, range) => (range.finish > latest ? range.finish : latest), present[0].finish),
    fromIteration: false,
  };
}

function statusTone(status: string): "" | "good" | "orange" | "blue" {
  const name = status.trim().toLowerCase();
  if (name === "done") return "good";
  if (name === "in progress" || name === "in review") return "orange";
  return "blue";
}

function shortDate(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function timelineToday(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
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

function TimelineStatus({
  title,
  status,
  issueId,
  onEdit,
}: {
  title: string;
  status: string;
  issueId: string;
  onEdit: ((issueId: string) => void) | null;
}) {
  const pill = <Pill tone={statusTone(status)}>{status || "No status"}</Pill>;
  if (!onEdit) return pill;
  return (
    <button className="timeline-status-btn" type="button" aria-label={`Edit ${title}`} onClick={() => onEdit(issueId)}>
      {pill}
    </button>
  );
}

function DependenciesPanel({
  issues,
  busy,
  readOnly,
  onLink,
}: {
  issues: PlanIssue[];
  busy: boolean;
  readOnly: boolean;
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
                After {predecessor.title}.
                {!readOnly && (
                  <button className="btn small" type="button" disabled={busy} onClick={() => void onLink(issue.issueId, predecessor.issueId, "remove")}>
                    Remove
                  </button>
                )}
              </p>
            ))}
            {notes.map((note) => (
              <p className="small" key={note.predecessorId}>
                {note.reason === "overlap" ? `Starts before ${note.predecessorTitle} finishes.` : `Not scheduled after ${note.predecessorTitle}.`}
              </p>
            ))}
            {!readOnly && <PredecessorForm choices={choices} busy={busy} onAdd={(predecessorId) => onLink(issue.issueId, predecessorId, "add")} />}
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
  canWrite,
  milestones,
  onReload,
}: {
  session: Session | null;
  projectId: string;
  canWrite: boolean;
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
          {canWrite && session && milestone.state === "ready" && (
            <button className="btn small" type="button" disabled={pending === milestone.key} onClick={() => confirm(milestone.key)}>
              Confirm milestone
            </button>
          )}
          {canWrite && session && milestone.state === "confirmed" && (
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
