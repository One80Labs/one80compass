import { describe, expect, it, vi } from "vitest";
import type { PlanIssue, StatusReport } from "../../../packages/domain/src/index";
import type { VaultChunk } from "../../vault/src/types";
import { createHandler, type HandlerDeps, type HttpEvent } from "./router";
import type { Store } from "./store";
import { handleVaultDraft, type VaultDraftDeps } from "./vault-draft";

const employeeClaims = { sub: "user-a", email: "ada@example.com", amr: '["authenticated"]' };

function event(partial: {
  method: string;
  path: string;
  claims?: Record<string, string>;
  body?: unknown;
}): HttpEvent {
  return {
    rawPath: partial.path,
    body: partial.body === undefined ? null : JSON.stringify(partial.body),
    requestContext: {
      http: { method: partial.method },
      requestId: "req-1",
      authorizer: partial.claims ? { jwt: { claims: partial.claims } } : undefined,
    },
  };
}

function sampleChunk(partial: Partial<VaultChunk> & Pick<VaultChunk, "id" | "body" | "documentId" | "versionId" | "customerId" | "programId">): VaultChunk {
  return {
    sourceType: "document",
    sourceId: partial.documentId,
    recordedAt: "2026-10-24T12:00:00.000Z",
    sourceLabel: "compass-upload",
    embedding: null,
    ...partial,
  };
}

describe("handleVaultDraft", () => {
  it("drafts with a matching chunk, refuses another customer chunk, and skips plan writes", async () => {
    const reports: StatusReport[] = [];
    const putIssue = vi.fn();
    const deps: VaultDraftDeps = {
      getProject: async () => ({ projectId: "proj-1", customerId: "cust-1" }),
      listMembershipsForUser: async () => [],
      loadWorkItems: async () => [
        {
          issueId: "I_1",
          title: "Discovery interviews",
          status: "In Progress",
          issueType: "Task",
          startDate: null,
          finishDate: null,
          effort: 2,
          description: null,
        },
      ],
      loadChunks: async () => [
        sampleChunk({
          id: "c1",
          customerId: "cust-1",
          programId: "proj-1",
          documentId: "doc-9",
          versionId: "ver-3",
          body: "The vendor signed the SOW on Monday.",
        }),
        sampleChunk({
          id: "c-other",
          customerId: "cust-other",
          programId: "proj-1",
          documentId: "doc-secret",
          versionId: "ver-secret",
          body: "The vendor signed a secret deal.",
        }),
      ],
      createReport: async (report) => {
        reports.push(report);
      },
      newId: () => "report-1",
      now: () => new Date("2026-10-24T12:00:00.000Z"),
    };

    const forbidden = await handleVaultDraft({
      deps,
      principal: { userId: "user-a", groups: [], mfa: false },
      method: "POST",
      path: "/projects/proj-1/reports/draft",
      body: { question: "What did the vendor sign?" },
      correlationId: "corr-1",
    });
    expect(forbidden?.statusCode).toBe(403);

    const missing = await handleVaultDraft({
      deps,
      principal: { userId: "admin-1", groups: ["one80-admin"], mfa: true },
      method: "POST",
      path: "/projects/proj-1/reports/draft",
      body: {},
      correlationId: "corr-1",
    });
    expect(missing?.statusCode).toBe(400);

    const drafted = await handleVaultDraft({
      deps,
      principal: { userId: "admin-1", groups: ["one80-admin"], mfa: true },
      method: "POST",
      path: "/projects/proj-1/reports/draft",
      body: { question: "What did the vendor sign?" },
      correlationId: "corr-1",
    });
    expect(drafted?.statusCode).toBe(200);
    const payload = JSON.parse(drafted!.body);
    expect(payload.report.body).toContain("doc-9");
    expect(payload.report.body).toContain("ver-3");
    expect(payload.report.body).not.toContain("doc-secret");
    expect(payload.citations).toEqual([
      expect.objectContaining({ documentId: "doc-9", versionId: "ver-3" }),
    ]);
    expect(reports).toHaveLength(1);
    expect(reports[0]?.status).toBe("draft");
    expect(putIssue).not.toHaveBeenCalled();

    const empty = await handleVaultDraft({
      deps: {
        ...deps,
        createReport: async (report) => {
          reports.push(report);
        },
      },
      principal: { userId: "admin-1", groups: ["one80-admin"], mfa: true },
      method: "POST",
      path: "/projects/proj-1/reports/draft",
      body: { question: "What is the Mars launch window?" },
      correlationId: "corr-2",
    });
    expect(empty?.statusCode).toBe(200);
    const emptyPayload = JSON.parse(empty!.body);
    expect(emptyPayload.report.body).toBe("No filed source supports that.");
    expect(emptyPayload.citations).toEqual([]);
    expect(emptyPayload.report.body).not.toMatch(/recommend|should|Discovery interviews/i);
  });
});

describe("publish putReportText", () => {
  it("calls putReportText with the version key when provided", async () => {
    const reports: StatusReport[] = [];
    const reportVersions: { versionId: string; reportId: string; body: string }[] = [];
    const putReportText = vi.fn(async () => undefined);
    const putIssue = vi.fn();

    const store = {
      async getProject() {
        return { projectId: "proj-1", customerId: "cust-1", name: "Bridge", createdAt: "2026-10-24T12:00:00.000Z" };
      },
      async listMembershipsForUser() {
        return [{ customerId: "cust-1", userId: "user-a", email: "ada@example.com", name: "", role: "contributor" as const, createdAt: "2026-10-24T12:00:00.000Z", projectIds: null }];
      },
      async getReport(reportId: string) {
        return reports.find((report) => report.reportId === reportId) ?? null;
      },
      async putReport(report: StatusReport) {
        const index = reports.findIndex((item) => item.reportId === report.reportId);
        if (index >= 0) reports[index] = report;
        else reports.push(report);
      },
      async createReport(report: StatusReport) {
        reports.push(report);
      },
      async listReports(projectId: string) {
        return reports.filter((report) => report.projectId === projectId);
      },
      async putReportVersion(version: { versionId: string; reportId: string; body: string }) {
        reportVersions.push(version);
      },
      async listReportVersions(reportId: string) {
        return reportVersions.filter((version) => version.reportId === reportId);
      },
      async putAudit() {
        return undefined;
      },
      async putIssue() {
        putIssue();
      },
      async listIssues() {
        return [] as PlanIssue[];
      },
    } as unknown as Store;

    let n = 0;
    const handler = createHandler({
      store,
      inviteUser: async () => ({ userId: "user-a" }),
      disableLogin: async () => undefined,
      newId: () => `id-${++n}`,
      now: () => new Date("2026-10-24T12:00:00.000Z"),
      signUpload: async () => "https://upload",
      signDownload: async () => "https://download",
      putReportText,
      enqueue: async () => undefined,
      githubConfigured: false,
      webhookSecret: "secret",
      listAdminUserIds: async () => ["admin-1"],
    } satisfies HandlerDeps);

    reports.push({
      reportId: "r1",
      projectId: "proj-1",
      customerId: "cust-1",
      title: "Week 1",
      body: "Kickoff is done.",
      status: "approved",
      updatedAt: "2026-10-24T12:00:00.000Z",
      createdAt: "2026-10-24T12:00:00.000Z",
    });

    const published = await handler(
      event({ method: "POST", path: "/projects/proj-1/reports/r1/publish", claims: employeeClaims }),
    );
    expect(published.statusCode).toBe(200);
    const versionId = JSON.parse(published.body).version.versionId as string;
    expect(putReportText).toHaveBeenCalledWith(
      `customers/cust-1/projects/proj-1/reports/r1/versions/${versionId}.md`,
      "Kickoff is done.",
    );
    expect(putIssue).not.toHaveBeenCalled();
  });
});

describe("draft path plan isolation", () => {
  it("does not call putIssue when drafting from the vault", async () => {
    const putIssue = vi.fn();
    const createReport = vi.fn(async (report: StatusReport) => {
      expect(report.status).toBe("draft");
    });
    await handleVaultDraft({
      deps: {
        getProject: async () => ({ projectId: "proj-1", customerId: "cust-1" }),
        listMembershipsForUser: async () => [],
        loadWorkItems: async () => [],
        loadChunks: async () => [],
        createReport,
        newId: () => "report-2",
        now: () => new Date("2026-10-24T12:00:00.000Z"),
      },
      principal: { userId: "admin-1", groups: ["one80-admin"], mfa: true },
      method: "POST",
      path: "/projects/proj-1/reports/draft",
      body: { question: "Anything?" },
      correlationId: "corr-3",
    });
    expect(createReport).toHaveBeenCalled();
    expect(putIssue).not.toHaveBeenCalled();
  });
});
