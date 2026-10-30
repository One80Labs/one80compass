import { describe, expect, it, vi } from "vitest";
import { buildTools } from "./tools.js";
import type {
  PortalClient,
  VaultAllowlistState,
  VaultChunkSummary,
  VaultDecisionSummary,
  VaultDraftResult,
  VaultIngestSummary,
} from "./types.js";

function chunk(partial: Partial<VaultChunkSummary> & Pick<VaultChunkSummary, "id" | "body">): VaultChunkSummary {
  return {
    customerId: "cust-1",
    programId: "prog-1",
    sourceLabel: "compass-upload",
    documentId: "doc-1",
    versionId: "ver-1",
    ...partial,
  };
}

function fakeClient(overrides: Partial<PortalClient> = {}): PortalClient {
  const allowlist: VaultAllowlistState = {
    customerId: "cust-1",
    programId: "prog-1",
    enabled: true,
  };
  const ingestSummary: VaultIngestSummary = {
    rowCount: 2,
    relationCount: 1,
    chunkCount: 3,
  };
  const draft: VaultDraftResult = {
    report: {
      reportId: "r1",
      projectId: "prog-1",
      customerId: "cust-1",
      title: "Status draft",
      body: "Draft body",
      status: "draft",
    },
    citations: [],
  };

  return {
    getAllowlist: vi.fn(async () => allowlist),
    setAllowlist: vi.fn(async (_programId, enabled) => ({ ...allowlist, enabled })),
    ingest: vi.fn(async () => ingestSummary),
    listChunks: vi.fn(async () => [
      chunk({ id: "c1", body: "Alpha kickoff notes" }),
      chunk({ id: "c2", body: "BETA vendor SOW signed" }),
      chunk({ id: "c3", body: "unrelated memo" }),
    ]),
    listDecisions: vi.fn(async () => [
      {
        sourceId: "dec-1",
        title: "Which vendor?",
        body: "Outcome: keep the current vendor.",
        customerId: "cust-1",
        programId: "prog-1",
      },
    ]),
    draftFromVault: vi.fn(async () => draft),
    ...overrides,
  };
}

function byName(tools: ReturnType<typeof buildTools>, name: string) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool;
}

describe("buildTools", () => {
  it("exports stable snake_case tool names", () => {
    const tools = buildTools(fakeClient());
    expect(tools.map((t) => t.name)).toEqual([
      "vault_get_allowlist",
      "vault_set_allowlist",
      "vault_ingest",
      "vault_list_chunks",
      "vault_list_decisions",
      "vault_draft_status",
    ]);
  });

  it("routes vault_get_allowlist to client.getAllowlist", async () => {
    const client = fakeClient();
    const result = await byName(buildTools(client), "vault_get_allowlist").handler({
      program_id: "prog-1",
    });
    expect(client.getAllowlist).toHaveBeenCalledWith("prog-1");
    expect(result).toEqual({ customerId: "cust-1", programId: "prog-1", enabled: true });
  });

  it("routes vault_set_allowlist including clear (enabled false)", async () => {
    const client = fakeClient();
    const tools = buildTools(client);
    await byName(tools, "vault_set_allowlist").handler({ program_id: "prog-1", enabled: true });
    expect(client.setAllowlist).toHaveBeenCalledWith("prog-1", true);

    const cleared = await byName(tools, "vault_set_allowlist").handler({
      program_id: "prog-1",
      enabled: false,
    });
    expect(client.setAllowlist).toHaveBeenCalledWith("prog-1", false);
    expect(cleared).toEqual({ customerId: "cust-1", programId: "prog-1", enabled: false });
  });

  it("routes vault_ingest to client.ingest", async () => {
    const client = fakeClient();
    const result = await byName(buildTools(client), "vault_ingest").handler({ program_id: "prog-1" });
    expect(client.ingest).toHaveBeenCalledWith("prog-1");
    expect(result).toEqual({ rowCount: 2, relationCount: 1, chunkCount: 3 });
  });

  it("lists all chunks when query is omitted", async () => {
    const client = fakeClient();
    const result = await byName(buildTools(client), "vault_list_chunks").handler({
      program_id: "prog-1",
    });
    expect(client.listChunks).toHaveBeenCalledWith("prog-1");
    expect(result).toHaveLength(3);
  });

  it("filters chunks by case-insensitive body query client-side", async () => {
    const client = fakeClient();
    const result = (await byName(buildTools(client), "vault_list_chunks").handler({
      program_id: "prog-1",
      query: "beta",
    })) as VaultChunkSummary[];
    expect(client.listChunks).toHaveBeenCalledWith("prog-1");
    expect(result.map((c) => c.id)).toEqual(["c2"]);
  });

  it("filters decisions by title or body", async () => {
    const client = fakeClient();
    const result = (await byName(buildTools(client), "vault_list_decisions").handler({
      program_id: "prog-1",
      query: "VENDOR",
    })) as VaultDecisionSummary[];
    expect(client.listDecisions).toHaveBeenCalledWith("prog-1");
    expect(result.map((row) => row.sourceId)).toEqual(["dec-1"]);
  });

  it("routes vault_draft_status to client.draftFromVault", async () => {
    const client = fakeClient();
    const result = await byName(buildTools(client), "vault_draft_status").handler({
      program_id: "prog-1",
      question: "What was signed?",
    });
    expect(client.draftFromVault).toHaveBeenCalledWith("prog-1", "What was signed?");
    expect(result).toMatchObject({ report: { reportId: "r1", status: "draft" } });
  });

  it("throws when program_id is missing", async () => {
    const tools = buildTools(fakeClient());
    await expect(byName(tools, "vault_get_allowlist").handler({})).rejects.toThrow(/program_id/);
    await expect(byName(tools, "vault_ingest").handler({ program_id: "" })).rejects.toThrow(
      /program_id/,
    );
  });

  it("throws when enabled is not a boolean", async () => {
    await expect(
      byName(buildTools(fakeClient()), "vault_set_allowlist").handler({
        program_id: "prog-1",
        enabled: "yes",
      }),
    ).rejects.toThrow(/enabled/);
  });

  it("throws when question is missing", async () => {
    await expect(
      byName(buildTools(fakeClient()), "vault_draft_status").handler({ program_id: "prog-1" }),
    ).rejects.toThrow(/question/);
  });

  it("uses JSON Schema objects with additionalProperties false", () => {
    for (const tool of buildTools(fakeClient())) {
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.additionalProperties).toBe(false);
      expect(Array.isArray(tool.inputSchema.required)).toBe(true);
      expect(tool.description).toMatch(/Admin-only/i);
      expect(tool.description).toMatch(/program_id/);
    }
  });
});
