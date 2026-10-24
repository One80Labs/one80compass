import { adminAccess, canAccessCustomer, principalFromClaims, type Principal } from "../../../packages/authz/src/index";
import { isModuleKey, type AuditEvent } from "../../../packages/domain/src/index";
import type { Store } from "./store";

export type HttpEvent = {
  requestContext: {
    http: { method: string };
    authorizer?: { jwt?: { claims?: Record<string, string> } };
    requestId?: string;
  };
  rawPath: string;
  headers?: Record<string, string | undefined>;
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
};

type Ctx = {
  principal: Principal;
  correlationId: string;
  body: Record<string, unknown>;
};

export function createHandler(deps: HandlerDeps) {
  return async function handler(event: HttpEvent): Promise<HttpResult> {
    const correlationId = header(event, "x-correlation-id") || deps.newId();
    const method = event.requestContext.http.method.toUpperCase();
    const path = event.rawPath.replace(/\/+$/, "") || "/";

    if (method === "OPTIONS") {
      return json(204, {}, correlationId);
    }

    const principal = principalFromClaims(event.requestContext.authorizer?.jwt?.claims);
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

    const ctx: Ctx = { principal, correlationId, body };
    try {
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

      const customerProjects = path.match(/^\/customers\/([^/]+)\/projects$/);
      if (customerProjects && method === "GET") return listProjects(deps, ctx, decodeURIComponent(customerProjects[1]));

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
    return validation(ctx, "displayName and moduleKey overview are required.");
  }
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

function header(event: HttpEvent, name: string): string | undefined {
  const headers = event.headers ?? {};
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name);
  return found?.[1];
}
