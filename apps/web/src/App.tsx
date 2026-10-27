import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import type { CognitoUser } from "amazon-cognito-identity-js";
import { api, ApiError } from "./api";
import { beginTotpSetup, completeNewPassword, confirmTotpSetup, mfaIsEnrolled, mfaRequired, restoreSession, signIn, signOut, submitTotp, type Session } from "./auth";
import { AuditPage } from "./audit";
import { KanbanPage, PlanPage } from "./plan";
import { DocumentsPage, DocumentDetailPage, OverviewPage } from "./project";
import { ReportDetailPage, ReportsPage } from "./reports";
import { DevLayout } from "./dev-layout";
import { MembersPage } from "./members";
import { displayName, ModuleTiles, Shell, usePortal, type PortalActivity } from "./shell";
import { CatalogSettings } from "./catalogs";

type Customer = { customerId: string; name: string };
type Project = { projectId: string; customerId: string; name: string };

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    restoreSession().then((restored) => {
      setSession(restored);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return (
      <main>
        <h1>One80Compass</h1>
        <p>Checking your sign-in.</p>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/projects/:projectId/overview" element={<SignedIn session={session} onSession={setSession}><OverviewPage session={session} /></SignedIn>} />
      <Route path="/projects/:projectId/documents/:documentId" element={<SignedIn session={session} onSession={setSession}><DocumentDetailPage session={session} /></SignedIn>} />
      <Route path="/projects/:projectId/documents" element={<SignedIn session={session} onSession={setSession}><DocumentsPage session={session} /></SignedIn>} />
      <Route path="/projects/:projectId/plan" element={<SignedIn session={session} onSession={setSession}><PlanPage session={session} /></SignedIn>} />
      <Route path="/projects/:projectId/kanban" element={<SignedIn session={session} onSession={setSession}><KanbanPage session={session} /></SignedIn>} />
      <Route path="/projects/:projectId/reports/:reportId" element={<SignedIn session={session} onSession={setSession}><ReportDetailPage session={session} /></SignedIn>} />
      <Route path="/projects/:projectId/reports" element={<SignedIn session={session} onSession={setSession}><ReportsPage session={session} /></SignedIn>} />
      <Route path="/projects/:projectId/audit" element={<SignedIn session={session} onSession={setSession}><AuditPage session={session} /></SignedIn>} />
      <Route path="/projects" element={<SignedIn session={session} onSession={setSession}><ProjectsPage /></SignedIn>} />
      <Route path="/members" element={<SignedIn session={session} onSession={setSession}><MembersPage session={session} /></SignedIn>} />
      <Route path="/settings" element={<SignedIn session={session} onSession={setSession}><SettingsPage session={session} /></SignedIn>} />
      <Route path="/help" element={<SignedIn session={session} onSession={setSession}><HelpPage /></SignedIn>} />
      {import.meta.env.DEV && <Route path="/dev/portal-home" element={<PortalHomePreview />} />}
      {import.meta.env.DEV && <Route path="/dev/layout/:screen" element={<DevLayout />} />}
      <Route path="*" element={<Home session={session} onSession={setSession} />} />
    </Routes>
  );
}

function SignedIn({ session, onSession, children }: { session: Session | null; onSession: (session: Session | null) => void; children: ReactNode }) {
  if (!session) {
    return (
      <main className="gate">
        <h1>One80Compass</h1>
        <SignIn onSession={onSession} />
      </main>
    );
  }
  if (mfaRequired && session.adminGroup && !session.mfa) {
    return (
      <main className="gate">
        <MfaGate session={session} onSession={onSession} />
      </main>
    );
  }
  return (
    <Shell session={session} onSession={onSession}>
      {children}
    </Shell>
  );
}

function Home({ session, onSession }: { session: Session | null; onSession: (session: Session | null) => void }) {
  if (!session) {
    return (
      <main className="gate">
        <h1>One80Compass</h1>
        <SignIn onSession={onSession} />
      </main>
    );
  }
  if (mfaRequired && session.adminGroup && !session.mfa) {
    return (
      <main className="gate">
        <MfaGate session={session} onSession={onSession} />
      </main>
    );
  }
  return (
    <Shell session={session} onSession={onSession}>
      <Dashboard session={session} />
    </Shell>
  );
}

function SignIn({ onSession }: { onSession: (session: Session) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [pendingUser, setPendingUser] = useState<CognitoUser | null>(null);
  const [mode, setMode] = useState<"password" | "newPassword" | "totp">("password");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      if (mode === "newPassword" && pendingUser) {
        const result = await completeNewPassword(pendingUser, email, password);
        applyResult(result);
        return;
      }
      if (mode === "totp" && pendingUser) {
        onSession(await submitTotp(pendingUser, email, totpCode));
        return;
      }
      applyResult(await signIn(email, password));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    }
  }

  function applyResult(result: Awaited<ReturnType<typeof signIn>>) {
    if (result.status === "signedIn") {
      onSession(result.session);
      return;
    }
    setPendingUser(result.user);
    setPassword("");
    setMode(result.status === "newPassword" ? "newPassword" : "totp");
  }

  const label = mode === "newPassword" ? "Choose a password" : mode === "totp" ? "Authenticator code" : "Password";

  return (
    <form onSubmit={onSubmit}>
      <h2>{mode === "totp" ? "Authenticator code" : "Sign in"}</h2>
      {mode === "password" && (
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
        </label>
      )}
      {mode === "password" && !mfaRequired && <p>This development site signs you in with your email and password.</p>}
      <label>
        {label}
        {mode === "totp" ? (
          <input
            type="text"
            inputMode="numeric"
            value={totpCode}
            onChange={(event) => setTotpCode(event.target.value)}
            autoComplete="one-time-code"
            required
          />
        ) : (
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "password" ? "current-password" : "new-password"}
            required
          />
        )}
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit">Continue</button>
    </form>
  );
}

function MfaGate({ session, onSession }: { session: Session; onSession: (session: Session | null) => void }) {
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enrolled, setEnrolled] = useState<boolean | null>(null);

  useEffect(() => {
    if (!session.adminGroup || session.mfa) return;
    mfaIsEnrolled(session.email)
      .then(setEnrolled)
      .catch(() => setEnrolled(false));
  }, [session.adminGroup, session.email, session.mfa]);

  if (enrolled === null) return <p>Checking your authenticator.</p>;
  if (enrolled) {
    return (
      <section className="card">
        <h2>Authenticator already enrolled</h2>
        <p>Sign out, enter your password, and then enter the current 6-digit code from Passwords. Do not create a new secret.</p>
        <button
          type="button"
          onClick={() => {
            signOut();
            onSession(null);
          }}
        >
          Sign out
        </button>
      </section>
    );
  }
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          if (!secret) {
            setSecret(await beginTotpSetup(session.email));
            return;
          }
          await confirmTotpSetup(session.email, code);
          signOut();
          onSession(null);
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "MFA setup failed.");
        }
      }}
    >
      <h2>Set up MFA</h2>
      <p>Administrator actions stay blocked until an authenticator is enrolled. After confirming, sign in again with the code.</p>
      {secret && (
        <p>
          Add this secret to an authenticator app: <strong>{secret}</strong>
        </p>
      )}
      {secret && (
        <label>
          Code
          <input value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" required />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button type="submit">{secret ? "Confirm MFA" : "Show secret"}</button>
    </form>
  );
}

function Dashboard({ session }: { session: Session }) {
  const portal = usePortal();
  const project = portal.projects.find((item) => item.projectId === portal.projectId);
  const person = displayName(session.email);
  const [progress, setProgress] = useState("Not Started / No Tasks");
  const [percent, setPercent] = useState<number | null>(portal.sample?.percent ?? null);
  const [activity, setActivity] = useState<PortalActivity[]>([]);

  useEffect(() => {
    if (portal.sample || !portal.projectId) return;
    api<{ summary: { progress?: string }; activity: PortalActivity[] }>(`/projects/${portal.projectId}/overview`, session.idToken)
      .then((result) => {
        const label = result.summary.progress ?? "Not Started / No Tasks";
        setProgress(label);
        const parsed = label.endsWith("%") ? Number(label.replace("%", "")) : NaN;
        setPercent(Number.isFinite(parsed) ? parsed : null);
        setActivity(result.activity.slice(0, 4));
      })
      .catch(() => undefined);
  }, [portal.projectId, portal.sample, session.idToken]);

  const shown = percent ?? 0;

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Welcome back, {person.name.split(" ")[0]}.</h1>
          <p className="subtitle">{project ? `Here’s the latest on ${project.name}.` : "Select a project."}</p>
        </div>
      </header>
      <ModuleTiles />
      {portal.projectId && (
        <div className="grid two grid-gap">
          <section className="panel">
            <h3>Project progress</h3>
            <div className="progress-flex">
              <div className="progressline" aria-hidden="true">
                <span style={{ width: `${shown}%` }} />
              </div>
              <strong>{percent == null ? progress : `${percent}%`}</strong>
            </div>
            {portal.sample ? (
              <>
                <p className="muted small">{portal.sample.phase}</p>
                <p className="muted tiny">{portal.sample.window}</p>
              </>
            ) : (
              <p className="muted small">{percent == null ? progress : "Calculated from active tasks."}</p>
            )}
          </section>
          <section className="panel">
            <h3>Recent activity</h3>
            {portal.sample ? (
              <div className="activity">
                {portal.sample.activity.map((item) => (
                  <div className="activity-row" key={item.eventId}>
                    <span className="activity-icon">{item.icon}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="activity">
                {activity.length === 0 && <p className="muted small">No project activity yet.</p>}
                {activity.map((item) => (
                  <div className="activity-row" key={item.eventId}>
                    <span className="activity-icon">{activityIcon(item.action)}</span>
                    <div>
                      <strong>{activityTitle(item.action)}</strong>
                      <small>
                        {activityDetail(item.action)} · {relativeTime(item.at)}
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function activityIcon(action: string): string {
  if (action.startsWith("document.")) return "▤";
  if (action.startsWith("report.")) return "▥";
  if (action.includes("kanban") || action.startsWith("issue.")) return "♧";
  return "◉";
}

function activityTitle(action: string): string {
  const labels: Record<string, string> = {
    "document.created": "Document added",
    "document.restored": "Document restored",
    "overview.updated": "Overview updated",
    "report.published": "Status report published",
    "report.drafted": "Status report drafted",
    "member.invited": "Person invited",
    "project.created": "Project created",
    "project.renamed": "Project renamed",
    "progress.overridden": "Progress overridden",
  };
  return labels[action] ?? action;
}

function activityDetail(action: string): string {
  if (action.startsWith("document.")) return "Document library";
  if (action.startsWith("report.")) return "Status report";
  if (action.startsWith("overview.")) return "Project overview";
  return "Project activity";
}

function relativeTime(value: string): string {
  const then = Date.parse(value);
  if (!Number.isFinite(then)) return value;
  const hours = Math.round((Date.now() - then) / 36e5);
  if (hours < 1) return "Just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1d ago" : `${days}d ago`;
}

function ProjectsPage() {
  const portal = usePortal();
  const navigate = useNavigate();
  const project = portal.projects.find((item) => item.projectId === portal.projectId);
  const customer = portal.customers.find((item) => item.customerId === portal.customerId);

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Projects.</h1>
          <p className="subtitle">Select a customer workspace and project.</p>
        </div>
      </header>
      <div className="grid two">
        <section className="panel">
          <p className="eyebrow">Active project</p>
          <h2 className="project-title">{project?.name ?? "None selected"}</h2>
          <p className="muted small">Choose a project, then open its workspace.</p>
          <div className="row">
            {portal.projects.map((item) => (
              <button key={item.projectId} className={item.projectId === portal.projectId ? "btn primary" : "btn"} type="button" onClick={() => portal.setProjectId(item.projectId)}>
                {item.name}
              </button>
            ))}
          </div>
          <button className="btn primary" type="button" onClick={() => navigate("/")}>
            Open workspace
          </button>
        </section>
        <section className="panel">
          <p className="eyebrow">Customer</p>
          <h2 className="project-title">{customer?.name ?? "None selected"}</h2>
          <p className="muted small">Customer management stays with an administrator.</p>
        </section>
      </div>
    </>
  );
}

function SettingsPage({ session }: { session: Session | null }) {
  const portal = usePortal();
  const project = portal.projects.find((item) => item.projectId === portal.projectId);
  const customer = portal.customers.find((item) => item.customerId === portal.customerId);
  const [tab, setTab] = useState("Project access");
  if (!session) return null;
  const person = displayName(session.email);
  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Settings.</h1>
          <p className="subtitle">Manage project access and preferences.</p>
        </div>
      </header>
      <div className="settings-grid">
        <section className="panel settings-menu">
          {["Project access", "General", "Catalog", "Notifications", "GitHub integration"].map((item) => (
            <button key={item} className={tab === item ? "active" : undefined} type="button" onClick={() => setTab(item)}>
              {item}
            </button>
          ))}
        </section>
        {tab === "Project access" && (
          <section className="panel">
            <div className="docdetailbar">
              <div>
                <h3>Project access</h3>
                <p className="small muted">This table is the signed-in person. Invited people, their customer, and their projects are on the <Link to="/members">members list</Link>.</p>
              </div>
            </div>
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
                    <td>{person.name}</td>
                    <td>{session.email}</td>
                    <td>{portal.accessLabel}</td>
                    <td>
                      <span className="pill good">Active</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {session.adminGroup ? <AdminHome session={session} /> : <p className="copy">Ask an administrator to invite someone to this customer.</p>}
          </section>
        )}
        {tab === "General" && (
          <section className="panel">
            <h3>General</h3>
            <p className="copy">Customer: {customer?.name ?? "None selected"}.</p>
            {!project && <p className="copy">Select a project to view or change its name.</p>}
            {project && !session.adminGroup && <p className="copy">Project: {project.name}.</p>}
            {project && session.adminGroup && <RenameProjectForm session={session} project={project} />}
          </section>
        )}
        {tab === "Catalog" && (
          <section className="panel">
            <h3>Catalog</h3>
            <CatalogSettings session={session} projectId={portal.projectId} projectName={project?.name ?? null} />
          </section>
        )}
        {tab === "Notifications" && (
          <section className="panel">
            <h3>Notifications</h3>
            <p className="copy">Notification preferences are not part of this release.</p>
          </section>
        )}
        {tab === "GitHub integration" && (
          <section className="panel">
            <h3>GitHub integration</h3>
            <p className="copy">Repository mapping is saved by an administrator on the project plan. Issue edits reach GitHub only after the App is configured.</p>
            {portal.projectId && (
              <Link className="btn" to={`/projects/${portal.projectId}/plan`}>
                Open project plan
              </Link>
            )}
          </section>
        )}
      </div>
    </>
  );
}

function HelpPage() {
  return (
    <main>
      <h1>Help</h1>
      <p>A help guide is not part of this release.</p>
    </main>
  );
}

function PortalHomePreview() {
  const session: Session = { email: "alex.chen@example.com", idToken: "", adminGroup: false, mfa: true };
  return (
    <Shell
      session={session}
      onSession={() => undefined}
      sample={{
        percent: 16,
        phase: "Phase 1 · Discovery",
        window: "Mar 4, 2025 – Apr 30, 2025",
        activity: [
          { eventId: "1", icon: "▤", title: "Document updated", detail: "Project Charter v1.2 · 2h ago" },
          { eventId: "2", icon: "▥", title: "Status report published", detail: "Week of Mar 10 · 1d ago" },
          { eventId: "3", icon: "♧", title: "Task moved to In Progress", detail: "Discovery interview schedule · 1d ago" },
        ],
      }}
    >
      <Dashboard session={session} />
    </Shell>
  );
}

function AdminHome({ session }: { session: Session }) {
  const portal = usePortal();
  const [error, setError] = useState<string | null>(null);

  return (
    <section>
      {error && <p className="error">{error}</p>}
      <h2>Administrator tools</h2>
      <NamedForm
        label="Customer name"
        submit="Create customer"
        onSubmit={async (name) => {
          const created = await api<Customer>("/admin/customers", session.idToken, { method: "POST", body: { name } });
          portal.reload();
          portal.setCustomerId(created.customerId);
        }}
      />
      {portal.customerId && (
        <>
          <NamedForm
            label="Project name"
            submit="Create project"
            onSubmit={async (name) => {
              const created = await api<Project>(`/admin/customers/${portal.customerId}/projects`, session.idToken, {
                method: "POST",
                body: { name },
              });
              portal.reload();
              portal.setProjectId(created.projectId);
            }}
          />
          <InviteForm
            onSubmit={async (email, access) => {
              await api(`/admin/customers/${portal.customerId}/invitations`, session.idToken, { method: "POST", body: { email, access } });
            }}
          />
          {portal.projectId && <EnableModule session={session} projectId={portal.projectId} onError={setError} />}
        </>
      )}
    </section>
  );
}

function EnableModule({ session, projectId, onError }: { session: Session; projectId: string; onError: (message: string | null) => void }) {
  const portal = usePortal();
  const [moduleKey, setModuleKey] = useState<"overview" | "documents" | "plan" | "kanban" | "reports">("reports");
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        onError(null);
        try {
          await api(`/admin/projects/${projectId}/applications`, session.idToken, {
            method: "POST",
            body: { moduleKey, displayName: moduleKey[0].toUpperCase() + moduleKey.slice(1) },
          });
          portal.reload();
        } catch (caught) {
          onError(caught instanceof ApiError ? caught.message : "Could not enable the module.");
        }
      }}
    >
      <label>
        Module
        <select value={moduleKey} onChange={(event) => setModuleKey(event.target.value as "overview" | "documents" | "plan" | "kanban" | "reports")}>
          <option value="overview">Overview</option>
          <option value="documents">Documents</option>
          <option value="plan">Plan</option>
          <option value="kanban">Kanban</option>
          <option value="reports">Reports</option>
        </select>
      </label>
      <button type="submit">Enable module</button>
    </form>
  );
}

function InviteForm({ onSubmit }: { onSubmit: (email: string, access: "Contributor" | "View") => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [access, setAccess] = useState<"Contributor" | "View">("Contributor");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await onSubmit(email, access);
          setEmail("");
          setAccess("Contributor");
        } catch (caught) {
          setError(caught instanceof ApiError ? caught.message : "Request failed.");
        }
      }}
    >
      <label>
        Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
      </label>
      <label>
        Access
        <select value={access} onChange={(event) => setAccess(event.target.value as "Contributor" | "View")}>
          <option value="Contributor">Contributor</option>
          <option value="View">View</option>
        </select>
      </label>
      <button type="submit">Invite</button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

function NamedForm({ label, submit, onSubmit }: { label: string; submit: string; onSubmit: (value: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await onSubmit(value);
          setValue("");
        } catch (caught) {
          setError(caught instanceof ApiError ? caught.message : "Request failed.");
        }
      }}
    >
      <label>
        {label}
        <input value={value} onChange={(event) => setValue(event.target.value)} required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit">{submit}</button>
    </form>
  );
}

/** Administrator form on Settings → General. Saves the portal project name without changing GitHub. */
function RenameProjectForm({ session, project }: { session: Session; project: Project }) {
  const portal = usePortal();
  const [name, setName] = useState(project.name);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(project.name);
    setError(null);
    setNotice(null);
  }, [project.projectId, project.name]);

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const saved = await api<Project>(`/admin/projects/${project.projectId}`, session.idToken, {
        method: "PATCH",
        body: { name },
      });
      setName(saved.name);
      setNotice("Project name saved.");
      portal.reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not rename the project.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="toolbar settings-name-form" onSubmit={(event) => void save(event)}>
      <label>
        Project name
        <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
      </label>
      <button className="btn primary" type="submit" disabled={busy || name.trim() === project.name}>
        Save name
      </button>
      {error && <p className="error">{error}</p>}
      {notice && <p className="muted small">{notice}</p>}
    </form>
  );
}
