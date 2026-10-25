import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import type { Session } from "./auth";
import { displayName } from "./shell";

type Member = {
  userId: string;
  email: string;
  customerId: string;
  customerName: string;
  access: "Administrator" | "Employee";
  projects: { projectId: string; name: string }[];
};

/** Invited people, the customer they belong to, and the projects that customer can open. */
export function MembersPage({ session }: { session: Session | null }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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
          An employee can open every project for their customer. Administrator is the One80Compass admin sign-in. Owner, Contributor, and Viewer are a later release.
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
              {members?.map((member) => (
                <tr key={`${member.customerId}:${member.userId}`}>
                  <td>{displayName(member.email).name}</td>
                  <td>{member.email}</td>
                  <td>{member.customerName}</td>
                  <td>{member.projects.length ? member.projects.map((project) => project.name).join(", ") : "No projects"}</td>
                  <td>
                    <span className={member.access === "Administrator" ? "pill good" : "pill"}>{member.access}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted">
          Invite someone from <Link to="/settings">Settings</Link>.
        </p>
      </section>
    </>
  );
}
