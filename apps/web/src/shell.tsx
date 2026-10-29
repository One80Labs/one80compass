import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "./api";
import type { Session } from "./auth";
import { signOut } from "./auth";
import { modulePath } from "./project";

type Customer = { customerId: string; name: string };
type Project = { projectId: string; customerId: string; name: string; projectKey?: string | null; createdAt?: string };
type Application = { applicationId: string; projectId: string; displayName: string; moduleKey: string };
type Me = { memberships: { customerId: string; role?: string }[] };

export type PortalActivity = { eventId: string; action: string; at: string };

/** Sample fields exist only on the local layout preview. Live pages leave this empty. */
export type PortalSample = {
  percent: number;
  phase: string;
  window: string;
  activity: { eventId: string; title: string; detail: string; icon: string }[];
};

/** Customer, project, and the modules enabled for the project selected in the shell. */
type PortalState = {
  customers: Customer[];
  projects: Project[];
  tiles: Application[];
  customerId: string;
  projectId: string;
  /** False for View. Administrators and Contributors can edit, add, and upload. */
  canWrite: boolean;
  accessLabel: "Administrator" | "Contributor" | "View";
  setCustomerId: (customerId: string) => void;
  setProjectId: (projectId: string) => void;
  reload: () => void;
  sample: PortalSample | null;
};

const PortalContext = createContext<PortalState | null>(null);

export function usePortal(): PortalState {
  const portal = useContext(PortalContext);
  if (!portal) throw new Error("Portal navigation is not available on this screen.");
  return portal;
}

const MODULES = ["overview", "documents", "plan", "kanban", "reports", "audit"];

const NAV_LINKS = [
  { key: "overview", label: "Overview", icon: "◉" },
  { key: "plan", label: "Project Plan", icon: "▤" },
  { key: "kanban", label: "Kanban Board", icon: "▦" },
  { key: "documents", label: "Documents", icon: "♧" },
  { key: "reports", label: "Status Reports", icon: "▥" },
] as const;

const HOME_TILES = [
  { key: "overview", title: "Project Overview", detail: "Goals, timeline, and key details", icon: "♧" },
  { key: "plan", title: "Project Plan", detail: "Milestones, phases, and tasks", icon: "▤" },
  { key: "kanban", title: "Kanban Board", detail: "Track and manage work", icon: "▦" },
  { key: "documents", title: "Documents", detail: "Requirements, references, and deliverables", icon: "♧" },
] as const;

/**
 * Shared frame copied from the HTML reference: sidebar, top bar, and page padding.
 * Module pages keep their existing data loading.
 */
export function Shell({
  session,
  onSession,
  children,
  sample,
}: {
  session: Session;
  onSession: (session: Session | null) => void;
  children: ReactNode;
  sample?: PortalSample;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const routeProjectId = params.projectId ?? "";
  const [navOpen, setNavOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>(sample ? [{ customerId: "sample", name: "Sample" }] : []);
  const [projects, setProjects] = useState<Project[]>(sample ? [{ projectId: "sample", customerId: "sample", name: "Amur", createdAt: "" } as Project] : []);
  const [tiles, setTiles] = useState<Application[]>([]);
  const [customerId, setCustomerIdState] = useState(sample ? "sample" : "");
  const [projectId, setProjectIdState] = useState(sample ? "sample" : routeProjectId);
  const [roles, setRoles] = useState<Record<string, "contributor" | "view">>({});
  const [rolesReady, setRolesReady] = useState(Boolean(sample) || session.adminGroup);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (sample) return;
    api<Me>("/me", session.idToken)
      .then((me) => {
        const next: Record<string, "contributor" | "view"> = {};
        for (const membership of me.memberships) next[membership.customerId] = membership.role === "view" ? "view" : "contributor";
        setRoles(next);
        setRolesReady(true);
      })
      .catch(() => setRolesReady(true));
  }, [generation, sample, session.idToken]);

  useEffect(() => {
    if (sample) return;
    const load = session.adminGroup
      ? api<{ customers: Customer[] }>("/admin/customers", session.idToken).then((result) => result.customers)
      : api<Me>("/me", session.idToken).then((me) => Promise.all(me.memberships.map((membership) => api<Customer>(`/customers/${membership.customerId}`, session.idToken))));
    load.then(setCustomers).catch(() => setCustomers([]));
  }, [generation, sample, session.adminGroup, session.idToken]);

  useEffect(() => {
    if (sample || !routeProjectId) return;
    api<Project>(`/projects/${routeProjectId}`, session.idToken)
      .then((project) => {
        setCustomerIdState(project.customerId);
        setProjectIdState(project.projectId);
      })
      .catch(() => undefined);
  }, [routeProjectId, sample, session.idToken]);

  useEffect(() => {
    if (sample) return;
    if (!customerId && customers.length === 1) setCustomerIdState(customers[0].customerId);
  }, [customerId, customers, sample]);

  useEffect(() => {
    if (sample) return;
    if (!customerId) {
      setProjects([]);
      return;
    }
    api<{ projects: Project[] }>(`/customers/${customerId}/projects`, session.idToken)
      .then((result) => setProjects(result.projects))
      .catch(() => setProjects([]));
  }, [customerId, generation, sample, session.idToken]);

  useEffect(() => {
    if (sample) return;
    if (!projectId && projects.length === 1) setProjectIdState(projects[0].projectId);
  }, [projectId, projects, sample]);

  useEffect(() => {
    if (sample || !projectId) {
      if (!sample) setTiles([]);
      return;
    }
    api<{ applications: Application[] }>(`/projects/${projectId}/applications`, session.idToken)
      .then((result) => setTiles(uniqueModules(result.applications)))
      .catch(() => setTiles([]));
  }, [projectId, generation, sample, session.idToken]);

  function closeNav() {
    setNavOpen(false);
  }

  function setCustomerId(next: string) {
    setCustomerIdState(next);
    setProjectIdState("");
    if (location.pathname.startsWith("/projects/")) navigate("/");
  }

  function setProjectId(next: string) {
    setProjectIdState(next);
    const moduleKey = location.pathname.split("/")[3] ?? "";
    if (next && MODULES.includes(moduleKey)) navigate(modulePath(moduleKey, next));
  }

  const canWrite = Boolean(sample) || session.adminGroup || (rolesReady && customerId !== "" && roles[customerId] === "contributor");
  const accessLabel: PortalState["accessLabel"] = session.adminGroup
    ? "Administrator"
    : roles[customerId] === "view"
      ? "View"
      : "Contributor";
  const portal: PortalState = {
    customers,
    projects,
    tiles,
    customerId,
    projectId,
    canWrite,
    accessLabel,
    setCustomerId,
    setProjectId,
    reload: () => setGeneration((current) => current + 1),
    sample: sample ?? null,
  };
  const activeModule = location.pathname.split("/")[3] ?? "";
  const projectName = projects.find((project) => project.projectId === projectId)?.name ?? "";
  const person = displayName(session.email);
  const homeActive = location.pathname === "/" || location.pathname === "/dev/portal-home";
  const preview = Boolean(sample);

  return (
    <PortalContext.Provider value={portal}>
      <div className={navOpen ? "mobile-shade open" : "mobile-shade"} onClick={closeNav} />
      <div className="shell">
        <aside className={navOpen ? "sidebar open" : "sidebar"}>
          <Link className="brand" to={preview ? "/dev/portal-home" : "/"} onClick={closeNav}>
            <span className="orange">One</span>80Compass
          </Link>
          <nav className="nav" aria-label="Main navigation">
            <Link className={homeActive ? "nav-link active" : "nav-link"} to={preview ? "/dev/portal-home" : "/"} onClick={closeNav}>
              <span className="ico">⌂</span>Home
            </Link>
            <Link className={location.pathname === "/projects" ? "nav-link active" : "nav-link"} to={preview ? "/dev/portal-home" : "/projects"} onClick={closeNav}>
              <span className="ico">▣</span>Projects
            </Link>
            <div className="nav-label">Active project</div>
            {customers.length > 1 && (
              <label className="nav-field">
                <span>Customer</span>
                <select aria-label="Customer" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                  <option value="">Select a customer</option>
                  {customers.map((customer) => (
                    <option key={customer.customerId} value={customer.customerId}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {projects.map((project) => (
              <button key={project.projectId} className="nav-link" type="button" onClick={() => setProjectId(project.projectId)}>
                <span className="ico">♙</span>
                {project.name}
              </button>
            ))}
            {projectId &&
              NAV_LINKS.map((item) => (
                <Link
                  key={item.key}
                  className={item.key === activeModule ? "nav-link child active" : "nav-link child"}
                  to={preview ? "/dev/portal-home" : modulePath(item.key, projectId)}
                  onClick={closeNav}
                >
                  <span className="ico">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
          </nav>
          <div className="nav-bottom">
            {session.adminGroup && !preview && (
              <Link className={location.pathname === "/members" ? "nav-link active" : "nav-link"} to="/members" onClick={closeNav}>
                <span className="ico">☺</span>Members
              </Link>
            )}
            <Link className={location.pathname === "/settings" ? "nav-link active" : "nav-link"} to="/settings" onClick={closeNav}>
              <span className="ico">⚙</span>Settings
            </Link>
            <Link className={location.pathname === "/help" ? "nav-link active" : "nav-link"} to="/help" onClick={closeNav}>
              <span className="ico">ⓘ</span>FAQ
            </Link>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div className="topbar-start">
              <button className="hamburger" type="button" aria-expanded={navOpen} aria-label={navOpen ? "Close navigation" : "Open navigation"} onClick={() => setNavOpen((open) => !open)}>
                ☰
              </button>
              <div className="project-tag">
                {projectName || "One80Compass"}
                {projectName && (
                  <>
                    <span className="dot" />
                    <small>Active</small>
                  </>
                )}
              </div>
            </div>
            <div className="profile">
              <span className="avatar" aria-hidden="true">
                {person.initials}
              </span>
              <span className="profile-text">
                <strong>{person.name}</strong>
                <small>{preview ? `${projectName} · sample layout` : session.email}</small>
              </span>
              <button className="chevron" type="button" aria-expanded={menuOpen} aria-label="Account menu" onClick={() => setMenuOpen((open) => !open)}>
                ⌄
              </button>
              {menuOpen && (
                <div className="profile-menu">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      signOut();
                      onSession(null);
                    }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </header>
          <div className="main">{children}</div>
        </div>
      </div>
    </PortalContext.Provider>
  );
}

function uniqueModules(tiles: Application[]): Application[] {
  const seen = new Set<string>();
  return tiles.filter((tile) => {
    if (seen.has(tile.moduleKey)) return false;
    seen.add(tile.moduleKey);
    return true;
  });
}

export function ModuleTiles() {
  const { projectId, sample } = usePortal();
  if (!projectId) return <p className="empty">Select a project to open its modules.</p>;
  return (
    <div className="grid four">
      {HOME_TILES.map((tile) => (
        <Link key={tile.key} className="tile" to={sample ? "/dev/portal-home" : modulePath(tile.key, projectId)}>
          <span className="tile-icon">{tile.icon}</span>
          <strong>{tile.title}</strong>
          <span>{tile.detail}</span>
        </Link>
      ))}
    </div>
  );
}

export function displayName(email: string): { name: string; initials: string } {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  const name = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") || email;
  const initials = (parts[0]?.charAt(0) ?? email.charAt(0)).toUpperCase() + (parts[1]?.charAt(0) ?? "").toUpperCase();
  return { name, initials };
}
