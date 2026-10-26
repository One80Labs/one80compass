/** Portal records for the dev portal. */

/** Largest file accepted for an R1 upload. Comparison and quotas are later. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export type Customer = {
  customerId: string;
  name: string;
  createdAt: string;
};

export type Membership = {
  customerId: string;
  userId: string;
  email: string;
  /** Shown in the members list. Empty until an administrator sets one. */
  name: string;
  role: "employee";
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
  statusOptions: { id: string; name: string }[];
  doneStatuses: string[];
  columns: string[];
};

export type PlanIssue = {
  issueId: string;
  itemId: string | null;
  projectId: string;
  customerId: string;
  number: number | null;
  title: string;
  status: string;
  effort: number | null;
  issueState: "open" | "closed";
  archived: boolean;
  deletedAt: string | null;
  parentIssueId: string | null;
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
  /** GitHub issues that block this one. The task starts the day after the latest of those finishes. */
  predecessorIds: string[];
  inProject: boolean;
  updatedAt: string;
};

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
  | {
      type: "update-issue";
      projectId: string;
      issueId: string;
      idempotencyKey: string;
      title?: string;
      status?: string;
      effort?: number | null;
      startDate?: string | null;
      finishDate?: string | null;
    }
  | {
      type: "update-schedule";
      projectId: string;
      idempotencyKey: string;
      changes: {
        issueId: string;
        title?: string;
        status?: string;
        effort?: number | null;
        startDate?: string | null;
        finishDate?: string | null;
      }[];
    }
  | { type: "set-dependency"; projectId: string; issueId: string; predecessorId: string; action: "add" | "remove"; idempotencyKey: string }
  | { type: "ensure-date-fields"; projectId: string };
