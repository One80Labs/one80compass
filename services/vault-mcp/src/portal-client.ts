import { randomUUID } from "node:crypto";
import type { VaultMcpConfig } from "./config.js";
import type {
  PortalClient,
  VaultAllowlistState,
  VaultChunkSummary,
  VaultDecisionSummary,
  VaultDraftResult,
  VaultIngestSummary,
} from "./types.js";

type ErrorBody = {
  message?: unknown;
  code?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parseAllowlist(data: unknown): VaultAllowlistState {
  if (!isRecord(data)) throw new Error("Invalid vault allowlist response.");
  return {
    customerId: asString(data.customerId),
    programId: asString(data.programId),
    enabled: Boolean(data.enabled),
  };
}

function parseIngestSummary(data: unknown): VaultIngestSummary {
  if (!isRecord(data)) throw new Error("Invalid vault ingest response.");
  return {
    rowCount: asNumber(data.rowCount),
    relationCount: asNumber(data.relationCount),
    chunkCount: asNumber(data.chunkCount),
  };
}

function parseChunk(raw: unknown): VaultChunkSummary {
  if (!isRecord(raw)) throw new Error("Invalid vault chunk entry.");
  return {
    id: asString(raw.id),
    customerId: asString(raw.customerId),
    programId: asString(raw.programId),
    sourceLabel: asString(raw.sourceLabel),
    documentId: asString(raw.documentId),
    versionId: asString(raw.versionId),
    body: asString(raw.body),
  };
}

function parseChunks(data: unknown): VaultChunkSummary[] {
  if (!isRecord(data) || !Array.isArray(data.chunks)) {
    throw new Error("Invalid vault chunks response.");
  }
  return data.chunks.map(parseChunk);
}

function parseDecision(raw: unknown): VaultDecisionSummary {
  if (!isRecord(raw)) throw new Error("Invalid vault decision entry.");
  return {
    sourceId: asString(raw.sourceId),
    title: asString(raw.title),
    body: asString(raw.body),
    customerId: asString(raw.customerId),
    programId: asString(raw.programId),
  };
}

function parseDecisions(data: unknown): VaultDecisionSummary[] {
  if (!isRecord(data) || !Array.isArray(data.decisions)) {
    throw new Error("Invalid vault decisions response.");
  }
  return data.decisions.map(parseDecision);
}

function parseDraft(data: unknown): VaultDraftResult {
  if (!isRecord(data) || !isRecord(data.report)) {
    throw new Error("Invalid vault draft response.");
  }
  const report = data.report;
  return {
    report: {
      reportId: asString(report.reportId),
      projectId: asString(report.projectId),
      customerId: asString(report.customerId),
      title: asString(report.title),
      body: asString(report.body),
      status: asString(report.status),
    },
    citations: Array.isArray(data.citations) ? data.citations : [],
  };
}

function formatHttpError(status: number, bodyText: string): Error {
  let message = `Portal API request failed (${status})`;
  let code: string | undefined;
  try {
    const parsed = JSON.parse(bodyText) as ErrorBody;
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      message = `${message}: ${parsed.message}`;
    }
    if (typeof parsed.code === "string" && parsed.code.trim()) {
      code = parsed.code;
      message = `${message} [${code}]`;
    }
  } catch {
    if (bodyText.trim()) message = `${message}: ${bodyText.trim().slice(0, 200)}`;
  }
  return new Error(message);
}

async function requestJson(
  config: VaultMcpConfig,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${config.idToken}`,
    "content-type": "application/json",
    "x-correlation-id": randomUUID(),
  };
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (response.status < 200 || response.status >= 300) {
    throw formatHttpError(response.status, text);
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Portal API returned non-JSON (${response.status}).`);
  }
}

/** HTTP portal client — vault MCP talks only to the admin API, never Aurora/Lambda. */
export function createPortalClient(config: VaultMcpConfig): PortalClient {
  return {
    async getAllowlist(programId: string): Promise<VaultAllowlistState> {
      const data = await requestJson(config, "GET", `/projects/${encodeURIComponent(programId)}/vault-allowlist`);
      return parseAllowlist(data);
    },

    async setAllowlist(programId: string, enabled: boolean): Promise<VaultAllowlistState> {
      const data = await requestJson(
        config,
        "PUT",
        `/projects/${encodeURIComponent(programId)}/vault-allowlist`,
        { enabled },
      );
      return parseAllowlist(data);
    },

    async ingest(programId: string): Promise<VaultIngestSummary> {
      const data = await requestJson(config, "POST", `/projects/${encodeURIComponent(programId)}/vault-ingest`, {});
      return parseIngestSummary(data);
    },

    async listChunks(programId: string): Promise<VaultChunkSummary[]> {
      const data = await requestJson(config, "GET", `/projects/${encodeURIComponent(programId)}/vault-chunks`);
      return parseChunks(data);
    },

    async listDecisions(programId: string): Promise<VaultDecisionSummary[]> {
      const data = await requestJson(config, "GET", `/projects/${encodeURIComponent(programId)}/vault-decisions`);
      return parseDecisions(data);
    },

    async draftFromVault(programId: string, question: string): Promise<VaultDraftResult> {
      const data = await requestJson(
        config,
        "POST",
        `/projects/${encodeURIComponent(programId)}/reports/draft`,
        { question },
      );
      return parseDraft(data);
    },
  };
}
