import { describe, expect, it, vi } from "vitest";
import type { AllowlistEntry } from "../../vault/src/allowlist";
import type { VaultIngestDeps } from "./vault-ingest";
import { runScheduledVaultIngest } from "./vault-schedule";

const recordedAt = "2026-10-29T12:00:00.000Z";
const correlationId = "corr-schedule";

describe("runScheduledVaultIngest", () => {
  it("returns zeros and does not ingest when the allowlist is empty", async () => {
    const loadPlan = vi.fn();
    const vault = fakeVault({ allowlist: [], loadPlan });

    const summary = await runScheduledVaultIngest({ vault, recordedAt, correlationId });

    expect(summary).toEqual({
      programs: 0,
      ingested: 0,
      skipped: 0,
      failed: 0,
      failures: [],
    });
    expect(loadPlan).not.toHaveBeenCalled();
  });

  it("counts one ingested program and one skipped program", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const vault = fakeVault({
      allowlist: [
        { customerId: "cust-1", programId: "prog-ok" },
        { customerId: "cust-1", programId: "prog-missing" },
      ],
      plans: {
        "prog-ok": plan("cust-1", "prog-ok", "Alpha"),
      },
    });

    const summary = await runScheduledVaultIngest({ vault, recordedAt, correlationId });

    expect(summary).toEqual({
      programs: 2,
      ingested: 1,
      skipped: 1,
      failed: 0,
      failures: [],
    });
    expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toMatchObject({
      correlationId,
      message: "vault scheduled ingest completed",
      projectId: "prog-ok",
      reason: "schedule",
      rowCount: 1,
      chunkCount: 0,
    });
    info.mockRestore();
  });

  it("records a thrown ingest and still resolves", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const vault = fakeVault({
      allowlist: [{ customerId: "cust-1", programId: "prog-boom" }],
      loadPlan: async () => {
        throw new Error("plan store down");
      },
    });

    const summary = await runScheduledVaultIngest({ vault, recordedAt, correlationId });

    expect(summary.failed).toBe(1);
    expect(summary.failures[0]?.programId).toBe("prog-boom");
    expect(summary.failures[0]?.message).toBe("plan store down");
    expect(summary.ingested).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(JSON.parse(String(error.mock.calls[0]?.[0]))).toEqual({
      correlationId,
      message: "vault scheduled ingest failed",
      projectId: "prog-boom",
      reason: "schedule",
      error: "plan store down",
    });
    error.mockRestore();
  });

  it("ingests duplicate allowlist rows for the same customer and program once", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const loadPlan = vi.fn(async (projectId: string) => {
      if (projectId !== "prog-1") return null;
      return plan("cust-1", "prog-1", "Alpha");
    });
    const vault = fakeVault({
      allowlist: [
        { customerId: "cust-1", programId: "prog-1" },
        { customerId: "cust-1", programId: "prog-1" },
      ],
      loadPlan,
    });

    const summary = await runScheduledVaultIngest({ vault, recordedAt, correlationId });

    expect(loadPlan).toHaveBeenCalledTimes(1);
    expect(summary.programs).toBe(1);
    expect(summary.ingested).toBe(1);
    expect(summary.skipped).toBe(0);
    expect(summary.failed).toBe(0);
    info.mockRestore();
  });
});

function plan(customerId: string, programId: string, name: string) {
  return {
    project: { customerId, projectId: programId, name },
    issues: [],
    milestones: [],
    risks: [],
  };
}

/** In-memory vault ports. No AWS SDK. */
function fakeVault(options: {
  allowlist: AllowlistEntry[];
  plans?: Record<string, ReturnType<typeof plan>>;
  loadPlan?: VaultIngestDeps["loadPlan"];
}): VaultIngestDeps {
  const loadPlan: VaultIngestDeps["loadPlan"] =
    options.loadPlan ??
    (async (projectId) => {
      return options.plans?.[projectId] ?? null;
    });

  return {
    loadPlan,
    async loadDocuments() {
      return [];
    },
    async loadVersionText() {
      return null;
    },
    async readAllowlist() {
      return [...options.allowlist];
    },
    async saveAllowlist() {
      return undefined;
    },
    async saveRows() {
      return undefined;
    },
    async loadChunks() {
      return [];
    },
  };
}
