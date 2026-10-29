import { describe, expect, it, vi } from "vitest";
import type { Principal } from "../../../packages/authz/src/index";
import type { AllowlistEntry } from "../../vault/src/allowlist";
import type { IngestDocument, IngestResult, IngestVersion } from "../../vault/src/ingest";
import type { VaultChunk } from "../../vault/src/types";
import type { HandlerDeps } from "./router";
import {
  handleVaultIngest,
  ingestAllowlistedProgram,
  isVaultSourceLabel,
  maybeAutoIngestProgram,
  type VaultIngestDeps,
} from "./vault-ingest";

describe("vault ingest helpers", () => {
  it("recognizes vault source labels only", () => {
    expect(isVaultSourceLabel("compass-upload")).toBe(true);
    expect(isVaultSourceLabel("krisp")).toBe(true);
    expect(isVaultSourceLabel(null)).toBe(false);
    expect(isVaultSourceLabel("unknown")).toBe(false);
  });

  it("ingestAllowlistedProgram skips when the project is not allowlisted", async () => {
    const { vault } = harness({ groups: ["one80-admin"], allowlistSeed: [] });
    const outcome = await ingestAllowlistedProgram(vault, "prog-1", "2026-10-26T12:00:00.000Z");
    expect(outcome.status).toBe("not_allowlisted");
  });

  it("maybeAutoIngestProgram swallows save failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { vault } = harness({
      groups: ["one80-admin"],
      allowlistSeed: [{ customerId: "cust-1", programId: "prog-1" }],
      onSave: () => {
        throw new Error("save blew up");
      },
    });
    await expect(
      maybeAutoIngestProgram({
        vault,
        projectId: "prog-1",
        recordedAt: "2026-10-26T12:00:00.000Z",
        correlationId: "corr-1",
        reason: "test",
      }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("handleVaultIngest", () => {
  it("rejects non-admin allowlist updates with 403", async () => {
    const { ctx, vault } = harness({ groups: [] });
    const result = await handleVaultIngest(
      { ...ctx, method: "PUT", path: "/projects/prog-1/vault-allowlist", body: { enabled: true } },
      vault,
    );
    expect(result?.statusCode).toBe(403);
  });

  it("rejects non-admin allowlist reads with 403", async () => {
    const { ctx, vault } = harness({ groups: [] });
    const result = await handleVaultIngest(
      { ...ctx, method: "GET", path: "/projects/prog-1/vault-allowlist", body: {} },
      vault,
    );
    expect(result?.statusCode).toBe(403);
  });

  it("returns 404 when reading allowlist for a missing project", async () => {
    const { ctx, vault } = harness({ groups: ["one80-admin"] });
    const result = await handleVaultIngest(
      { ...ctx, method: "GET", path: "/projects/missing/vault-allowlist", body: {} },
      vault,
    );
    expect(result?.statusCode).toBe(404);
  });

  it("returns enabled true when the project is on the allowlist", async () => {
    const { ctx, vault } = harness({
      groups: ["one80-admin"],
      allowlistSeed: [{ customerId: "cust-1", programId: "prog-1" }],
    });
    const result = await handleVaultIngest(
      { ...ctx, method: "GET", path: "/projects/prog-1/vault-allowlist", body: {} },
      vault,
    );
    expect(result?.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual({
      customerId: "cust-1",
      programId: "prog-1",
      enabled: true,
    });
  });

  it("returns enabled false when the project is not on the allowlist", async () => {
    const { ctx, vault } = harness({ groups: ["one80-admin"], allowlistSeed: [] });
    const result = await handleVaultIngest(
      { ...ctx, method: "GET", path: "/projects/prog-1/vault-allowlist", body: {} },
      vault,
    );
    expect(result?.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual({
      customerId: "cust-1",
      programId: "prog-1",
      enabled: false,
    });
  });

  it("records allowlist for an admin", async () => {
    const { ctx, vault, allowlist } = harness({ groups: ["one80-admin"] });
    const result = await handleVaultIngest(
      { ...ctx, method: "PUT", path: "/projects/prog-1/vault-allowlist", body: { enabled: true } },
      vault,
    );
    expect(result?.statusCode).toBe(200);
    expect(allowlist).toEqual([{ customerId: "cust-1", programId: "prog-1" }]);
  });

  it("ingests the program once when an admin enables the allowlist", async () => {
    const saved: IngestResult[] = [];
    const { ctx, vault, allowlist } = harness({
      groups: ["one80-admin"],
      allowlistSeed: [],
      onSave: (result) => saved.push(result),
    });
    const result = await handleVaultIngest(
      { ...ctx, method: "PUT", path: "/projects/prog-1/vault-allowlist", body: { enabled: true } },
      vault,
    );
    expect(result?.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual({
      customerId: "cust-1",
      programId: "prog-1",
      enabled: true,
    });
    expect(allowlist).toEqual([{ customerId: "cust-1", programId: "prog-1" }]);
    expect(saved).toHaveLength(1);
  });

  it("removes the allowlist without ingesting when an admin disables it", async () => {
    const saved: IngestResult[] = [];
    const { ctx, vault, allowlist } = harness({
      groups: ["one80-admin"],
      allowlistSeed: [{ customerId: "cust-1", programId: "prog-1" }],
      onSave: (result) => saved.push(result),
    });
    const result = await handleVaultIngest(
      { ...ctx, method: "PUT", path: "/projects/prog-1/vault-allowlist", body: { enabled: false } },
      vault,
    );
    expect(result?.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual({
      customerId: "cust-1",
      programId: "prog-1",
      enabled: false,
    });
    expect(allowlist).toEqual([]);
    expect(saved).toHaveLength(0);
  });

  it("returns 200 when enabling the allowlist if ingest saveRows throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let saves = 0;
    const { ctx, vault, allowlist } = harness({
      groups: ["one80-admin"],
      allowlistSeed: [],
      onSave: () => {
        saves += 1;
        throw new Error("save blew up");
      },
    });
    const result = await handleVaultIngest(
      { ...ctx, method: "PUT", path: "/projects/prog-1/vault-allowlist", body: { enabled: true } },
      vault,
    );
    expect(result?.statusCode).toBe(200);
    expect(JSON.parse(result!.body)).toEqual({
      customerId: "cust-1",
      programId: "prog-1",
      enabled: true,
    });
    expect(allowlist).toEqual([{ customerId: "cust-1", programId: "prog-1" }]);
    expect(saves).toBe(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("does not save chunks for a document belonging to another customer", async () => {
    const saved: IngestResult[] = [];
    const { ctx, vault } = harness({
      groups: ["one80-admin"],
      allowlistSeed: [{ customerId: "cust-1", programId: "prog-1" }],
      documents: [
        {
          documentId: "doc-own",
          customerId: "cust-1",
          projectId: "prog-1",
          name: "own.txt",
          sourceLabel: "compass-upload",
          deletedAt: null,
          currentVersionId: "ver-own",
        },
        {
          documentId: "doc-other",
          customerId: "cust-other",
          projectId: "prog-1",
          name: "other.txt",
          sourceLabel: "compass-upload",
          deletedAt: null,
          currentVersionId: "ver-other",
        },
      ],
      versions: [
        {
          versionId: "ver-own",
          documentId: "doc-own",
          contentType: "text/plain",
          fileName: "own.txt",
          status: "stored",
          text: "own customer file",
        },
        {
          versionId: "ver-other",
          documentId: "doc-other",
          contentType: "text/plain",
          fileName: "other.txt",
          status: "stored",
          text: "other customer file",
        },
      ],
      onSave: (result) => saved.push(result),
    });

    const result = await handleVaultIngest(
      { ...ctx, method: "POST", path: "/projects/prog-1/vault-ingest", body: {} },
      vault,
    );
    expect(result?.statusCode).toBe(200);
    expect(saved).toHaveLength(1);
    expect(saved[0].chunks.every((chunk) => chunk.customerId === "cust-1")).toBe(true);
    expect(saved[0].chunks.some((chunk) => chunk.documentId === "doc-other")).toBe(false);
    expect(saved[0].chunks.some((chunk) => chunk.documentId === "doc-own")).toBe(true);
  });

  it("returns 409 when the project is not allowlisted", async () => {
    const { ctx, vault } = harness({ groups: ["one80-admin"], allowlistSeed: [] });
    const result = await handleVaultIngest(
      { ...ctx, method: "POST", path: "/projects/prog-1/vault-ingest", body: {} },
      vault,
    );
    expect(result?.statusCode).toBe(409);
  });

  it("rejects non-admin vault-chunks reads with 403", async () => {
    const { ctx, vault } = harness({ groups: [] });
    const result = await handleVaultIngest(
      { ...ctx, method: "GET", path: "/projects/prog-1/vault-chunks", body: {} },
      vault,
    );
    expect(result?.statusCode).toBe(403);
  });

  it("returns 404 when listing chunks for a missing project", async () => {
    const { ctx, vault } = harness({ groups: ["one80-admin"] });
    const result = await handleVaultIngest(
      { ...ctx, method: "GET", path: "/projects/missing/vault-chunks", body: {} },
      vault,
    );
    expect(result?.statusCode).toBe(404);
  });

  it("returns 409 when listing chunks for a program that is not allowlisted", async () => {
    const { ctx, vault } = harness({ groups: ["one80-admin"], allowlistSeed: [] });
    const result = await handleVaultIngest(
      { ...ctx, method: "GET", path: "/projects/prog-1/vault-chunks", body: {} },
      vault,
    );
    expect(result?.statusCode).toBe(409);
    expect(JSON.parse(result!.body).message).toMatch(/not on the vault allowlist/i);
  });

  it("lists chunks without embeddings for an allowlisted program", async () => {
    const { ctx, vault } = harness({
      groups: ["one80-admin"],
      allowlistSeed: [{ customerId: "cust-1", programId: "prog-1" }],
      chunks: [
        {
          id: "chunk-1",
          customerId: "cust-1",
          programId: "prog-1",
          sourceType: "document",
          sourceId: "doc-1",
          recordedAt: "2026-10-26T12:00:00.000Z",
          sourceLabel: "compass-upload",
          documentId: "doc-1",
          versionId: "ver-1",
          body: "filed evidence",
          embedding: [0.1, 0.2, 0.3],
        },
        {
          id: "chunk-other",
          customerId: "cust-other",
          programId: "prog-1",
          sourceType: "document",
          sourceId: "doc-x",
          recordedAt: "2026-10-26T12:00:00.000Z",
          sourceLabel: "compass-upload",
          documentId: "doc-x",
          versionId: "ver-x",
          body: "foreign",
          embedding: null,
        },
      ],
    });
    const result = await handleVaultIngest(
      { ...ctx, method: "GET", path: "/projects/prog-1/vault-chunks", body: {} },
      vault,
    );
    expect(result?.statusCode).toBe(200);
    const body = JSON.parse(result!.body) as { chunks: Record<string, unknown>[] };
    expect(body.chunks).toHaveLength(1);
    expect(body.chunks[0]).toMatchObject({
      id: "chunk-1",
      customerId: "cust-1",
      programId: "prog-1",
      body: "filed evidence",
    });
    expect(body.chunks[0]).not.toHaveProperty("embedding");
  });

  it("maps Lambda not-allowlisted errors to 409 when listing chunks", async () => {
    const { ctx, vault } = harness({
      groups: ["one80-admin"],
      allowlistSeed: [{ customerId: "cust-1", programId: "prog-1" }],
      onLoadChunks: () => {
        throw new Error("Vault Lambda failed: list-chunks program is not allowlisted");
      },
    });
    const result = await handleVaultIngest(
      { ...ctx, method: "GET", path: "/projects/prog-1/vault-chunks", body: {} },
      vault,
    );
    expect(result?.statusCode).toBe(409);
  });
});

function harness(options: {
  groups: string[];
  allowlistSeed?: AllowlistEntry[];
  documents?: IngestDocument[];
  versions?: IngestVersion[];
  chunks?: VaultChunk[];
  onSave?: (result: IngestResult) => void;
  onLoadChunks?: (customerId: string, programId: string) => Promise<VaultChunk[]> | VaultChunk[];
}) {
  const allowlist: AllowlistEntry[] = [...(options.allowlistSeed ?? [])];
  const documents = options.documents ?? [];
  const versions = options.versions ?? [];
  const principal: Principal = { userId: "admin-1", groups: options.groups, mfa: true };
  const deps = {
    store: {
      async getProject(projectId: string) {
        if (projectId !== "prog-1") return null;
        return { projectId: "prog-1", customerId: "cust-1", name: "Alpha", projectKey: "ALPH", createdAt: "2026-01-01T00:00:00.000Z" };
      },
    },
    now: () => new Date("2026-10-26T12:00:00.000Z"),
    newId: () => "id-1",
  } as unknown as HandlerDeps;

  const vault: VaultIngestDeps = {
    async loadPlan(projectId) {
      if (projectId !== "prog-1") return null;
      return {
        project: { customerId: "cust-1", projectId: "prog-1", name: "Alpha" },
        issues: [
          {
            issueId: "issue-1",
            title: "Task",
            description: null,
            status: "Todo",
            issueType: "Task",
            startDate: null,
            finishDate: null,
            predecessorIds: [],
            assignees: [],
          },
        ],
        milestones: [],
        risks: [],
      };
    },
    async loadDocuments() {
      return documents;
    },
    async loadVersionText(documentId, versionId) {
      return versions.find((version) => version.documentId === documentId && version.versionId === versionId) ?? null;
    },
    async readAllowlist() {
      return [...allowlist];
    },
    async saveAllowlist(entry, enabled) {
      const index = allowlist.findIndex((row) => row.customerId === entry.customerId && row.programId === entry.programId);
      if (enabled) {
        if (index < 0) allowlist.push(entry);
      } else if (index >= 0) {
        allowlist.splice(index, 1);
      }
    },
    async saveRows(result) {
      options.onSave?.(result);
    },
    async loadChunks(customerId, programId) {
      if (options.onLoadChunks) return options.onLoadChunks(customerId, programId);
      void customerId;
      void programId;
      return options.chunks ?? [];
    },
  };

  return {
    allowlist,
    vault,
    ctx: {
      deps,
      principal,
      method: "GET",
      path: "/",
      body: {},
      correlationId: "corr-1",
    },
  };
}
