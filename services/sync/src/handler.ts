import { randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import type { PlanIssue, ProjectSettings, SyncMessage } from "../../../packages/domain/src/index";
import { parentStatusChanges, rollupTargets } from "../../../packages/domain/src/hierarchy";
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
      await rollUpParents(store, gateway, settings, changedIssue(issues, next), now, message.deliveryId);
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
        await rollUpParents(store, gateway, result.settings, null, now, "reconcile");
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
  if (message.type === "ensure-date-fields") {
    const settings = await store.getSettings(message.projectId);
    if (!settings) return;
    if (!gateway.configured) {
      await store.putSync({ projectId: settings.projectId, customerId: settings.customerId, status: "failed", detail: "GitHub App is not configured.", updatedAt: now });
      return;
    }
    try {
      const result = await gateway.ensureDateFields(settings);
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
    return;
  }
  if (message.type === "update-schedule") {
    const settings = await store.getSettings(message.projectId);
    if (!settings) return;
    if (!gateway.configured) {
      await store.putSync({ projectId: settings.projectId, customerId: settings.customerId, status: "failed", detail: "GitHub App is not configured.", updatedAt: now });
      return;
    }
    try {
      for (const change of message.changes) {
        const issue = await store.getIssue(message.projectId, change.issueId);
        if (!issue) continue;
        const updated = await gateway.updateIssue(settings, issue, change);
        await store.putIssue(updated);
      }
      await rollUpParents(store, gateway, settings, message.changes[0]?.issueId ?? null, now, message.idempotencyKey);
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
    return;
  }
  if (message.type === "set-dependency") {
    const settings = await store.getSettings(message.projectId);
    const issue = await store.getIssue(message.projectId, message.issueId);
    if (!settings || !issue) return;
    if (!gateway.configured) {
      await store.putSync({ projectId: settings.projectId, customerId: settings.customerId, status: "failed", detail: "GitHub App is not configured.", updatedAt: now });
      return;
    }
    try {
      const updated = await gateway.setDependency(settings, issue, message.predecessorId, message.action);
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
    await rollUpParents(store, gateway, settings, message.issueId, now, message.idempotencyKey);
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

/** Writes parent Done and reopen changes back to GitHub and records each one. */
async function rollUpParents(
  store: DynamoStore,
  gateway: GitHubGateway,
  settings: ProjectSettings,
  initiatingIssueId: string | null,
  now: string,
  correlationId: string,
): Promise<void> {
  if (!gateway.configured) return;
  const issues = await store.listIssues(settings.projectId);
  const targets = rollupTargets(settings.doneStatuses, settings.columns);
  const changes = parentStatusChanges(issues, settings.doneStatuses, targets.doneStatus, targets.reopenStatus, initiatingIssueId);
  for (const change of changes) {
    const issue = issues.find((item) => item.issueId === change.issueId);
    if (!issue?.itemId || !settings.statusOptions.some((option) => option.name === change.to)) continue;
    const updated = await gateway.updateIssue(settings, issue, { status: change.to });
    await store.putIssue(updated);
    await store.putAudit({
      eventId: randomUUID(),
      customerId: settings.customerId,
      projectId: settings.projectId,
      actorUserId: "github-sync",
      action: "issue.parent_status",
      targetType: "issue",
      targetId: change.issueId,
      before: { status: change.from },
      after: { status: change.to, initiatingIssueId: change.initiatingIssueId },
      at: now,
      correlationId,
    });
  }
}

function changedIssue(before: PlanIssue[], after: PlanIssue[]): string | null {
  for (const issue of after) {
    const previous = before.find((item) => item.issueId === issue.issueId);
    if (!previous || previous.status !== issue.status || previous.parentIssueId !== issue.parentIssueId) return issue.issueId;
  }
  return null;
}
