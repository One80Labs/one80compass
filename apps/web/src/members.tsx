import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import type { Session } from "./auth";
import { displayName } from "./shell";

type ProjectRef = { projectId: string; name: string };

type Member = {
  userId: string;
  email: string;
  name: string;
  customerId: string;
  customerName: string;
  access: "Administrator" | "Employee";
  allProjects: boolean;
  projects: ProjectRef[];
  customerProjects: ProjectRef[];
};

/** Invited people, the customer they belong to, and the projects they can open. */
export function MembersPage({ session }: { session: Session | null }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);

  useEffect(() => {
    if (!session?.adminGroup) return;
    api<{ members: Member[] }>("/admin/members", session.idToken)
      .then((result) => setMembers(result.members))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load members."));
  }, [session]);

  if (!session) return null;
  if (!session.adminGroup) return <p>An administrator opens the members list.</p>;

  return (
    <>
      <header className="page-head">
        <div>
          <h1 className="page-title">Members.</h1>
          <p className="subtitle">Everyone invited to a customer, the projects they can open, and their access.</p>
        </div>
      </header>
      {error && <p className="error">{error}</p>}
      <section className="panel">
        <p className="small muted">
          Edit sets the name, sign-in email, and projects. All projects includes ones added later. An administrator can open every project. Owner, Contributor, and Viewer are a later release.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Customer</th>
                <th>Projects</th>
                <th>Access</th>
              </tr>
            </thead>
            <tbody>
              {members?.length === 0 && (
                <tr>
                  <td colSpan={5}>No one has been invited yet.</td>
                </tr>
              )}
              {members?.map((member) => {
                const label = memberName(member);
                return (
                  <tr key={`${member.customerId}:${member.userId}`}>
                    <td>
                      <div className="member-name">
                        <span>{label}</span>
                        <button className="btn small" type="button" onClick={() => setEditing(member)}>
                          Edit
                        </button>
                      </div>
                    </td>
                    <td>{member.email}</td>
                    <td>{member.customerName}</td>
                    <td>{member.allProjects ? "All projects" : member.projects.length ? member.projects.map((project) => project.name).join(", ") : "No projects"}</td>
                    <td>
                      <span className={member.access === "Administrator" ? "pill good" : "pill"}>{member.access}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          Invite someone from <Link to="/settings">Settings</Link>.
        </p>
      </section>
      {editing && session && (
        <MemberDrawer
          member={editing}
          idToken={session.idToken}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setMembers((current) => current?.map((member) => (member.customerId === editing.customerId && member.userId === editing.userId ? saved : member)) ?? null);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

function memberName(member: Member): string {
  const trimmed = member.name.trim();
  return trimmed || displayName(member.email).name;
}

function MemberDrawer({
  member,
  idToken,
  onClose,
  onSaved,
}: {
  member: Member;
  idToken: string;
  onClose: () => void;
  onSaved: (member: Member) => void;
}) {
  const administrator = member.access === "Administrator";
  const [name, setName] = useState(memberName(member));
  const [email, setEmail] = useState(member.email);
  const [allProjects, setAllProjects] = useState(member.allProjects);
  const [projectIds, setProjectIds] = useState(member.projects.map((project) => project.projectId));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggleProject(projectId: string) {
    setProjectIds((current) => (current.includes(projectId) ? current.filter((id) => id !== projectId) : [...current, projectId]));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!administrator && !allProjects && projectIds.length === 0) {
      setError("Choose at least one project, or allow every project.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await api<Member>(`/admin/customers/${member.customerId}/members/${member.userId}`, idToken, {
        method: "PATCH",
        body: {
          name,
          email: administrator ? member.email : email,
          projectIds: administrator || allProjects ? null : projectIds,
        },
      });
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this member.");
      setSaving(false);
    }
  }

  return (
    <div className="drawer-layer" onClick={onClose}>
      <form className="drawer" role="dialog" aria-modal="true" aria-label={`Edit ${memberName(member)}`} onClick={(event) => event.stopPropagation()} onSubmit={onSubmit}>
        <h2>Edit member</h2>
        <p>{member.customerName}</p>
        <label>
          Name
          <input className="field" value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
        </label>
        <label>
          Email
          <input className="field" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={administrator} />
        </label>
        {administrator ? (
          <p>Administrators can open every project. This sign-in email stays on the administrator account.</p>
        ) : (
          <>
            <p>A new email receives a temporary password. The previous address stops signing in.</p>
            <label className="check">
              <input type="checkbox" checked={allProjects} onChange={(event) => setAllProjects(event.target.checked)} />
              All projects for this customer
            </label>
            {member.customerProjects.map((project) => (
              <label className="check" key={project.projectId}>
                <input
                  type="checkbox"
                  checked={allProjects || projectIds.includes(project.projectId)}
                  disabled={allProjects}
                  onChange={() => toggleProject(project.projectId)}
                />
                {project.name}
              </label>
            ))}
            <p>All projects includes ones added later.</p>
          </>
        )}
        {error && <p className="error">{error}</p>}
        <div className="dialog-actions">
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? "Saving" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
