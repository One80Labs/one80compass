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

export type DecisionSuggestion = {
  suggestionId: string;
  documentId: string;
  documentName: string;
  quote: string;
  kind: "question" | "decision";
  mark: "proposal" | "hypothetical" | "rejected" | "discussed";
  acceptable: boolean;
  issueId: string | null;
  workLabel: string;
  assigneeIds: string[];
  assigneeLabel: string;
  targetDate: string | null;
  speaker: string;
  location: string;
};

export type SuggestionAccept = {
  statement: string;
  kind: "question" | "decision";
  issueId: string | null;
  assigneeIds: string[];
  targetDate: string | null;
};

/** Proposals parsed from Krisp and Fireflies transcripts. Accepted and dismissed rows are omitted. */
export async function listSuggestions(projectId: string, idToken: string): Promise<{ suggestions: DecisionSuggestion[] }> {
  const result = await api<{ suggestions: DecisionSuggestion[] }>(`/projects/${projectId}/decision-suggestions`, idToken);
  return { suggestions: Array.isArray(result.suggestions) ? result.suggestions : [] };
}

/** Creates a register row from a proposal. Does not create a plan issue. */
export function acceptSuggestion(projectId: string, idToken: string, suggestionId: string, body: SuggestionAccept): Promise<DecisionResponse> {
  return api<DecisionResponse>(`/projects/${projectId}/decision-suggestions/${encodeURIComponent(suggestionId)}/accept`, idToken, {
    method: "POST",
    body,
  });
}

/** Drops a proposal. Does not create a register row. */
export function dismissSuggestion(projectId: string, idToken: string, suggestionId: string): Promise<void> {
  return api(`/projects/${projectId}/decision-suggestions/${encodeURIComponent(suggestionId)}/dismiss`, idToken, { method: "POST", body: {} });
}
