import { adminAccess, type Principal } from "../../../packages/authz/src/index";
import {
  ingestProgram,
  type IngestDocument,
  type IngestIssue,
  type IngestMilestone,
  type IngestResult,
  type IngestVersion,
} from "../../vault/src/ingest";
import type { AllowlistEntry } from "../../vault/src/allowlist";
import type { HandlerDeps, HttpResult } from "./router";

type VaultCtx = {
  deps: HandlerDeps;
  principal: Principal;
  method: string;
  path: string;
  body: Record<string, unknown>;
  correlationId: string;
};

/** Plan, documents, version text, allowlist, and vault persistence for ingest. */
export type VaultIngestDeps = {
  loadPlan: (projectId: string) => Promise<{
    project: { customerId: string; projectId: string; name: string };
    issues: IngestIssue[];
    milestones: IngestMilestone[];
  } | null>;
  loadDocuments: (projectId: string) => Promise<IngestDocument[]>;
  loadVersionText: (documentId: string, versionId: string) => Promise<IngestVersion | null>;
  readAllowlist: () => Promise<AllowlistEntry[]>;
  saveAllowlist: (entry: AllowlistEntry, enabled: boolean) => Promise<void>;
  saveRows: (result: IngestResult) => Promise<void>;
};

/**
 * Admin vault routes. Returns null when the path is not a vault route.
 * Parent wires this beside plan/catalogs/reports in router.ts.
 */
export async function handleVaultIngest(ctx: VaultCtx, vault: VaultIngestDeps): Promise<HttpResult | null> {
  const allowlistMatch = ctx.path.match(/^\/projects\/([^/]+)\/vault-allowlist$/);
  if (allowlistMatch && ctx.method === "PUT") {
    return putAllowlist(ctx, vault, decodeURIComponent(allowlistMatch[1]));
  }
  const ingestMatch = ctx.path.match(/^\/projects\/([^/]+)\/vault-ingest$/);
  if (ingestMatch && ctx.method === "POST") {
    return postIngest(ctx, vault, decodeURIComponent(ingestMatch[1]));
  }
  return null;
}

async function putAllowlist(ctx: VaultCtx, vault: VaultIngestDeps, projectId: string): Promise<HttpResult> {
  const forbidden = requireAdmin(ctx);
  if (forbidden) return forbidden;
  const project = await ctx.deps.store.getProject(projectId);
  if (!project) return notFound(ctx.correlationId);
  if (typeof ctx.body.enabled !== "boolean") {
    return validation(ctx.correlationId, "enabled must be a boolean.");
  }
  await vault.saveAllowlist({ customerId: project.customerId, programId: project.projectId }, ctx.body.enabled);
  return json(200, { customerId: project.customerId, programId: project.projectId, enabled: ctx.body.enabled }, ctx.correlationId);
}

async function postIngest(ctx: VaultCtx, vault: VaultIngestDeps, projectId: string): Promise<HttpResult> {
  const forbidden = requireAdmin(ctx);
  if (forbidden) return forbidden;
  const plan = await vault.loadPlan(projectId);
  if (!plan) return notFound(ctx.correlationId);

  const allowlist = await vault.readAllowlist();
  const allowed = allowlist.some(
    (entry) => entry.customerId === plan.project.customerId && entry.programId === plan.project.projectId,
  );
  if (!allowed) {
    return json(
      409,
      {
        code: "CONFLICT",
        message: "Project is not on the vault allowlist.",
        correlationId: ctx.correlationId,
      },
      ctx.correlationId,
    );
  }

  const documents = (await vault.loadDocuments(projectId)).filter(
    (document) => document.customerId === plan.project.customerId,
  );
  const versions: IngestVersion[] = [];
  for (const document of documents) {
    if (!document.currentVersionId) continue;
    const version = await vault.loadVersionText(document.documentId, document.currentVersionId);
    if (version) versions.push(version);
  }

  const result = ingestProgram({
    allowlist,
    program: {
      customerId: plan.project.customerId,
      programId: plan.project.projectId,
      title: plan.project.name,
    },
    issues: plan.issues,
    milestones: plan.milestones,
    documents,
    versions,
    recordedAt: ctx.deps.now().toISOString(),
  });
  await vault.saveRows(result);
  return json(
    200,
    {
      rowCount: result.rows.length,
      relationCount: result.relations.length,
      chunkCount: result.chunks.length,
      chunks: result.chunks,
    },
    ctx.correlationId,
  );
}

function requireAdmin(ctx: VaultCtx): HttpResult | null {
  const access = adminAccess(ctx.principal);
  if (access === "ok") return null;
  if (access === "mfa_required") {
    return json(403, { code: "MFA_REQUIRED", message: "Administrator actions require MFA.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  return json(403, { code: "FORBIDDEN", message: "Administrator access is required.", correlationId: ctx.correlationId }, ctx.correlationId);
}

function json(statusCode: number, body: unknown, correlationId: string): HttpResult {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "x-correlation-id": correlationId,
    },
    body: JSON.stringify(body),
  };
}

function notFound(correlationId: string): HttpResult {
  return json(404, { code: "NOT_FOUND", message: "Not found.", correlationId }, correlationId);
}

function validation(correlationId: string, message: string): HttpResult {
  return json(400, { code: "VALIDATION", message, correlationId }, correlationId);
}

export type { IngestDocument, IngestResult };
