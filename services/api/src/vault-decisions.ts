import { adminAccess, type Principal } from "../../../packages/authz/src/index";
import type { VaultDecisionRow } from "../../vault/src/types";
import { createVaultInvoker } from "./vault-client";
import type { HttpResult } from "./router";

type VaultInvoke = <T>(event: Record<string, unknown>) => Promise<T>;

export type VaultDecisionsCtx = {
  principal: Principal;
  method: string;
  path: string;
  correlationId: string;
  getProject: (projectId: string) => Promise<{ projectId: string; customerId: string } | null>;
  readAllowlist: () => Promise<{ customerId: string; programId: string }[]>;
  loadDecisions: (customerId: string, programId: string) => Promise<VaultDecisionRow[]>;
};

/**
 * GET /projects/:projectId/vault-decisions — admin list of vault decision rows.
 * Returns null when the path is not this route.
 * Does not write the live plan or the vault.
 */
export async function handleVaultDecisions(ctx: VaultDecisionsCtx): Promise<HttpResult | null> {
  const match = ctx.path.match(/^\/projects\/([^/]+)\/vault-decisions$/);
  if (!match || ctx.method !== "GET") return null;

  const forbidden = requireAdmin(ctx);
  if (forbidden) return forbidden;

  const projectId = decodeURIComponent(match[1]);
  const project = await ctx.getProject(projectId);
  if (!project) return notFound(ctx.correlationId);

  const allowlist = await ctx.readAllowlist();
  const allowed = allowlist.some(
    (entry) => entry.customerId === project.customerId && entry.programId === project.projectId,
  );
  if (!allowed) return notAllowlisted(ctx.correlationId);

  try {
    const loaded = await ctx.loadDecisions(project.customerId, project.projectId);
    const decisions = loaded
      .filter((row) => row.customerId === project.customerId && row.programId === project.projectId)
      .map((row) => ({
        sourceId: row.sourceId,
        title: row.title,
        body: row.body,
        customerId: row.customerId,
        programId: row.programId,
      }));
    return json(200, { decisions }, ctx.correlationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/not allowlisted/i.test(message)) return notAllowlisted(ctx.correlationId);
    throw error;
  }
}

/** Load decision rows for a status draft through the vault Lambda list-decisions event. */
export function createLoadVaultDecisions(options: {
  vaultFunctionName: string | undefined;
  invokeVault?: VaultInvoke;
}): ((customerId: string, programId: string) => Promise<VaultDecisionRow[]>) | undefined {
  const functionName = options.vaultFunctionName?.trim();
  if (!functionName) return undefined;
  const invoke = options.invokeVault ?? createVaultInvoker(functionName);
  return async (customerId, programId) => {
    const payload = await invoke<{ decisions?: VaultDecisionRow[] }>({
      type: "list-decisions",
      customerId,
      programId,
    });
    return payload.decisions ?? [];
  };
}

function requireAdmin(ctx: VaultDecisionsCtx): HttpResult | null {
  const access = adminAccess(ctx.principal);
  if (access === "ok") return null;
  if (access === "mfa_required") {
    return json(403, { code: "MFA_REQUIRED", message: "Administrator actions require MFA.", correlationId: ctx.correlationId }, ctx.correlationId);
  }
  return json(403, { code: "FORBIDDEN", message: "Administrator access is required.", correlationId: ctx.correlationId }, ctx.correlationId);
}

function notAllowlisted(correlationId: string): HttpResult {
  return json(
    409,
    {
      code: "CONFLICT",
      message: "Project is not on the vault allowlist.",
      correlationId,
    },
    correlationId,
  );
}

function notFound(correlationId: string): HttpResult {
  return json(404, { code: "NOT_FOUND", message: "Not found.", correlationId }, correlationId);
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
