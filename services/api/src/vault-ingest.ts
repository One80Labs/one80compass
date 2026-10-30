import { adminAccess, type Principal } from "../../../packages/authz/src/index";
import { DOCUMENT_SOURCE_LABELS, type DocumentSourceLabel } from "../../../packages/domain/src/index";
import {
  ingestProgram,
  type IngestDecision,
  type IngestDocument,
  type IngestIssue,
  type IngestMilestone,
  type IngestResult,
  type IngestRisk,
  type IngestVersion,
} from "../../vault/src/ingest";
import type { AllowlistEntry } from "../../vault/src/allowlist";
import type { VaultChunk } from "../../vault/src/types";
import type { HandlerDeps, HttpResult } from "./router";

type VaultCtx = {
  deps: HandlerDeps;
  principal: Principal;
  method: string;
  path: string;
  body: Record<string, unknown>;
  correlationId: string;
};

/** Plan, documents, version text, allowlist, chunks, and vault persistence for ingest. */
export type VaultIngestDeps = {
  loadPlan: (projectId: string) => Promise<{
    project: { customerId: string; projectId: string; name: string };
    issues: IngestIssue[];
    milestones: IngestMilestone[];
    risks: IngestRisk[];
    /** Decision register rows for this program. Omitted means none. */
    decisions?: IngestDecision[];
  } | null>;
  loadDocuments: (projectId: string) => Promise<IngestDocument[]>;
  loadVersionText: (documentId: string, versionId: string) => Promise<IngestVersion | null>;
  readAllowlist: () => Promise<AllowlistEntry[]>;
  saveAllowlist: (entry: AllowlistEntry, enabled: boolean) => Promise<void>;
  saveRows: (result: IngestResult) => Promise<void>;
  /** List vault chunks for one customer + program (Lambda list-chunks). */
  loadChunks: (customerId: string, programId: string) => Promise<VaultChunk[]>;
};

/** Outcome of loading a program and writing vault rows (shared by admin POST and auto-ingest). */
export type IngestProgramOutcome =
  | { status: "ok"; result: IngestResult }
  | { status: "not_found" }
  | { status: "not_allowlisted" };

const VAULT_LABEL_SET = new Set<string>(DOCUMENT_SOURCE_LABELS);

/** True when the document label is one of the vault source labels (not null/cleared). */
export function isVaultSourceLabel(label: DocumentSourceLabel | string | null | undefined): label is DocumentSourceLabel {
  return typeof label === "string" && VAULT_LABEL_SET.has(label);
}

/**
 * Copy an allowlisted Compass program into the vault using the same pipeline as POST vault-ingest.
 * Does not enforce admin auth — callers decide who may trigger ingest.
 */
export async function ingestAllowlistedProgram(
  vault: VaultIngestDeps,
  projectId: string,
  recordedAt: string,
): Promise<IngestProgramOutcome> {
  const plan = await vault.loadPlan(projectId);
  if (!plan) return { status: "not_found" };

  const allowlist = await vault.readAllowlist();
  const allowed = allowlist.some(
    (entry) => entry.customerId === plan.project.customerId && entry.programId === plan.project.projectId,
  );
  if (!allowed) return { status: "not_allowlisted" };

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
    risks: plan.risks,
    decisions: plan.decisions ?? [],
    documents,
    versions,
    recordedAt,
  });
  await vault.saveRows(result);
  return { status: "ok", result };
}

/**
 * Best-effort re-ingest after a document becomes vault-eligible.
 * Never throws: failures are logged so upload/label APIs keep succeeding.
 */
export async function maybeAutoIngestProgram(options: {
  vault: VaultIngestDeps | undefined;
  projectId: string;
  recordedAt: string;
  correlationId: string;
  reason: string;
}): Promise<void> {
  if (!options.vault) return;
  try {
    const outcome = await ingestAllowlistedProgram(options.vault, options.projectId, options.recordedAt);
    if (outcome.status === "ok") {
      console.info(
        JSON.stringify({
          correlationId: options.correlationId,
          message: "vault auto-ingest completed",
          projectId: options.projectId,
          reason: options.reason,
          rowCount: outcome.result.rows.length,
          chunkCount: outcome.result.chunks.length,
        }),
      );
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        correlationId: options.correlationId,
        message: "vault auto-ingest failed",
        projectId: options.projectId,
        reason: options.reason,
        error: error instanceof Error ? error.message : "error",
      }),
    );
  }
}

/**
 * Admin vault routes. Returns null when the path is not a vault route.
 * Parent wires this beside plan/catalogs/reports in router.ts.
 */
export async function handleVaultIngest(ctx: VaultCtx, vault: VaultIngestDeps): Promise<HttpResult | null> {
  const allowlistMatch = ctx.path.match(/^\/projects\/([^/]+)\/vault-allowlist$/);
  if (allowlistMatch && ctx.method === "GET") {
    return getAllowlist(ctx, vault, decodeURIComponent(allowlistMatch[1]));
  }
  if (allowlistMatch && ctx.method === "PUT") {
    return putAllowlist(ctx, vault, decodeURIComponent(allowlistMatch[1]));
  }
  const ingestMatch = ctx.path.match(/^\/projects\/([^/]+)\/vault-ingest$/);
  if (ingestMatch && ctx.method === "POST") {
    return postIngest(ctx, vault, decodeURIComponent(ingestMatch[1]));
  }
  const chunksMatch = ctx.path.match(/^\/projects\/([^/]+)\/vault-chunks$/);
  if (chunksMatch && ctx.method === "GET") {
    return getChunks(ctx, vault, decodeURIComponent(chunksMatch[1]));
  }
  return null;
}

/** Read whether customerId+programId is already on the staff vault allowlist. */
async function getAllowlist(ctx: VaultCtx, vault: VaultIngestDeps, projectId: string): Promise<HttpResult> {
  const forbidden = requireAdmin(ctx);
  if (forbidden) return forbidden;
  const project = await ctx.deps.store.getProject(projectId);
  if (!project) return notFound(ctx.correlationId);
  const allowlist = await vault.readAllowlist();
  const enabled = allowlist.some(
    (entry) => entry.customerId === project.customerId && entry.programId === project.projectId,
  );
  return json(200, { customerId: project.customerId, programId: project.projectId, enabled }, ctx.correlationId);
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
  // Ingest reads the allowlist, so it must run after the save. Disable is a no-op.
  // Failures are best-effort: the allowlist response stays 200 even if ingest throws.
  if (ctx.body.enabled === true) {
    await maybeAutoIngestProgram({
      vault,
      projectId,
      recordedAt: ctx.deps.now().toISOString(),
      correlationId: ctx.correlationId,
      reason: "allowlist-enable",
    });
  }
  return json(200, { customerId: project.customerId, programId: project.projectId, enabled: ctx.body.enabled }, ctx.correlationId);
}

async function postIngest(ctx: VaultCtx, vault: VaultIngestDeps, projectId: string): Promise<HttpResult> {
  const forbidden = requireAdmin(ctx);
  if (forbidden) return forbidden;
  const outcome = await ingestAllowlistedProgram(vault, projectId, ctx.deps.now().toISOString());
  if (outcome.status === "not_found") return notFound(ctx.correlationId);
  if (outcome.status === "not_allowlisted") {
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
  const { result } = outcome;
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

/** Admin GET vault chunks for MCP list/search — scoped to the project's customer + program. */
async function getChunks(ctx: VaultCtx, vault: VaultIngestDeps, projectId: string): Promise<HttpResult> {
  const forbidden = requireAdmin(ctx);
  if (forbidden) return forbidden;
  const project = await ctx.deps.store.getProject(projectId);
  if (!project) return notFound(ctx.correlationId);

  const allowlist = await vault.readAllowlist();
  const allowed = allowlist.some(
    (entry) => entry.customerId === project.customerId && entry.programId === project.projectId,
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

  try {
    const loaded = await vault.loadChunks(project.customerId, project.projectId);
    const chunks = loaded
      .filter((chunk) => chunk.customerId === project.customerId && chunk.programId === project.projectId)
      .map((chunk) => {
        const { embedding: _embedding, ...rest } = chunk;
        return rest;
      });
    return json(200, { chunks }, ctx.correlationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/not allowlisted/i.test(message)) {
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
    throw error;
  }
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
