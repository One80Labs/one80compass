import type { DecisionRecord } from "../../../packages/domain/src/decisions";
import { api } from "./api";

/**
 * Fields a normal save may write.
 * Status here is outstanding or resolved. Duplicate and archive use their own calls.
 */
export type DecisionDraft = Pick<
  DecisionRecord,
  | "kind"
  | "statement"
  | "raisedBy"
  | "raisedOn"
  | "assigneeIds"
  | "neededFrom"
  | "targetDate"
  | "affects"
  | "blocksWork"
  | "issueId"
  | "source"
  | "answer"
  | "outcome"
  | "rationale"
  | "decisionType"
  | "decidedBy"
  | "decidedOn"
  | "consulted"
  | "assumptions"
  | "whatWouldChange"
  | "doesNotMean"
> & {
  status: "outstanding" | "resolved";
};

type DecisionResponse = { decision: DecisionRecord };

/** Lists every decision and question on the project. */
export async function listDecisions(projectId: string, idToken: string): Promise<{ decisions: DecisionRecord[] }> {
  const result = await api<{ decisions: DecisionRecord[] }>(`/projects/${projectId}/decisions`, idToken);
  return { decisions: Array.isArray(result.decisions) ? result.decisions : [] };
}

/** Creates one question or decision. Does not create a plan issue. */
export function createDecision(projectId: string, idToken: string, body: DecisionDraft): Promise<DecisionResponse> {
  return api<DecisionResponse>(`/projects/${projectId}/decisions`, idToken, { method: "POST", body });
}

/** Updates the writable fields. Status on this call is outstanding or resolved. */
export function updateDecision(projectId: string, idToken: string, decisionId: string, body: DecisionDraft): Promise<DecisionResponse> {
  return api<DecisionResponse>(`/projects/${projectId}/decisions/${decisionId}`, idToken, { method: "PATCH", body });
}

/** Appends a comment. `body` is the comment text. */
export function commentDecision(projectId: string, idToken: string, decisionId: string, body: string): Promise<DecisionResponse> {
  return api<DecisionResponse>(`/projects/${projectId}/decisions/${decisionId}/comments`, idToken, { method: "POST", body: { body } });
}

/** Marks this item as a duplicate of the surviving item. */
export function duplicateDecision(projectId: string, idToken: string, decisionId: string, duplicateOfId: string): Promise<DecisionResponse> {
  return api<DecisionResponse>(`/projects/${projectId}/decisions/${decisionId}/duplicate`, idToken, {
    method: "POST",
    body: { duplicateOfId },
  });
}

/** Archives the item. Administrators only; the API requires a reason. */
export function archiveDecision(projectId: string, idToken: string, decisionId: string, reason: string): Promise<DecisionResponse> {
  return api<DecisionResponse>(`/projects/${projectId}/decisions/${decisionId}/archive`, idToken, { method: "POST", body: { reason } });
}
