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
