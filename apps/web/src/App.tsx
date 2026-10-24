import { useEffect, useState, type FormEvent } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import type { CognitoUser } from "amazon-cognito-identity-js";
import { api, ApiError } from "./api";
import { beginTotpSetup, completeNewPassword, confirmTotpSetup, mfaIsEnrolled, signIn, signOut, submitTotp, type Session } from "./auth";

type Customer = { customerId: string; name: string };
type Project = { projectId: string; customerId: string; name: string };
type Application = { applicationId: string; projectId: string; displayName: string; moduleKey: string };
type Me = { admin: boolean; email: string | null; memberships: { customerId: string }[] };

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  return (
    <Routes>
      <Route path="/projects/:projectId/overview" element={<Overview session={session} />} />
      <Route path="*" element={<Home session={session} onSession={setSession} />} />
    </Routes>
  );
}

function Home({ session, onSession }: { session: Session | null; onSession: (session: Session | null) => void }) {
  return (
    <main>
      <h1>One80Compass</h1>
      {session ? <Workspace session={session} onSession={onSession} /> : <SignIn onSession={onSession} />}
    </main>
  );
}

function SignIn({ onSession }: { onSession: (session: Session) => void }) {
  const [email, setEmail] = useState("nick@one80labs.com");
  const [password, setPassword] = useState("");
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
        onSession(await submitTotp(pendingUser, email, password));
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
      <label>
        {label}
        <input
          type={mode === "totp" ? "text" : "password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={mode === "password" ? "current-password" : "new-password"}
          required
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit">Continue</button>
    </form>
  );
}

function Workspace({ session, onSession }: { session: Session; onSession: (session: Session | null) => void }) {
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

  if (session.adminGroup && !session.mfa) {
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

  return (
    <>
      <div className="row">
        <p>{session.email}</p>
        <button
          className="secondary"
          type="button"
          onClick={() => {
            signOut();
            onSession(null);
          }}
        >
          Sign out
        </button>
      </div>
      {session.adminGroup ? <AdminHome session={session} /> : <EmployeeHome session={session} />}
    </>
  );
}

function AdminHome({ session }: { session: Session }) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ customers: Customer[] }>("/admin/customers", session.idToken)
      .then((result) => setCustomers(result.customers))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load customers."));
  }, [session.idToken]);

  useEffect(() => {
    if (!customerId) return;
    api<{ projects: Project[] }>(`/customers/${customerId}/projects`, session.idToken)
      .then((result) => setProjects(result.projects))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load projects."));
  }, [customerId, session.idToken]);

  return (
    <section>
      <h2>Administration</h2>
      {error && <p className="error">{error}</p>}
      <NamedForm
        label="Customer name"
        submit="Create customer"
        onSubmit={async (name) => {
          const created = await api<Customer>("/admin/customers", session.idToken, { method: "POST", body: { name } });
          setCustomers((current) => [...current, created]);
          setCustomerId(created.customerId);
        }}
      />
      <label>
        Customer
        <select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
          <option value="">Select a customer</option>
          {customers.map((customer) => (
            <option key={customer.customerId} value={customer.customerId}>
              {customer.name}
            </option>
          ))}
        </select>
      </label>
      {customerId && (
        <>
          <NamedForm
            label="Project name"
            submit="Create project"
            onSubmit={async (name) => {
              const created = await api<Project>(`/admin/customers/${customerId}/projects`, session.idToken, {
                method: "POST",
                body: { name },
              });
              setProjects((current) => [...current, created]);
              setProjectId(created.projectId);
            }}
          />
          <NamedForm
            label="Employee email"
            submit="Invite employee"
            onSubmit={async (email) => {
              await api(`/admin/customers/${customerId}/invitations`, session.idToken, { method: "POST", body: { email } });
            }}
          />
        </>
      )}
      <label>
        Project
        <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="">Select a project</option>
          {projects.map((project) => (
            <option key={project.projectId} value={project.projectId}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      {projectId && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            try {
              await api(`/admin/projects/${projectId}/applications`, session.idToken, {
                method: "POST",
                body: { moduleKey: "overview", displayName: "Overview" },
              });
            } catch (caught) {
              setError(caught instanceof ApiError ? caught.message : "Could not enable Overview.");
            }
          }}
        >
          <button type="submit">Enable Overview</button>
          <Link to={`/projects/${projectId}/overview`}>Open Overview</Link>
        </form>
      )}
    </section>
  );
}

function EmployeeHome({ session }: { session: Session }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tiles, setTiles] = useState<Application[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/me", session.idToken)
      .then(async (me) => {
        const listed = await Promise.all(
          me.memberships.map((membership) => api<{ projects: Project[] }>(`/customers/${membership.customerId}/projects`, session.idToken)),
        );
        const nextProjects = listed.flatMap((result) => result.projects);
        setProjects(nextProjects);
        const apps = await Promise.all(
          nextProjects.map((project) => api<{ applications: Application[] }>(`/projects/${project.projectId}/applications`, session.idToken)),
        );
        setTiles(apps.flatMap((result) => result.applications));
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load projects."));
  }, [session.idToken]);

  return (
    <section>
      <h2>Projects</h2>
      {error && <p className="error">{error}</p>}
      {projects.length === 0 && <p>No projects are assigned yet.</p>}
      {tiles.map((tile) => (
        <p key={tile.applicationId}>
          <Link className="tile" to={`/projects/${tile.projectId}/overview`}>
            {tile.displayName}
          </Link>
        </p>
      ))}
    </section>
  );
}

function Overview({ session }: { session: Session | null }) {
  const { projectId = "" } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    api<Project>(`/projects/${projectId}`, session.idToken)
      .then(setProject)
      .catch((caught) => setError(caught instanceof ApiError ? caught.message : "Could not open the project."));
  }, [projectId, session]);

  return (
    <main>
      <h1>Overview</h1>
      {!session && <p>Sign in to open this project.</p>}
      {error && <p className="error">{error}</p>}
      {project && <p>{project.name}</p>}
      <button className="secondary" type="button" onClick={() => navigate("/")}>
        Back
      </button>
    </main>
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
