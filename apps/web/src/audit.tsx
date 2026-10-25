import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "./api";
import type { Session } from "./auth";

type AuditEvent = {
  eventId: string;
  projectId: string | null;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  at: string;
};

/** Newest recorded changes for this customer, limited to the open project and customer-wide events. */
export function AuditPage({ session }: { session: Session | null }) {
  const { projectId = "" } = useParams();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const actor = session ? tokenSubject(session.idToken) : null;

  useEffect(() => {
    if (!session) return;
    api<{ customerId: string }>(`/projects/${projectId}`, session.idToken)
      .then((project) => api<{ events: AuditEvent[] }>(`/customers/${project.customerId}/audit`, session.idToken))
      .then((result) => setEvents(result.events.filter((event) => event.projectId === projectId || event.projectId == null)))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load the audit."));
  }, [projectId, session]);

  return (
    <main>
      <h1>Audit</h1>
      {!session && <p>Sign in to read the audit.</p>}
      {error && <p className="error">{error}</p>}
      {session && events.length === 0 && !error && <p>No recorded changes yet.</p>}
      {events.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Action</th>
              <th>Target</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.eventId}>
                <td>{event.at}</td>
                <td>{event.actorUserId === actor ? "You" : event.actorUserId}</td>
                <td>{event.action}</td>
                <td>
                  {event.targetType} {event.targetId}
                </td>
                <td>{changeText(event.before, event.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

function tokenSubject(idToken: string): string | null {
  try {
    const payload = idToken.split(".")[1] ?? "";
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const body = JSON.parse(json) as { sub?: unknown };
    return typeof body.sub === "string" ? body.sub : null;
  } catch {
    return null;
  }
}

function changeText(before: unknown, after: unknown): string {
  if (before == null && after == null) return "";
  if (before == null) return summarize(after);
  if (after == null) return `Removed ${summarize(before)}`;
  return `${summarize(before)} → ${summarize(after)}`;
}

function summarize(value: unknown): string {
  if (value == null || typeof value !== "object") return String(value ?? "");
  const text = Object.entries(value as Record<string, unknown>)
    .slice(0, 6)
    .map(([key, item]) => `${key}: ${item == null || typeof item !== "object" ? String(item) : "…"}`)
    .join(", ");
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}
