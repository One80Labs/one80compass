import { afterEach, describe, expect, it, vi } from "vitest";
import { createPortalClient } from "./portal-client.js";
import type { VaultMcpConfig } from "./config.js";

const config: VaultMcpConfig = {
  apiBaseUrl: "https://api.example.test",
  idToken: "test-id-token",
};

type FetchCall = [input: string | URL | Request, init?: RequestInit];

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function lastCall(fetchMock: { mock: { calls: unknown[][] } }): FetchCall {
  const call = fetchMock.mock.calls[0];
  if (!call) throw new Error("expected fetch to be called");
  return call as FetchCall;
}

describe("createPortalClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("getAllowlist GETs vault-allowlist with auth headers", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { customerId: "cust-1", programId: "prog-1", enabled: true }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createPortalClient(config);
    await expect(client.getAllowlist("prog-1")).resolves.toEqual({
      customerId: "cust-1",
      programId: "prog-1",
      enabled: true,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("https://api.example.test/projects/prog-1/vault-allowlist");
    expect(init?.method).toBe("GET");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer test-id-token");
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-correlation-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("setAllowlist PUTs enabled flag", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { customerId: "cust-1", programId: "prog-1", enabled: false }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createPortalClient(config);
    await expect(client.setAllowlist("prog-1", false)).resolves.toEqual({
      customerId: "cust-1",
      programId: "prog-1",
      enabled: false,
    });

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("https://api.example.test/projects/prog-1/vault-allowlist");
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(JSON.stringify({ enabled: false }));
  });

  it("ingest POSTs empty body and maps summary counts", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        rowCount: 12,
        relationCount: 3,
        chunkCount: 5,
        chunks: [{ id: "ignored-chunk" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createPortalClient(config);
    await expect(client.ingest("prog-1")).resolves.toEqual({
      rowCount: 12,
      relationCount: 3,
      chunkCount: 5,
    });

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("https://api.example.test/projects/prog-1/vault-ingest");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe("{}");
  });

  it("listChunks GETs vault-chunks and maps chunk fields", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        chunks: [
          {
            id: "chunk-1",
            customerId: "cust-1",
            programId: "prog-1",
            sourceLabel: "compass-upload",
            documentId: "doc-1",
            versionId: "ver-1",
            body: "Evidence text",
            embedding: [0.1],
            sourceType: "document",
            sourceId: "doc-1",
            recordedAt: "2026-10-01T00:00:00.000Z",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createPortalClient(config);
    await expect(client.listChunks("prog-1")).resolves.toEqual([
      {
        id: "chunk-1",
        customerId: "cust-1",
        programId: "prog-1",
        sourceLabel: "compass-upload",
        documentId: "doc-1",
        versionId: "ver-1",
        body: "Evidence text",
      },
    ]);

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("https://api.example.test/projects/prog-1/vault-chunks");
    expect(init?.method).toBe("GET");
  });

  it("draftFromVault POSTs question and returns report + citations", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, {
        report: {
          reportId: "rep-1",
          projectId: "prog-1",
          customerId: "cust-1",
          title: "Status",
          body: "All good.",
          status: "draft",
        },
        citations: [{ documentId: "doc-1" }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createPortalClient(config);
    await expect(client.draftFromVault("prog-1", "How are we tracking?")).resolves.toEqual({
      report: {
        reportId: "rep-1",
        projectId: "prog-1",
        customerId: "cust-1",
        title: "Status",
        body: "All good.",
        status: "draft",
      },
      citations: [{ documentId: "doc-1" }],
    });

    const [url, init] = lastCall(fetchMock);
    expect(url).toBe("https://api.example.test/projects/prog-1/reports/draft");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ question: "How are we tracking?" }));
  });

  it("throws on 403 with status and server message/code", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(403, {
        code: "FORBIDDEN",
        message: "Administrator access is required.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createPortalClient(config);
    await expect(client.getAllowlist("prog-1")).rejects.toThrow(
      /403.*Administrator access is required\..*FORBIDDEN/,
    );
  });

  it("throws on 409 ingest conflict with status and server message/code", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(409, {
        code: "CONFLICT",
        message: "Project is not on the vault allowlist.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createPortalClient(config);
    await expect(client.ingest("prog-1")).rejects.toThrow(
      /409.*Project is not on the vault allowlist\..*CONFLICT/,
    );
  });

  it("surfaces a 409 from vault_draft_status when the program is not allowlisted", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(409, {
        code: "CONFLICT",
        message: "Project is not on the vault allowlist.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createPortalClient(config);
    await expect(client.draftFromVault("prog-1", "What shipped?")).rejects.toThrow(
      /409.*Project is not on the vault allowlist\..*CONFLICT/,
    );
  });
});
