import type { ScheduleConflict } from "./dependencies";
import { isIsoDate } from "./schedule";

/** Administrator-chosen severity on the project plan risk register. */
export type RiskSeverity = "critical" | "high" | "medium" | "low";

export const RISK_SEVERITIES: RiskSeverity[] = ["critical", "high", "medium", "low"];

/** Persisted risk row. Schedule-linked rows use a stable id from issue + predecessor. */
export type RiskRecord = {
  riskId: string;
  projectId: string;
  customerId: string;
  title: string;
  severity: RiskSeverity | null;
  description: string;
  /** YYYY-MM-DD when an administrator marks the risk cleared. */
  dateCleared: string | null;
  notes: string;
  /** Successor issue when this risk tracks a hard blocker conflict. */
  issueId: string | null;
  predecessorId: string | null;
  updatedAt: string;
  updatedBy: string;
};

export type RiskRegisterRow = RiskRecord & {
  status: "open" | "cleared";
  /** Live blocker conflict while the schedule still breaks the rule. */
  conflictReason: ScheduleConflict["reason"] | null;
};

/** Stable id for a schedule conflict so edits round-trip without creating duplicates. */
export function scheduleRiskId(issueId: string, predecessorId: string): string {
  return `schedule:${issueId}:${predecessorId}`;
}

export function riskSeverityFromStore(value: unknown): RiskSeverity | null {
  return value === "critical" || value === "high" || value === "medium" || value === "low" ? value : null;
}

function conflictDescription(conflict: ScheduleConflict): string {
  if (conflict.reason === "unscheduled") {
    return `Blocked by “${conflict.predecessorTitle}”, but this task has no start and finish dates.`;
  }
  return `Start overlaps the finish of “${conflict.predecessorTitle}”; it should start the day after that blocker finishes.`;
}

/**
 * Combines stored administrator edits with live hard-blocker schedule conflicts.
 * Active conflicts always appear. Stored rows remain after the conflict clears so Date Cleared and notes are kept.
 */
export function mergeRiskRegister(stored: RiskRecord[], conflicts: ScheduleConflict[]): RiskRegisterRow[] {
  const byScheduleKey = new Map<string, RiskRecord>();
  const manual: RiskRecord[] = [];
  for (const row of stored) {
    if (row.issueId && row.predecessorId) byScheduleKey.set(`${row.issueId}:${row.predecessorId}`, row);
    else manual.push(row);
  }

  const rows: RiskRegisterRow[] = [];
  const seen = new Set<string>();

  for (const conflict of conflicts) {
    const key = `${conflict.issueId}:${conflict.predecessorId}`;
    seen.add(key);
    const existing = byScheduleKey.get(key);
    const riskId = existing?.riskId ?? scheduleRiskId(conflict.issueId, conflict.predecessorId);
    const title = existing?.title?.trim() ? existing.title : conflict.title;
    const description = existing?.description?.trim() ? existing.description : conflictDescription(conflict);
    const dateCleared = existing?.dateCleared && isIsoDate(existing.dateCleared) ? existing.dateCleared : null;
    rows.push({
      riskId,
      projectId: existing?.projectId ?? "",
      customerId: existing?.customerId ?? "",
      title,
      severity: existing?.severity ?? null,
      description,
      dateCleared,
      notes: existing?.notes ?? "",
      issueId: conflict.issueId,
      predecessorId: conflict.predecessorId,
      updatedAt: existing?.updatedAt ?? "",
      updatedBy: existing?.updatedBy ?? "",
      status: dateCleared ? "cleared" : "open",
      conflictReason: conflict.reason,
    });
  }

  for (const [key, existing] of byScheduleKey) {
    if (seen.has(key)) continue;
    const dateCleared = existing.dateCleared && isIsoDate(existing.dateCleared) ? existing.dateCleared : null;
    rows.push({
      ...existing,
      dateCleared,
      status: dateCleared ? "cleared" : "open",
      conflictReason: null,
    });
  }

  for (const existing of manual) {
    const dateCleared = existing.dateCleared && isIsoDate(existing.dateCleared) ? existing.dateCleared : null;
    rows.push({
      ...existing,
      dateCleared,
      status: dateCleared ? "cleared" : "open",
      conflictReason: null,
    });
  }

  return rows.sort((left, right) => {
    if (left.status !== right.status) return left.status === "open" ? -1 : 1;
    return left.title.localeCompare(right.title);
  });
}

/** Schedule conflict keys (`issueId:predecessorId`) that an administrator has cleared. Cleared risks stay in the register but leave Timeline icons. */
export function clearedScheduleRiskKeys(risks: Pick<RiskRegisterRow, "status" | "issueId" | "predecessorId">[]): Set<string> {
  const keys = new Set<string>();
  for (const row of risks) {
    if (row.status !== "cleared" || !row.issueId || !row.predecessorId) continue;
    keys.add(`${row.issueId}:${row.predecessorId}`);
  }
  return keys;
}

/** Live blocker conflicts that should still show Timeline risk icons. */
export function activeScheduleConflicts(
  conflicts: ScheduleConflict[],
  risks: Pick<RiskRegisterRow, "status" | "issueId" | "predecessorId">[],
): ScheduleConflict[] {
  const cleared = clearedScheduleRiskKeys(risks);
  return conflicts.filter((conflict) => !cleared.has(`${conflict.issueId}:${conflict.predecessorId}`));
}
