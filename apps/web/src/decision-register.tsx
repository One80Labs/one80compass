import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  decisionCounts,
  decisionIsBlocking,
  decisionIsOverdue,
  type DecisionKind,
  type DecisionRecord,
  type DecisionStatus,
} from "../../../packages/domain/src/decisions";
import { api, ApiError } from "./api";
import type { Session } from "./auth";
import {
  archiveDecision,
  commentDecision,
  createDecision,
  duplicateDecision,
  listDecisions,
  updateDecision,
  type DecisionDraft,
} from "./decision-client";
import { DecisionDrawer } from "./decision-drawer";
import { PlanIssueEditDrawer, usePlan } from "./plan";
import { SuggestionInbox } from "./suggestion-inbox";
import { usePortal } from "./shell";
import { EditRowButton, PageHead, Pill, formatWhen } from "./ui";

type StatusFilter = DecisionStatus | "all";
type KindFilter = DecisionKind | "all";

type DrawerIssue = { issueId: string; title: string; issueType: string | null; keyLabel: string | null };
type DrawerMember = { id: string; name: string };
type DrawerDocument = { documentId: string; fileName: string };

type PlanIssueRow = {
  issueId: string;
  title: string;
  issueType?: string | null;
  keyNumber?: number | null;
  deletedAt?: string | null;
};

type PlanLookup = {
  projectKey?: string | null;
  issues?: PlanIssueRow[];
  members?: { id: string; login?: string; name: string | null }[];
  settings?: { assignableUsers?: { id: string; login: string; name: string | null }[] } | null;
};

type ListedDocument = { documentId: string; name: string; currentFileName: string | null };

/**
 * Decision register: counts, assigned-to-me, and a filterable table.
 * The same drawer adds an item and opens a row. It does not create plan issues.
 * The pencil to the left of a Work item name opens that item's plan edit drawer.
 */
export function DecisionRegisterPage({ session }: { session: Session | null }) {
  const { projectId = "" } = useParams();
  const portal = usePortal();
  const canWrite = portal.canWrite;
  const canArchive = portal.accessLabel === "Administrator";
  const name = portal.projects.find((item) => item.projectId === projectId)?.name ?? "this project";
  const currentUserId = session ? signedInUserId(session.idToken) : "";
  const today = new Date().toISOString().slice(0, 10);

  const [decisions, setDecisions] = useState<DecisionRecord[]>([]);
  const [documents, setDocuments] = useState<DrawerDocument[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The register opens on Outstanding. Other statuses are chosen from the filter. */
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("outstanding");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [blockingFilter, setBlockingFilter] = useState<"all" | "blocking">("all");
  const [overdueFilter, setOverdueFilter] = useState<"all" | "overdue">("all");
  const [open, setOpen] = useState<{ decisionId: string | null } | null>(null);
  /** Plan issue open in the edit drawer. Null keeps the register on the decision row. */
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const plan = usePlan(session);
  const issues = issuesFromPlan(plan.data);
  const members = membersFromPlan(plan.data);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    setLoaded(false);
    setError(null);
    setOpen(null);
    setEditingIssueId(null);

    listDecisions(projectId, session.idToken)
      .then((result) => {
        if (!cancelled) setDecisions(result.decisions);
      })
      .catch((caught) => {
        if (cancelled) return;
        setDecisions([]);
        setError(message(caught));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    api<{ documents: ListedDocument[] }>(`/projects/${projectId}/documents`, session.idToken)
      .then((result) => {
        if (cancelled) return;
        const documents = Array.isArray(result.documents) ? result.documents : [];
        setDocuments(
          documents.map((document) => ({
            documentId: document.documentId,
            fileName: document.currentFileName || document.name,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setDocuments([]);
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, session]);

  async function refreshDecisions() {
    if (!session) return;
    const result = await listDecisions(projectId, session.idToken);
    setDecisions(result.decisions);
  }

  async function perform(action: () => Promise<unknown>) {
    if (!session) return;
    setError(null);
    try {
      await action();
    } catch (caught) {
      const text = message(caught);
      setError(text);
      throw caught instanceof Error ? caught : new Error(text);
    }
    try {
      await refreshDecisions();
    } catch (caught) {
      setError(message(caught));
    }
  }

  const counts = decisionCounts(decisions, today);
  const record = open?.decisionId ? (decisions.find((item) => item.decisionId === open.decisionId) ?? null) : null;

  // Overdue assigned items sort first, then by target date (missing dates last).
  const assigned = decisions
    .filter((item) => item.status === "outstanding" && currentUserId !== "" && item.assigneeIds.includes(currentUserId))
    .sort((left, right) => compareAssigned(left, right, today));

  const rows = decisions.filter((item) => {
    if (statusFilter !== "all" && item.status !== statusFilter) return false;
    if (kindFilter !== "all" && item.kind !== kindFilter) return false;
    if (assigneeFilter && !item.assigneeIds.includes(assigneeFilter)) return false;
    if (blockingFilter === "blocking" && !decisionIsBlocking(item)) return false;
    if (overdueFilter === "overdue" && !decisionIsOverdue(item, today)) return false;
    return true;
  });

  const assigneeOptions = assigneeChoices(members, decisions);
  const filtersAreDefault =
    statusFilter === "outstanding" && kindFilter === "all" && !assigneeFilter && blockingFilter === "all" && overdueFilter === "all";
  const emptyLabel = filtersAreDefault ? "No outstanding items." : "No items match these filters.";

  return (
    <div className="decision-register">
      <PageHead title="Decision register." subtitle={`Questions and the decisions they become for ${name}.`} />
      {!session && <p>Sign in to open the decision register.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {session && (
        <>
          <div className="decision-counts" aria-label="Decision counts">
            {loaded ? (
              <>
                <span>
                  <strong>{counts.outstanding}</strong> outstanding
                </span>
                <span>
                  <strong>{counts.overdue}</strong> overdue
                </span>
                <span>
                  <strong>{counts.blocking}</strong> blocking
                </span>
              </>
            ) : (
              <span className="muted">Loading…</span>
            )}
          </div>
          <section className="decision-assigned" aria-label="Assigned to me">
            <h2>Assigned to me</h2>
            {!loaded ? (
              <p className="muted small">Loading…</p>
            ) : assigned.length === 0 ? (
              <p className="muted small">No outstanding items are assigned to you.</p>
            ) : (
              <div className="table-wrap">
                <table className="decision-table">
                  <thead>
                    <tr>
                      <th scope="col">Statement</th>
                      <th scope="col">Target date</th>
                      <th scope="col">Overdue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assigned.map((item) => (
                      <tr
                        key={item.decisionId}
                        className={decisionIsOverdue(item, today) ? "clickable overdue" : "clickable"}
                        onClick={() => setOpen({ decisionId: item.decisionId })}
                      >
                        <td>{item.statement}</td>
                        <td>{item.targetDate ? formatWhen(item.targetDate) : "—"}</td>
                        <td>{decisionIsOverdue(item, today) ? "Overdue" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {session && (
            <SuggestionInbox
              projectId={projectId}
              idToken={session.idToken}
              canWrite={canWrite}
              issues={issues}
              members={members}
              onAccepted={refreshDecisions}
            />
          )}
          <section className="panel">
            <div className="toolbar decision-filters">
              <label>
                Status
                <select className="field" value={statusFilter} aria-label="Filter by status" onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                  <option value="outstanding">Outstanding</option>
                  <option value="resolved">Resolved</option>
                  <option value="duplicate">Duplicate</option>
                  <option value="archive">Archive</option>
                  <option value="all">All statuses</option>
                </select>
              </label>
              <label>
                Kind
                <select className="field" value={kindFilter} aria-label="Filter by kind" onChange={(event) => setKindFilter(event.target.value as KindFilter)}>
                  <option value="all">All kinds</option>
                  <option value="question">Question</option>
                  <option value="decision">Decision</option>
                </select>
              </label>
              <label>
                Assignee
                <select className="field" value={assigneeFilter} aria-label="Filter by assignee" onChange={(event) => setAssigneeFilter(event.target.value)}>
                  <option value="">All assignees</option>
                  {assigneeOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Blocking
                <select
                  className="field"
                  value={blockingFilter}
                  aria-label="Filter by blocking"
                  onChange={(event) => setBlockingFilter(event.target.value as "all" | "blocking")}
                >
                  <option value="all">All</option>
                  <option value="blocking">Blocking</option>
                </select>
              </label>
              <label>
                Overdue
                <select
                  className="field"
                  value={overdueFilter}
                  aria-label="Filter by overdue"
                  onChange={(event) => setOverdueFilter(event.target.value as "all" | "overdue")}
                >
                  <option value="all">All</option>
                  <option value="overdue">Overdue</option>
                </select>
              </label>
              {canWrite && (
                <button className="btn primary decision-add" type="button" onClick={() => setOpen({ decisionId: null })}>
                  Add
                </button>
              )}
            </div>
            <div className="table-wrap">
              <table className="decision-table">
                <thead>
                  <tr>
                    <th scope="col">Statement</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Status</th>
                    <th scope="col">Assignees</th>
                    <th scope="col">Target date</th>
                    <th scope="col">Affects</th>
                    <th scope="col">Work item</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const linked = issues.find((issue) => issue.issueId === item.issueId);
                    return (
                      <tr
                        key={item.decisionId}
                        className={decisionIsOverdue(item, today) ? "clickable overdue" : "clickable"}
                        onClick={() => setOpen({ decisionId: item.decisionId })}
                      >
                        <td title={item.statement}>{item.statement}</td>
                        <td>{item.kind === "question" ? "Question" : "Decision"}</td>
                        <td>
                          <Pill tone={statusTone(item.status)}>{statusLabel(item.status)}</Pill>
                        </td>
                        <td>{assigneeLabel(item.assigneeIds, members)}</td>
                        <td>
                          {item.targetDate ? formatWhen(item.targetDate) : "—"}
                          {decisionIsOverdue(item, today) ? " · Overdue" : ""}
                        </td>
                        <td>{affectLabel(item.affects)}</td>
                        <td>
                          <WorkItemCell issue={linked} issueId={item.issueId} canWrite={canWrite} onEdit={setEditingIssueId} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {loaded && rows.length === 0 && <div className="empty">{emptyLabel}</div>}
            </div>
          </section>
        </>
      )}
      {session && open && (open.decisionId === null || record) && (
        <DecisionDrawer
          key={open.decisionId ?? "new"}
          record={record}
          issues={issues}
          members={members}
          documents={documents}
          canWrite={canWrite}
          canArchive={canArchive}
          currentUserId={currentUserId}
          siblings={decisions}
          onClose={() => setOpen(null)}
          onCreate={(draft: DecisionDraft) => perform(() => createDecision(projectId, session.idToken, draft))}
          onSave={(decisionId: string, draft: DecisionDraft) => perform(() => updateDecision(projectId, session.idToken, decisionId, draft))}
          onComment={(decisionId: string, body: string) => perform(() => commentDecision(projectId, session.idToken, decisionId, body))}
          onArchive={(decisionId: string, reason: string) => perform(() => archiveDecision(projectId, session.idToken, decisionId, reason))}
          onDuplicate={(decisionId: string, duplicateOfId: string) =>
            perform(() => duplicateDecision(projectId, session.idToken, decisionId, duplicateOfId))
          }
        />
      )}
      {session && (
        <PlanIssueEditDrawer
          plan={plan}
          session={session}
          issueId={editingIssueId}
          canWrite={canWrite}
          canArchive={canArchive}
          onClose={() => setEditingIssueId(null)}
        />
      )}
    </div>
  );
}

/**
 * Work item name from the project plan. The pencil on the left opens that item's edit drawer.
 * The name itself still opens the decision row.
 */
function WorkItemCell({
  issue,
  issueId,
  canWrite,
  onEdit,
}: {
  issue: DrawerIssue | undefined;
  issueId: string | null;
  canWrite: boolean;
  onEdit: (issueId: string) => void;
}) {
  if (!issueId || !issue?.title) return "—";
  return (
    <span className="decision-work-item">
      {canWrite && (
        <span className="decision-work-item-edit" onClick={(event) => event.stopPropagation()}>
          <EditRowButton label={`Edit ${issue.title}`} onClick={() => onEdit(issueId)} />
        </span>
      )}
      <span>{issue.title}</span>
    </span>
  );
}

/**
 * Overdue items come first. Dated items follow by target date, earliest first.
 * An item with no target date sorts after dated items.
 */
function compareAssigned(left: DecisionRecord, right: DecisionRecord, today: string): number {
  const leftOverdue = decisionIsOverdue(left, today);
  const rightOverdue = decisionIsOverdue(right, today);
  if (leftOverdue !== rightOverdue) return leftOverdue ? -1 : 1;
  if (left.targetDate === right.targetDate) return left.statement.localeCompare(right.statement);
  if (!left.targetDate) return 1;
  if (!right.targetDate) return -1;
  return left.targetDate.localeCompare(right.targetDate);
}

function issuesFromPlan(plan: PlanLookup | null): DrawerIssue[] {
  if (!plan) return [];
  const projectKey = plan.projectKey ?? null;
  const issues = Array.isArray(plan.issues) ? plan.issues : [];
  return issues
    .filter((issue) => !issue.deletedAt)
    .map((issue) => ({
      issueId: issue.issueId,
      title: issue.title,
      issueType: issue.issueType ?? null,
      keyLabel: actionKey(projectKey, issue.keyNumber),
    }));
}

/** Plan members first, then assignable users that are not already listed. */
function membersFromPlan(plan: PlanLookup | null): DrawerMember[] {
  if (!plan) return [];
  const byId = new Map<string, DrawerMember>();
  const members = Array.isArray(plan.members) ? plan.members : [];
  const users = Array.isArray(plan.settings?.assignableUsers) ? plan.settings.assignableUsers : [];
  for (const member of members) {
    byId.set(member.id, { id: member.id, name: displayPerson(member.name, member.login, member.id) });
  }
  for (const user of users) {
    if (!byId.has(user.id)) byId.set(user.id, { id: user.id, name: displayPerson(user.name, user.login, user.id) });
  }
  return [...byId.values()];
}

function assigneeChoices(members: DrawerMember[], records: DecisionRecord[]): DrawerMember[] {
  const byId = new Map(members.map((member) => [member.id, member]));
  for (const record of records) {
    for (const id of record.assigneeIds) {
      if (!byId.has(id)) byId.set(id, { id, name: id });
    }
  }
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name));
}

function displayPerson(name: string | null | undefined, login: string | undefined, id: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (login) return login;
  return id;
}

function actionKey(projectKey: string | null, keyNumber: number | null | undefined): string | null {
  if (!projectKey || keyNumber == null || !Number.isInteger(keyNumber) || keyNumber < 1) return null;
  return `${projectKey}-${keyNumber}`;
}

function assigneeLabel(ids: string[], members: DrawerMember[]): string {
  if (ids.length === 0) return "—";
  return ids.map((id) => members.find((member) => member.id === id)?.name ?? id).join(", ");
}

function affectLabel(affects: DecisionRecord["affects"]): string {
  if (affects.length === 0) return "—";
  return affects.map((affect) => affect.charAt(0).toUpperCase() + affect.slice(1)).join(", ");
}

function statusLabel(status: DecisionStatus): string {
  if (status === "outstanding") return "Outstanding";
  if (status === "resolved") return "Resolved";
  if (status === "duplicate") return "Duplicate";
  return "Archive";
}

function statusTone(status: DecisionStatus): "" | "good" | "orange" | "blue" {
  if (status === "resolved") return "good";
  if (status === "outstanding") return "orange";
  if (status === "duplicate") return "blue";
  return "";
}

/** Cognito subject, the same id audit uses for the signed-in person. */
function signedInUserId(idToken: string): string {
  try {
    const payload = idToken.split(".")[1] ?? "";
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const body = JSON.parse(json) as { sub?: unknown };
    return typeof body.sub === "string" ? body.sub : "";
  } catch {
    return "";
  }
}

function message(caught: unknown): string {
  return caught instanceof ApiError || caught instanceof Error ? caught.message : "Request failed.";
}
