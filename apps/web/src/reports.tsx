import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "./api";
import type { Session } from "./auth";
import { usePortal } from "./shell";
import { PageHead, Pill, Tabs, formatWhen } from "./ui";

type ReportStatus = "draft" | "in_review" | "approved" | "published";
type Report = { reportId: string; title: string; body: string; status: ReportStatus };
type Version = { versionId: string; title: string; body: string; publishedAt: string };

const statusLabel: Record<ReportStatus, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  published: "Published",
};

function statusTone(status: ReportStatus): "" | "good" | "orange" | "blue" {
  if (status === "published" || status === "approved") return "good";
  if (status === "draft") return "orange";
  return "blue";
}

export function ReportsPage({ session }: { session: Session | null }) {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const name = usePortal().projects.find((item) => item.projectId === projectId)?.name ?? "this project";
  const [reports, setReports] = useState<Report[]>([]);
  const [tab, setTab] = useState("All reports");
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    api<{ reports: Report[] }>(`/projects/${projectId}/reports`, session.idToken)
      .then((result) => setReports(result.reports))
      .catch((caught) => setError(message(caught)));
  }, [projectId, session]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    setError(null);
    const created = await api<Report>(`/projects/${projectId}/reports`, session.idToken, { method: "POST", body: { title: newTitle, body: newBody } });
    setNewTitle("");
    setNewBody("");
    setCreating(false);
    navigate(`/projects/${projectId}/reports/${created.reportId}`);
  }

  const published = reports.filter((report) => report.status === "published");

  return (
    <>
      <PageHead
        title="Status reports."
        subtitle={`Published updates on progress for ${name}.`}
        action={
          <button className="btn primary" type="button" onClick={() => setCreating(true)}>
            Create report
          </button>
        }
      />
      {!session && <p>Sign in to open reports.</p>}
      {error && <p className="error">{error}</p>}
      <Tabs label="Reports" tabs={["All reports", "Summary view"]} value={tab} onChange={setTab} />
      {tab === "Summary view" ? (
        <section className="panel">
          <h3>Published report overview</h3>
          <p className="copy">
            {reports.length} reports · {published.length} published
            {published[0] ? ` · Most recent title: ${published[0].title}` : ""}
          </p>
        </section>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Key updates</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr className="clickable" key={report.reportId} onClick={() => navigate(`/projects/${projectId}/reports/${report.reportId}`)}>
                  <td>{report.title}</td>
                  <td>
                    <Pill tone={statusTone(report.status)}>{statusLabel[report.status]}</Pill>
                  </td>
                  <td>{report.body || "No notes yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {reports.length === 0 && <div className="empty">No reports yet.</div>}
        </div>
      )}
      {creating && (
        <div className="dialog-layer" onClick={() => setCreating(false)}>
          <form
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Create report"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              create(event).catch((caught) => setError(message(caught)));
            }}
          >
            <h2>Create report</h2>
            <p>This saves a draft. Publish it after review.</p>
            <label>
              Title
              <input className="field" value={newTitle} onChange={(event) => setNewTitle(event.target.value)} required />
            </label>
            <label>
              Body
              <textarea className="field" value={newBody} onChange={(event) => setNewBody(event.target.value)} />
            </label>
            <div className="dialog-actions">
              <button className="btn" type="button" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button className="btn primary" type="submit">
                Create draft
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

export function ReportDetailPage({ session }: { session: Session | null }) {
  const { projectId = "", reportId = "" } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [progress, setProgress] = useState("Not Started / No Tasks");
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!session) return;
    const detail = await api<{ report: Report; versions: Version[] }>(`/projects/${projectId}/reports/${reportId}`, session.idToken);
    setReport(detail.report);
    setTitle(detail.report.title);
    setBody(detail.report.body);
    setVersions(detail.versions);
    const plan = await api<{ progress: { label: string } }>(`/projects/${projectId}/plan`, session.idToken).catch(() => null);
    if (plan) setProgress(plan.progress.label);
  }

  useEffect(() => {
    if (!session) return;
    reload().catch((caught) => setError(message(caught)));
  }, [projectId, reportId, session]);

  async function act(path: string, init?: { method?: string; body?: unknown }) {
    if (!session) return;
    setError(null);
    await api(path, session.idToken, init);
    await reload();
  }

  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);

  return (
    <>
      <button className="backlink" type="button" onClick={() => navigate(`/projects/${projectId}/reports`)}>
        ← Back to reports
      </button>
      {!session && <p>Sign in to open reports.</p>}
      {error && <p className="error">{error}</p>}
      {report && (
        <>
          <PageHead
            title="Status report."
            subtitle={report.title}
            action={
              <div className="row">
                {report.status === "draft" && (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => act(`/projects/${projectId}/reports/${report.reportId}`, { method: "PUT", body: { title, body } }).catch((caught) => setError(message(caught)))}
                  >
                    Save draft
                  </button>
                )}
                {report.status === "draft" && (
                  <button className="btn primary" type="button" onClick={() => act(`/projects/${projectId}/reports/${report.reportId}/submit`, { method: "POST" }).catch((caught) => setError(message(caught)))}>
                    Submit for review
                  </button>
                )}
                {report.status === "in_review" && (
                  <button className="btn primary" type="button" onClick={() => act(`/projects/${projectId}/reports/${report.reportId}/approve`, { method: "POST" }).catch((caught) => setError(message(caught)))}>
                    Approve
                  </button>
                )}
                {report.status === "approved" && (
                  <button className="btn primary" type="button" onClick={() => act(`/projects/${projectId}/reports/${report.reportId}/publish`, { method: "POST" }).catch((caught) => setError(message(caught)))}>
                    Publish
                  </button>
                )}
                {report.status === "published" && (
                  <button className="btn" type="button" onClick={() => act(`/projects/${projectId}/reports/${report.reportId}/revise`, { method: "POST" }).catch((caught) => setError(message(caught)))}>
                    Start revision
                  </button>
                )}
              </div>
            }
          />
          <div className="report-grid">
            <div className="report-box">
              <div className="tiny">Status</div>
              <b>{statusLabel[report.status]}</b>
              <div className="small muted">This is the report workflow state, not a separate health score.</div>
            </div>
            <section className="panel">
              <div className="tiny">Project progress</div>
              <p className="copy">{progress}</p>
              <div className="tiny muted">Taken from the project plan. This report does not store its own percent.</div>
            </section>
          </div>
          <div className="grid two">
            <div>
              <h3 className="section-title">Key updates</h3>
              {report.status === "draft" ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    act(`/projects/${projectId}/reports/${report.reportId}`, { method: "PUT", body: { title, body } }).catch((caught) => setError(message(caught)));
                  }}
                >
                  <label>
                    Title
                    <input value={title} onChange={(event) => setTitle(event.target.value)} required />
                  </label>
                  <label>
                    Body
                    <textarea value={body} onChange={(event) => setBody(event.target.value)} />
                  </label>
                </form>
              ) : lines.length === 0 ? (
                <p className="copy">No notes yet.</p>
              ) : (
                <ul className="goal-list">
                  {lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="section-title">Published copies</h3>
              {versions.length === 0 && <p className="copy">Nothing has been published yet.</p>}
              <ul className="goal-list">
                {versions.map((version) => (
                  <li key={version.versionId}>
                    <strong>{version.title}</strong> · {formatWhen(version.publishedAt)}
                    <br />
                    {version.body}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function message(caught: unknown): string {
  return caught instanceof ApiError || caught instanceof Error ? caught.message : "Request failed.";
}
