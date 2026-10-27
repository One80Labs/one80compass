import { describe, expect, it } from "vitest";
import type { Principal } from "../../../packages/authz/src/index";
import type { AllowlistEntry } from "../../vault/src/allowlist";
import type { IngestDocument, IngestResult, IngestVersion } from "../../vault/src/ingest";
import type { HandlerDeps } from "./router";
import { handleVaultIngest, type VaultIngestDeps } from "./vault-ingest";

describe("handleVaultIngest", () => {
  it("rejects non-admin allowlist updates with 403", async () => {
    const { ctx, vault } = harness({ groups: [] });
    const result = await handleVaultIngest(
      { ...ctx, method: "PUT", path: "/projects/prog-1/vault-allowlist", body: { enabled: true } },
      vault,
    );
    expect(result?.statusCode).toBe(403);
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
});

function harness(options: {
  groups: string[];
  allowlistSeed?: AllowlistEntry[];
  documents?: IngestDocument[];
  versions?: IngestVersion[];
  onSave?: (result: IngestResult) => void;
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
          },
        ],
        milestones: [],
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
