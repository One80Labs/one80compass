import type { ProjectCatalogs } from "../../../packages/domain/src/index";
import { freshIdToken } from "./auth";

/** A link that is not the parent and not a finish-to-start dependency. */
export type IssueRelationship = {
  id: string;
  kind: string;
  otherIssueId: string;
};

/**
 * Body for PATCH /projects/{projectId}/issues/{issueId}.
 * Compass projects also accept issue type, parent, milestone, priority, labels, assignees, predecessors, and relationships.
 */
export type IssueSave = {
  title?: string;
  description?: string | null;
  status?: string;
  effort?: number | null;
  startDate?: string | null;
  finishDate?: string | null;
  iterationId?: string | null;
  assigneeId?: string | null;
  assigneeIds?: string[];
  comment?: string;
  issueType?: string | null;
  parentIssueId?: string | null;
  milestone?: string | null;
  priority?: string | null;
  labels?: string[];
  predecessorIds?: string[];
  relationships?: IssueRelationship[];
};

const apiUrl = () => {
  const raw = import.meta.env.VITE_API_URL;
  if (!raw || typeof raw !== "string") throw new Error("VITE_API_URL is not configured.");
  return raw.replace(/\/$/, "");
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly payload: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Authenticated API call. Uses Cognito's current ID token (getSession may refresh it).
 * Does not fall back to a React Session.idToken snapshot after Cognito sign-out or the
 * absolute 2-hour session limit. Retries once on 401 after another refresh; does not loop.
 * The idToken argument is retained for call-site clarity; live auth comes from Cognito.
 */
export async function api<T>(path: string, idToken: string, init?: { method?: string; body?: unknown }): Promise<T> {
  void idToken;
  const token = await freshIdToken();
  if (!token) {
    throw new ApiError("Your session has expired. Sign in again.", 401, "session_expired");
  }
  try {
    return await request<T>(path, token, init);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    const retried = await freshIdToken();
    if (!retried || retried === token) throw error;
    return request<T>(path, retried, init);
  }
}

async function request<T>(path: string, idToken: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`${apiUrl()}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  let payload = {} as T & { code?: string; message?: string };
  if (text) {
    try {
      payload = JSON.parse(text) as T & { code?: string; message?: string };
    } catch {
      if (!response.ok) throw new ApiError("Request failed.", response.status, "ERROR");
      throw new ApiError("The API returned a non-JSON response.", response.status, "ERROR");
    }
  }
  if (!response.ok) {
    throw new ApiError(payload.message ?? "Request failed.", response.status, payload.code ?? "ERROR", payload);
  }
  return payload;
}

/** Replaces the Compass catalogs on a project. Administrator only, and only when recordSource is compass. */
export function putCatalogs(projectId: string, idToken: string, catalogs: ProjectCatalogs) {
  return api<ProjectCatalogs>(`/projects/${projectId}/catalogs`, idToken, { method: "PUT", body: catalogs });
}
