/** Records stored for the first One80Compass slice. Later releases add documents, baselines, and reports. */

export type Customer = {
  customerId: string;
  name: string;
  createdAt: string;
};

export type Membership = {
  customerId: string;
  userId: string;
  email: string;
  role: "employee";
  createdAt: string;
};

export type Project = {
  projectId: string;
  customerId: string;
  name: string;
  createdAt: string;
};

export const MODULE_KEYS = ["overview"] as const;
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
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
  at: string;
  correlationId: string;
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}
