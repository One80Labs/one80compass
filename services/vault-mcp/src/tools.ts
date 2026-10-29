import type { PortalClient, VaultChunkSummary } from "./types.js";

/** MCP tool defs: handlers return plain JSON; index.ts wraps MCP content. */
export type ToolDefs = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}[];

function requireProgramId(args: Record<string, unknown>): string {
  const programId = args.program_id;
  if (typeof programId !== "string" || programId.length === 0) {
    throw new Error("program_id is required and must be a non-empty string");
  }
  return programId;
}

function requireQuestion(args: Record<string, unknown>): string {
  const question = args.question;
  if (typeof question !== "string" || question.length === 0) {
    throw new Error("question is required and must be a non-empty string");
  }
  return question;
}

function requireEnabled(args: Record<string, unknown>): boolean {
  if (typeof args.enabled !== "boolean") {
    throw new Error("enabled is required and must be a boolean");
  }
  return args.enabled;
}

/** Case-insensitive substring filter over chunk body; still only program-scoped rows. */
function filterChunksByQuery(chunks: VaultChunkSummary[], query: string): VaultChunkSummary[] {
  const needle = query.toLowerCase();
  return chunks.filter((c) => c.body.toLowerCase().includes(needle));
}

const ADMIN_SCOPED =
  "Admin-only. Tenant-scoped to program_id. Does not mutate live plan dates or status.";

/**
 * Staff vault MCP tools (Phase 10): allowlist, ingest, list/search chunks, cited draft.
 * Portal HTTP only — no Aurora credentials; draft creates a Compass report draft only.
 */
export function buildTools(client: PortalClient): ToolDefs {
  return [
    {
      name: "vault_get_allowlist",
      description: `${ADMIN_SCOPED} Returns whether the program is allowlisted for staff vault ingest.`,
      inputSchema: {
        type: "object",
        properties: {
          program_id: { type: "string", description: "Compass program id" },
        },
        required: ["program_id"],
        additionalProperties: false,
      },
      handler: async (args) => {
        const programId = requireProgramId(args);
        return client.getAllowlist(programId);
      },
    },
    {
      name: "vault_set_allowlist",
      description: `${ADMIN_SCOPED} Enables or clears vault allowlist for the program (enabled false = clear).`,
      inputSchema: {
        type: "object",
        properties: {
          program_id: { type: "string", description: "Compass program id" },
          enabled: {
            type: "boolean",
            description: "true to allowlist; false to clear allowlist",
          },
        },
        required: ["program_id", "enabled"],
        additionalProperties: false,
      },
      handler: async (args) => {
        const programId = requireProgramId(args);
        const enabled = requireEnabled(args);
        return client.setAllowlist(programId, enabled);
      },
    },
    {
      name: "vault_ingest",
      description: `${ADMIN_SCOPED} Copies allowlisted program data into the staff vault (rebuildable copy).`,
      inputSchema: {
        type: "object",
        properties: {
          program_id: { type: "string", description: "Compass program id" },
        },
        required: ["program_id"],
        additionalProperties: false,
      },
      handler: async (args) => {
        const programId = requireProgramId(args);
        return client.ingest(programId);
      },
    },
    {
      name: "vault_list_chunks",
      description: `${ADMIN_SCOPED} Lists vault chunks for one program; optional query filters body client-side (case-insensitive).`,
      inputSchema: {
        type: "object",
        properties: {
          program_id: { type: "string", description: "Compass program id" },
          query: {
            type: "string",
            description: "Optional case-insensitive substring filter on chunk body",
          },
        },
        required: ["program_id"],
        additionalProperties: false,
      },
      handler: async (args) => {
        const programId = requireProgramId(args);
        const chunks = await client.listChunks(programId);
        if (typeof args.query === "string" && args.query.length > 0) {
          return filterChunksByQuery(chunks, args.query);
        }
        return chunks;
      },
    },
    {
      name: "vault_draft_status",
      description: `${ADMIN_SCOPED} Creates a cited Compass report draft from vault evidence only (not live plan writes).`,
      inputSchema: {
        type: "object",
        properties: {
          program_id: { type: "string", description: "Compass program id" },
          question: { type: "string", description: "Status question to draft against vault evidence" },
        },
        required: ["program_id", "question"],
        additionalProperties: false,
      },
      handler: async (args) => {
        const programId = requireProgramId(args);
        const question = requireQuestion(args);
        return client.draftFromVault(programId, question);
      },
    },
  ];
}
