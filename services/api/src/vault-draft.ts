import { adminAccess, canAccessProject, type Principal } from "../../../packages/authz/src/index";
import type { StatusReport } from "../../../packages/domain/src/index";
import { draftStatus, type DraftWorkItem } from "../../vault/src/draft";
import type { VaultChunk, VaultDecisionRow } from "../../vault/src/types";
import type { HttpResult } from "./router";

export type VaultDraftDeps = {
  getProject: (projectId: string) => Promise<{ projectId: string; customerId: string } | null>;
  listMembershipsForUser: (userId: string) => Promise<{ customerId: string; userId: string; projectIds?: string[] | null; role?: "contributor" | "view" | "employee" }[]>;
  loadWorkItems: (projectId: string) => Promise<DraftWorkItem[]>;
  /** Caller already scopes retrieval; draftStatus still drops mismatched customer or program rows. */
  loadChunks: (customerId: string, programId: string) => Promise<VaultChunk[]>;
  /** Decision-register and plan Decision rows for this customer and program. */
  loadDecisions: (customerId: string, programId: string) => Promise<VaultDecisionRow[]>;
  createReport: (report: StatusReport) => Promise<void>;
  newId: () => string;
  now: () => Date;
};

type VaultDraftCtx = {
  deps: VaultDraftDeps;
  principal: Principal;
  method: string;
  path: string;
  body: Record<string, unknown>;
  correlationId: string;
};

/** POST /projects/:projectId/reports/draft — admin-only vault status draft. Does not write issues or the live plan. */
export async function handleVaultDraft(ctx: VaultDraftCtx): Promise<HttpResult | null> {
  const match = ctx.path.match(/^\/projects\/([^/]+)\/reports\/draft$/);
  if (!match || ctx.method !== "POST") return null;

  const access = adminAccess(ctx.principal);
  if (access !== "ok") {
    return json(403, { code: "FORBIDDEN", message: "Administrator access is required.", correlationId: ctx.correlationId }, ctx.correlationId);
  }

  const projectId = decodeURIComponent(match[1]);
  const project = await ctx.deps.getProject(projectId);
  if (!project) return json(404, { code: "NOT_FOUND", message: "Not found.", correlationId: ctx.correlationId }, ctx.correlationId);
  const memberships = await ctx.deps.listMembershipsForUser(ctx.principal.userId);
  if (!canAccessProject(ctx.principal, project, memberships)) {
    return json(404, { code: "NOT_FOUND", message: "Not found.", correlationId: ctx.correlationId }, ctx.correlationId);
  }

  const question = typeof ctx.body.question === "string" ? ctx.body.question.trim() : "";
  if (!question) {
    return json(400, { code: "VALIDATION", message: "question is required.", correlationId: ctx.correlationId }, ctx.correlationId);
  }

  const workItems = await ctx.deps.loadWorkItems(projectId);
  const chunks = await ctx.deps.loadChunks(project.customerId, projectId);
  const decisions = await ctx.deps.loadDecisions(project.customerId, projectId);
  const drafted = draftStatus({
    customerId: project.customerId,
    programId: projectId,
    question,
    workItems,
    chunks,
    decisions,
  });

  const now = ctx.deps.now().toISOString();
  const report: StatusReport = {
    reportId: ctx.deps.newId(),
    projectId,
    customerId: project.customerId,
    title: drafted.title,
    body: drafted.body,
    status: "draft",
    updatedAt: now,
    createdAt: now,
  };
  await ctx.deps.createReport(report);
  return json(200, { report, citations: drafted.citations }, ctx.correlationId);
}

function json(statusCode: number, payload: unknown, correlationId: string): HttpResult {
  const body = payload && typeof payload === "object" ? { ...payload, correlationId } : { correlationId };
  return { statusCode, headers: { "content-type": "application/json", "x-correlation-id": correlationId }, body: JSON.stringify(body) };
}
