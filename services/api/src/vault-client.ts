import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { AllowlistEntry } from "../../vault/src/allowlist";
import type {
  IngestDocument,
  IngestIssue,
  IngestMilestone,
  IngestResult,
  IngestRisk,
  IngestVersion,
} from "../../vault/src/ingest";
import type { VaultChunk } from "../../vault/src/types";
import type { Store } from "./store";
import type { VaultIngestDeps } from "./vault-ingest";

type VaultInvoke = <T>(event: Record<string, unknown>) => Promise<T>;

/** Invoke the staff vault Lambda. The API only needs lambda:InvokeFunction. */
export function createVaultInvoker(functionName: string, client = new LambdaClient({})): VaultInvoke {
  return async function invokeVault<T>(event: Record<string, unknown>): Promise<T> {
    const response = await client.send(
      new InvokeCommand({
        FunctionName: functionName,
        Payload: Buffer.from(JSON.stringify(event)),
      }),
    );
    const raw = response.Payload ? Buffer.from(response.Payload).toString("utf8") : "";
    if (response.FunctionError) {
      throw new Error(`Vault Lambda failed: ${raw || response.FunctionError}`);
    }
    if (!raw) throw new Error("Vault Lambda returned an empty payload.");
    return JSON.parse(raw) as T;
  };
}

/** Read UTF-8 object text from the documents bucket. Binary or missing objects yield an empty string. */
export function createObjectTextReader(bucket: string, client = new S3Client({})) {
  return async function readObjectText(objectKey: string): Promise<string> {
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
      return (await result.Body?.transformToString("utf-8")) ?? "";
    } catch {
      return "";
    }
  };
}

/**
 * Wire admin vault ingest to DynamoDB/S3 reads and vault Lambda writes.
 * Returns null when VAULT_FUNCTION_NAME is not set.
 */
export function createVaultIngestDeps(options: {
  store: Store;
  vaultFunctionName: string | undefined;
  readObjectText: (objectKey: string) => Promise<string>;
  invokeVault?: VaultInvoke;
}): VaultIngestDeps | null {
  const functionName = options.vaultFunctionName?.trim();
  if (!functionName) return null;
  const invoke = options.invokeVault ?? createVaultInvoker(functionName);
  const { store, readObjectText } = options;

  return {
    async loadPlan(projectId) {
      const project = await store.getProject(projectId);
      if (!project) return null;
      const [issues, settings, risks] = await Promise.all([
        store.listIssues(projectId),
        store.getSettings(projectId),
        store.listRisks(projectId),
      ]);
      const mappedIssues: IngestIssue[] = issues.map((issue) => ({
        issueId: issue.issueId,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        issueType: issue.issueType,
        startDate: issue.startDate,
        finishDate: issue.finishDate,
        predecessorIds: issue.predecessorIds ?? [],
        assignees: (issue.assignees ?? []).map((person) => ({
          id: person.id,
          login: person.login,
          name: person.name,
        })),
      }));
      const milestones: IngestMilestone[] = (settings?.milestones ?? []).map((milestone) => ({
        id: milestone.id,
        title: milestone.title,
        dueOn: milestone.dueOn,
      }));
      const mappedRisks: IngestRisk[] = risks.map((risk) => ({
        riskId: risk.riskId,
        title: risk.title,
        description: risk.description,
        notes: risk.notes,
        severity: risk.severity,
        issueId: risk.issueId,
        dateCleared: risk.dateCleared,
      }));
      return {
        project: { customerId: project.customerId, projectId: project.projectId, name: project.name },
        issues: mappedIssues,
        milestones,
        risks: mappedRisks,
      };
    },
    async loadDocuments(projectId) {
      const documents = await store.listDocuments(projectId);
      return documents.map(
        (document): IngestDocument => ({
          documentId: document.documentId,
          customerId: document.customerId,
          projectId: document.projectId,
          name: document.name,
          sourceLabel: document.sourceLabel,
          deletedAt: document.deletedAt,
          currentVersionId: document.currentVersionId,
        }),
      );
    },
    async loadVersionText(documentId, versionId) {
      const version = await store.getVersion(documentId, versionId);
      if (!version) return null;
      const text = await readObjectText(version.objectKey);
      const loaded: IngestVersion = {
        versionId: version.versionId,
        documentId: version.documentId,
        contentType: version.contentType,
        fileName: version.fileName,
        status: version.status,
        text,
      };
      return loaded;
    },
    async readAllowlist() {
      const payload = await invoke<{ allowlist: AllowlistEntry[] }>({ type: "read-allowlist" });
      return payload.allowlist ?? [];
    },
    async saveAllowlist(entry, enabled) {
      await invoke({ type: "save-allowlist", entry, enabled });
    },
    async saveRows(result: IngestResult) {
      await invoke({ type: "save-rows", result });
    },
  };
}

/** Load vault chunks for a status draft through the vault Lambda. */
export function createLoadVaultChunks(options: {
  vaultFunctionName: string | undefined;
  invokeVault?: VaultInvoke;
}): ((customerId: string, programId: string) => Promise<VaultChunk[]>) | undefined {
  const functionName = options.vaultFunctionName?.trim();
  if (!functionName) return undefined;
  const invoke = options.invokeVault ?? createVaultInvoker(functionName);
  return async (customerId, programId) => {
    const payload = await invoke<{ chunks: VaultChunk[] }>({ type: "list-chunks", customerId, programId });
    return payload.chunks ?? [];
  };
}
