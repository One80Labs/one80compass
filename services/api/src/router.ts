import { adminAccess, canAccessCustomer, canAccessProject, canWriteProject, principalFromClaims, type Principal } from "../../../packages/authz/src/index";
import {
  documentSourceLabelFromStore,
  isModuleKey,
  isProjectHealth,
  memberRole,
  MAX_UPLOAD_BYTES,
  normalizeProjectKey,
  type AuditEvent,
  type DocumentFolder,
  type DocumentSourceLabel,
  type DocumentVersion,
  type MemberRole,
  type Membership,
  type PortalDocument,
  type Project,
  type ProjectOverview,
  type SyncMessage,
} from "../../../packages/domain/src/index";
import { milestoneViews } from "../../../packages/domain/src/milestones";
import { projectProgress } from "../../../packages/domain/src/progress";
import { handlePlan } from "./plan";
import { handleCatalogs } from "./catalogs";
import { handleReports } from "./reports";
import { handleVaultDraft } from "./vault-draft";
import { handleVaultIngest, type VaultIngestDeps } from "./vault-ingest";
import type { Store } from "./store";
import type { VaultChunk } from "../../vault/src/types";
import { acceptWebhook } from "./webhook";

export type HttpEvent = {
  requestContext: {
    http: { method: string };
    authorizer?: { jwt?: { claims?: Record<string, string> } };
    requestId?: string;
  };
  rawPath: string;
  headers?: Record<string, string | undefined>;
  queryStringParameters?: Record<string, string | undefined>;
  isBase64Encoded?: boolean;
  body?: string | null;
};

export type HttpResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export type HandlerDeps = {
  store: Store;
  inviteUser: (email: string) => Promise<{ userId: string }>;
  /** Stops sign-in for an address that no longer has a membership. */
  disableLogin: (email: string) => Promise<void>;
  newId: () => string;
  now: () => Date;
  signUpload: (objectKey: string, sizeBytes: number) => Promise<string>;
  signDownload: (objectKey: string, fileName: string, contentType: string) => Promise<string>;
  /** Confirms a pending upload object exists in the documents bucket before marking stored. */
  objectExists?: (objectKey: string, expectedBytes?: number) => Promise<boolean>;
  /** Optional: store published report markdown in the documents bucket. */
  putReportText?: (objectKey: string, body: string) => Promise<void>;
  /** Staff vault ingest and allowlist. Absent in unit tests that do not exercise vault routes. */
  vault?: VaultIngestDeps;
  /** Chunks already filtered by customer and program for a status draft. */
  loadVaultChunks?: (customerId: string, programId: string) => Promise<VaultChunk[]>;
  maxUploadBytes?: number;
  enqueue: (message: SyncMessage) => Promise<void>;
  githubConfigured: boolean;
  webhookSecret: string;
  /** Cognito subjects in the one80-admin group. Membership rows stay employees. */
  listAdminUserIds: () => Promise<string[]>;
};

type Ctx = {
  principal: Principal;
  correlationId: string;
  body: Record<string, unknown>;
  query: Record<string, string | undefined>;
};

export function createHandler(deps: HandlerDeps) {
  return async function handler(event: HttpEvent): Promise<HttpResult> {
    const correlationId = header(event, "x-correlation-id") || deps.newId();
    const method = event.requestContext.http.method.toUpperCase();
    const path = event.rawPath.replace(/\/+$/, "") || "/";

    if (method === "OPTIONS") {
      return json(204, {}, correlationId);
    }

    if (method === "POST" && path === "/webhooks/github") {
      return acceptWebhook(deps, event, correlationId);
    }

    const principal = principalFromClaims(claimsFromEvent(event));
    if (!principal) {
      return json(401, { code: "UNAUTHORIZED", message: "Sign in is required.", correlationId }, correlationId);
    }

    let body: Record<string, unknown> = {};
    if (event.body) {
      try {
        const parsed: unknown = JSON.parse(event.body);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>;
        } else {
          return json(400, { code: "VALIDATION", message: "Body must be an object.", correlationId }, correlationId);
        }
      } catch {
        return json(400, { code: "VALIDATION", message: "Body must be JSON.", correlationId }, correlationId);
      }
    }

    const ctx: Ctx = { principal, correlationId, body, query: event.queryStringParameters ?? {} };
    try {
      const planned = await handlePlan({ deps, principal, method, path, body, correlationId });
      if (planned) return planned;
      const catalogs = await handleCatalogs({ deps, principal, method, path, body, correlationId });
      if (catalogs) return catalogs;
      const reported = await handleReports({ deps, principal, method, path, body, correlationId });
      if (reported) return reported;
      if (deps.vault) {
        const vaulted = await handleVaultIngest({ deps, principal, method, path, body, correlationId }, deps.vault);
        if (vaulted) return vaulted;
      }
      if (deps.loadVaultChunks) {
        const drafted = await handleVaultDraft({
          deps: {
            getProject: (id) => deps.store.getProject(id),
            listMembershipsForUser: (id) => deps.store.listMembershipsForUser(id),
            loadWorkItems: async (projectId) =>
              (await deps.store.listIssues(projectId)).map((issue) => ({
                issueId: issue.issueId,
                title: issue.title,
                status: issue.status,
                issueType: issue.issueType,
                startDate: issue.startDate,
                finishDate: issue.finishDate,
                effort: issue.effort,
                description: issue.description,
              })),
            loadChunks: (customerId, programId) => deps.loadVaultChunks!(customerId, programId),
            createReport: (report) => deps.store.createReport(report),
            newId: deps.newId,
            now: deps.now,
          },
          principal,
          method,
          path,
          body,
          correlationId,
        });
        if (drafted) return drafted;
      }

      if (path === "/admin/members" && method === "GET") return listMembers(deps, ctx);

      const customerList = path.match(/^\/admin\/customers$/);
      if (customerList && method === "POST") return createCustomer(deps, ctx);
      if (customerList && method === "GET") return listCustomers(deps, ctx);

      const invite = path.match(/^\/admin\/customers\/([^/]+)\/invitations$/);
      if (invite && method === "POST") return inviteMember(deps, ctx, decodeURIComponent(invite[1]));

      const member = path.match(/^\/admin\/customers\/([^/]+)\/members\/([^/]+)$/);
      if (member && method === "PATCH") {
        return updateMember(deps, ctx, decodeURIComponent(member[1]), decodeURIComponent(member[2]));
      }

      const projects = path.match(/^\/admin\/customers\/([^/]+)\/projects$/);
      if (projects && method === "POST") return createProject(deps, ctx, decodeURIComponent(projects[1]));

      const audit = path.match(/^\/admin\/customers\/([^/]+)\/audit$/);
      if (audit && method === "GET") return listAudit(deps, ctx, decodeURIComponent(audit[1]));

      const rename = path.match(/^\/admin\/projects\/([^/]+)$/);
      if (rename && method === "PATCH") return renameProject(deps, ctx, decodeURIComponent(rename[1]));

      const applications = path.match(/^\/admin\/projects\/([^/]+)\/applications$/);
      if (applications && method === "POST") return createApplication(deps, ctx, decodeURIComponent(applications[1]));

      if (path === "/me" && method === "GET") return me(deps, ctx);

      const customerAudit = path.match(/^\/customers\/([^/]+)\/audit$/);
      if (customerAudit && method === "GET") return listCustomerAudit(deps, ctx, decodeURIComponent(customerAudit[1]));

      const customerRecord = path.match(/^\/customers\/([^/]+)$/);
      if (customerRecord && method === "GET") return readCustomer(deps, ctx, decodeURIComponent(customerRecord[1]));

      const customerProjects = path.match(/^\/customers\/([^/]+)\/projects$/);
      if (customerProjects && method === "GET") return listProjects(deps, ctx, decodeURIComponent(customerProjects[1]));

      const overview = path.match(/^\/projects\/([^/]+)\/overview$/);
      if (overview && (method === "GET" || method === "PUT")) return projectOverview(deps, ctx, decodeURIComponent(overview[1]), method);

      const download = path.match(/^\/projects\/([^/]+)\/documents\/([^/]+)\/download$/);
      if (download && method === "GET") {
        return downloadDocument(deps, ctx, decodeURIComponent(download[1]), decodeURIComponent(download[2]));
      }

      const completeVersion = path.match(/^\/projects\/([^/]+)\/documents\/([^/]+)\/versions\/([^/]+)\/complete$/);
      if (completeVersion && method === "POST") {
        return completeDocumentVersion(
          deps,
          ctx,
          decodeURIComponent(completeVersion[1]),
          decodeURIComponent(completeVersion[2]),
          decodeURIComponent(completeVersion[3]),
        );
      }

      const versions = path.match(/^\/projects\/([^/]+)\/documents\/([^/]+)\/versions$/);
      if (versions && method === "GET") return listDocumentVersions(deps, ctx, decodeURIComponent(versions[1]), decodeURIComponent(versions[2]));
      if (versions && method === "POST") return addDocumentVersion(deps, ctx, decodeURIComponent(versions[1]), decodeURIComponent(versions[2]));

      const documentAction = path.match(/^\/projects\/([^/]+)\/documents\/([^/]+)\/(delete|restore)$/);
      if (documentAction && method === "POST") {
        return documentAction[3] === "delete"
          ? deleteDocument(deps, ctx, decodeURIComponent(documentAction[1]), decodeURIComponent(documentAction[2]))
          : restoreDocument(deps, ctx, decodeURIComponent(documentAction[1]), decodeURIComponent(documentAction[2]));
      }

      const removeFolder = path.match(/^\/projects\/([^/]+)\/folders\/delete$/);
      if (removeFolder && method === "POST") return deleteFolder(deps, ctx, decodeURIComponent(removeFolder[1]));

      const folders = path.match(/^\/projects\/([^/]+)\/folders$/);
      if (folders && method === "POST") return createFolder(deps, ctx, decodeURIComponent(folders[1]));

      const moveDocument = path.match(/^\/projects\/([^/]+)\/documents\/([^/]+)$/);
      if (moveDocument && method === "PATCH") {
        return moveDocumentToFolder(deps, ctx, decodeURIComponent(moveDocument[1]), decodeURIComponent(moveDocument[2]));
      }

      const documents = path.match(/^\/projects\/([^/]+)\/documents$/);
      if (documents && method === "GET") return listProjectDocuments(deps, ctx, decodeURIComponent(documents[1]));
      if (documents && method === "POST") return createDocument(deps, ctx, decodeURIComponent(documents[1]));

      const projectApps = path.match(/^\/projects\/([^/]+)\/applications$/);
      if (projectApps && method === "GET") return listApplications(deps, ctx, decodeURIComponent(projectApps[1]));

      const project = path.match(/^\/projects\/([^/]+)$/);
      if (project && method === "GET") return getProject(deps, ctx, decodeURIComponent(project[1]));

      return json(404, { code: "NOT_FOUND", message: "Route not found.", correlationId }, correlationId);
    } catch (error) {
      console.error(JSON.stringify({ correlationId, message: error instanceof Error ? error.message : "error" }));
      return json(500, { code: "INTERNAL", message: "Request failed.", correlationId }, correlationId);
    }
  };
}

async function createCustomer(deps: HandlerDeps, ctx: Ctx): Promise<HttpResult> {
  const gate = requireAdmin(ctx);
  if (gate) return gate;
  const name = stringField(ctx.body, "name");
  if (!name) return validation(ctx, "name is required.");
  const customer = { customerId: deps.newId(), name, createdAt: deps.now().toISOString() };
  await deps.store.createCustomer(customer);
  await audit(deps, ctx, {
    customerId: customer.customerId,
    action: "customer.created",
    targetType: "customer",
    projectId: null,
    targetId: customer.customerId,
    before: null,
    after: { name: customer.name },
  });
  return json(201, customer, ctx.correlationId);
}

type MemberAccess = "Administrator" | "Contributor" | "View";

type MemberRow = {
  userId: string;
  email: string;
  name: string;
  customerId: string;
  customerName: string;
  access: MemberAccess;
  allProjects: boolean;
  projects: { projectId: string; name: string }[];
  customerProjects: { projectId: string; name: string }[];
};

function accessLabel(role: MemberRole): "Contributor" | "View" {
  return role === "view" ? "View" : "Contributor";
}

/** Absent keeps the current role. Owner is not a portal role. */
function requestedRole(value: unknown): MemberRole | "keep" | "invalid" {
  if (value === undefined) return "keep";
  if (value === "Contributor") return "contributor";
  if (value === "View") return "view";
  return "invalid";
}

function memberRow(membership: Membership, customerName: string, projects: Project[], admin: boolean): MemberRow {
  const customerProjects = projects.map((project) => ({ projectId: project.projectId, name: project.name }));
  const allProjects = admin || membership.projectIds == null;
  const visible = allProjects
    ? customerProjects
    : customerProjects.filter((project) => membership.projectIds?.includes(project.projectId));
  return {
    userId: membership.userId,
    email: membership.email,
    name: membership.name,
    customerId: membership.customerId,
    customerName,
    access: admin ? "Administrator" : accessLabel(membership.role),
    allProjects,
    projects: visible,
    customerProjects,
  };
}

async function listMembers(deps: HandlerDeps, ctx: Ctx): Promise<HttpResult> {
  const gate = requireAdmin(ctx);
  if (gate) return gate;
  const adminIds = new Set(await deps.listAdminUserIds());
  const customers = await deps.store.listCustomers();
  const members: MemberRow[] = [];
  for (const customer of customers) {
    const [memberships, projects] = await Promise.all([
      deps.store.listMembershipsForCustomer(customer.customerId),
      deps.store.listProjects(customer.customerId),
    ]);
    for (const membership of memberships) {
      members.push(memberRow(membership, customer.name, projects, adminIds.has(membership.userId)));
    }
  }
  members.sort((left, right) => left.customerName.localeCompare(right.customerName) || left.email.localeCompare(right.email));
  return json(200, { members }, ctx.correlationId);
}

async function updateMember(deps: HandlerDeps, ctx: Ctx, customerId: string, userId: string): Promise<HttpResult> {
  const gate = requireAdmin(ctx);
  if (gate) return gate;
  const customer = await deps.store.getCustomer(customerId);
  if (!customer) return notFound(ctx);
  const [memberships, projects] = await Promise.all([
    deps.store.listMembershipsForCustomer(customerId),
    deps.store.listProjects(customerId),
  ]);
  const current = memberships.find((membership) => membership.userId === userId);
  if (!current) return notFound(ctx);

  const name = stringField(ctx.body, "name");
  if (!name || name.length > 80) return validation(ctx, "A name up to 80 characters is required.");
  const email = stringField(ctx.body, "email")?.toLowerCase() ?? "";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return validation(ctx, "A valid email is required.");

  const adminIds = new Set(await deps.listAdminUserIds());
  const administrator = adminIds.has(current.userId);
  if (administrator && email !== current.email) {
    return validation(ctx, "The administrator sign-in email cannot be changed.");
  }

  let projectIds = current.projectIds;
  if (!administrator) {
    const selected = selectedProjectIds(ctx.body.projectIds, projects.map((project) => project.projectId));
    if (selected === "invalid") return validation(ctx, "Choose projects that belong to this customer, or allow every project.");
    projectIds = selected;
  }
  const chosen = requestedRole(ctx.body.access);
  if (chosen === "invalid") return validation(ctx, "Access must be Contributor or View.");
  const role = administrator || chosen === "keep" ? memberRole(current.role) : chosen;

  let nextUserId = current.userId;
  if (email !== current.email) {
    if (memberships.some((membership) => membership.email === email && membership.userId !== current.userId)) {
      return conflict(ctx, "That email is already a member of this customer.");
    }
    const invited = await deps.inviteUser(email);
    if (invited.userId !== current.userId && adminIds.has(invited.userId)) {
      return validation(ctx, "That email belongs to an administrator.");
    }
    nextUserId = invited.userId;
  }

  const next: Membership = { ...current, userId: nextUserId, email, name, projectIds, role };
  await deps.store.putMembership(next);
  if (nextUserId !== current.userId) {
    await deps.store.deleteMembership(customerId, current.userId);
    const remaining = await deps.store.listMembershipsForUser(current.userId);
    if (remaining.length === 0 && !adminIds.has(current.userId)) await deps.disableLogin(current.email);
  }

  await audit(deps, ctx, {
    customerId,
    action: "member.updated",
    targetType: "membership",
    projectId: null,
    targetId: nextUserId,
    before: { email: current.email, name: current.name, projectIds: current.projectIds, role: memberRole(current.role) },
    after: { email, name, projectIds, role },
  });
  return json(200, memberRow(next, customer.name, projects, administrator), ctx.correlationId);
}

function selectedProjectIds(value: unknown, known: string[]): string[] | null | "invalid" {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length === 0) return "invalid";
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !known.includes(item) || ids.includes(item)) return "invalid";
    ids.push(item);
  }
  return ids;
}

async function listCustomers(deps: HandlerDeps, ctx: Ctx): Promise<HttpResult> {
  const gate = requireAdmin(ctx);
  if (gate) return gate;
  return json(200, { customers: await deps.store.listCustomers() }, ctx.correlationId);
}

async function inviteMember(deps: HandlerDeps, ctx: Ctx, customerId: string): Promise<HttpResult> {
  const gate = requireAdmin(ctx);
  if (gate) return gate;
  const email = stringField(ctx.body, "email")?.toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return validation(ctx, "A valid email is required.");
  const chosen = requestedRole(ctx.body.access);
  if (chosen === "invalid") return validation(ctx, "Access must be Contributor or View.");
  const role = chosen === "keep" ? "contributor" : chosen;
  const customer = await deps.store.getCustomer(customerId);
  if (!customer) return notFound(ctx);
  const existing = await deps.store.listMembershipsForCustomer(customerId);
  if (existing.some((membership) => membership.email === email)) {
    return conflict(ctx, "That email is already a member of this customer.");
  }
  const invited = await deps.inviteUser(email);
  const adminIds = new Set(await deps.listAdminUserIds());
  if (adminIds.has(invited.userId)) {
    return validation(ctx, "That email belongs to an administrator.");
  }
  if (existing.some((membership) => membership.userId === invited.userId)) {
    return conflict(ctx, "That user is already a member of this customer.");
  }
  const membership = {
    customerId,
    userId: invited.userId,
    email,
    name: "",
    role,
    createdAt: deps.now().toISOString(),
    projectIds: null,
  };
  await deps.store.putMembership(membership);
  await audit(deps, ctx, {
    customerId,
    action: "member.invited",
    targetType: "membership",
    projectId: null,
    targetId: invited.userId,
    before: null,
    after: { email, role },
  });
  return json(201, { customerId, userId: invited.userId, email, access: accessLabel(role) }, ctx.correlationId);
}

async function createProject(deps: HandlerDeps, ctx: Ctx, customerId: string): Promise<HttpResult> {
  const gate = requireAdmin(ctx);
  if (gate) return gate;
  const name = stringField(ctx.body, "name");
  if (!name || name.length > 120) return validation(ctx, "A project name up to 120 characters is required.");
  const projectKey = normalizeProjectKey(ctx.body.projectKey);
  if (!projectKey) return validation(ctx, "A project key of 3 or 4 letters is required.");
  const customer = await deps.store.getCustomer(customerId);
  if (!customer) return notFound(ctx);
  const project = { projectId: deps.newId(), customerId, name, projectKey, createdAt: deps.now().toISOString() };
  const claimed = await deps.store.claimProjectKey(projectKey, project.projectId, customerId);
  if (!claimed) return validation(ctx, `The project key ${projectKey} is already in use.`);
  try {
    await deps.store.createProject(project);
  } catch (error) {
    await deps.store.releaseProjectKey(projectKey, project.projectId);
    throw error;
  }
  await audit(deps, ctx, {
    customerId,
    action: "project.created",
    targetType: "project",
    projectId: project.projectId,
    targetId: project.projectId,
    before: null,
    after: { name, projectKey, customerId },
  });
  return json(201, project, ctx.correlationId);
}

/** Administrator updates the portal project name and/or key. Does not change GitHub. */
async function renameProject(deps: HandlerDeps, ctx: Ctx, projectId: string): Promise<HttpResult> {
  const gate = requireAdmin(ctx);
  if (gate) return gate;
  const hasName = Object.prototype.hasOwnProperty.call(ctx.body, "name");
  const hasKey = Object.prototype.hasOwnProperty.call(ctx.body, "projectKey");
  if (!hasName && !hasKey) return validation(ctx, "A project name or project key is required.");
  const name = hasName ? stringField(ctx.body, "name") : null;
  if (hasName && (!name || name.length > 120)) return validation(ctx, "A project name up to 120 characters is required.");
  const projectKey = hasKey ? normalizeProjectKey(ctx.body.projectKey) : null;
  if (hasKey && !projectKey) return validation(ctx, "A project key of 3 or 4 letters is required.");
  const project = await deps.store.getProject(projectId);
  if (!project) return notFound(ctx);
  const nextName = name ?? project.name;
  const nextKey = projectKey ?? project.projectKey;
  if (!nextKey) return validation(ctx, "A project key of 3 or 4 letters is required.");
  if (project.name === nextName && project.projectKey === nextKey) return json(200, project, ctx.correlationId);

  if (nextKey !== project.projectKey) {
    const claimed = await deps.store.claimProjectKey(nextKey, project.projectId, project.customerId);
    if (!claimed) return validation(ctx, `The project key ${nextKey} is already in use.`);
  }

  const next = { ...project, name: nextName, projectKey: nextKey };
  await deps.store.putProject(next);
  if (project.projectKey && project.projectKey !== nextKey) {
    await deps.store.releaseProjectKey(project.projectKey, project.projectId);
  }

  const renamed = project.name !== nextName;
  const keyChanged = project.projectKey !== nextKey;
  await audit(deps, ctx, {
    customerId: project.customerId,
    action: renamed && keyChanged ? "project.updated" : renamed ? "project.renamed" : "project.key_set",
    targetType: "project",
    projectId: project.projectId,
    targetId: project.projectId,
    before: { name: project.name, projectKey: project.projectKey },
    after: { name: nextName, projectKey: nextKey },
  });
  return json(200, next, ctx.correlationId);
}

async function createApplication(deps: HandlerDeps, ctx: Ctx, projectId: string): Promise<HttpResult> {
  const gate = requireAdmin(ctx);
  if (gate) return gate;
  const project = await deps.store.getProject(projectId);
  if (!project) return notFound(ctx);
  const displayName = stringField(ctx.body, "displayName");
  const moduleKey = stringField(ctx.body, "moduleKey");
  if (!displayName || !moduleKey || !isModuleKey(moduleKey)) {
    return validation(ctx, "displayName and a known moduleKey are required.");
  }
  const already = (await deps.store.listApplications(projectId)).find((item) => item.moduleKey === moduleKey);
  if (already) return json(200, already, ctx.correlationId);
  const application = {
    applicationId: deps.newId(),
    projectId,
    customerId: project.customerId,
    moduleKey,
    displayName,
    createdAt: deps.now().toISOString(),
  };
  await deps.store.createApplication(application);
  await audit(deps, ctx, {
    customerId: project.customerId,
    action: "application.enabled",
    targetType: "application",
    projectId,
    targetId: application.applicationId,
    before: null,
    after: { moduleKey, displayName, projectId },
  });
  return json(201, application, ctx.correlationId);
}

async function listAudit(deps: HandlerDeps, ctx: Ctx, customerId: string): Promise<HttpResult> {
  const gate = requireAdmin(ctx);
  if (gate) return gate;
  const customer = await deps.store.getCustomer(customerId);
  if (!customer) return notFound(ctx);
  return json(200, { events: await deps.store.listAudit(customerId) }, ctx.correlationId);
}

async function me(deps: HandlerDeps, ctx: Ctx): Promise<HttpResult> {
  const memberships = await deps.store.listMembershipsForUser(ctx.principal.userId);
  return json(
    200,
    {
      userId: ctx.principal.userId,
      email: ctx.principal.email ?? null,
      admin: adminAccess(ctx.principal) === "ok",
      mfa: ctx.principal.mfa,
      memberships,
    },
    ctx.correlationId,
  );
}

/** A member can read the customer name shown in the navigation selector. */
async function readCustomer(deps: HandlerDeps, ctx: Ctx, customerId: string): Promise<HttpResult> {
  if (!(await canReadCustomer(deps, ctx, customerId))) return notFound(ctx);
  const customer = await deps.store.getCustomer(customerId);
  if (!customer) return notFound(ctx);
  return json(200, customer, ctx.correlationId);
}

async function listProjects(deps: HandlerDeps, ctx: Ctx, customerId: string): Promise<HttpResult> {
  if (!(await canReadCustomer(deps, ctx, customerId))) return notFound(ctx);
  const memberships = await deps.store.listMembershipsForUser(ctx.principal.userId);
  const projects = (await deps.store.listProjects(customerId)).filter((project) => canAccessProject(ctx.principal, project, memberships));
  return json(200, { projects }, ctx.correlationId);
}

async function getProject(deps: HandlerDeps, ctx: Ctx, projectId: string): Promise<HttpResult> {
  const project = await readableProject(deps, ctx, projectId);
  if (!project) return notFound(ctx);
  return json(200, project, ctx.correlationId);
}

async function listApplications(deps: HandlerDeps, ctx: Ctx, projectId: string): Promise<HttpResult> {
  const project = await readableProject(deps, ctx, projectId);
  if (!project) return notFound(ctx);
  return json(200, { applications: await deps.store.listApplications(projectId) }, ctx.correlationId);
}

async function canReadCustomer(deps: HandlerDeps, ctx: Ctx, customerId: string): Promise<boolean> {
  const memberships = await deps.store.listMembershipsForUser(ctx.principal.userId);
  return canAccessCustomer(ctx.principal, customerId, memberships);
}

function requireAdmin(ctx: Ctx): HttpResult | null {
  const access = adminAccess(ctx.principal);
  if (access === "ok") return null;
  if (access === "mfa_required") {
    return json(403, { code: "MFA_REQUIRED", message: "Administrator actions require MFA.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  return json(403, { code: "FORBIDDEN", message: "Administrator access is required.", correlationId: ctx.correlationId }, ctx.correlationId);
}

async function audit(
  deps: HandlerDeps,
  ctx: Ctx,
  input: Omit<AuditEvent, "eventId" | "actorUserId" | "at" | "correlationId">,
): Promise<void> {
  await deps.store.putAudit({
    ...input,
    eventId: deps.newId(),
    actorUserId: ctx.principal.userId,
    at: deps.now().toISOString(),
    correlationId: ctx.correlationId,
  });
}

function stringField(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function validation(ctx: Ctx, message: string): HttpResult {
  return json(400, { code: "VALIDATION", message, correlationId: ctx.correlationId }, ctx.correlationId);
}

function notFound(ctx: Ctx): HttpResult {
  return json(404, { code: "NOT_FOUND", message: "Not found.", correlationId: ctx.correlationId }, ctx.correlationId);
}

function conflict(ctx: Ctx, message: string): HttpResult {
  return json(409, { code: "CONFLICT", message, correlationId: ctx.correlationId }, ctx.correlationId);
}

function json(statusCode: number, payload: unknown, correlationId: string): HttpResult {
  const body = payload && typeof payload === "object" ? { ...payload, correlationId } : { correlationId };
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "x-correlation-id": correlationId,
    },
    body: JSON.stringify(body),
  };
}

async function listCustomerAudit(deps: HandlerDeps, ctx: Ctx, customerId: string): Promise<HttpResult> {
  if (!(await canReadCustomer(deps, ctx, customerId))) return notFound(ctx);
  const events = await deps.store.listAudit(customerId);
  // Non-admins keep metadata (action/at/actor) but before/after can hold membership emails/names.
  if (adminAccess(ctx.principal) === "ok") {
    return json(200, { events }, ctx.correlationId);
  }
  return json(200, { events: events.map(redactAuditPayloads) }, ctx.correlationId);
}

/** Strip before/after so customer-scoped audit lists do not leak invite/member PII to non-admins. */
function redactAuditPayloads(event: AuditEvent): AuditEvent {
  return { ...event, before: null, after: null };
}

async function latestPublishedReport(deps: HandlerDeps, projectId: string): Promise<{ reportId: string; title: string; publishedAt: string } | null> {
  let latest: { reportId: string; title: string; publishedAt: string } | null = null;
  for (const report of await deps.store.listReports(projectId)) {
    for (const version of await deps.store.listReportVersions(report.reportId)) {
      if (!latest || version.publishedAt > latest.publishedAt) {
        latest = { reportId: version.reportId, title: version.title, publishedAt: version.publishedAt };
      }
    }
  }
  return latest;
}

async function projectOverview(deps: HandlerDeps, ctx: Ctx, projectId: string, method: string): Promise<HttpResult> {
  const project = await readableProject(deps, ctx, projectId);
  if (!project) return notFound(ctx);
  const current = (await deps.store.getOverview(projectId)) ?? emptyOverview(project.projectId, project.customerId);
  if (method === "GET") {
    const documents = await deps.store.listDocuments(projectId);
    const issues = await deps.store.listIssues(projectId);
    const rawActivity = (await deps.store.listAudit(project.customerId)).filter((event) => event.projectId === projectId).slice(0, 10);
    const activity = adminAccess(ctx.principal) === "ok" ? rawActivity : rawActivity.map(redactAuditPayloads);
    return json(
      200,
      {
        project,
        overview: current,
        links: await deps.store.listApplications(projectId),
        summary: {
          activeDocuments: documents.filter((document) => !document.deletedAt).length,
          deletedDocuments: documents.filter((document) => document.deletedAt).length,
          progress: projectProgress(issues, (await deps.store.getSettings(projectId))?.doneStatuses ?? ["Done"]).label,
        },
        milestones: milestoneViews(
          issues,
          await deps.store.listMilestones(projectId),
          (await deps.store.getSettings(projectId))?.doneStatuses ?? ["Done"],
          deps.now().toISOString().slice(0, 10),
        ),
        publishedReport: await latestPublishedReport(deps, projectId),
        activity,
      },
      ctx.correlationId,
    );
  }

  const next = { ...current, updatedAt: deps.now().toISOString() };
  if ("health" in ctx.body) {
    if (ctx.body.health === null) next.health = null;
    else if (typeof ctx.body.health === "string" && isProjectHealth(ctx.body.health)) next.health = ctx.body.health;
    else return validation(ctx, "health must be green, yellow, red, or null.");
  }
  if ("healthExplanation" in ctx.body) {
    const explanation = optionalText(ctx.body.healthExplanation, 500);
    if (explanation === undefined) return validation(ctx, "healthExplanation must be text up to 500 characters.");
    next.healthExplanation = explanation;
  }
  if ("notes" in ctx.body) {
    const notes = optionalText(ctx.body.notes, 5000);
    if (notes === undefined) return validation(ctx, "notes must be text up to 5000 characters.");
    next.notes = notes ?? "";
  }
  if (!("health" in ctx.body) && !("healthExplanation" in ctx.body) && !("notes" in ctx.body)) {
    return validation(ctx, "Send health, healthExplanation, or notes.");
  }
  const blocked = await rejectView(deps, ctx, project);
  if (blocked) return blocked;
  await deps.store.putOverview(next);
  await audit(deps, ctx, {
    customerId: project.customerId,
    projectId,
    action: "overview.updated",
    targetType: "overview",
    targetId: projectId,
    before: current,
    after: next,
  });
  return json(200, next, ctx.correlationId);
}

async function listProjectDocuments(deps: HandlerDeps, ctx: Ctx, projectId: string): Promise<HttpResult> {
  const project = await readableProject(deps, ctx, projectId);
  if (!project) return notFound(ctx);
  const deleted = ctx.query.state === "deleted";
  const documents = (await deps.store.listDocuments(projectId)).filter((document) => Boolean(document.deletedAt) === deleted);
  const listed = await Promise.all(
    documents.map(async (document) => {
      const version = document.currentVersionId ? await deps.store.getVersion(document.documentId, document.currentVersionId) : null;
      return { ...document, currentFileName: version?.fileName ?? null };
    }),
  );
  const folders = visibleFolders(await deps.store.listFolders(projectId), documents);
  return json(200, { documents: listed, folders }, ctx.correlationId);
}

async function createFolder(deps: HandlerDeps, ctx: Ctx, projectId: string): Promise<HttpResult> {
  const project = await readableProject(deps, ctx, projectId);
  if (!project) return notFound(ctx);
  const blocked = await rejectView(deps, ctx, project);
  if (blocked) return blocked;
  const name = folderName(ctx.body.name);
  if (!name) return validation(ctx, "A folder name can use letters, numbers, spaces, and . _ -.");
  const parent = folderField(ctx.body.parent);
  if (parent === null) return validation(ctx, "Choose an existing folder.");
  const documents = await deps.store.listDocuments(projectId);
  const stored = await deps.store.listFolders(projectId);
  const known = new Set(visibleFolders(stored, documents).map((folder) => folder.path));
  if (parent && !known.has(parent)) return validation(ctx, "Choose an existing folder.");
  const path = parent ? `${parent}/${name}` : name;
  if (path.length > 120) return validation(ctx, "That folder path is too long.");
  const existing = stored.find((folder) => folder.path === path);
  if (existing) return json(200, existing, ctx.correlationId);
  const folder: DocumentFolder = {
    projectId,
    customerId: project.customerId,
    path,
    name,
    parent,
    createdAt: deps.now().toISOString(),
  };
  await deps.store.putFolder(folder);
  await audit(deps, ctx, {
    customerId: project.customerId,
    projectId,
    action: "folder.created",
    targetType: "folder",
    targetId: path,
    before: null,
    after: { path, name, parent },
  });
  return json(201, folder, ctx.correlationId);
}

async function deleteFolder(deps: HandlerDeps, ctx: Ctx, projectId: string): Promise<HttpResult> {
  const project = await readableProject(deps, ctx, projectId);
  if (!project) return notFound(ctx);
  const blocked = await rejectView(deps, ctx, project);
  if (blocked) return blocked;
  const path = folderField(ctx.body.path);
  if (!path) return validation(ctx, "Choose a folder to remove.");
  const documents = await deps.store.listDocuments(projectId);
  const stored = await deps.store.listFolders(projectId);
  const known = visibleFolders(stored, documents);
  if (!known.some((item) => item.path === path)) return notFound(ctx);
  const prefix = `${path}/`;
  const occupied =
    documents.some((document) => !document.deletedAt && (document.folder === path || document.folder.startsWith(prefix))) ||
    stored.some((item) => item.parent === path);
  if (occupied || !stored.some((item) => item.path === path)) {
    return conflict(ctx, "Move the files and folders out of this folder before removing it.");
  }
  await deps.store.deleteFolder(projectId, path);
  await audit(deps, ctx, {
    customerId: project.customerId,
    projectId,
    action: "folder.removed",
    targetType: "folder",
    targetId: path,
    before: { path },
    after: null,
  });
  return json(200, { path }, ctx.correlationId);
}

async function moveDocumentToFolder(deps: HandlerDeps, ctx: Ctx, projectId: string, documentId: string): Promise<HttpResult> {
  const document = await activeDocument(deps, ctx, projectId, documentId);
  if (!document) return notFound(ctx);
  const blocked = await rejectView(deps, ctx, { customerId: document.customerId, projectId });
  if (blocked) return blocked;
  const hasFolder = Object.prototype.hasOwnProperty.call(ctx.body, "folder");
  const hasSourceLabel = Object.prototype.hasOwnProperty.call(ctx.body, "sourceLabel");
  if (!hasFolder && !hasSourceLabel) return validation(ctx, "folder or sourceLabel is required.");

  let folder = document.folder;
  if (hasFolder) {
    const nextFolder = folderField(ctx.body.folder);
    if (nextFolder === null) return validation(ctx, "Choose an existing folder.");
    const documents = await deps.store.listDocuments(projectId);
    const known = new Set(visibleFolders(await deps.store.listFolders(projectId), documents).map((item) => item.path));
    if (nextFolder && !known.has(nextFolder)) return validation(ctx, "Choose an existing folder.");
    folder = nextFolder;
  }

  let sourceLabel = document.sourceLabel;
  if (hasSourceLabel) {
    const parsed = parseSourceLabelField(ctx.body.sourceLabel);
    if (parsed === undefined) return validation(ctx, "sourceLabel must be compass-upload, krisp, fireflies, other, or null.");
    sourceLabel = parsed;
  }

  const moved = { ...document, folder, sourceLabel };
  await deps.store.putDocument(moved);
  await audit(deps, ctx, {
    customerId: document.customerId,
    projectId,
    action: hasFolder && folder !== document.folder ? "document.moved" : "document.updated",
    targetType: "document",
    targetId: documentId,
    before: { folder: document.folder, sourceLabel: document.sourceLabel },
    after: { folder, sourceLabel },
  });
  return json(200, moved, ctx.correlationId);
}

function visibleFolders(stored: DocumentFolder[], documents: PortalDocument[]): DocumentFolder[] {
  const byPath = new Map(stored.map((folder) => [folder.path, folder]));
  for (const document of documents) {
    if (document.deletedAt || !document.folder) continue;
    const parts = document.folder.split("/").filter(Boolean);
    let parent = "";
    for (const name of parts) {
      const path = parent ? `${parent}/${name}` : name;
      if (!byPath.has(path)) {
        byPath.set(path, {
          projectId: document.projectId,
          customerId: document.customerId,
          path,
          name,
          parent,
          createdAt: document.createdAt,
        });
      }
      parent = path;
    }
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function folderName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (!name || name.length > 80 || name.includes("/") || name.includes("\\") || name.includes("..")) return null;
  if (!/^[A-Za-z0-9 _.-]+$/.test(name)) return null;
  return name;
}

async function createDocument(deps: HandlerDeps, ctx: Ctx, projectId: string): Promise<HttpResult> {
  const project = await readableProject(deps, ctx, projectId);
  if (!project) return notFound(ctx);
  const blocked = await rejectView(deps, ctx, project);
  if (blocked) return blocked;
  const name = stringField(ctx.body, "name");
  const file = fileFields(ctx, deps);
  if (!name || name.length > 200) return validation(ctx, "name is required.");
  if (!file) return validation(ctx, "fileName, contentType, and sizeBytes are required.");
  const documentId = deps.newId();
  const versionId = deps.newId();
  const sourceLabel = parseSourceLabelField(ctx.body.sourceLabel);
  if (sourceLabel === undefined) {
    return validation(ctx, "sourceLabel must be compass-upload, krisp, fireflies, other, or null.");
  }
  const document: PortalDocument = {
    documentId,
    projectId,
    customerId: project.customerId,
    name,
    folder: file.folder,
    currentVersionId: null,
    deletedAt: null,
    createdAt: deps.now().toISOString(),
    sourceLabel: sourceLabel ?? null,
  };
  const version = newVersion(deps, ctx, document, versionId, file);
  await deps.store.createDocument(document);
  await deps.store.putVersion(version);
  const uploadUrl = await deps.signUpload(version.objectKey, version.sizeBytes);
  return json(201, { documentId, versionId, uploadUrl }, ctx.correlationId);
}

async function addDocumentVersion(deps: HandlerDeps, ctx: Ctx, projectId: string, documentId: string): Promise<HttpResult> {
  const document = await activeDocument(deps, ctx, projectId, documentId);
  if (!document) return notFound(ctx);
  const blocked = await rejectView(deps, ctx, { customerId: document.customerId, projectId });
  if (blocked) return blocked;
  const file = fileFields(ctx, deps);
  if (!file) return validation(ctx, "fileName, contentType, and sizeBytes are required.");
  const versionId = deps.newId();
  const version = newVersion(deps, ctx, document, versionId, file);
  await deps.store.putVersion(version);
  const uploadUrl = await deps.signUpload(version.objectKey, version.sizeBytes);
  return json(201, { documentId, versionId, uploadUrl }, ctx.correlationId);
}

async function completeDocumentVersion(deps: HandlerDeps, ctx: Ctx, projectId: string, documentId: string, versionId: string): Promise<HttpResult> {
  const document = await activeDocument(deps, ctx, projectId, documentId);
  if (!document) return notFound(ctx);
  const blocked = await rejectView(deps, ctx, { customerId: document.customerId, projectId });
  if (blocked) return blocked;
  const version = await deps.store.getVersion(documentId, versionId);
  if (!version || version.projectId !== projectId) return notFound(ctx);
  if (version.status === "stored") {
    return json(200, { documentId, versionId, currentVersionId: document.currentVersionId ?? versionId }, ctx.correlationId);
  }
  if (version.status !== "pending") return validation(ctx, "Only pending uploads can be completed.");
  if (deps.objectExists) {
    const exists = await deps.objectExists(version.objectKey, version.sizeBytes);
    if (!exists) return validation(ctx, "Upload the file before completing this version.");
  }
  const previousVersionId = document.currentVersionId;
  const stored = { ...version, status: "stored" as const };
  await deps.store.putVersion(stored);
  const updated = { ...document, currentVersionId: versionId };
  await deps.store.putDocument(updated);
  await audit(deps, ctx, {
    customerId: document.customerId,
    projectId,
    action: previousVersionId ? "document.version_added" : "document.created",
    targetType: "document",
    targetId: documentId,
    before: { currentVersionId: previousVersionId },
    after: { currentVersionId: versionId, fileName: version.fileName, sizeBytes: version.sizeBytes },
  });
  return json(200, { documentId, versionId, currentVersionId: versionId }, ctx.correlationId);
}

async function listDocumentVersions(deps: HandlerDeps, ctx: Ctx, projectId: string, documentId: string): Promise<HttpResult> {
  const document = await visibleDocument(deps, ctx, projectId, documentId);
  if (!document) return notFound(ctx);
  const versions = (await deps.store.listVersions(documentId)).filter((version) => version.status === "stored");
  return json(200, { versions }, ctx.correlationId);
}

async function downloadDocument(deps: HandlerDeps, ctx: Ctx, projectId: string, documentId: string): Promise<HttpResult> {
  const document = await visibleDocument(deps, ctx, projectId, documentId);
  if (!document) return notFound(ctx);
  const versionId = ctx.query.versionId || document.currentVersionId;
  if (!versionId) return notFound(ctx);
  const version = await deps.store.getVersion(documentId, versionId);
  if (!version || version.status !== "stored" || version.projectId !== projectId) return notFound(ctx);
  const url = await deps.signDownload(version.objectKey, version.fileName, version.contentType);
  return json(200, { url, fileName: version.fileName, versionId }, ctx.correlationId);
}

async function deleteDocument(deps: HandlerDeps, ctx: Ctx, projectId: string, documentId: string): Promise<HttpResult> {
  const document = await activeDocument(deps, ctx, projectId, documentId);
  if (!document) return notFound(ctx);
  const blocked = await rejectView(deps, ctx, { customerId: document.customerId, projectId });
  if (blocked) return blocked;
  const explanation = optionalText(ctx.body.explanation, 500);
  if (explanation === undefined) return validation(ctx, "explanation must be text up to 500 characters.");
  const deleted = { ...document, deletedAt: deps.now().toISOString() };
  await deps.store.putDocument(deleted);
  await audit(deps, ctx, {
    customerId: document.customerId,
    projectId,
    action: "document.deleted",
    targetType: "document",
    targetId: documentId,
    before: { deletedAt: null, currentVersionId: document.currentVersionId },
    after: { deletedAt: deleted.deletedAt, currentVersionId: document.currentVersionId, explanation },
  });
  return json(200, deleted, ctx.correlationId);
}

async function restoreDocument(deps: HandlerDeps, ctx: Ctx, projectId: string, documentId: string): Promise<HttpResult> {
  const document = await visibleDocument(deps, ctx, projectId, documentId);
  if (!document?.deletedAt) return notFound(ctx);
  const blocked = await rejectView(deps, ctx, { customerId: document.customerId, projectId });
  if (blocked) return blocked;
  const explanation = optionalText(ctx.body.explanation, 500);
  if (explanation === undefined) return validation(ctx, "explanation must be text up to 500 characters.");
  const restored = { ...document, deletedAt: null };
  await deps.store.putDocument(restored);
  await audit(deps, ctx, {
    customerId: document.customerId,
    projectId,
    action: "document.restored",
    targetType: "document",
    targetId: documentId,
    before: { deletedAt: document.deletedAt, currentVersionId: document.currentVersionId },
    after: { deletedAt: null, currentVersionId: restored.currentVersionId, explanation },
  });
  return json(200, restored, ctx.correlationId);
}

function emptyOverview(projectId: string, customerId: string): ProjectOverview {
  return { projectId, customerId, health: null, healthExplanation: null, notes: "", updatedAt: null };
}

async function rejectView(
  deps: HandlerDeps,
  ctx: Ctx,
  project: { customerId: string; projectId: string },
): Promise<HttpResult | null> {
  const memberships = await deps.store.listMembershipsForUser(ctx.principal.userId);
  if (canWriteProject(ctx.principal, project, memberships)) return null;
  return json(403, { code: "VIEW_ONLY", message: "View access can open this project and cannot change it.", correlationId: ctx.correlationId }, ctx.correlationId);
}

async function readableProject(deps: HandlerDeps, ctx: Ctx, projectId: string) {
  const project = await deps.store.getProject(projectId);
  if (!project) return null;
  const memberships = await deps.store.listMembershipsForUser(ctx.principal.userId);
  if (!canAccessProject(ctx.principal, project, memberships)) return null;
  return project;
}

async function visibleDocument(deps: HandlerDeps, ctx: Ctx, projectId: string, documentId: string): Promise<PortalDocument | null> {
  const project = await readableProject(deps, ctx, projectId);
  if (!project) return null;
  const document = await deps.store.getDocument(documentId);
  if (!document || document.projectId !== projectId || document.customerId !== project.customerId) return null;
  return document;
}

async function activeDocument(deps: HandlerDeps, ctx: Ctx, projectId: string, documentId: string): Promise<PortalDocument | null> {
  const document = await visibleDocument(deps, ctx, projectId, documentId);
  if (!document || document.deletedAt) return null;
  return document;
}

type FileFields = { folder: string; fileName: string; contentType: string; sizeBytes: number };

function fileFields(ctx: Ctx, deps: HandlerDeps): FileFields | null {
  const fileName = stringField(ctx.body, "fileName");
  if (!fileName || fileName.length > 200 || /[\\/]/.test(fileName)) return null;
  const contentType = typeof ctx.body.contentType === "string" && ctx.body.contentType ? ctx.body.contentType : "application/octet-stream";
  if (!/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+$/.test(contentType) || contentType.length > 200) return null;
  const sizeBytes = ctx.body.sizeBytes;
  const limit = deps.maxUploadBytes ?? MAX_UPLOAD_BYTES;
  if (typeof sizeBytes !== "number" || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > limit) return null;
  const folder = folderField(ctx.body.folder);
  if (folder === null) return null;
  return { folder, fileName, contentType, sizeBytes };
}

function folderField(value: unknown): string | null {
  if (value == null || value === "") return "";
  if (typeof value !== "string") return null;
  const folder = value.trim();
  if (!folder) return "";
  if (folder.length > 120 || folder.includes("..") || folder.startsWith("/") || folder.endsWith("/")) return null;
  if (!/^[A-Za-z0-9 _./-]+$/.test(folder)) return null;
  return folder;
}

/**
 * Parses a document vault source label.
 * `undefined` means the value is present but invalid (unknown non-empty label).
 * Omitted, null, or blank clears to null so the file stays out of the vault.
 */
function parseSourceLabelField(value: unknown): DocumentSourceLabel | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = documentSourceLabelFromStore(trimmed);
  return parsed ?? undefined;
}

function newVersion(deps: HandlerDeps, ctx: Ctx, document: PortalDocument, versionId: string, file: FileFields): DocumentVersion {
  return {
    versionId,
    documentId: document.documentId,
    projectId: document.projectId,
    customerId: document.customerId,
    fileName: file.fileName,
    contentType: file.contentType,
    sizeBytes: file.sizeBytes,
    objectKey: `customers/${document.customerId}/projects/${document.projectId}/documents/${document.documentId}/versions/${versionId}`,
    status: "pending",
    createdAt: deps.now().toISOString(),
    createdBy: ctx.principal.userId,
  };
}

/** Returns the text, null when the value is null, or undefined when the value is invalid. */
function optionalText(value: unknown, max: number): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== "string" || value.length > max) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Identity comes only from API Gateway's verified JWT authorizer. Never decode Bearer payloads here. */
function claimsFromEvent(event: HttpEvent): Record<string, string> | undefined {
  const authorizerClaims = event.requestContext.authorizer?.jwt?.claims;
  if (!authorizerClaims || typeof authorizerClaims !== "object") return undefined;
  return authorizerClaims;
}

function header(event: HttpEvent, name: string): string | undefined {
  const headers = event.headers ?? {};
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return found?.[1];
}
