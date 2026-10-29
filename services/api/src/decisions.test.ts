import { describe, expect, it } from "vitest";
import type { Principal } from "../../../packages/authz/src/index";
import type { DecisionRecord, Membership, Project } from "../../../packages/domain/src/index";
import { createHandler, type HandlerDeps, type HttpEvent, type HttpResult } from "./router";
import { handleDecisions } from "./decisions";
import type { Store } from "./store";

const NOW = "2026-10-29T14:00:00.000Z";

const project: Project = {
  projectId: "proj-1",
  customerId: "cust-1",
  name: "Alpha",
  projectKey: "ALPH",
  createdAt: "2026-01-01T00:00:00.000Z",
};

type Role = "view" | "contributor" | "admin";

const principals: Record<Role, Principal> = {
  view: { userId: "view-1", email: "view@example.com", groups: [], mfa: false },
  contributor: { userId: "user-1", email: "ada@example.com", groups: [], mfa: false },
  admin: { userId: "admin-1", email: "admin@example.com", groups: ["one80-admin"], mfa: true },
};

function member(userId: string, email: string, role: "view" | "contributor"): Membership {
  return {
    customerId: "cust-1",
    userId,
    email,
    name: email,
    role,
    createdAt: "2026-01-01T00:00:00.000Z",
    projectIds: null,
  };
}

function record(overrides: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    decisionId: "d1",
    projectId: "proj-1",
    customerId: "cust-1",
    kind: "question",
    status: "outstanding",
    statement: "Which vendor?",
    raisedBy: "",
    raisedOn: "",
    assigneeIds: [],
    neededFrom: "",
    targetDate: null,
    affects: [],
    blocksWork: false,
    issueId: null,
    source: null,
    answer: "",
    outcome: "",
    rationale: "",
    decisionType: null,
    decidedBy: null,
    decidedOn: null,
    consulted: "",
    assumptions: "",
    whatWouldChange: "",
    doesNotMean: "",
    duplicateOfId: null,
    archiveReason: "",
    suggestionText: null,
    acceptedBy: null,
    comments: [],
    history: [],
    createdAt: NOW,
    updatedAt: NOW,
    updatedBy: "user-1",
    ...overrides,
  };
}

function harness() {
  const rows: DecisionRecord[] = [];
  const issues: { issueId: string; projectId: string }[] = [];
  const documents: { documentId: string; projectId: string }[] = [];
  const memberships = [member("view-1", "view@example.com", "view"), member("user-1", "ada@example.com", "contributor")];
  let seq = 0;
  const deps = {
    store: {
      async getProject(projectId: string) {
        return projectId === project.projectId ? project : null;
      },
      async listMembershipsForUser(userId: string) {
        return memberships.filter((membership) => membership.userId === userId);
      },
      async listDecisions(projectId: string) {
        return rows.filter((row) => row.projectId === projectId);
      },
      async putDecision(saved: DecisionRecord) {
        const index = rows.findIndex((row) => row.projectId === saved.projectId && row.decisionId === saved.decisionId);
        if (index >= 0) rows[index] = saved;
        else rows.push(saved);
      },
      async listIssues(projectId: string) {
        return issues.filter((issue) => issue.projectId === projectId);
      },
      async getDocument(documentId: string) {
        return documents.find((document) => document.documentId === documentId) ?? null;
      },
      async putIssue() {
        throw new Error("comments must not create a plan issue");
      },
    },
    newId: () => `id-${++seq}`,
    now: () => new Date(NOW),
  } as unknown as HandlerDeps;

  function ctx(role: Role, method: string, path: string, body: Record<string, unknown> = {}) {
    return { deps, principal: principals[role], method, path, body, correlationId: "corr-1" };
  }

  async function send(role: Role, method: string, path: string, body: Record<string, unknown> = {}): Promise<HttpResult> {
    const result = await handleDecisions(ctx(role, method, path, body));
    if (!result) throw new Error(`expected a decision route: ${method} ${path}`);
    return result;
  }

  return { rows, issues, documents, ctx, send };
}

function decisionFrom(result: HttpResult): DecisionRecord {
  return (JSON.parse(result.body) as { decision: DecisionRecord }).decision;
}

function decisionsFrom(result: HttpResult): DecisionRecord[] {
  return (JSON.parse(result.body) as { decisions: DecisionRecord[] }).decisions;
}

describe("decision register API", () => {
  it("lets a view list decisions and refuses creates", async () => {
    const { send, rows } = harness();
    const empty = await send("view", "GET", "/projects/proj-1/decisions");
    expect(empty.statusCode).toBe(200);
    expect(decisionsFrom(empty)).toEqual([]);

    const denied = await send("view", "POST", "/projects/proj-1/decisions", { statement: "Which vendor?", kind: "question" });
    expect(denied.statusCode).toBe(403);
    expect(JSON.parse(denied.body)).toEqual({
      code: "VIEW_ONLY",
      message: "View access can open this project and cannot change it.",
      correlationId: "corr-1",
    });
    expect(rows).toHaveLength(0);

    const created = await send("contributor", "POST", "/projects/proj-1/decisions", { statement: "Which vendor?", kind: "question" });
    expect(created.statusCode).toBe(201);
    const listed = await send("view", "GET", "/projects/proj-1/decisions");
    expect(decisionsFrom(listed).map((row) => row.statement)).toEqual(["Which vendor?"]);

    const patched = await send("view", "PATCH", "/projects/proj-1/decisions/id-1", { outcome: "Later" });
    expect(patched.statusCode).toBe(403);
    expect(JSON.parse(patched.body).code).toBe("VIEW_ONLY");
  });

  it("promotes a question to a decision without changing its id", async () => {
    const { send } = harness();
    const created = await send("contributor", "POST", "/projects/proj-1/decisions", {
      statement: "Which vendor?",
      kind: "question",
      decisionType: "type1",
      answer: "Not yet",
    });
    expect(created.statusCode).toBe(201);
    const question = decisionFrom(created);
    expect(question).toMatchObject({
      decisionId: "id-1",
      projectId: "proj-1",
      customerId: "cust-1",
      kind: "question",
      status: "outstanding",
      statement: "Which vendor?",
      decisionType: null,
      answer: "Not yet",
      suggestionText: null,
      acceptedBy: null,
      comments: [],
      history: [],
      duplicateOfId: null,
      archiveReason: "",
      createdAt: NOW,
      updatedAt: NOW,
      updatedBy: "user-1",
    });

    const promoted = await send("contributor", "PATCH", "/projects/proj-1/decisions/id-1", {
      kind: "decision",
      decisionType: "type2",
    });
    expect(promoted.statusCode).toBe(200);
    const decision = decisionFrom(promoted);
    expect(decision.decisionId).toBe(question.decisionId);
    expect(decision.kind).toBe("decision");
    expect(decision.decisionType).toBe("type2");
    expect(decision.answer).toBe("Not yet");
    expect(decision.history).toEqual([
      { field: "becameDecision", from: "question", to: "decision", at: NOW, by: "user-1" },
    ]);
  });

  it("refuses to turn a decision back into a question", async () => {
    const { send } = harness();
    const created = await send("contributor", "POST", "/projects/proj-1/decisions", {
      statement: "Use vendor A",
      kind: "decision",
      decisionType: "type1",
    });
    expect(decisionFrom(created)).toMatchObject({ kind: "decision", decisionType: "type1", history: [] });

    const flipped = await send("contributor", "PATCH", "/projects/proj-1/decisions/id-1", { kind: "question" });
    expect(flipped.statusCode).toBe(400);
    expect(JSON.parse(flipped.body).code).toBe("VALIDATION");

    const listed = decisionsFrom(await send("contributor", "GET", "/projects/proj-1/decisions"));
    expect(listed).toHaveLength(1);
    expect(listed[0].kind).toBe("decision");
    expect(listed[0].decisionType).toBe("type1");
    expect(listed[0].history).toEqual([]);
  });

  it("requires a surviving row before marking a duplicate", async () => {
    const { send } = harness();
    await send("contributor", "POST", "/projects/proj-1/decisions", { statement: "First?", kind: "question" });
    await send("contributor", "POST", "/projects/proj-1/decisions", { statement: "Second?", kind: "question" });

    expect((await send("contributor", "POST", "/projects/proj-1/decisions/id-1/duplicate", {})).statusCode).toBe(400);
    expect((await send("contributor", "POST", "/projects/proj-1/decisions/id-1/duplicate", { duplicateOfId: "id-1" })).statusCode).toBe(400);
    expect((await send("contributor", "POST", "/projects/proj-1/decisions/id-1/duplicate", { duplicateOfId: "missing" })).statusCode).toBe(400);

    const before = decisionsFrom(await send("contributor", "GET", "/projects/proj-1/decisions"));
    expect(before.map((row) => row.status)).toEqual(["outstanding", "outstanding"]);

    const marked = await send("contributor", "POST", "/projects/proj-1/decisions/id-1/duplicate", { duplicateOfId: "id-2" });
    expect(marked.statusCode).toBe(200);
    const saved = decisionFrom(marked);
    expect(saved.status).toBe("duplicate");
    expect(saved.duplicateOfId).toBe("id-2");
    expect(saved.history).toEqual([{ field: "status", from: "outstanding", to: "duplicate", at: NOW, by: "user-1" }]);
  });

  it("archives only for a platform admin and only with a reason", async () => {
    const { send } = harness();
    await send("contributor", "POST", "/projects/proj-1/decisions", { statement: "Keep the old plan?", kind: "question" });

    const view = await send("view", "POST", "/projects/proj-1/decisions/id-1/archive", { reason: "Done" });
    expect(view.statusCode).toBe(403);
    expect(JSON.parse(view.body).code).toBe("VIEW_ONLY");

    const contributor = await send("contributor", "POST", "/projects/proj-1/decisions/id-1/archive", { reason: "Done" });
    expect(contributor.statusCode).toBe(403);
    expect(JSON.parse(contributor.body)).toMatchObject({
      code: "FORBIDDEN",
      message: "Administrator access is required.",
    });

    expect((await send("admin", "POST", "/projects/proj-1/decisions/id-1/archive", {})).statusCode).toBe(400);
    expect((await send("admin", "POST", "/projects/proj-1/decisions/id-1/archive", { reason: "   " })).statusCode).toBe(400);
    expect(decisionsFrom(await send("admin", "GET", "/projects/proj-1/decisions"))[0].status).toBe("outstanding");

    const archived = await send("admin", "POST", "/projects/proj-1/decisions/id-1/archive", { reason: "  Retired  " });
    expect(archived.statusCode).toBe(200);
    const saved = decisionFrom(archived);
    expect(saved.status).toBe("archive");
    expect(saved.archiveReason).toBe("Retired");
    expect(saved.history).toEqual([{ field: "status", from: "outstanding", to: "archive", at: NOW, by: "admin-1" }]);
  });

  it("records history for status, assignees, target date, outcome, rationale, and the work item", async () => {
    const { send, issues } = harness();
    issues.push({ issueId: "issue-1", projectId: "proj-1" });
    await send("contributor", "POST", "/projects/proj-1/decisions", { statement: "Which vendor?", kind: "question" });
    const patched = await send("contributor", "PATCH", "/projects/proj-1/decisions/id-1", {
      status: "resolved",
      assigneeIds: ["ada", "bea"],
      targetDate: "2026-12-01",
      outcome: "Yes",
      rationale: "Because",
      issueId: "issue-1",
    });
    expect(patched.statusCode).toBe(200);
    const saved = decisionFrom(patched);
    expect(saved.kind).toBe("question");
    expect(saved.history).toEqual([
      { field: "status", from: "outstanding", to: "resolved", at: NOW, by: "user-1" },
      { field: "assignee", from: "", to: "ada,bea", at: NOW, by: "user-1" },
      { field: "targetDate", from: null, to: "2026-12-01", at: NOW, by: "user-1" },
      { field: "outcome", from: "", to: "Yes", at: NOW, by: "user-1" },
      { field: "rationale", from: "", to: "Because", at: NOW, by: "user-1" },
      { field: "workItem", from: null, to: "issue-1", at: NOW, by: "user-1" },
    ]);
  });

  it("rejects bad dates, affects, work items, documents, and archive status on patch", async () => {
    const { send, rows, issues, documents } = harness();
    const path = "/projects/proj-1/decisions";
    expect((await send("contributor", "POST", path, { statement: "When?", kind: "question", targetDate: "10/29/2026" })).statusCode).toBe(400);
    expect((await send("contributor", "POST", path, { statement: "When?", kind: "question", raisedOn: "20261029" })).statusCode).toBe(400);
    expect((await send("contributor", "POST", path, { statement: "When?", kind: "question", decidedOn: "yesterday" })).statusCode).toBe(400);
    expect((await send("contributor", "POST", path, { statement: "When?", kind: "question", affects: ["budget"] })).statusCode).toBe(400);
    expect((await send("contributor", "POST", path, { statement: "When?", kind: "question", issueId: "missing" })).statusCode).toBe(400);
    expect((await send("contributor", "POST", path, { statement: "Ship it", kind: "decision", decisionType: "hard" })).statusCode).toBe(400);
    documents.push({ documentId: "doc-other", projectId: "other" });
    expect(
      (
        await send("contributor", "POST", path, {
          statement: "When?",
          kind: "question",
          source: { kind: "document", quote: "Wait", speaker: "Ada", location: "Notes", when: null, documentId: "doc-other" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await send("contributor", "POST", path, {
          statement: "When?",
          kind: "question",
          source: { kind: "phone", quote: "", speaker: "", location: "", when: null, documentId: null },
        })
      ).statusCode,
    ).toBe(400);
    expect(rows).toHaveLength(0);

    issues.push({ issueId: "issue-1", projectId: "proj-1" });
    documents.push({ documentId: "doc-1", projectId: "proj-1" });
    const created = await send("contributor", "POST", path, {
      statement: "Which vendor?",
      kind: "question",
      raisedOn: "2026-10-01",
      targetDate: "2026-11-01",
      affects: ["timeline", "resources"],
      issueId: "issue-1",
      source: {
        kind: "email",
        quote: "We should wait.",
        speaker: "Ada",
        location: "Inbox",
        when: "2026-10-29T14:00:00.000Z",
        documentId: "doc-1",
      },
    });
    expect(created.statusCode).toBe(201);
    expect(decisionFrom(created)).toMatchObject({
      raisedOn: "2026-10-01",
      targetDate: "2026-11-01",
      affects: ["timeline", "resources"],
      issueId: "issue-1",
      source: {
        kind: "email",
        quote: "We should wait.",
        speaker: "Ada",
        location: "Inbox",
        when: "2026-10-29T14:00:00.000Z",
        documentId: "doc-1",
      },
    });

    const archived = await send("contributor", "PATCH", "/projects/proj-1/decisions/id-1", { status: "archive" });
    expect(archived.statusCode).toBe(400);
    expect(decisionsFrom(await send("contributor", "GET", path))[0].status).toBe("outstanding");
  });

  it("appends a comment without creating a plan issue", async () => {
    const { send } = harness();
    await send("contributor", "POST", "/projects/proj-1/decisions", { statement: "Which vendor?", kind: "question" });
    expect((await send("contributor", "POST", "/projects/proj-1/decisions/id-1/comments", { body: "  " })).statusCode).toBe(400);
    const commented = await send("contributor", "POST", "/projects/proj-1/decisions/id-1/comments", { body: "Ask the sponsor." });
    expect(commented.statusCode).toBe(200);
    const saved = decisionFrom(commented);
    expect(saved.comments).toEqual([{ commentId: "id-2", at: NOW, by: "user-1", body: "Ask the sponsor." }]);
    expect(saved.history).toEqual([]);
    expect(saved.issueId).toBeNull();
  });

  it("returns null for routes the register does not own", async () => {
    const { ctx } = harness();
    expect(await handleDecisions(ctx("view", "GET", "/projects/proj-1/plan"))).toBeNull();
    expect(await handleDecisions(ctx("view", "PUT", "/projects/proj-1/decisions"))).toBeNull();
  });

  it("serves GET /projects/:projectId/decisions from the main router", async () => {
    const stored = record();
    const store = {
      async getProject(projectId: string) {
        return projectId === project.projectId ? project : null;
      },
      async listMembershipsForUser(userId: string) {
        if (userId !== "view-1") return [];
        return [member("view-1", "view@example.com", "view")];
      },
      async listDecisions() {
        return [stored];
      },
    };
    const handler = createHandler({
      store: store as unknown as Store,
      inviteUser: async () => ({ userId: "user-1" }),
      disableLogin: async () => undefined,
      newId: () => "id-1",
      now: () => new Date(NOW),
      signUpload: async () => "https://files.example/upload",
      signDownload: async () => "https://files.example/download",
      enqueue: async () => undefined,
      githubConfigured: false,
      webhookSecret: "test-secret",
      listAdminUserIds: async () => ["admin-1"],
    });
    const response = await handler({
      rawPath: "/projects/proj-1/decisions",
      body: null,
      headers: { "x-correlation-id": "corr-1" },
      requestContext: {
        http: { method: "GET" },
        requestId: "req-1",
        authorizer: { jwt: { claims: { sub: "view-1", email: "view@example.com" } } },
      },
    } satisfies HttpEvent);
    expect(response.statusCode).toBe(200);
    expect(decisionsFrom(response)).toEqual([stored]);
  });
});
