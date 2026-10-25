import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { api, ApiError } from "./api";
import type { Session } from "./auth";
import { usePortal } from "./shell";
import { Notice, PageHead, Pill, Tabs } from "./ui";

type PlanIssue = {
  issueId: string;
  title: string;
  status: string;
  effort: number | null;
  number: number | null;
};
type PlanResponse = {
  settings: { owner: string; repo: string; projectNumber: number; columns: string[] } | null;
  sync: { status: string; detail: string | null };
  issues: PlanIssue[];
  progress: { label: string; defaultedIssueIds: string[] };
  override: { percent: number; explanation: string; calculatedPercent: number | null } | null;
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
      <Tabs label="Plan" tabs={["Timeline view", "List view", "Dependencies"]} value={tab} onChange={setTab} />
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
                    <small>Dates are not stored on tasks</small>
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
        </div>
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
              {plan.data.issues.map((issue) => (
                <IssueRow
                  key={issue.issueId}
                  issue={issue}
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
      {tab === "Dependencies" && (
        <section className="panel">
          <h3>Dependencies</h3>
          <p className="copy">Dependency modeling and interactive rescheduling are a later release.</p>
        </section>
      )}
      {notice && (
        <Notice
          title="Add milestone"
          body="Milestone creation stays in GitHub. This release shows milestone names that already exist on the project. It does not create new ones."
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
  const columns = plan.data?.settings?.columns?.length ? plan.data.settings.columns : defaultColumns;
  let issues = plan.data?.issues.filter((issue) => issue.title.toLowerCase().includes(query.toLowerCase())) ?? [];
  if (filter !== "All tasks") issues = [];
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
          const rows = issues.filter((issue) => issue.status === column);
          return (
            <section className="kanban-col" key={column}>
              <div className="kanban-header">
                <span>{column}</span>
                <span>{rows.length}</span>
              </div>
              {rows.map((issue) => (
                <article className="kanban-card" key={issue.issueId}>
                  <strong>{issue.title}</strong>
                  <Pill tone="blue">{issue.effort == null ? "Unestimated" : `${issue.effort} pts`}</Pill>
                  <div className="kanban-foot">
                    <span>Not scheduled</span>
                  </div>
                  <select
                    aria-label={`Change status for ${issue.title}`}
                    value={issue.status}
                    onChange={(event) => {
                      plan.move(issue.issueId, event.target.value).catch((caught) => plan.setError(message(caught)));
                    }}
                  >
                    {columns.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
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
        <p className="muted small">
          Sync: {plan.data.sync.status}
          {plan.data.sync.detail ? ` — ${plan.data.sync.detail}` : ""}
          {plan.data.override ? ` Override: ${plan.data.override.percent}% (${plan.data.override.explanation}).` : ""}
        </p>
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

function IssueRow({
  issue,
  columns,
  defaulted,
  onSave,
}: {
  issue: PlanIssue;
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
      <td>
        <label>
          {issue.number ? `#${issue.number}` : "Title"}
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
            onSave(issue.issueId, { title, status, effort: parsed });
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
  const [percent, setPercent] = useState("");
  const [explanation, setExplanation] = useState("");

  async function reload() {
    if (!session) return;
    const result = await api<PlanResponse>(`/projects/${projectId}/plan`, session.idToken);
    setData(result);
  }

  useEffect(() => {
    if (!session) return;
    reload().catch((caught) => setError(message(caught)));
  }, [projectId, session]);

  return {
    data,
    error,
    setError,
    percent,
    setPercent,
    explanation,
    setExplanation,
    reload,
    async saveIssue(issueId: string, change: { title: string; status: string; effort: number | null }) {
      if (!session) return;
      setError(null);
      if (change.effort != null && !Number.isFinite(change.effort)) {
        setError("Effort must be a number.");
        return;
      }
      try {
        await api(`/projects/${projectId}/issues/${issueId}`, session.idToken, {
          method: "PATCH",
          body: { ...change, idempotencyKey: crypto.randomUUID() },
        });
        await reload();
      } catch (caught) {
        setError(message(caught));
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
