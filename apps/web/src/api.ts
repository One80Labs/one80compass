import type { ProjectCatalogs } from "../../../packages/domain/src/index";

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

const apiUrl = () => import.meta.env.VITE_API_URL.replace(/\/$/, "");

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

export async function api<T>(path: string, idToken: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`${apiUrl()}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      authorization: `Bearer ${idToken}`,
      "content-type": "application/json",
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const payload = (await response.json()) as T & { code?: string; message?: string };
  if (!response.ok) {
    throw new ApiError(payload.message ?? "Request failed.", response.status, payload.code ?? "ERROR", payload);
  }
  return payload;
}

/** Replaces the Compass catalogs on a project. Administrator only, and only when recordSource is compass. */
export function putCatalogs(projectId: string, idToken: string, catalogs: ProjectCatalogs) {
  return api<ProjectCatalogs>(`/projects/${projectId}/catalogs`, idToken, { method: "PUT", body: catalogs });
}
