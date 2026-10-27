import { useState, type FormEvent } from "react";
import { catalogColorHex } from "../../../packages/domain/src/index";
import { datesAfterIterationPick, iterationFinish, iterationOptionLabel } from "../../../packages/domain/src/schedule";
import type { IssueRelationship, IssueSave } from "./api";
import { EditDrawer } from "./ui";

type Named = { id: string; name: string; color?: string | null };
type Person = { id: string; login: string; name: string | null };
type IterationChoice = { id: string; title: string; startDate: string; duration: number };

export type CompassIssue = {
  issueId: string;
  title: string;
  description?: string | null;
  status: string;
  effort: number | null;
  number: number | null;
  parentIssueId: string | null;
  issueType: string | null;
  startDate: string | null;
  finishDate: string | null;
  iterationTitle?: string | null;
  iterationStart?: string | null;
  iterationDuration?: number | null;
  iterationId?: string | null;
  assignees?: Person[];
  comments?: string | null;
  predecessorIds: string[];
  milestone?: string | null;
  milestoneId?: string | null;
  priority?: string | null;
  labels?: string[];
  relationships?: IssueRelationship[];
  inProject?: boolean;
  archived?: boolean;
  deletedAt?: string | null;
};

export type CompassCatalogs = {
  statusOptions: Named[];
  labels: Named[];
  issueTypes: Named[];
  priorityOptions: Named[];
  milestones: { id: string; title: string; dueOn: string | null }[];
};

/** Editor for a project stored in Compass. Dropdowns use the project catalogs. Save stays in the portal. */
export function CompassIssueDrawer({
  issue,
  issues,
  catalogs,
  members,
  columns,
  iterations,
  users,
  datesDerived,
  summary,
  derivedStart,
  derivedFinish,
  onClose,
  onSave,
}: {
  issue: CompassIssue;
  issues: CompassIssue[];
  catalogs: CompassCatalogs;
  members: Person[];
  columns: string[];
  iterations: IterationChoice[];
  users: Person[];
  datesDerived: boolean;
  summary: boolean;
  derivedStart: string | null;
  derivedFinish: string | null;
  onClose: () => void;
  onSave: (issueId: string, change: IssueSave & { title: string; status: string; effort: number | null }) => Promise<void>;
}) {
  const [title, setTitle] = useState(issue.title);
  const [description, setDescription] = useState(issue.description ?? "");
  const [status, setStatus] = useState(issue.status);
  const [issueType, setIssueType] = useState(issue.issueType ?? "");
  const [parentIssueId, setParentIssueId] = useState(issue.parentIssueId ?? "");
  const [effort, setEffort] = useState(issue.effort == null ? "" : String(issue.effort));
  const [iterationId, setIterationId] = useState(issue.iterationId ?? "");
  const [pickedIteration, setPickedIteration] = useState(false);
  const [startDate, setStartDate] = useState(issue.startDate ?? "");
  const [finishDate, setFinishDate] = useState(issue.finishDate ?? "");
  const [milestoneId, setMilestoneId] = useState(issue.milestoneId ?? catalogs.milestones.find((item) => item.title === issue.milestone)?.id ?? "");
  const [priority, setPriority] = useState(issue.priority ?? "");
  const [labels, setLabels] = useState(issue.labels ?? []);
  const [assigneeIds, setAssigneeIds] = useState((issue.assignees ?? []).map((person) => person.id));
  const [comment, setComment] = useState("");
  const [predecessorIds, setPredecessorIds] = useState(issue.predecessorIds ?? []);
  const [relationships, setRelationships] = useState<IssueRelationship[]>(issue.relationships ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const statusNames = catalogs.statusOptions.map((option) => option.name);
  const statusChoices = withCurrent(statusNames.length > 0 ? statusNames : columns, status);
  const iterationChoices = iterationOptions(iterations, issue);
  const people = assigneeOptions(members.length > 0 ? members : users, issue.assignees ?? []);
  const parents = parentChoices(issue.issueId, issues);
  const linkIssues = otherIssues(issue.issueId, issues, [...predecessorIds, ...relationships.map((row) => row.otherIssueId), parentIssueId]);
  const milestoneDue = catalogs.milestones.find((item) => item.id === milestoneId)?.dueOn ?? null;

  function chooseIteration(nextId: string) {
    setIterationId(nextId);
    if (!nextId || datesDerived) return;
    const next = iterationChoices.find((item) => item.id === nextId);
    const end = next ? iterationFinish(next.startDate, next.duration) : null;
    if (!next || !end) return;
    const dates = datesAfterIterationPick({
      hadIteration: Boolean(issue.iterationId),
      pickedBefore: pickedIteration,
      startDate,
      iterationStart: next.startDate,
      iterationEnd: end,
    });
    setStartDate(dates.startDate);
    setFinishDate(dates.finishDate);
    setPickedIteration(true);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = effort.trim() === "" ? null : Number(effort);
    if (parsed != null && (!Number.isFinite(parsed) || parsed < 0)) {
      setError("Effort must be a number that is zero or more.");
      return;
    }
    if (!datesDerived && startDate && finishDate && finishDate < startDate) {
      setError("The finish date cannot be before the start date.");
      return;
    }
    const chosenPredecessors = predecessorIds.filter(Boolean);
    if (new Set(chosenPredecessors).size !== chosenPredecessors.length) {
      setError("That dependency is already listed.");
      return;
    }
    const filled = relationships.filter((row) => row.kind.trim() || row.otherIssueId);
    if (filled.some((row) => !row.kind.trim() || !row.otherIssueId)) {
      setError("Each relationship needs a kind and an issue.");
      return;
    }
    const nextRelationships = filled.map((row) => ({ id: row.id, kind: row.kind.trim(), otherIssueId: row.otherIssueId }));
    const milestone = catalogs.milestones.find((item) => item.id === milestoneId);
    setSaving(true);
    setError(null);
    try {
      await onSave(issue.issueId, {
        title,
        description: description.trim() ? description : null,
        status,
        effort: parsed,
        ...(!datesDerived && startDate !== (issue.startDate ?? "") ? { startDate: startDate || null } : {}),
        ...(!datesDerived && finishDate !== (issue.finishDate ?? "") ? { finishDate: finishDate || null } : {}),
        ...(iterationId !== (issue.iterationId ?? "") ? { iterationId: iterationId || null } : {}),
        ...(comment.trim() ? { comment: comment.trim() } : {}),
        ...(issueType !== (issue.issueType ?? "") ? { issueType: issueType || null } : {}),
        ...(parentIssueId !== (issue.parentIssueId ?? "") ? { parentIssueId: parentIssueId || null } : {}),
        ...(milestoneId !== (issue.milestoneId ?? "") ? { milestone: milestone?.title ?? null } : {}),
        ...(priority !== (issue.priority ?? "") ? { priority: priority || null } : {}),
        ...(!sameSet(labels, issue.labels ?? []) ? { labels } : {}),
        ...(!sameSet(assigneeIds, (issue.assignees ?? []).map((person) => person.id)) ? { assigneeIds } : {}),
        ...(!sameSet(chosenPredecessors, issue.predecessorIds ?? []) ? { predecessorIds: chosenPredecessors } : {}),
        ...(!sameRelationships(nextRelationships, issue.relationships ?? []) ? { relationships: nextRelationships } : {}),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditDrawer title={title.trim() || issue.title || "Edit issue"} onClose={onClose} onSubmit={onSubmit} saving={saving}>
      <p>
        Saved in Compass for this project. GitHub is not updated.
        {datesDerived
          ? " Start and Finish come from the tasks and subtasks under this item."
          : summary
            ? " Choosing an iteration fills Start and Finish. You can still change the dates."
            : " Choosing an iteration fills Start and Finish from that iteration. You can still change the dates."}{" "}
        A comment is stored with your name and the date.
      </p>
      <label>
        Title
        <input className="field" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} />
      </label>
      <label>
        Description
        <textarea className="field" value={description} rows={6} maxLength={65000} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label>
        Status
        <select className="field" value={status} onChange={(event) => setStatus(event.target.value)} required>
          {!status && <option value="">No status</option>}
          {statusChoices.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <label>
        Issue type
        {catalogs.issueTypes.length > 0 ? (
          <select className="field" value={issueType} onChange={(event) => setIssueType(event.target.value)}>
            <option value="">No type</option>
            {withCurrent(catalogs.issueTypes.map((item) => item.name), issueType).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : (
          <input className="field" value={issueType} onChange={(event) => setIssueType(event.target.value)} maxLength={80} placeholder="No type" />
        )}
      </label>
      <label>
        Parent
        <select className="field" value={parentIssueId} onChange={(event) => setParentIssueId(event.target.value)}>
          <option value="">No parent</option>
          {parents.map((item) => (
            <option key={item.issueId} value={item.issueId}>
              {item.number ? `#${item.number} ${item.title}` : item.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Estimate
        <input className="field" value={effort} onChange={(event) => setEffort(event.target.value)} inputMode="decimal" placeholder="Unestimated" />
      </label>
      {datesDerived ? (
        <p>{derivedStart && derivedFinish ? `Start ${derivedStart}. Finish ${derivedFinish}.` : "No task under this item has both a start and a finish yet."}</p>
      ) : (
        <>
          <label>
            Start
            <input className="field" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            Finish
            <input className="field" type="date" value={finishDate} onChange={(event) => setFinishDate(event.target.value)} />
          </label>
        </>
      )}
      <label>
        Iteration
        <select className="field" value={iterationId} onChange={(event) => chooseIteration(event.target.value)}>
          <option value="">No iteration</option>
          {iterationChoices.map((item) => (
            <option key={item.id} value={item.id}>
              {iterationOptionLabel(item)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Milestone
        {catalogs.milestones.length > 0 ? (
          <select className="field" value={milestoneId} onChange={(event) => setMilestoneId(event.target.value)}>
            <option value="">No milestone</option>
            {catalogs.milestones.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        ) : (
          <input className="field" value={milestoneId} onChange={(event) => setMilestoneId(event.target.value)} maxLength={120} placeholder="No milestone" />
        )}
        {milestoneDue && <span className="muted small">Due {milestoneDue}.</span>}
      </label>
      <label>
        Priority
        {catalogs.priorityOptions.length > 0 ? (
          <select className="field" value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value="">No priority</option>
            {catalogs.priorityOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        ) : (
          <input className="field" value={priority} onChange={(event) => setPriority(event.target.value)} maxLength={80} placeholder="No priority" />
        )}
      </label>
      <fieldset className="label-tags">
        <legend>Labels</legend>
        {catalogs.labels.length === 0 && <span className="muted small">No labels yet. An administrator can add them in Settings.</span>}
        {catalogs.labels.map((label) => {
          const selected = labels.includes(label.id);
          const border = catalogColorHex(label.color);
          return (
            <button
              key={label.id}
              className={selected ? "label-tag selected" : "label-tag"}
              type="button"
              aria-pressed={selected}
              style={border ? { borderColor: border } : undefined}
              onClick={() => setLabels(toggleValue(labels, label.id, !selected))}
            >
              {label.name}
            </button>
          );
        })}
      </fieldset>
      <fieldset className="choice-list">
        <legend>Assignees</legend>
        {people.length === 0 && <span className="muted small">No customer members are available for this project.</span>}
        {people.map((person) => (
          <label key={person.id}>
            <input type="checkbox" checked={assigneeIds.includes(person.id)} onChange={(event) => setAssigneeIds(toggleValue(assigneeIds, person.id, event.target.checked))} />
            {person.name ? `${person.name} (${person.login})` : person.login}
          </label>
        ))}
      </fieldset>
      <div>
        <p>Dependencies</p>
        {predecessorIds.map((predecessorId, index) => (
          <div className="link-row pair" key={`${predecessorId}:${index}`}>
            <label>
              Predecessor
              <select className="field" value={predecessorId} onChange={(event) => setPredecessorIds(predecessorIds.map((id, item) => (item === index ? event.target.value : id)))}>
                <option value="">Choose an issue</option>
                {linkIssues.map((item) => (
                  <option key={item.issueId} value={item.issueId}>
                    {item.number ? `#${item.number} ${item.title}` : item.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn small" type="button" onClick={() => setPredecessorIds(predecessorIds.filter((_, item) => item !== index))}>
              Remove
            </button>
          </div>
        ))}
        <button className="btn small" type="button" onClick={() => setPredecessorIds([...predecessorIds, ""])}>
          Add dependency
        </button>
      </div>
      <div>
        <p>Other relationships</p>
        {relationships.map((row, index) => (
          <div className="link-row" key={row.id}>
            <label>
              Kind
              <input className="field" value={row.kind} maxLength={80} onChange={(event) => setRelationships(relationships.map((item, itemIndex) => (itemIndex === index ? { ...item, kind: event.target.value } : item)))} />
            </label>
            <label>
              Issue
              <select className="field" value={row.otherIssueId} onChange={(event) => setRelationships(relationships.map((item, itemIndex) => (itemIndex === index ? { ...item, otherIssueId: event.target.value } : item)))}>
                <option value="">Choose an issue</option>
                {linkIssues.map((item) => (
                  <option key={item.issueId} value={item.issueId}>
                    {item.number ? `#${item.number} ${item.title}` : item.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn small" type="button" onClick={() => setRelationships(relationships.filter((item) => item.id !== row.id))}>
              Remove
            </button>
          </div>
        ))}
        <button className="btn small" type="button" onClick={() => setRelationships([...relationships, { id: crypto.randomUUID(), kind: "", otherIssueId: "" }])}>
          Add relationship
        </button>
      </div>
      <label>
        Comments
        {issue.comments ? <span className="comment-log">{issue.comments}</span> : <span className="muted small">No comments yet.</span>}
        <textarea className="field" value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} placeholder="Add a comment" />
      </label>
      {error && <p className="error">{error}</p>}
    </EditDrawer>
  );
}

function withCurrent(options: string[], current: string): string[] {
  if (!current || options.includes(current)) return options;
  return [current, ...options];
}

function parentChoices(issueId: string, issues: CompassIssue[]): CompassIssue[] {
  const blocked = new Set<string>([issueId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of issues) {
      if (item.parentIssueId && blocked.has(item.parentIssueId) && !blocked.has(item.issueId)) {
        blocked.add(item.issueId);
        grew = true;
      }
    }
  }
  return issues.filter((item) => !blocked.has(item.issueId) && item.inProject !== false && !item.archived && !item.deletedAt);
}

function otherIssues(issueId: string, issues: CompassIssue[], extraIds: string[]): CompassIssue[] {
  const active = issues.filter((item) => item.issueId !== issueId && item.inProject !== false && !item.archived && !item.deletedAt);
  const seen = new Set(active.map((item) => item.issueId));
  const extras = extraIds.flatMap((id) => {
    if (!id || id === issueId || seen.has(id)) return [];
    seen.add(id);
    const found = issues.find((item) => item.issueId === id);
    return [found ?? { issueId: id, title: id, status: "", effort: null, number: null, parentIssueId: null, issueType: null, startDate: null, finishDate: null, predecessorIds: [] }];
  });
  return [...extras, ...active];
}

function toggleValue(values: string[], value: string, on: boolean): string[] {
  if (on) return values.includes(value) ? values : [...values, value];
  return values.filter((item) => item !== value);
}

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const values = new Set(right);
  return left.every((item) => values.has(item));
}

function sameRelationships(left: IssueRelationship[], right: IssueRelationship[]): boolean {
  return left.length === right.length && left.every((row, index) => row.id === right[index]?.id && row.kind === right[index]?.kind && row.otherIssueId === right[index]?.otherIssueId);
}

function iterationOptions(iterations: IterationChoice[], issue: CompassIssue): IterationChoice[] {
  if (!issue.iterationId || iterations.some((item) => item.id === issue.iterationId)) return iterations;
  if (!issue.iterationTitle || !issue.iterationStart || !issue.iterationDuration) return iterations;
  return [{ id: issue.iterationId, title: issue.iterationTitle, startDate: issue.iterationStart, duration: issue.iterationDuration }, ...iterations];
}

function assigneeOptions(users: Person[], current: Person[]): Person[] {
  return [...current.filter((person) => !users.some((item) => item.id === person.id)), ...users];
}
