import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import type { ApplicationLink, AuditEvent, Customer, DocumentFolder, DocumentVersion, Membership, PlanIssue, PortalDocument, ProgressOverride, Project, ProjectOverview, ProjectSettings, ReportVersion, StatusReport, SyncState } from "../../../packages/domain/src/index";
import type { BaselineRecord } from "../../../packages/domain/src/baselines";
import type { MilestoneRecord } from "../../../packages/domain/src/milestones";
import { createHandler, type HandlerDeps, type HttpEvent } from "./router";
import type { Store } from "./store";

function memoryStore(): Store & {
  customers: Customer[];
  projects: Project[];
  memberships: Membership[];
  applications: ApplicationLink[];
  audits: AuditEvent[];
  documents: PortalDocument[];
  folders: DocumentFolder[];
  versions: DocumentVersion[];
  overviews: ProjectOverview[];
  settings: ProjectSettings[];
  issues: PlanIssue[];
  overrides: ProgressOverride[];
  syncs: SyncState[];
  deliveries: string[];
  reports: StatusReport[];
  reportVersions: ReportVersion[];
  milestones: MilestoneRecord[];
  baselines: BaselineRecord[];
} {
  const customers: Customer[] = [];
  const projects: Project[] = [];
  const memberships: Membership[] = [];
  const applications: ApplicationLink[] = [];
  const audits: AuditEvent[] = [];
  const documents: PortalDocument[] = [];
  const folders: DocumentFolder[] = [];
  const versions: DocumentVersion[] = [];
  const overviews: ProjectOverview[] = [];
  const settings: ProjectSettings[] = [];
  const issues: PlanIssue[] = [];
  const overrides: ProgressOverride[] = [];
  const syncs: SyncState[] = [];
  const deliveries: string[] = [];
  const reports: StatusReport[] = [];
  const reportVersions: ReportVersion[] = [];
  const milestones: MilestoneRecord[] = [];
  const baselines: BaselineRecord[] = [];
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
      const index = memberships.findIndex((row) => row.customerId === membership.customerId && row.userId === membership.userId);
      if (index >= 0) memberships[index] = membership;
      else memberships.push(membership);
    },
    async deleteMembership(customerId, userId) {
      const index = memberships.findIndex((row) => row.customerId === customerId && row.userId === userId);
      if (index >= 0) memberships.splice(index, 1);
    },
    async listMembershipsForUser(userId) {
      return memberships.filter((membership) => membership.userId === userId);
    },
    async listMembershipsForCustomer(customerId) {
      return memberships.filter((membership) => membership.customerId === customerId);
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
    async getOverview(projectId) {
      return overviews.find((overview) => overview.projectId === projectId) ?? null;
    },
    async putOverview(overview) {
      const index = overviews.findIndex((item) => item.projectId === overview.projectId);
      if (index >= 0) overviews[index] = overview;
      else overviews.push(overview);
    },
    async createDocument(document) {
      documents.push(document);
    },
    async putDocument(document) {
      const index = documents.findIndex((item) => item.documentId === document.documentId);
      if (index >= 0) documents[index] = document;
      else documents.push(document);
    },
    async getDocument(documentId) {
      return documents.find((document) => document.documentId === documentId) ?? null;
    },
    async listFolders(projectId) {
      return folders.filter((folder) => folder.projectId === projectId);
    },
    async putFolder(folder) {
      const index = folders.findIndex((item) => item.projectId === folder.projectId && item.path === folder.path);
      if (index >= 0) folders[index] = folder;
      else folders.push(folder);
    },
    async deleteFolder(projectId, path) {
      const index = folders.findIndex((folder) => folder.projectId === projectId && folder.path === path);
      if (index >= 0) folders.splice(index, 1);
    },
    async listDocuments(projectId) {
      return documents.filter((document) => document.projectId === projectId);
    },
    async putVersion(version) {
      const index = versions.findIndex((item) => item.versionId === version.versionId);
      if (index >= 0) versions[index] = version;
      else versions.push(version);
    },
    async getVersion(documentId, versionId) {
      return versions.find((version) => version.documentId === documentId && version.versionId === versionId) ?? null;
    },
    async listVersions(documentId) {
      return versions.filter((version) => version.documentId === documentId);
    },
    async getSettings(projectId) {
      return settings.find((item) => item.projectId === projectId) ?? null;
    },
    async putSettings(item) {
      const index = settings.findIndex((current) => current.projectId === item.projectId);
      if (index >= 0) settings[index] = item;
      else settings.push(item);
    },
    async listSettings() {
      return settings;
    },
    async getIssue(projectId, issueId) {
      return issues.find((issue) => issue.projectId === projectId && issue.issueId === issueId) ?? null;
    },
    async putIssue(issue) {
      const index = issues.findIndex((item) => item.issueId === issue.issueId && item.projectId === issue.projectId);
      if (index >= 0) issues[index] = issue;
      else issues.push(issue);
    },
    async listIssues(projectId) {
      return issues.filter((issue) => issue.projectId === projectId);
    },
    async getOverride(projectId) {
      return overrides.find((item) => item.projectId === projectId) ?? null;
    },
    async putOverride(override) {
      const index = overrides.findIndex((item) => item.projectId === override.projectId);
      if (index >= 0) overrides[index] = override;
      else overrides.push(override);
    },
    async getSync(projectId) {
      return syncs.find((item) => item.projectId === projectId) ?? null;
    },
    async putSync(state) {
      const index = syncs.findIndex((item) => item.projectId === state.projectId);
      if (index >= 0) syncs[index] = state;
      else syncs.push(state);
    },
    async claimDelivery(deliveryId) {
      if (deliveries.includes(deliveryId)) return false;
      deliveries.push(deliveryId);
      return true;
    },
    async createReport(report) {
      reports.push(report);
    },
    async putReport(report) {
      const index = reports.findIndex((item) => item.reportId === report.reportId);
      if (index >= 0) reports[index] = report;
      else reports.push(report);
    },
    async getReport(reportId) {
      return reports.find((report) => report.reportId === reportId) ?? null;
    },
    async listReports(projectId) {
      return reports.filter((report) => report.projectId === projectId);
    },
    async putReportVersion(version) {
      reportVersions.push(version);
    },
    async listReportVersions(reportId) {
      return reportVersions.filter((version) => version.reportId === reportId);
    },
    async listMilestones(projectId) {
      return milestones.filter((record) => record.projectId === projectId);
    },
    async putMilestone(record) {
      const index = milestones.findIndex((item) => item.projectId === record.projectId && item.milestoneKey === record.milestoneKey);
      if (index >= 0) milestones[index] = record;
      else milestones.push(record);
    },
    async listBaselines(projectId) {
      return baselines.filter((record) => record.projectId === projectId);
    },
    async putBaseline(record) {
      const index = baselines.findIndex((item) => item.baselineId === record.baselineId);
      if (index >= 0) baselines[index] = record;
      else baselines.push(record);
    },
    documents,
    folders,
    versions,
    overviews,
    settings,
    issues,
    overrides,
    syncs,
    deliveries,
    reports,
    reportVersions,
    milestones,
    baselines,
  };
}

function fakeJwt(payload: Record<string, unknown>): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;
}

function event(partial: {
  method: string;
  path: string;
  claims?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string>;
}): HttpEvent {
  return {
    rawPath: partial.path,
    body: partial.body === undefined ? null : JSON.stringify(partial.body),
    headers: partial.headers,
    queryStringParameters: partial.query,
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

const queued: unknown[] = [];

function handlerFor(store: Store, extras: Partial<Pick<HandlerDeps, "inviteUser" | "disableLogin">> = {}) {
  let n = 0;
  return createHandler({
    store,
    inviteUser: async () => ({ userId: "user-a" }),
    disableLogin: async () => undefined,
    newId: () => `id-${++n}`,
    now: () => new Date("2026-10-24T12:00:00.000Z"),
    maxUploadBytes: 100,
    signUpload: async (objectKey) => `https://files.example/upload/${objectKey}`,
    signDownload: async (objectKey) => `https://files.example/download/${objectKey}`,
    enqueue: async (message) => {
      queued.push(message);
    },
    githubConfigured: false,
    webhookSecret: "test-secret",
    listAdminUserIds: async () => ["admin-1"],
    ...extras,
  });
}

describe("api router", () => {
  it("accepts MFA recorded in the token when the authorizer omits it", async () => {
    const token = fakeJwt({ amr: ["authenticated", "mfa"] });
    const response = await handlerFor(memoryStore())(
      event({
        method: "GET",
        path: "/admin/customers",
        claims: { sub: "admin-1", "cognito:groups": "one80-admin" },
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(response.statusCode).toBe(200);
  });

  it("returns 401 when the token is missing", async () => {
    const response = await handlerFor(memoryStore())(event({ method: "GET", path: "/projects/id-1" }));
    expect(response.statusCode).toBe(401);
    expect(JSON.parse(response.body).code).toBe("UNAUTHORIZED");
  });

  it("creates a customer from an administrator ID token that has no amr claim", async () => {
    const response = await handlerFor(memoryStore())(
      event({ method: "POST", path: "/admin/customers", claims: adminNoMfa, body: { name: "Acme" } }),
    );
    expect(response.statusCode).toBe(201);
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
    const again = await handler(
      event({
        method: "POST",
        path: `/admin/projects/${project.projectId}/applications`,
        claims: adminClaims,
        body: { moduleKey: "overview", displayName: "Overview" },
      }),
    );
    expect(again.statusCode).toBe(200);
    expect(store.applications.filter((item) => item.moduleKey === "overview")).toHaveLength(1);
    expect(store.audits.map((row) => row.action)).toEqual([
      "customer.created",
      "project.created",
      "member.invited",
      "application.enabled",
    ]);

    const members = await handler(event({ method: "GET", path: "/admin/members", claims: adminClaims }));
    expect(members.statusCode).toBe(200);
    expect(JSON.parse(members.body).members).toEqual([
      {
        userId: "user-a",
        email: "ada@example.com",
        name: "",
        customerId,
        customerName: "Acme",
        access: "Contributor",
        allProjects: true,
        projects: [{ projectId: project.projectId, name: "Bridge" }],
        customerProjects: [{ projectId: project.projectId, name: "Bridge" }],
      },
    ]);
    const hidden = await handler(event({ method: "GET", path: "/admin/members", claims: employeeClaims }));
    expect(hidden.statusCode).toBe(403);
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
      name: "",
      role: "contributor",
      createdAt: "2026-10-24T12:00:00.000Z",
      projectIds: null,
    });
    const allowed = await handler(event({ method: "GET", path: `/projects/${projectId}`, claims: employeeClaims }));
    expect(allowed.statusCode).toBe(200);
    expect(JSON.parse(allowed.body).name).toBe("Bridge");
    const named = await handler(event({ method: "GET", path: `/customers/${customerId}`, claims: employeeClaims }));
    expect(JSON.parse(named.body).name).toBe("Acme");
    const hiddenCustomer = await handler(event({ method: "GET", path: `/customers/${customerId}`, claims: { ...employeeClaims, sub: "user-b" } }));
    expect(hiddenCustomer.statusCode).toBe(404);
  });

  it("records overview health and notes for a member", async () => {
    const store = memoryStore();
    const handler = handlerFor(store);
    const projectId = await seedProject(handler, store);
    const saved = await handler(
      event({
        method: "PUT",
        path: `/projects/${projectId}/overview`,
        claims: employeeClaims,
        body: { health: "yellow", healthExplanation: "Waiting on a vendor", notes: "Kickoff is Thursday." },
      }),
    );
    expect(saved.statusCode).toBe(200);
    expect(store.audits.some((row) => row.action === "overview.updated" && row.projectId === projectId)).toBe(true);
    store.issues.push({
      issueId: "I_mile",
      itemId: null,
      projectId,
      customerId: store.projects[0].customerId,
      number: 2,
      title: "Deck",
      status: "Todo",
      effort: 1,
      issueState: "open",
      archived: false,
      deletedAt: null,
      parentIssueId: null,
      milestone: "Phase 1",
      milestoneId: null,
      milestoneDueOn: null,
      startDate: null,
      finishDate: null,
      predecessorIds: [],
      issueType: null,
      description: null,
      iterationTitle: null,
      iterationStart: null,
      iterationDuration: null,
      iterationId: null,
      assignees: [],
      comments: null,
      inProject: true,
      updatedAt: "2026-10-24T12:00:00.000Z",
    });
    store.reportVersions.push({
      versionId: "ver-1",
      reportId: "rpt-1",
      projectId,
      customerId: store.projects[0].customerId,
      title: "Week 1",
      body: "Published copy",
      publishedAt: "2026-10-24T15:00:00.000Z",
      publishedBy: "user-1",
    });
    store.reports.push({
      reportId: "rpt-1",
      projectId,
      customerId: store.projects[0].customerId,
      title: "Week 1 draft",
      body: "Working copy",
      status: "draft",
      updatedAt: "2026-10-24T16:00:00.000Z",
      createdAt: "2026-10-24T12:00:00.000Z",
    });
    const loaded = await handler(event({ method: "GET", path: `/projects/${projectId}/overview`, claims: employeeClaims }));
    const body = JSON.parse(loaded.body) as { overview: { health: string }; milestones: string[]; publishedReport: { title: string } };
    expect(body.overview.health).toBe("yellow");
    expect(body.milestones).toEqual([expect.objectContaining({ title: "Phase 1", state: "open", workOpen: true })]);
    expect(body.publishedReport.title).toBe("Week 1");
    const hidden = await handler(event({ method: "GET", path: `/projects/${projectId}/overview`, claims: { ...employeeClaims, sub: "user-b" } }));
    expect(hidden.statusCode).toBe(404);
  });

  it("versions a document without removing the previous file and restores it unchanged", async () => {
    const store = memoryStore();
    const handler = handlerFor(store);
    const projectId = await seedProject(handler, store);
    const tooBig = await handler(
      event({
        method: "POST",
        path: `/projects/${projectId}/documents`,
        claims: employeeClaims,
        body: { name: "Plan", fileName: "plan.pdf", contentType: "application/pdf", sizeBytes: 101 },
      }),
    );
    expect(tooBig.statusCode).toBe(400);

    const created = await handler(
      event({
        method: "POST",
        path: `/projects/${projectId}/documents`,
        claims: employeeClaims,
        body: { name: "Plan", folder: "Specs", fileName: "plan.pdf", contentType: "application/pdf", sizeBytes: 10 },
      }),
    );
    expect(created.statusCode).toBe(201);
    const first = JSON.parse(created.body) as { documentId: string; versionId: string; uploadUrl: string };
    expect(first.uploadUrl).toContain(first.versionId);
    expect(first.uploadUrl).toContain(`customers/${store.projects[0].customerId}/`);
    await handler(
      event({
        method: "POST",
        path: `/projects/${projectId}/documents/${first.documentId}/versions/${first.versionId}/complete`,
        claims: employeeClaims,
      }),
    );

    const added = await handler(
      event({
        method: "POST",
        path: `/projects/${projectId}/documents/${first.documentId}/versions`,
        claims: employeeClaims,
        body: { fileName: "plan-v2.pdf", contentType: "application/pdf", sizeBytes: 12 },
      }),
    );
    const second = JSON.parse(added.body) as { versionId: string };
    const completed = await handler(
      event({
        method: "POST",
        path: `/projects/${projectId}/documents/${first.documentId}/versions/${second.versionId}/complete`,
        claims: employeeClaims,
      }),
    );
    expect(JSON.parse(completed.body).currentVersionId).toBe(second.versionId);
    const versions = await handler(
      event({ method: "GET", path: `/projects/${projectId}/documents/${first.documentId}/versions`, claims: employeeClaims }),
    );
    expect(JSON.parse(versions.body).versions).toHaveLength(2);

    await handler(
      event({ method: "POST", path: `/projects/${projectId}/documents/${first.documentId}/delete`, claims: employeeClaims, body: {} }),
    );
    const active = await handler(event({ method: "GET", path: `/projects/${projectId}/documents`, claims: employeeClaims }));
    expect(JSON.parse(active.body).documents).toHaveLength(0);
    const restored = await handler(
      event({
        method: "POST",
        path: `/projects/${projectId}/documents/${first.documentId}/restore`,
        claims: employeeClaims,
        body: { explanation: "Removed by mistake" },
      }),
    );
    expect(JSON.parse(restored.body).currentVersionId).toBe(second.versionId);

    const library = await handler(event({ method: "GET", path: `/projects/${projectId}/documents`, claims: employeeClaims }));
    expect(JSON.parse(library.body).folders.map((folder: { path: string }) => folder.path)).toEqual(["Specs"]);
    const made = await handler(
      event({ method: "POST", path: `/projects/${projectId}/folders`, claims: employeeClaims, body: { name: "Drafts", parent: "Specs" } }),
    );
    expect(made.statusCode).toBe(201);
    const moved = await handler(
      event({
        method: "PATCH",
        path: `/projects/${projectId}/documents/${first.documentId}`,
        claims: employeeClaims,
        body: { folder: "Specs/Drafts" },
      }),
    );
    expect(moved.statusCode).toBe(200);
    expect(store.documents[0].folder).toBe("Specs/Drafts");
    const blocked = await handler(
      event({ method: "POST", path: `/projects/${projectId}/folders/delete`, claims: employeeClaims, body: { path: "Specs/Drafts" } }),
    );
    expect(blocked.statusCode).toBe(409);
    const removed = await handler(
      event({ method: "POST", path: `/projects/${projectId}/folders`, claims: employeeClaims, body: { name: "Empty", parent: "" } }),
    );
    expect(removed.statusCode).toBe(201);
    const gone = await handler(
      event({ method: "POST", path: `/projects/${projectId}/folders/delete`, claims: employeeClaims, body: { path: "Empty" } }),
    );
    expect(gone.statusCode).toBe(200);
    expect(store.folders.map((folder) => folder.path)).toEqual(["Specs/Drafts"]);
    const foreign = await handler(
      event({ method: "GET", path: `/projects/${projectId}/documents/${first.documentId}/download`, claims: { ...employeeClaims, sub: "user-b" } }),
    );
    expect(foreign.statusCode).toBe(404);
  });

  it("updates an employee name, email, and project list", async () => {
    const store = memoryStore();
    const disabled: string[] = [];
    const handler = handlerFor(store, {
      inviteUser: async (email) => ({ userId: email === "ada@example.com" ? "user-a" : "user-b" }),
      disableLogin: async (email) => {
        disabled.push(email);
      },
    });
    await handler(event({ method: "POST", path: "/admin/customers", claims: adminClaims, body: { name: "Acme" } }));
    const customerId = store.customers[0].customerId;
    await handler(event({ method: "POST", path: `/admin/customers/${customerId}/projects`, claims: adminClaims, body: { name: "Bridge" } }));
    await handler(event({ method: "POST", path: `/admin/customers/${customerId}/projects`, claims: adminClaims, body: { name: "Harbor" } }));
    await handler(event({ method: "POST", path: `/admin/customers/${customerId}/invitations`, claims: adminClaims, body: { email: "ada@example.com" } }));
    const bridge = store.projects[0].projectId;
    const harbor = store.projects[1].projectId;

    const saved = await handler(
      event({
        method: "PATCH",
        path: `/admin/customers/${customerId}/members/user-a`,
        claims: adminClaims,
        body: { name: "Ada Lovelace", email: "ada@example.com", projectIds: [bridge] },
      }),
    );
    expect(saved.statusCode).toBe(200);
    expect(JSON.parse(saved.body)).toMatchObject({ name: "Ada Lovelace", allProjects: false, projects: [{ projectId: bridge, name: "Bridge" }] });
    const hidden = await handler(event({ method: "GET", path: `/projects/${harbor}`, claims: employeeClaims }));
    expect(hidden.statusCode).toBe(404);
    const open = await handler(event({ method: "GET", path: `/projects/${bridge}`, claims: employeeClaims }));
    expect(open.statusCode).toBe(200);

    const moved = await handler(
      event({
        method: "PATCH",
        path: `/admin/customers/${customerId}/members/user-a`,
        claims: adminClaims,
        body: { name: "Ada Lovelace", email: "ada.new@example.com", projectIds: null },
      }),
    );
    expect(moved.statusCode).toBe(200);
    expect(JSON.parse(moved.body).userId).toBe("user-b");
    expect(store.memberships.map((membership) => membership.userId)).toEqual(["user-b"]);
    expect(disabled).toEqual(["ada@example.com"]);

    const refused = await handler(
      event({
        method: "PATCH",
        path: `/admin/customers/${customerId}/members/user-b`,
        claims: employeeClaims,
        body: { name: "Ada Lovelace", email: "ada.new@example.com", projectIds: null },
      }),
    );
    expect(refused.statusCode).toBe(403);

    store.memberships.push({
      customerId,
      userId: "admin-1",
      email: "nick@one80labs.com",
      name: "Nick",
      role: "contributor",
      createdAt: "2026-10-24T12:00:00.000Z",
      projectIds: null,
    });
    const adminEmail = await handler(
      event({
        method: "PATCH",
        path: `/admin/customers/${customerId}/members/admin-1`,
        claims: adminClaims,
        body: { name: "Nick Kramer", email: "other@one80labs.com", projectIds: null },
      }),
    );
    expect(adminEmail.statusCode).toBe(400);
  });

  it("sets view access and keeps reading open", async () => {
    const store = memoryStore();
    const handler = handlerFor(store);
    const projectId = await seedProject(handler, store);
    const saved = await handler(
      event({
        method: "PATCH",
        path: `/admin/customers/${store.projects[0].customerId}/members/user-a`,
        claims: adminClaims,
        body: { name: "Ada", email: "ada@example.com", projectIds: null, access: "View" },
      }),
    );
    expect(saved.statusCode).toBe(200);
    expect(JSON.parse(saved.body).access).toBe("View");
    expect(store.memberships[0].role).toBe("view");

    const open = await handler(event({ method: "GET", path: `/projects/${projectId}/plan`, claims: employeeClaims }));
    expect(open.statusCode).toBe(200);
    const upload = await handler(
      event({
        method: "POST",
        path: `/projects/${projectId}/documents`,
        claims: employeeClaims,
        body: { name: "Notes", fileName: "notes.txt", contentType: "text/plain", sizeBytes: 12 },
      }),
    );
    expect(upload.statusCode).toBe(403);
    expect(JSON.parse(upload.body).code).toBe("VIEW_ONLY");
    const issue = await handler(event({ method: "PATCH", path: `/projects/${projectId}/issues/missing`, claims: employeeClaims, body: { title: "Changed" } }));
    expect(issue.statusCode).toBe(403);
    const report = await handler(event({ method: "POST", path: `/projects/${projectId}/reports`, claims: employeeClaims, body: { title: "Week", body: "Notes" } }));
    expect(report.statusCode).toBe(403);
    const overview = await handler(event({ method: "PUT", path: `/projects/${projectId}/overview`, claims: employeeClaims, body: { notes: "No" } }));
    expect(overview.statusCode).toBe(403);
    const invalid = await handler(
      event({
        method: "PATCH",
        path: `/admin/customers/${store.projects[0].customerId}/members/user-a`,
        claims: adminClaims,
        body: { name: "Ada", email: "ada@example.com", projectIds: null, access: "Owner" },
      }),
    );
    expect(invalid.statusCode).toBe(400);
  });
});

async function seedProject(handler: (event: HttpEvent) => Promise<{ statusCode: number; body: string }>, store: ReturnType<typeof memoryStore>) {
  await handler(event({ method: "POST", path: "/admin/customers", claims: adminClaims, body: { name: "Acme" } }));
  const customerId = store.customers[0].customerId;
  await handler(event({ method: "POST", path: `/admin/customers/${customerId}/projects`, claims: adminClaims, body: { name: "Bridge" } }));
  store.memberships.push({
    customerId,
    userId: "user-a",
    email: "ada@example.com",
    name: "",
    role: "contributor",
    createdAt: "2026-10-24T12:00:00.000Z",
    projectIds: null,
  });
  return store.projects[0].projectId;
}

describe("plan and webhooks", () => {
  it("rejects a progress override without an explanation and records one with the calculated value", async () => {
    const store = memoryStore();
    const handler = handlerFor(store);
    const projectId = await seedProject(handler, store);
    store.issues.push({
      issueId: "I_1",
      itemId: null,
      projectId,
      customerId: store.projects[0].customerId,
      number: 1,
      title: "Pour footing",
      status: "Done",
      effort: 1,
      issueState: "open",
      archived: false,
      deletedAt: null,
      parentIssueId: null,
      milestone: "Phase 1",
      milestoneId: null,
      milestoneDueOn: null,
      startDate: null,
      finishDate: null,
      predecessorIds: [],
      issueType: null,
      description: null,
      iterationTitle: null,
      iterationStart: null,
      iterationDuration: null,
      iterationId: null,
      assignees: [],
      comments: null,
      inProject: true,
      updatedAt: "2026-10-24T12:00:00.000Z",
    });
    const missing = await handler(event({ method: "POST", path: `/projects/${projectId}/progress-override`, claims: employeeClaims, body: { percent: 80 } }));
    expect(missing.statusCode).toBe(400);
    const saved = await handler(
      event({
        method: "POST",
        path: `/projects/${projectId}/progress-override`,
        claims: employeeClaims,
        body: { percent: 80, explanation: "Field work is ahead of the board." },
      }),
    );
    expect(saved.statusCode).toBe(200);
    expect(JSON.parse(saved.body).override.calculatedPercent).toBe(100);
    expect(store.audits.some((row) => row.action === "progress.overridden")).toBe(true);
    const hidden = await handler(event({ method: "GET", path: `/projects/${projectId}/plan`, claims: { ...employeeClaims, sub: "user-b" } }));
    expect(hidden.statusCode).toBe(404);
  });

  it("refuses to mark a parent Done while a task under it is open", async () => {
    const store = memoryStore();
    const handler = handlerFor(store);
    const projectId = await seedProject(handler, store);
    const customerId = store.projects[0].customerId;
    const base = {
      itemId: null,
      projectId,
      customerId,
      effort: 1,
      issueState: "open" as const,
      archived: false,
      deletedAt: null,
      milestone: null,
      milestoneId: null,
      milestoneDueOn: null,
      startDate: null,
      finishDate: null,
      predecessorIds: [],
      issueType: null,
      description: null,
      iterationTitle: null,
      iterationStart: null,
      iterationDuration: null,
      iterationId: null,
      assignees: [],
      comments: null,
      inProject: true,
      updatedAt: "2026-10-26T12:00:00.000Z",
    };
    store.issues.push(
      { ...base, issueId: "I_parent", number: 1, title: "Parent", status: "Ready", parentIssueId: null },
      { ...base, issueId: "I_child", number: 2, title: "Child", status: "Ready", parentIssueId: "I_parent" },
    );
    const refused = await handler(
      event({ method: "PATCH", path: `/projects/${projectId}/issues/I_parent`, claims: employeeClaims, body: { status: "Done" } }),
    );
    expect(refused.statusCode).toBe(409);
    expect(JSON.parse(refused.body).code).toBe("PARENT_INCOMPLETE");
    store.issues[1].status = "Done";
    const leaf = await handler(
      event({ method: "PATCH", path: `/projects/${projectId}/issues/I_parent`, claims: employeeClaims, body: { status: "Done" } }),
    );
    expect(JSON.parse(leaf.body).code).toBe("SYNC_NOT_CONFIGURED");
  });

  it("rejects a finish date before the start and refuses dates until GitHub has Start and Finish fields", async () => {
    const store = memoryStore();
    const handler = handlerFor(store);
    const projectId = await seedProject(handler, store);
    store.issues.push({
      issueId: "I_date",
      itemId: null,
      projectId,
      customerId: store.projects[0].customerId,
      number: 4,
      title: "Deck",
      status: "Ready",
      effort: 1,
      issueState: "open",
      archived: false,
      deletedAt: null,
      parentIssueId: null,
      milestone: null,
      milestoneId: null,
      milestoneDueOn: null,
      startDate: null,
      finishDate: null,
      predecessorIds: [],
      issueType: null,
      description: null,
      iterationTitle: null,
      iterationStart: null,
      iterationDuration: null,
      iterationId: null,
      assignees: [],
      comments: null,
      inProject: true,
      updatedAt: "2026-10-26T12:00:00.000Z",
    });
    const order = await handler(
      event({
        method: "PATCH",
        path: `/projects/${projectId}/issues/I_date`,
        claims: employeeClaims,
        body: { startDate: "2026-11-02", finishDate: "2026-10-01" },
      }),
    );
    expect(order.statusCode).toBe(400);
    const missing = await handler(
      event({
        method: "PATCH",
        path: `/projects/${projectId}/issues/I_date`,
        claims: employeeClaims,
        body: { startDate: "2026-10-26", finishDate: "2026-11-02" },
      }),
    );
    expect(missing.statusCode).toBe(409);
    expect(JSON.parse(missing.body).code).toBe("DATES_NOT_CONFIGURED");
  });

  it("refuses an Epic without a Workstream and a Feature whose parent is not an Epic", async () => {
    const store = memoryStore();
    const handler = handlerFor(store);
    const projectId = await seedProject(handler, store);
    await handler(
      event({
        method: "PUT",
        path: `/projects/${projectId}/github`,
        claims: adminClaims,
        body: { owner: "One80Labs", repo: "one80compass", projectNumber: 1 },
      }),
    );
    const missing = await handler(
      event({ method: "POST", path: `/projects/${projectId}/plan-items`, claims: employeeClaims, body: { kind: "epic", title: "Billing" } }),
    );
    expect(JSON.parse(missing.body).code).toBe("WORKSTREAM_NOT_SET");
    await handler(
      event({
        method: "PUT",
        path: `/projects/${projectId}/github`,
        claims: adminClaims,
        body: { owner: "One80Labs", repo: "one80compass", projectNumber: 1, workstreamNumber: 10 },
      }),
    );
    const queued = await handler(
      event({ method: "POST", path: `/projects/${projectId}/plan-items`, claims: employeeClaims, body: { kind: "epic", title: "Billing" } }),
    );
    expect(JSON.parse(queued.body).code).toBe("SYNC_NOT_CONFIGURED");
    const customerId = store.projects[0].customerId;
    store.issues.push({
      issueId: "I_epic",
      itemId: null,
      projectId,
      customerId,
      number: 11,
      title: "Billing",
      status: "Ready",
      effort: null,
      issueState: "open",
      archived: false,
      deletedAt: null,
      parentIssueId: null,
      issueType: "Epic",
      description: null,
      iterationTitle: null,
      iterationStart: null,
      iterationDuration: null,
      iterationId: null,
      assignees: [],
      comments: null,
      milestone: null,
      milestoneId: null,
      milestoneDueOn: null,
      startDate: null,
      finishDate: null,
      predecessorIds: [],
      inProject: true,
      updatedAt: "2026-10-26T12:00:00.000Z",
    });
    const feature = await handler(
      event({
        method: "POST",
        path: `/projects/${projectId}/plan-items`,
        claims: employeeClaims,
        body: { kind: "feature", title: "Payments", parentIssueId: "I_missing" },
      }),
    );
    expect(feature.statusCode).toBe(404);
    const wrong = await handler(
      event({
        method: "POST",
        path: `/projects/${projectId}/plan-items`,
        claims: employeeClaims,
        body: { kind: "subissue", title: "Charge", parentIssueId: "I_epic" },
      }),
    );
    expect(JSON.parse(wrong.body).code).toBe("PARENT_REQUIRED");
  });

  it("asks for approval before a date change moves a later task and refuses a dependency loop", async () => {
    const store = memoryStore();
    const handler = handlerFor(store);
    const projectId = await seedProject(handler, store);
    const customerId = store.projects[0].customerId;
    store.settings.push({
      projectId,
      customerId,
      owner: "One80Labs",
      repo: "one80compass",
      projectNumber: 1,
      projectNodeId: "PVT_1",
      statusFieldName: "Status",
      effortFieldName: "Effort",
      statusFieldId: null,
      effortFieldId: null,
      startFieldName: "Start",
      finishFieldName: "Finish",
      startFieldId: "start",
      finishFieldId: "finish",
      statusOptions: [],
      doneStatuses: ["Done"],
      columns: ["Ready", "Done"],
      workstreamNumber: null,
      iterationFieldId: null,
      iterations: [],
      commentsFieldId: null,
      assignableUsers: [],
    });
    const base = {
      itemId: null,
      projectId,
      customerId,
      effort: 1,
      issueState: "open" as const,
      archived: false,
      deletedAt: null,
      parentIssueId: null,
      issueType: null,
      description: null,
      iterationTitle: null,
      iterationStart: null,
      iterationDuration: null,
      iterationId: null,
      assignees: [],
      comments: null,
      milestone: null,
      milestoneId: null,
      milestoneDueOn: null,
      inProject: true,
      updatedAt: "2026-10-26T12:00:00.000Z",
    };
    store.issues.push(
      { ...base, issueId: "A", number: 1, title: "Deck", status: "Ready", startDate: "2026-10-01", finishDate: "2026-10-05", predecessorIds: [] },
      { ...base, issueId: "B", number: 2, title: "Rail", status: "Ready", startDate: "2026-10-06", finishDate: "2026-10-08", predecessorIds: ["A"] },
    );
    const review = await handler(
      event({
        method: "PATCH",
        path: `/projects/${projectId}/issues/A`,
        claims: employeeClaims,
        body: { startDate: "2026-10-01", finishDate: "2026-10-10" },
      }),
    );
    expect(review.statusCode).toBe(409);
    const body = JSON.parse(review.body) as { code: string; proposals: { toStart: string; toFinish: string }[] };
    expect(body.code).toBe("DEPENDENCY_REVIEW");
    expect(body.proposals[0]).toMatchObject({ toStart: "2026-10-11", toFinish: "2026-10-13" });
    const loop = await handler(
      event({ method: "POST", path: `/projects/${projectId}/issues/A/predecessors`, claims: employeeClaims, body: { predecessorId: "B" } }),
    );
    expect(loop.statusCode).toBe(409);
    expect(JSON.parse(loop.body).code).toBe("DEPENDENCY_CYCLE");
    const kept = await handler(
      event({
        method: "PATCH",
        path: `/projects/${projectId}/issues/A`,
        claims: employeeClaims,
        body: { startDate: "2026-10-01", finishDate: "2026-10-10", dependencyDecision: "reject" },
      }),
    );
    expect(JSON.parse(kept.body).code).toBe("SYNC_NOT_CONFIGURED");
  });

  it("confirms a milestone when every task on it is Done and requires an explanation to reopen it", async () => {
    const store = memoryStore();
    const handler = handlerFor(store);
    const projectId = await seedProject(handler, store);
    const customerId = store.projects[0].customerId;
    store.issues.push({
      issueId: "I_mile",
      itemId: null,
      projectId,
      customerId,
      number: 3,
      title: "Deck",
      status: "Ready",
      effort: 1,
      issueState: "open",
      archived: false,
      deletedAt: null,
      parentIssueId: null,
      milestone: "Phase 1",
      milestoneId: "M_1",
      milestoneDueOn: "2026-10-01",
      startDate: null,
      finishDate: null,
      predecessorIds: [],
      issueType: null,
      description: null,
      iterationTitle: null,
      iterationStart: null,
      iterationDuration: null,
      iterationId: null,
      assignees: [],
      comments: null,
      inProject: true,
      updatedAt: "2026-10-24T12:00:00.000Z",
    });
    const early = await handler(event({ method: "POST", path: `/projects/${projectId}/milestones/M_1/confirm`, claims: employeeClaims, body: {} }));
    expect(early.statusCode).toBe(409);
    store.issues[0].status = "Done";
    const confirmed = await handler(event({ method: "POST", path: `/projects/${projectId}/milestones/M_1/confirm`, claims: employeeClaims, body: {} }));
    expect(confirmed.statusCode).toBe(200);
    expect(JSON.parse(confirmed.body).milestone.state).toBe("confirmed");
    expect(JSON.parse(confirmed.body).milestone.late).toBe(false);
    const missing = await handler(event({ method: "POST", path: `/projects/${projectId}/milestones/M_1/reopen`, claims: employeeClaims, body: {} }));
    expect(missing.statusCode).toBe(400);
    const reopened = await handler(
      event({
        method: "POST",
        path: `/projects/${projectId}/milestones/M_1/reopen`,
        claims: employeeClaims,
        body: { explanation: "The deck measurement was wrong." },
      }),
    );
    expect(reopened.statusCode).toBe(200);
    expect(JSON.parse(reopened.body).milestone.state).toBe("ready");
    expect(store.milestones[0].history.map((event) => event.action)).toEqual(["confirmed", "reopened"]);
    expect(store.audits.some((row) => row.action === "milestone.reopened")).toBe(true);
  });

  it("lets an administrator set Baseline 1 and approve a later proposal without rewriting its tasks", async () => {
    const store = memoryStore();
    const handler = handlerFor(store);
    const projectId = await seedProject(handler, store);
    const customerId = store.projects[0].customerId;
    store.issues.push({
      issueId: "I_open",
      itemId: null,
      projectId,
      customerId,
      number: 1,
      title: "Deck",
      status: "Ready",
      effort: 1,
      issueState: "open",
      archived: false,
      deletedAt: null,
      parentIssueId: null,
      milestone: null,
      milestoneId: null,
      milestoneDueOn: null,
      startDate: null,
      finishDate: null,
      predecessorIds: [],
      issueType: null,
      description: null,
      iterationTitle: null,
      iterationStart: null,
      iterationDuration: null,
      iterationId: null,
      assignees: [],
      comments: null,
      inProject: true,
      updatedAt: "2026-10-26T12:00:00.000Z",
    });
    const blocked = await handler(event({ method: "POST", path: `/projects/${projectId}/baselines`, claims: employeeClaims, body: { explanation: "First cut." } }));
    expect(blocked.statusCode).toBe(403);
    const first = await handler(event({ method: "POST", path: `/projects/${projectId}/baselines`, claims: adminClaims, body: { explanation: "Reviewed with the team." } }));
    expect(first.statusCode).toBe(200);
    const baseline1 = JSON.parse(first.body).baseline as { number: number; state: string; tasks: { startDate: string | null }[] };
    expect(baseline1).toMatchObject({ number: 1, state: "approved" });
    expect(baseline1.tasks[0].startDate).toBeNull();
    const proposed = await handler(event({ method: "POST", path: `/projects/${projectId}/baselines`, claims: employeeClaims, body: { explanation: "Dates are in." } }));
    expect(proposed.statusCode).toBe(200);
    const proposal = JSON.parse(proposed.body).baseline as { baselineId: string; state: string; tasks: { title: string }[] };
    expect(proposal.state).toBe("proposed");
    const employeeDecision = await handler(
      event({ method: "POST", path: `/projects/${projectId}/baselines/${proposal.baselineId}/approve`, claims: employeeClaims, body: {} }),
    );
    expect(employeeDecision.statusCode).toBe(403);
    const approved = await handler(
      event({ method: "POST", path: `/projects/${projectId}/baselines/${proposal.baselineId}/approve`, claims: adminClaims, body: {} }),
    );
    expect(approved.statusCode).toBe(200);
    const baseline2 = JSON.parse(approved.body).baseline as { number: number; tasks: { title: string }[] };
    expect(baseline2.number).toBe(2);
    expect(baseline2.tasks).toEqual(proposal.tasks);
    const again = await handler(event({ method: "POST", path: `/projects/${projectId}/baselines`, claims: employeeClaims, body: { explanation: "One more." } }));
    const openId = JSON.parse(again.body).baseline.baselineId as string;
    const missingReason = await handler(event({ method: "POST", path: `/projects/${projectId}/baselines/${openId}/reject`, claims: adminClaims, body: {} }));
    expect(missingReason.statusCode).toBe(400);
    const rejected = await handler(
      event({ method: "POST", path: `/projects/${projectId}/baselines/${openId}/reject`, claims: adminClaims, body: { explanation: "The dates are still moving." } }),
    );
    expect(JSON.parse(rejected.body).baseline.state).toBe("rejected");
    expect(store.audits.some((row) => row.action === "baseline.established")).toBe(true);
  });

  it("rejects an unsigned webhook and queues a signed one", async () => {
    queued.length = 0;
    const handler = handlerFor(memoryStore());
    const unsigned = await handler(event({ method: "POST", path: "/webhooks/github", body: { zen: "keep" }, headers: {} }));
    expect(unsigned.statusCode).toBe(401);
    const raw = JSON.stringify({ zen: "keep" });
    const signature = `sha256=${createHmac("sha256", "test-secret").update(raw).digest("hex")}`;
    const signed = await handler(
      event({
        method: "POST",
        path: "/webhooks/github",
        body: { zen: "keep" },
        headers: { "x-hub-signature-256": signature, "x-github-delivery": "del-1", "x-github-event": "ping" },
      }),
    );
    expect(signed.statusCode).toBe(202);
    expect(queued).toHaveLength(1);
  });

  it("publishes an approved report without changing the published copy", async () => {
    const store = memoryStore();
    const handler = handlerFor(store);
    const projectId = await seedProject(handler, store);
    const created = await handler(
      event({ method: "POST", path: `/projects/${projectId}/reports`, claims: employeeClaims, body: { title: "Week 1", body: "Kickoff is done." } }),
    );
    expect(created.statusCode).toBe(201);
    const reportId = JSON.parse(created.body).reportId as string;
    const early = await handler(event({ method: "POST", path: `/projects/${projectId}/reports/${reportId}/publish`, claims: employeeClaims }));
    expect(early.statusCode).toBe(409);
    await handler(event({ method: "POST", path: `/projects/${projectId}/reports/${reportId}/submit`, claims: employeeClaims }));
    await handler(event({ method: "POST", path: `/projects/${projectId}/reports/${reportId}/approve`, claims: employeeClaims }));
    const published = await handler(event({ method: "POST", path: `/projects/${projectId}/reports/${reportId}/publish`, claims: employeeClaims }));
    expect(published.statusCode).toBe(200);
    const versionId = JSON.parse(published.body).version.versionId as string;
    await handler(event({ method: "POST", path: `/projects/${projectId}/reports/${reportId}/revise`, claims: employeeClaims }));
    await handler(
      event({ method: "PUT", path: `/projects/${projectId}/reports/${reportId}`, claims: employeeClaims, body: { title: "Week 1 revised", body: "Added the vendor note." } }),
    );
    const loaded = await handler(event({ method: "GET", path: `/projects/${projectId}/reports/${reportId}`, claims: employeeClaims }));
    const payload = JSON.parse(loaded.body);
    expect(payload.report.status).toBe("draft");
    expect(payload.versions).toHaveLength(1);
    expect(payload.versions[0].versionId).toBe(versionId);
    expect(payload.versions[0].body).toBe("Kickoff is done.");
    const hidden = await handler(event({ method: "GET", path: `/projects/${projectId}/reports`, claims: { ...employeeClaims, sub: "user-b" } }));
    expect(hidden.statusCode).toBe(404);
  });
});
