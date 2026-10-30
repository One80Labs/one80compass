import { Workbook } from "exceljs";
import { describe, expect, it } from "vitest";
import { createLoadVaultChunks, createVaultIngestDeps } from "./vault-client";
import type { Store } from "./store";

describe("vault client wiring", () => {
  it("returns null deps when the vault function name is missing", () => {
    expect(
      createVaultIngestDeps({
        store: {} as Store,
        vaultFunctionName: undefined,
        readObjectBytes: async () => new Uint8Array(),
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
              assignees: [{ id: "U_ada", login: "ada", name: "Ada" }],
            },
          ];
        },
        async getSettings() {
          return { milestones: [{ id: "m1", title: "Launch", dueOn: "2026-12-01" }] };
        },
        async listRisks() {
          return [
            {
              riskId: "risk-1",
              projectId: "prog-1",
              customerId: "cust-1",
              title: "Slip",
              severity: "high",
              description: "Dates collide",
              dateCleared: null,
              notes: "",
              issueId: "issue-1",
              predecessorId: null,
              updatedAt: "2026-10-26T00:00:00.000Z",
              updatedBy: "admin",
            },
          ];
        },
        async listDocuments() {
          return [];
        },
        async getVersion() {
          return null;
        },
      } as unknown as Store,
      vaultFunctionName: "one80compass-dev-vault",
      readObjectBytes: async () => new Uint8Array(),
      invokeVault: async <T,>(event: Record<string, unknown>) => {
        events.push(event);
        if (event.type === "read-allowlist") {
          return { allowlist: [{ customerId: "cust-1", programId: "prog-1" }] } as T;
        }
        if (event.type === "list-chunks") {
          return { chunks: [] } as T;
        }
        return { ok: true } as T;
      },
    });
    expect(deps).not.toBeNull();
    await expect(deps!.readAllowlist()).resolves.toEqual([{ customerId: "cust-1", programId: "prog-1" }]);
    await deps!.saveAllowlist({ customerId: "cust-1", programId: "prog-1" }, true);
    await deps!.saveRows({ rows: [], relations: [], chunks: [] });
    await expect(deps!.loadChunks("cust-1", "prog-1")).resolves.toEqual([]);
    const plan = await deps!.loadPlan("prog-1");
    expect(plan?.milestones).toEqual([{ id: "m1", title: "Launch", dueOn: "2026-12-01" }]);
    expect(plan?.issues[0]?.assignees).toEqual([{ id: "U_ada", login: "ada", name: "Ada" }]);
    expect(plan?.risks).toEqual([
      {
        riskId: "risk-1",
        title: "Slip",
        description: "Dates collide",
        notes: "",
        severity: "high",
        issueId: "issue-1",
        dateCleared: null,
      },
    ]);
    expect(events.map((event) => event.type)).toEqual(["read-allowlist", "save-allowlist", "save-rows", "list-chunks"]);
  });

  it("loads extracted workbook text without replacing the stored version", async () => {
    const workbook = new Workbook();
    workbook.addWorksheet("Plan").addRow(["Launch"]);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    let writes = 0;
    const deps = createVaultIngestDeps({
      store: {
        async getVersion() {
          return {
            versionId: "v1",
            documentId: "d1",
            objectKey: "objects/plan.xlsx",
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            fileName: "plan.xlsx",
            status: "stored",
            projectId: "prog-1",
          };
        },
        async putVersion() {
          writes += 1;
        },
        async putDocument() {
          writes += 1;
        },
      } as unknown as Store,
      vaultFunctionName: "one80compass-dev-vault",
      readObjectBytes: async () => bytes,
      invokeVault: async <T,>() => ({}) as T,
    });
    const loaded = await deps!.loadVersionText("d1", "v1");
    expect(loaded?.fileName).toBe("plan.xlsx");
    expect(loaded?.contentType).toBe("text/csv");
    expect(loaded?.text).toContain("Launch");
    expect(writes).toBe(0);
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
