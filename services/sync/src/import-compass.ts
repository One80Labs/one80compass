import type { CatalogLabel, CatalogMilestone, IssueRelationship, PlanIssue, ProjectSettings } from "../../../packages/domain/src/index";

/**
 * Copies a stored GitHub projection into Compass-owned settings and issues.
 * The caller passes the records already saved for the project. This function does not call GitHub.
 */
export function importCompass(settings: ProjectSettings, issues: PlanIssue[]): { settings: ProjectSettings; issues: PlanIssue[] } {
  const nextIssues = issues.map((issue) => importIssue(issue));
  return { settings: importSettings(settings, nextIssues), issues: nextIssues };
}

function importIssue(issue: PlanIssue): PlanIssue {
  return {
    ...issue,
    assignees: issue.assignees.map((user) => ({ ...user })),
    predecessorIds: [...issue.predecessorIds],
    priority: copyText(issue.priority),
    labels: copyList(issue.labels),
    relationships: relationshipsFor(issue),
  };
}

function importSettings(settings: ProjectSettings, issues: PlanIssue[]): ProjectSettings {
  return {
    ...settings,
    statusOptions: settings.statusOptions.map((option) => ({ id: option.id, name: option.name })),
    columns: [...settings.columns],
    doneStatuses: [...settings.doneStatuses],
    iterations: settings.iterations.map((iteration) => ({ ...iteration })),
    issueTypes: coloredCatalog(settings.issueTypes, issues.map((issue) => issue.issueType)),
    milestones: milestoneCatalog(settings.milestones, issues),
    priorityOptions: namedCatalog(settings.priorityOptions, issues.map((issue) => issue.priority)),
    labels: labelCatalog(settings.labels, issues),
    recordSource: "compass",
  };
}

function relationshipsFor(issue: PlanIssue): IssueRelationship[] {
  const links = issue.relationships.map((link) => ({ ...link }));
  const seen = new Set(links.filter((link) => link.kind === "blocks").map((link) => link.otherIssueId));
  for (const raw of issue.predecessorIds) {
    const otherIssueId = raw.trim();
    if (!otherIssueId || otherIssueId === issue.issueId || seen.has(otherIssueId)) continue;
    seen.add(otherIssueId);
    links.push({ id: `blocks:${issue.issueId}:${otherIssueId}`, kind: "blocks", otherIssueId });
  }
  return links;
}

function milestoneCatalog(existing: CatalogMilestone[], issues: PlanIssue[]): CatalogMilestone[] {
  const order: string[] = [];
  const rows = new Map<string, CatalogMilestone>();
  for (const issue of issues) {
    const title = issue.milestone?.trim() ?? "";
    if (!title) continue;
    const stored = existing.find((row) => row.title === title || (issue.milestoneId != null && row.id === issue.milestoneId));
    const current = rows.get(title);
    const dueOn = issue.milestoneDueOn ?? current?.dueOn ?? stored?.dueOn ?? null;
    if (!current) {
      order.push(title);
      rows.set(title, { id: stored?.id ?? (issue.milestoneId?.trim() || title), title, dueOn });
      continue;
    }
    if (current.dueOn == null && dueOn) rows.set(title, { ...current, dueOn });
  }
  return order.map((title) => rows.get(title)!);
}

function labelCatalog(existing: CatalogLabel[], issues: PlanIssue[]): CatalogLabel[] {
  return coloredCatalog(existing, issues.flatMap((issue) => issue.labels));
}

function coloredCatalog(existing: { id: string; name: string; color: string | null }[], values: Array<string | null | undefined>): { id: string; name: string; color: string | null }[] {
  const rows: { id: string; name: string; color: string | null }[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const name = value?.trim() ?? "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const stored = existing.find((row) => row.id === name || row.name === name);
    rows.push(stored ? { id: stored.id, name: stored.name, color: stored.color } : { id: name, name, color: null });
  }
  return rows;
}

function namedCatalog(existing: { id: string; name: string }[], values: Array<string | null | undefined>): { id: string; name: string }[] {
  const rows: { id: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const name = value?.trim() ?? "";
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const stored = existing.find((row) => row.id === name || row.name === name);
    rows.push(stored ? { id: stored.id, name: stored.name } : { id: name, name });
  }
  return rows;
}

function copyText(value: string | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function copyList(values: string[]): string[] {
  return values.flatMap((value) => {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  });
}
