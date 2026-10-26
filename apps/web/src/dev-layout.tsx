import { useState } from "react";
import { useParams } from "react-router-dom";
import { Shell } from "./shell";
import type { Session } from "./auth";
import { PageHead, Pill, Tabs } from "./ui";

const session: Session = { email: "alex.chen@example.com", idToken: "", adminGroup: false, mfa: true };

/** Local layout check for the eight screens. It does not call the API. */
export function DevLayout() {
  const { screen = "overview" } = useParams();
  return (
    <Shell session={session} onSession={() => undefined} sample={{ percent: 16, phase: "Phase 1 · Discovery", window: "Mar 4, 2025 – Apr 30, 2025", activity: [] }}>
      <p className="sample-banner">Layout preview. Not a live project.</p>
      {screen === "overview" && <OverviewPreview />}
      {screen === "plan" && <PlanPreview />}
      {screen === "kanban" && <KanbanPreview />}
      {screen === "documents" && <DocumentsPreview />}
      {screen === "document" && <DocumentPreview />}
      {screen === "reports" && <ReportsPreview />}
      {screen === "report" && <ReportPreview />}
      {screen === "settings" && <SettingsPreview />}
    </Shell>
  );
}

function OverviewPreview() {
  const [tab, setTab] = useState("Timeline");
  return (
    <>
      <PageHead title="Project overview." subtitle="Key information and status for Amur." action={<button className="btn primary" type="button">Edit overview</button>} />
      <div className="meta-strip">
        {[["Customer", "Sample"], ["Status", "Green"], ["Milestone", "Discovery"], ["Started", "Oct 24, 2026"], ["Target end date", "Not set"]].map(([label, value]) => (
          <div key={label}>
            <label>{label}</label>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="grid two">
        <div>
          <h3 className="section-title">Project description</h3>
          <p className="copy">Notes saved on the project appear here.</p>
        </div>
        <div>
          <h3 className="section-title">Milestones</h3>
          <ul className="goal-list">
            <li>Discovery</li>
          </ul>
        </div>
      </div>
      <Tabs label="Overview" tabs={["Timeline", "Key stakeholders", "Links", "GitHub"]} value={tab} onChange={setTab} />
      <div className="timeline">
        <div className="timeline-step current">
          <strong>Discovery</strong>No dates stored
        </div>
      </div>
    </>
  );
}

function PlanPreview() {
  return (
    <>
      <PageHead title="Project plan." subtitle="Milestones, phases, and tasks for Amur." action={<button className="btn primary" type="button">Add milestone</button>} />
      <div className="phase active">
        <div className="phase-head">
          <div>
            <strong>In Progress</strong>
            <br />
            <small>Dates are not stored on tasks</small>
          </div>
          <div className="phase-score">
            <span>1 of 2 tasks</span>
            <div className="progressline">
              <span style={{ width: "50%" }} />
            </div>
            <strong>50%</strong>
          </div>
        </div>
        <div className="phase-tasks">
          <div className="taskline">
            <span className="status-icon review">◐</span>Conduct discovery interviews
          </div>
        </div>
      </div>
    </>
  );
}

function KanbanPreview() {
  return (
    <>
      <PageHead title="Kanban board." subtitle="Track and manage project work for Amur." action={<button className="btn primary" type="button">Add task</button>} />
      <div className="toolbar">
        <button className="btn small primary" type="button">All tasks</button>
        <button className="btn small" type="button">My tasks</button>
        <button className="btn small" type="button">Due this week</button>
        <input type="search" placeholder="Search tasks…" aria-label="Search tasks" />
      </div>
      <div className="kanban">
        {["To Do", "In Progress", "In Review", "Done"].map((column) => (
          <section className="kanban-col" key={column}>
            <div className="kanban-header">
              <span>{column}</span>
              <span>{column === "In Progress" ? 1 : 0}</span>
            </div>
            {column === "In Progress" && (
              <article className="kanban-card">
                <strong>Conduct discovery interviews</strong>
                <Pill tone="blue">8 pts</Pill>
                <div className="kanban-foot">
                  <span>Not scheduled</span>
                </div>
              </article>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

function DocumentsPreview() {
  return (
    <>
      <PageHead title="Documents." subtitle="Manage project documents and versions for Amur." action={<button className="btn primary" type="button">Upload document</button>} />
      <Tabs label="Documents" tabs={["All documents", "Recycle bin", "Baselines"]} value="All documents" onChange={() => undefined} />
      <div className="toolbar">
        <input type="search" placeholder="Search documents…" aria-label="Search documents" />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Version</th>
              <th>Status</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span className="file-icon docx">▣</span>
                <strong>AIM Rapid Discovery</strong>
              </td>
              <td>DOCX</td>
              <td>Current</td>
              <td>
                <Pill tone="good">Current</Pill>
              </td>
              <td>Oct 24, 2026</td>
              <td>
                <button className="btn small" type="button">Open</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function DocumentPreview() {
  return (
    <>
      <button className="backlink" type="button">← Back to documents</button>
      <div className="docdetailbar">
        <div>
          <div className="small muted">▣ DOCX · 1.2 MB</div>
          <h2>AIM Rapid Discovery</h2>
        </div>
        <button className="btn primary" type="button">Download</button>
      </div>
      <Tabs label="Document" tabs={["Preview", "Version history", "Baselines", "Audit history"]} value="Preview" onChange={() => undefined} />
      <div className="preview-grid">
        <div className="preview">
          <div className="paper">
            <strong>AIM Rapid Discovery</strong>
            <small>Placeholder only. Download the file to read it.</small>
          </div>
        </div>
        <section className="panel">
          <h3>Version details</h3>
          <dl className="detail-list">
            <dt>Version</dt>
            <dd>Current</dd>
            <dt>File type</dt>
            <dd>DOCX</dd>
          </dl>
        </section>
      </div>
    </>
  );
}

function ReportsPreview() {
  return (
    <>
      <PageHead title="Status reports." subtitle="Published updates on progress for Amur." action={<button className="btn primary" type="button">Create report</button>} />
      <Tabs label="Reports" tabs={["All reports", "Summary view"]} value="All reports" onChange={() => undefined} />
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
            <tr>
              <td>Week of March 10</td>
              <td>
                <Pill tone="good">Published</Pill>
              </td>
              <td>Discovery interviews continued.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function ReportPreview() {
  return (
    <>
      <button className="backlink" type="button">← Back to reports</button>
      <PageHead title="Status report." subtitle="Week of March 10" action={<button className="btn" type="button">Start revision</button>} />
      <div className="report-grid">
        <div className="report-box">
          <div className="tiny">Status</div>
          <b>Published</b>
        </div>
        <section className="panel">
          <div className="tiny">Project progress</div>
          <p className="copy">Not Started / No Tasks</p>
        </section>
      </div>
    </>
  );
}

function SettingsPreview() {
  return (
    <>
      <PageHead title="Settings." subtitle="Manage project access and preferences." />
      <div className="settings-grid">
        <section className="panel settings-menu">
          <button className="active" type="button">Project access</button>
          <button type="button">General</button>
          <button type="button">Notifications</button>
          <button type="button">GitHub integration</button>
        </section>
        <section className="panel">
          <h3>Project access</h3>
          <p className="small muted">A Contributor can edit, add, and upload. View can open the screens and cannot change data.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Alex Chen</td>
                  <td>alex.chen@example.com</td>
                  <td>Contributor</td>
                  <td>
                    <Pill tone="good">Active</Pill>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
