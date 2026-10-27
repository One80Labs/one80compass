import { describe, expect, it } from "vitest";
import { createLoadVaultChunks, createVaultIngestDeps } from "./vault-client";
import type { Store } from "./store";

describe("vault client wiring", () => {
  it("returns null deps when the vault function name is missing", () => {
    expect(
      createVaultIngestDeps({
        store: {} as Store,
        vaultFunctionName: undefined,
        readObjectText: async () => "",
      }),
    ).toBeNull();
    expect(createLoadVaultChunks({ vaultFunctionName: " " })).toBeUndefined();
  });

  it("reads allowlist and saves rows through the vault invoker", async () => {
    const events: Record<string, unknown>[] = [];
    const deps = createVaultIngestDeps({
      store: {
        async getProject() {
          return { projectId: "prog-1", customerId: "cust-1", name: "Demo", projectKey: "DEMO" };
        },
        async listIssues() {
          return [
            {
              issueId: "issue-1",
              title: "Task",
              description: null,
              status: "Ready",
              issueType: "Task",
              startDate: null,
              finishDate: null,
              predecessorIds: [],
            },
          ];
        },
        async getSettings() {
          return { milestones: [{ id: "m1", title: "Launch", dueOn: "2026-12-01" }] };
        },
        async listDocuments() {
          return [];
        },
        async getVersion() {
          return null;
        },
      } as unknown as Store,
      vaultFunctionName: "one80compass-dev-vault",
      readObjectText: async () => "",
      invokeVault: async <T,>(event: Record<string, unknown>) => {
        events.push(event);
        if (event.type === "read-allowlist") {
          return { allowlist: [{ customerId: "cust-1", programId: "prog-1" }] } as T;
        }
        return { ok: true } as T;
      },
    });
    expect(deps).not.toBeNull();
    await expect(deps!.readAllowlist()).resolves.toEqual([{ customerId: "cust-1", programId: "prog-1" }]);
    await deps!.saveAllowlist({ customerId: "cust-1", programId: "prog-1" }, true);
    await deps!.saveRows({ rows: [], relations: [], chunks: [] });
    const plan = await deps!.loadPlan("prog-1");
    expect(plan?.milestones).toEqual([{ id: "m1", title: "Launch", dueOn: "2026-12-01" }]);
    expect(events.map((event) => event.type)).toEqual(["read-allowlist", "save-allowlist", "save-rows"]);
  });

  it("loads chunks through list-chunks", async () => {
    const load = createLoadVaultChunks({
      vaultFunctionName: "one80compass-dev-vault",
      invokeVault: async <T,>(event: Record<string, unknown>) => {
        expect(event).toEqual({ type: "list-chunks", customerId: "cust-1", programId: "prog-1" });
        return {
          chunks: [
            {
              id: "c1",
              customerId: "cust-1",
              programId: "prog-1",
              sourceLabel: "compass-upload",
              documentId: "d1",
              versionId: "v1",
              sourceType: "compass",
              sourceId: "d1",
              body: "note",
              recordedAt: "2026-10-26T00:00:00.000Z",
              embedding: null,
            },
          ],
        } as T;
      },
    });
    await expect(load!("cust-1", "prog-1")).resolves.toHaveLength(1);
  });
});
