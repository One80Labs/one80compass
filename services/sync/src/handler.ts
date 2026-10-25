import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { SyncMessage } from "../../../packages/domain/src/index";
import { DynamoStore } from "../../api/src/store";
import { applyGithubDelivery } from "./apply";
import { githubFromEnv, type GitHubGateway } from "./github";

const tableName = process.env.TABLE_NAME;
const store = tableName ? new DynamoStore(DynamoDBDocumentClient.from(new DynamoDBClient({})), tableName) : null;
const github = githubFromEnv(() => new Date());

type SqsEvent = { Records: { body: string }[] };

/** Queue consumer and scheduled reconciliation. */
export async function handler(event: SqsEvent | { source?: string }): Promise<void> {
  if (!store) throw new Error("TABLE_NAME is required.");
  if ("Records" in event) {
    for (const record of event.Records) {
      await processMessage(store, github, JSON.parse(record.body) as SyncMessage, new Date().toISOString());
    }
    return;
  }
  await processMessage(store, github, { type: "reconcile" }, new Date().toISOString());
}

export async function processMessage(store: DynamoStore, gateway: GitHubGateway, message: SyncMessage, now: string): Promise<void> {
  if (message.type === "webhook") {
    const settingsList = await store.listSettings();
    for (const settings of settingsList) {
      const issues = await store.listIssues(settings.projectId);
      const next = applyGithubDelivery(issues, settings, message.eventName, message.payload, now);
      if (!next) continue;
      for (const issue of next) await store.putIssue(issue);
      await store.putSync({ projectId: settings.projectId, customerId: settings.customerId, status: "ok", detail: null, updatedAt: now });
    }
    await store.claimDelivery(message.deliveryId);
    return;
  }
  if (message.type === "reconcile") {
    const settingsList = (await store.listSettings()).filter((settings) => !message.projectId || settings.projectId === message.projectId);
    for (const settings of settingsList) {
      if (!gateway.configured) {
        await store.putSync({
          projectId: settings.projectId,
          customerId: settings.customerId,
          status: "not_configured",
          detail: "GitHub App is not configured.",
          updatedAt: now,
        });
        continue;
      }
      try {
        const result = await gateway.reconcile(settings);
        await store.putSettings(result.settings);
        const previous = await store.listIssues(settings.projectId);
        const seen = new Set(result.issues.map((issue) => issue.issueId));
        for (const issue of result.issues) await store.putIssue(issue);
        for (const issue of previous) {
          if (!seen.has(issue.issueId) && issue.inProject) await store.putIssue({ ...issue, inProject: false, updatedAt: now });
        }
        await store.putSync({ projectId: settings.projectId, customerId: settings.customerId, status: "ok", detail: null, updatedAt: now });
      } catch (error) {
        await store.putSync({
          projectId: settings.projectId,
          customerId: settings.customerId,
          status: "failed",
          detail: error instanceof Error ? error.message.slice(0, 300) : "Sync failed.",
          updatedAt: now,
        });
        throw error;
      }
    }
    return;
  }
  const settings = await store.getSettings(message.projectId);
  const issue = await store.getIssue(message.projectId, message.issueId);
  if (!settings || !issue) return;
  if (!gateway.configured) {
    await store.putSync({ projectId: settings.projectId, customerId: settings.customerId, status: "failed", detail: "GitHub App is not configured.", updatedAt: now });
    return;
  }
  try {
    const updated = await gateway.updateIssue(settings, issue, message);
    await store.putIssue(updated);
    await store.putSync({ projectId: settings.projectId, customerId: settings.customerId, status: "ok", detail: null, updatedAt: now });
  } catch (error) {
    await store.putSync({
      projectId: settings.projectId,
      customerId: settings.customerId,
      status: "failed",
      detail: error instanceof Error ? error.message.slice(0, 300) : "Sync failed.",
      updatedAt: now,
    });
    throw error;
  }
}
