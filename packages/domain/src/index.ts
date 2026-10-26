/** Portal records for the dev portal. */

/** Largest file accepted for an R1 upload. Comparison and quotas are later. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export type Customer = {
  customerId: string;
  name: string;
  createdAt: string;
};

/** Contributor can edit, add, and upload. View can open the same screens and cannot change data. */
export type MemberRole = "contributor" | "view";

/** Rows saved before this role used the name employee. Those people remain Contributors. */
export function memberRole(value: unknown): MemberRole {
  return value === "view" ? "view" : "contributor";
}

export type Membership = {
  customerId: string;
  userId: string;
  email: string;
  /** Shown in the members list. Empty until an administrator sets one. */
  name: string;
  role: MemberRole;
  createdAt: string;
  /** Null means every current and future project for the customer. */
  projectIds: string[] | null;
};

export type Project = {
  projectId: string;
  customerId: string;
  name: string;
  createdAt: string;
};

export const MODULE_KEYS = ["overview", "documents", "plan", "kanban", "reports"] as const;
export type ModuleKey = (typeof MODULE_KEYS)[number];

export type ApplicationLink = {
  applicationId: string;
  projectId: string;
  customerId: string;
  moduleKey: ModuleKey;
  displayName: string;
  createdAt: string;
};

export type AuditEvent = {
  eventId: string;
  customerId: string;
  projectId: string | null;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  at: string;
  correlationId: string;
};

export const HEALTH_VALUES = ["green", "yellow", "red"] as const;
export type ProjectHealth = (typeof HEALTH_VALUES)[number];

export type ProjectOverview = {
  projectId: string;
  customerId: string;
  health: ProjectHealth | null;
  healthExplanation: string | null;
  notes: string;
  updatedAt: string | null;
};

/** A project folder. `path` is the full name, such as `Specs` or `Specs/Drafts`. `parent` is empty at the top level. */
export type DocumentFolder = {
  projectId: string;
  customerId: string;
  path: string;
  name: string;
  parent: string;
  createdAt: string;
};

export type PortalDocument = {
  documentId: string;
  projectId: string;
  customerId: string;
  name: string;
  folder: string;
  currentVersionId: string | null;
  deletedAt: string | null;
  createdAt: string;
};

export type DocumentVersion = {
  versionId: string;
  documentId: string;
  projectId: string;
  customerId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  objectKey: string;
  status: "pending" | "stored";
  createdAt: string;
  createdBy: string;
};

export function isProjectHealth(value: string): value is ProjectHealth {
  return (HEALTH_VALUES as readonly string[]).includes(value);
}

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

export const DEFAULT_COLUMNS = ["Todo", "In Progress", "Done"] as const;
export const DEFAULT_DONE_STATUSES = ["Done"] as const;

/** Where the plan record was written. Existing GitHub sync rows stay `github`. */
export type RecordSource = "github" | "compass";
/**
 * Colors an administrator can assign to a label or an issue type.
 * The ids are stored. The hex values follow the One80Compass palette.
 */
export const CATALOG_COLORS = [
  { id: "terracotta", name: "Terracotta", hex: "#D97757" },
  { id: "clay", name: "Clay", hex: "#C9683E" },
  { id: "copper", name: "Copper", hex: "#B05D17" },
  { id: "orange", name: "Orange", hex: "#F58220" },
  { id: "gold", name: "Gold", hex: "#C4A35A" },
  { id: "olive", name: "Olive", hex: "#5E8C3A" },
  { id: "forest", name: "Forest", hex: "#3E6B45" },
  { id: "blue", name: "Blue", hex: "#3C7FBE" },
  { id: "slate", name: "Slate", hex: "#6B6A64" },
  { id: "ink", name: "Ink", hex: "#3D3D3A" },
] as const;

/** A stored color id, or null when the row has no color. Unknown ids are dropped. */
export function catalogColorFromStore(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return CATALOG_COLORS.some((color) => color.id === id) ? id : null;
}

/** Hex for a stored color id. Null when the id is missing or not one of the ten theme colors. */
export function catalogColorHex(value: string | null | undefined): string | null {
  if (!value) return null;
  return CATALOG_COLORS.find((color) => color.id === value)?.hex ?? null;
}

/** A label in the project catalog. `color` is a `CATALOG_COLORS` id, or null. */
export type CatalogLabel = { id: string; name: string; color: string | null };
/** An issue type in the project catalog. `color` is a `CATALOG_COLORS` id, or null. */
export type CatalogIssueType = { id: string; name: string; color: string | null };
/** A priority choice in the project catalog. */
export type PriorityOption = { id: string; name: string };
/** A milestone in the project catalog. `dueOn` is YYYY-MM-DD, or null when there is no due date. */
export type CatalogMilestone = { id: string; title: string; dueOn: string | null };
/** A link from this issue to another. `kind` is the relationship name. */
export type IssueRelationship = { id: string; kind: string; otherIssueId: string };

export type ProjectSettings = {
  projectId: string;
  customerId: string;
  owner: string;
  repo: string;
  projectNumber: number;
  projectNodeId: string | null;
  statusFieldName: string;
  effortFieldName: string;
  statusFieldId: string | null;
  effortFieldId: string | null;
  startFieldName: string;
  finishFieldName: string;
  /** Null until the project has a date field with that name. */
  startFieldId: string | null;
  finishFieldId: string | null;
  /** GitHub Project Iteration field. Null until sync finds one. */
  iterationFieldId: string | null;
  /** Iterations configured on that field, including completed ones. */
  iterations: IterationChoice[];
  /** GitHub Project text field named Comments. Null until the field exists. */
  commentsFieldId: string | null;
  /** People who can be assigned to issues in the mapped repository. */
  assignableUsers: GitHubUser[];
  statusOptions: { id: string; name: string }[];
  doneStatuses: string[];
  columns: string[];
  /** GitHub issue number of the Workstream. Null until an administrator saves one. The Workstream is not a plan row. */
  workstreamNumber: number | null;
  /** `github` for a project filled by GitHub sync. `compass` when Compass owns the catalog. */
  recordSource: RecordSource;
  /** Labels available on this project. Empty until a catalog is stored. */
  labels: CatalogLabel[];
  /** Issue types available on this project. Empty until a catalog is stored. */
  issueTypes: CatalogIssueType[];
  /** Priority choices. Empty until a catalog is stored. */
  priorityOptions: PriorityOption[];
  /** Milestones available on this project. Empty until a catalog is stored. */
  milestones: CatalogMilestone[];
};

export type GitHubUser = { id: string; login: string; name: string | null };

export type IterationChoice = { id: string; title: string; startDate: string; duration: number };

/** Catalog lists replaced together by `PUT /projects/{projectId}/catalogs`. */
export type ProjectCatalogs = Pick<
  ProjectSettings,
  "statusOptions" | "doneStatuses" | "columns" | "iterations" | "labels" | "issueTypes" | "priorityOptions" | "milestones"
>;

/** Fields the portal can write back to a GitHub issue. `comments` is the full Comments field, already attributed. */
export type IssueChange = {
  title?: string;
  description?: string | null;
  status?: string;
  effort?: number | null;
  startDate?: string | null;
  finishDate?: string | null;
  iterationId?: string | null;
  assigneeId?: string | null;
  comments?: string;
  /** Priority option id. Omitted when this edit does not change priority. GitHub sync does not write it. */
  priority?: string | null;
  /** Label ids. Omitted when this edit does not change labels. GitHub sync does not write them. */
  labels?: string[];
};

export type PlanIssue = {
  issueId: string;
  itemId: string | null;
  projectId: string;
  customerId: string;
  number: number | null;
  title: string;
  /** GitHub issue description. Null when the issue body is empty. */
  description: string | null;
  status: string;
  effort: number | null;
  issueState: "open" | "closed";
  archived: boolean;
  deletedAt: string | null;
  parentIssueId: string | null;
  /** GitHub issue type name. A new Epic is EPIC, a new Feature is Feature, and a new Task is Task. Null on a Sub-issue. */
  issueType: string | null;
  /** GitHub milestone title. Null when the issue has no milestone. */
  milestone: string | null;
  /** GitHub milestone node id. Null when the sync only knew the title. */
  milestoneId: string | null;
  /** GitHub milestone due date, YYYY-MM-DD. Null when GitHub has no due date. */
  milestoneDueOn: string | null;
  /** GitHub Project Start field, YYYY-MM-DD. Null when the task is not scheduled. */
  startDate: string | null;
  /** GitHub Project Finish field, YYYY-MM-DD. Null when the task is not scheduled. */
  finishDate: string | null;
  /** GitHub Project Iteration title. Null when the task is not in an iteration. */
  iterationTitle: string | null;
  /** First day of that iteration. */
  iterationStart: string | null;
  /** Length of that iteration in days, including the first day. */
  iterationDuration: number | null;
  /** GitHub iteration id. Null when the task is not in an iteration. */
  iterationId: string | null;
  /** GitHub issue assignees. Empty when nobody is assigned. */
  assignees: GitHubUser[];
  /** GitHub Project Comments field. Each line is one One80Compass user, date, and comment. */
  comments: string | null;
  /** GitHub issues that block this one. The task starts the day after the latest of those finishes. */
  predecessorIds: string[];
  /** Priority option id. Null when the issue has no priority. GitHub sync does not clear a stored value. */
  priority: string | null;
  /** Label ids on this issue. Empty when the issue has no labels. GitHub sync does not clear a stored list. */
  labels: string[];
  /** Links to other issues. Empty when none are stored. GitHub sync does not clear a stored list. */
  relationships: IssueRelationship[];
  inProject: boolean;
  updatedAt: string;
};

/**
 * Missing or unknown sources stay `github` so a row saved before this field still syncs as a GitHub project.
 * Only the exact value `compass` selects Compass.
 */
export function recordSourceFromStore(value: unknown): RecordSource {
  return value === "compass" ? "compass" : "github";
}

/** Missing catalogs become an empty list. Rows without an id and a name are dropped. */
export function catalogLabelsFromStore(value: unknown): CatalogLabel[] {
  return coloredCatalog(value);
}

/** Missing catalogs become an empty list. Rows without an id and a name are dropped. */
export function catalogIssueTypesFromStore(value: unknown): CatalogIssueType[] {
  return coloredCatalog(value);
}

/** Missing catalogs become an empty list. Rows without an id and a name are dropped. */
export function priorityOptionsFromStore(value: unknown): PriorityOption[] {
  return namedCatalog(value);
}

/** Missing catalogs become an empty list. A missing or non-date `dueOn` becomes null. */
export function catalogMilestonesFromStore(value: unknown): CatalogMilestone[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as { id?: unknown; title?: unknown; dueOn?: unknown };
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const title = typeof row.title === "string" ? row.title.trim() : "";
    if (!id || !title) return [];
    const dueOn = typeof row.dueOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.dueOn) ? row.dueOn : null;
    return [{ id, title, dueOn }];
  });
}

/** Missing, blank, or non-text priority becomes null. */
export function priorityFromStore(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** Missing label lists become an empty list. Blank entries are dropped. */
export function labelIdsFromStore(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : [])))];
}

/** Missing relationship lists become an empty list. Rows without id, kind, and other issue are dropped. */
export function relationshipsFromStore(value: unknown): IssueRelationship[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as { id?: unknown; kind?: unknown; otherIssueId?: unknown };
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const kind = typeof row.kind === "string" ? row.kind.trim() : "";
    const otherIssueId = typeof row.otherIssueId === "string" ? row.otherIssueId.trim() : "";
    if (!id || !kind || !otherIssueId) return [];
    return [{ id, kind, otherIssueId }];
  });
}

function namedCatalog(value: unknown): { id: string; name: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as { id?: unknown; name?: unknown };
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!id || !name) return [];
    return [{ id, name }];
  });
}

function coloredCatalog(value: unknown): { id: string; name: string; color: string | null }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const row = entry as { id?: unknown; name?: unknown; color?: unknown };
    const id = typeof row.id === "string" ? row.id.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (!id || !name) return [];
    return [{ id, name, color: catalogColorFromStore(row.color) }];
  });
}

export type ProgressOverride = {
  projectId: string;
  customerId: string;
  percent: number;
  explanation: string;
  calculatedPercent: number | null;
  actorUserId: string;
  at: string;
};

export type SyncStatus = "not_configured" | "pending" | "ok" | "failed";

export type SyncState = {
  projectId: string;
  customerId: string;
  status: SyncStatus;
  detail: string | null;
  updatedAt: string;
};

export const REPORT_STATUSES = ["draft", "in_review", "approved", "published"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export type StatusReport = {
  reportId: string;
  projectId: string;
  customerId: string;
  title: string;
  body: string;
  status: ReportStatus;
  updatedAt: string;
  createdAt: string;
};

export type ReportVersion = {
  versionId: string;
  reportId: string;
  projectId: string;
  customerId: string;
  title: string;
  body: string;
  publishedAt: string;
  publishedBy: string;
};

export type SyncMessage =
  | { type: "webhook"; deliveryId: string; eventName: string; payload: unknown }
  | { type: "reconcile"; projectId?: string }
  | ({
      type: "update-issue";
      projectId: string;
      issueId: string;
      idempotencyKey: string;
    } & IssueChange)
  | {
      type: "update-schedule";
      projectId: string;
      idempotencyKey: string;
      changes: ({ issueId: string } & IssueChange)[];
    }
  | { type: "set-dependency"; projectId: string; issueId: string; predecessorId: string; action: "add" | "remove"; idempotencyKey: string }
  | { type: "ensure-date-fields"; projectId: string }
  | ({
      type: "create-plan-item";
      projectId: string;
      idempotencyKey: string;
      kind: "epic" | "feature" | "issue" | "subissue";
      title: string;
      /** Parent issue node id. Null when the parent is the Workstream issue number. */
      parentIssueId: string | null;
      workstreamNumber: number | null;
    } & IssueChange);
