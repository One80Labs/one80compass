import { isIsoDate } from "./schedule";

/** Milestone confirmation. Spec §4.2. The target date comes from GitHub. The forecast is the latest finish date when every task has one. */

export type MilestoneEvent = {
  action: "confirmed" | "reopened";
  at: string;
  actorUserId: string;
  explanation: string | null;
};

export type MilestoneRecord = {
  projectId: string;
  customerId: string;
  milestoneKey: string;
  title: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
  history: MilestoneEvent[];
};

export type MilestoneView = {
  key: string;
  title: string;
  targetDate: string | null;
  /** Latest finish date. Null when any active task on the milestone has no finish date. */
  forecastDate: string | null;
  late: boolean;
  state: "open" | "ready" | "confirmed";
  workOpen: boolean;
  openCount: number;
  doneCount: number;
  confirmedAt: string | null;
  confirmedBy: string | null;
  history: MilestoneEvent[];
};

export type MilestoneIssue = {
  milestone: string | null;
  milestoneId: string | null;
  milestoneDueOn: string | null;
  finishDate: string | null;
  status: string;
  inProject: boolean;
  archived: boolean;
  deletedAt: string | null;
};

export function milestoneKey(milestoneId: string | null, title: string): string {
  return milestoneId && milestoneId.trim() ? milestoneId : `title:${title}`;
}

/** One row per GitHub milestone that has an active task on this project. */
export function milestoneViews(issues: MilestoneIssue[], records: MilestoneRecord[], doneStatuses: string[], today: string): MilestoneView[] {
  const groups = new Map<string, { title: string; due: string | null; done: number; open: number; finishes: string[]; unscheduled: boolean }>();
  for (const issue of issues) {
    if (!issue.inProject || issue.archived || issue.deletedAt || !issue.milestone) continue;
    const key = milestoneKey(issue.milestoneId, issue.milestone);
    const group = groups.get(key) ?? { title: issue.milestone, due: null, done: 0, open: 0, finishes: [], unscheduled: false };
    group.title = issue.milestone;
    if (issue.milestoneDueOn && (!group.due || issue.milestoneDueOn < group.due)) group.due = issue.milestoneDueOn;
    if (issue.finishDate && isIsoDate(issue.finishDate)) group.finishes.push(issue.finishDate);
    else group.unscheduled = true;
    if (doneStatuses.includes(issue.status)) group.done += 1;
    else group.open += 1;
    groups.set(key, group);
  }
  const views: MilestoneView[] = [];
  for (const [key, group] of groups) {
    const record = records.find((item) => item.milestoneKey === key || item.title === group.title);
    const confirmed = Boolean(record?.confirmedAt);
    const workOpen = group.open > 0;
    const state: MilestoneView["state"] = confirmed ? "confirmed" : !workOpen && group.done > 0 ? "ready" : "open";
    views.push({
      key,
      title: group.title,
      targetDate: group.due,
      forecastDate: group.unscheduled || group.finishes.length === 0 ? null : group.finishes.sort()[group.finishes.length - 1],
      late: Boolean(group.due && group.due < today && state !== "confirmed"),
      state,
      workOpen,
      openCount: group.open,
      doneCount: group.done,
      confirmedAt: record?.confirmedAt ?? null,
      confirmedBy: record?.confirmedBy ?? null,
      history: record?.history ?? [],
    });
  }
  return views.sort((left, right) => (left.targetDate ?? "9999-99-99").localeCompare(right.targetDate ?? "9999-99-99") || left.title.localeCompare(right.title));
}
