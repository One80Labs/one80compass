import { describe, expect, it } from "vitest";
import type { ApplicationLink, AuditEvent, Customer, Membership, Project } from "../../../packages/domain/src/index";
import { createHandler, type HttpEvent } from "./router";
import type { Store } from "./store";

function memoryStore(): Store & { customers: Customer[]; projects: Project[]; memberships: Membership[]; applications: ApplicationLink[]; audits: AuditEvent[] } {
  const customers: Customer[] = [];
  const projects: Project[] = [];
  const memberships: Membership[] = [];
  const applications: ApplicationLink[] = [];
  const audits: AuditEvent[] = [];
  return {
    customers,
    projects,
    memberships,
    applications,
    audits,
    async createCustomer(customer) {
      customers.push(customer);
    },
    async listCustomers() {
      return customers;
    },
    async getCustomer(customerId) {
      return customers.find((customer) => customer.customerId === customerId) ?? null;
    },
    async createProject(project) {
      projects.push(project);
    },
    async getProject(projectId) {
      return projects.find((project) => project.projectId === projectId) ?? null;
    },
    async listProjects(customerId) {
      return projects.filter((project) => project.customerId === customerId);
    },
    async putMembership(membership) {
      memberships.push(membership);
    },
    async listMembershipsForUser(userId) {
      return memberships.filter((membership) => membership.userId === userId);
    },
    async createApplication(application) {
      applications.push(application);
    },
    async listApplications(projectId) {
      return applications.filter((application) => application.projectId === projectId);
    },
    async putAudit(event) {
      audits.push(event);
    },
    async listAudit(customerId) {
      return audits.filter((event) => event.customerId === customerId);
    },
  };
}

function event(partial: { method: string; path: string; claims?: Record<string, string>; body?: unknown; headers?: Record<string, string> }): HttpEvent {
  return {
    rawPath: partial.path,
    body: partial.body === undefined ? null : JSON.stringify(partial.body),
    headers: partial.headers,
    requestContext: {
      http: { method: partial.method },
      requestId: "req-1",
      authorizer: partial.claims ? { jwt: { claims: partial.claims } } : undefined,
    },
  };
}

const adminClaims = { sub: "admin-1", email: "nick@one80labs.com", "cognito:groups": "one80-admin", amr: '["authenticated","mfa"]' };
const adminNoMfa = { sub: "admin-1", email: "nick@one80labs.com", "cognito:groups": "one80-admin", amr: '["authenticated"]' };
const employeeClaims = { sub: "user-a", email: "ada@example.com", amr: '["authenticated"]' };

function handlerFor(store: Store) {
  let n = 0;
  return createHandler({
    store,
    inviteUser: async () => ({ userId: "user-a" }),
    newId: () => `id-${++n}`,
    now: () => new Date("2026-10-24T12:00:00.000Z"),
  });
}

describe("api router", () => {
  it("returns 401 when the token is missing", async () => {
    const response = await handlerFor(memoryStore())(event({ method: "GET", path: "/projects/id-1" }));
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).code).toBe("UNAUTHORIZED");
  });

  it("blocks administrator writes until MFA is present", async () => {
    const response = await handlerFor(memoryStore())(
      event({ method: "POST", path: "/admin/customers", claims: adminNoMfa, body: { name: "Acme" } }),
    );
    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).code).toBe("MFA_REQUIRED");
  });

  it("creates a customer, project, membership, and module, and writes audit rows", async () => {
    const store = memoryStore();
    const handler = handlerFor(store);
    const created = await handler(event({ method: "POST", path: "/admin/customers", claims: adminClaims, body: { name: "Acme" } }));
    expect(created.statusCode).toBe(201);
    const customerId = JSON.parse(created.body).customerId as string;

    const projectResponse = await handler(
      event({
        method: "POST",
        path: `/admin/customers/${customerId}/projects`,
        claims: adminClaims,
        body: { name: "Bridge", customerId: "someone-else" },
      }),
    );
    expect(projectResponse.statusCode).toBe(201);
    const project = JSON.parse(projectResponse.body);
    expect(project.customerId).toBe(customerId);

    const invite = await handler(
      event({
        method: "POST",
        path: `/admin/customers/${customerId}/invitations`,
        claims: adminClaims,
        body: { email: "Ada@Example.com" },
      }),
    );
    expect(invite.statusCode).toBe(201);

    const tile = await handler(
      event({
        method: "POST",
        path: `/admin/projects/${project.projectId}/applications`,
        claims: adminClaims,
        body: { moduleKey: "overview", displayName: "Overview" },
      }),
    );
    expect(tile.statusCode).toBe(201);
    expect(store.audits.map((row) => row.action)).toEqual([
      "customer.created",
      "project.created",
      "member.invited",
      "application.enabled",
    ]);
  });

  it("hides another customer's project from an employee", async () => {
    const store = memoryStore();
    const handler = handlerFor(store);
    await handler(event({ method: "POST", path: "/admin/customers", claims: adminClaims, body: { name: "Acme" } }));
    const customerId = store.customers[0].customerId;
    await handler(event({ method: "POST", path: `/admin/customers/${customerId}/projects`, claims: adminClaims, body: { name: "Bridge" } }));
    const projectId = store.projects[0].projectId;

    const response = await handler(event({ method: "GET", path: `/projects/${projectId}`, claims: employeeClaims }));
    expect(response.statusCode).toBe(404);

    store.memberships.push({
      customerId,
      userId: "user-a",
      email: "ada@example.com",
      role: "employee",
      createdAt: "2026-10-24T12:00:00.000Z",
    });
    const allowed = await handler(event({ method: "GET", path: `/projects/${projectId}`, claims: employeeClaims }));
    expect(allowed.statusCode).toBe(200);
    expect(JSON.parse(allowed.body).name).toBe("Bridge");
  });
});
