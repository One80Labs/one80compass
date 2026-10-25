import { adminAccess, canAccessCustomer, principalFromClaims, type Principal } from "../../../packages/authz/src/index";
import {
  isModuleKey,
  isProjectHealth,
  MAX_UPLOAD_BYTES,
  type AuditEvent,
  type DocumentVersion,
  type PlanIssue,
  type PortalDocument,
  type ProjectOverview,
  type SyncMessage,
} from "../../../packages/domain/src/index";
import { projectProgress } from "../../../packages/domain/src/progress";
import { handlePlan } from "./plan";
import { handleReports } from "./reports";
import type { Store } from "./store";
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
  newId: () => string;
  now: () => Date;
  signUpload: (objectKey: string, sizeBytes: number) => Promise<string>;
  signDownload: (objectKey: string, fileName: string, contentType: string) => Promise<string>;
  maxUploadBytes?: number;
  enqueue: (message: SyncMessage) => Promise<void>;
  githubConfigured: boolean;
  webhookSecret: string;
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
      const reported = await handleReports({ deps, principal, method, path, body, correlationId });
      if (reported) return reported;

      const customerList = path.match(/^\/admin\/customers$/);
      if (customerList && method === "POST") return createCustomer(deps, ctx);
      if (customerList && method === "GET") return listCustomers(deps, ctx);

      const invite = path.match(/^\/admin\/customers\/([^/]+)\/invitations$/);
      if (invite && method === "POST") return inviteEmployee(deps, ctx, decodeURIComponent(invite[1]));

      const projects = path.match(/^\/admin\/customers\/([^/]+)\/projects$/);
      if (projects && method === "POST") return createProject(deps, ctx, decodeURIComponent(projects[1]));

      const audit = path.match(/^\/admin\/customers\/([^/]+)\/audit$/);
      if (audit && method === "GET") return listAudit(deps, ctx, decodeURIComponent(audit[1]));

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

async function listCustomers(deps: HandlerDeps, ctx: Ctx): Promise<HttpResult> {
  const gate = requireAdmin(ctx);
  if (gate) return gate;
  return json(200, { customers: await deps.store.listCustomers() }, ctx.correlationId);
}

async function inviteEmployee(deps: HandlerDeps, ctx: Ctx, customerId: string): Promise<HttpResult> {
  const gate = requireAdmin(ctx);
  if (gate) return gate;
  const email = stringField(ctx.body, "email")?.toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return validation(ctx, "A valid email is required.");
  const customer = await deps.store.getCustomer(customerId);
  if (!customer) return notFound(ctx);
  const invited = await deps.inviteUser(email);
  const membership = {
    customerId,
    userId: invited.userId,
    email,
    role: "employee" as const,
    createdAt: deps.now().toISOString(),
  };
  await deps.store.putMembership(membership);
  await audit(deps, ctx, {
    customerId,
    action: "member.invited",
    targetType: "membership",
    projectId: null,
    targetId: invited.userId,
    before: null,
    after: { email, role: "employee" },
  });
  return json(201, { customerId, userId: invited.userId, email }, ctx.correlationId);
}

async function createProject(deps: HandlerDeps, ctx: Ctx, customerId: string): Promise<HttpResult> {
  const gate = requireAdmin(ctx);
  if (gate) return gate;
  const name = stringField(ctx.body, "name");
  if (!name) return validation(ctx, "name is required.");
  const customer = await deps.store.getCustomer(customerId);
  if (!customer) return notFound(ctx);
  const project = { projectId: deps.newId(), customerId, name, createdAt: deps.now().toISOString() };
  await deps.store.createProject(project);
  await audit(deps, ctx, {
    customerId,
    action: "project.created",
    targetType: "project",
    projectId: project.projectId,
    targetId: project.projectId,
    before: null,
    after: { name, customerId },
  });
  return json(201, project, ctx.correlationId);
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
  return json(200, { projects: await deps.store.listProjects(customerId) }, ctx.correlationId);
}

async function getProject(deps: HandlerDeps, ctx: Ctx, projectId: string): Promise<HttpResult> {
  const project = await deps.store.getProject(projectId);
  if (!project || !(await canReadCustomer(deps, ctx, project.customerId))) return notFound(ctx);
  return json(200, project, ctx.correlationId);
}

async function listApplications(deps: HandlerDeps, ctx: Ctx, projectId: string): Promise<HttpResult> {
  const project = await deps.store.getProject(projectId);
  if (!project || !(await canReadCustomer(deps, ctx, project.customerId))) return notFound(ctx);
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
  return json(200, { events: await deps.store.listAudit(customerId) }, ctx.correlationId);
}

function milestoneNames(issues: PlanIssue[]): string[] {
  const names = new Set<string>();
  for (const issue of issues) {
    if (!issue.inProject || issue.archived || issue.deletedAt || !issue.milestone) continue;
    names.add(issue.milestone);
  }
  return [...names].sort((left, right) => left.localeCompare(right));
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
  const project = await deps.store.getProject(projectId);
  if (!project || !(await canReadCustomer(deps, ctx, project.customerId))) return notFound(ctx);
  const current = (await deps.store.getOverview(projectId)) ?? emptyOverview(project.projectId, project.customerId);
  if (method === "GET") {
    const documents = await deps.store.listDocuments(projectId);
    const issues = await deps.store.listIssues(projectId);
    const activity = (await deps.store.listAudit(project.customerId)).filter((event) => event.projectId === projectId).slice(0, 10);
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
        milestones: milestoneNames(issues),
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
  return json(200, { documents: listed }, ctx.correlationId);
}

async function createDocument(deps: HandlerDeps, ctx: Ctx, projectId: string): Promise<HttpResult> {
  const project = await readableProject(deps, ctx, projectId);
  if (!project) return notFound(ctx);
  const name = stringField(ctx.body, "name");
  const file = fileFields(ctx, deps);
  if (!name || name.length > 200) return validation(ctx, "name is required.");
  if (!file) return validation(ctx, "fileName, contentType, and sizeBytes are required.");
  const documentId = deps.newId();
  const versionId = deps.newId();
  const document: PortalDocument = {
    documentId,
    projectId,
    customerId: project.customerId,
    name,
    folder: file.folder,
    currentVersionId: null,
    deletedAt: null,
    createdAt: deps.now().toISOString(),
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
  const version = await deps.store.getVersion(documentId, versionId);
  if (!version || version.projectId !== projectId) return notFound(ctx);
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

async function readableProject(deps: HandlerDeps, ctx: Ctx, projectId: string) {
  const project = await deps.store.getProject(projectId);
  if (!project || !(await canReadCustomer(deps, ctx, project.customerId))) return null;
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
  if (typeof sizeBytes !== "number" || !Number.isInteger(sizeBytes) || sizeBytes < 0 || sizeBytes > limit) return null;
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

function claimsFromEvent(event: HttpEvent): Record<string, string> | undefined {
  const authorizerClaims = event.requestContext.authorizer?.jwt?.claims;
  const tokenClaims = claimsFromAuthorization(header(event, "authorization"));
  if (!authorizerClaims && !tokenClaims) return undefined;
  return { ...authorizerClaims, ...tokenClaims };
}

function claimsFromAuthorization(authorization: string | undefined): Record<string, string> | undefined {
  const token = authorization?.replace(/^Bearer\s+/i, "");
  const segment = token?.split(".")[1];
  if (!segment) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
    const claims: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") claims[key] = value;
      else if (value != null) claims[key] = JSON.stringify(value);
    }
    return claims;
  } catch {
    return undefined;
  }
}

function header(event: HttpEvent, name: string): string | undefined {
  const headers = event.headers ?? {};
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return found?.[1];
}
