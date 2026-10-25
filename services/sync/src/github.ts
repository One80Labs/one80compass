import { createSign } from "node:crypto";
import type { PlanIssue, ProjectSettings } from "../../../packages/domain/src/index";

export type GitHubGateway = {
  configured: boolean;
  reconcile(settings: ProjectSettings): Promise<{ settings: ProjectSettings; issues: PlanIssue[] }>;
  updateIssue(settings: ProjectSettings, issue: PlanIssue, change: { title?: string; status?: string; effort?: number | null }): Promise<PlanIssue>;
};

type GraphItem = {
  id?: string;
  isArchived?: boolean;
  content?: { id?: string; number?: number; title?: string; state?: string; milestone?: { title?: string } | null } | null;
  fieldValues?: { nodes?: FieldValue[] };
};

type FieldValue = {
  name?: string;
  number?: number;
  field?: { id?: string; name?: string };
};

type GraphField = { id?: string; name?: string; options?: { id: string; name: string }[] };

type ProjectPage = {
  repository?: {
    projectV2?: {
      id: string;
      items: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GraphItem[] };
      fields: { nodes: GraphField[] };
    };
  };
};

/** Reads App credentials from the environment. An empty key means sync is not configured. */
export function githubFromEnv(now: () => Date): GitHubGateway {
  const appId = process.env.GITHUB_APP_ID ?? "";
  const privateKey = (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const configured = Boolean(appId && privateKey.includes("BEGIN"));
  return {
    configured,
    async reconcile(settings) {
      const token = await installationToken(appId, privateKey, settings.owner, settings.repo);
      const collected: GraphItem[] = [];
      let projectNodeId = settings.projectNodeId;
      let fields: GraphField[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 10; page += 1) {
        const data: ProjectPage = await graphql<ProjectPage>(token, PROJECT_QUERY, {
          owner: settings.owner,
          name: settings.repo,
          number: settings.projectNumber,
          cursor,
        });
        const project = data.repository?.projectV2;
        if (!project) throw new Error("The GitHub Project was not found on that repository.");
        projectNodeId = project.id;
        fields = project.fields.nodes ?? [];
        collected.push(...(project.items.nodes ?? []));
        if (!project.items.pageInfo.hasNextPage) break;
        cursor = project.items.pageInfo.endCursor;
      }
      const statusField = fields.find((field) => field.name === settings.statusFieldName && field.options);
      const effortField = fields.find((field) => field.name === settings.effortFieldName);
      const nextSettings: ProjectSettings = {
        ...settings,
        projectNodeId,
        statusFieldId: statusField?.id ?? null,
        effortFieldId: effortField?.id ?? null,
        statusOptions: statusField?.options ?? [],
      };
      const issues = collected.filter((item) => item.content?.id).map((item) => toIssue(nextSettings, item, now().toISOString()));
      return { settings: nextSettings, issues };
    },
    async updateIssue(settings, issue, change) {
      const token = await installationToken(appId, privateKey, settings.owner, settings.repo);
      const next = { ...issue, updatedAt: now().toISOString() };
      if (change.title && issue.number != null) {
        await github(token, `/repos/${settings.owner}/${settings.repo}/issues/${issue.number}`, { title: change.title });
        next.title = change.title;
      }
      if (change.status && settings.projectNodeId && settings.statusFieldId && issue.itemId) {
        const option = settings.statusOptions.find((item) => item.name === change.status);
        if (!option) throw new Error(`Status ${change.status} is not on the GitHub Project.`);
        await graphql(token, SET_FIELD, {
          project: settings.projectNodeId,
          item: issue.itemId,
          field: settings.statusFieldId,
          value: { singleSelectOptionId: option.id },
        });
        next.status = change.status;
      }
      if (change.effort !== undefined && settings.projectNodeId && settings.effortFieldId && issue.itemId && change.effort !== null) {
        await graphql(token, SET_FIELD, {
          project: settings.projectNodeId,
          item: issue.itemId,
          field: settings.effortFieldId,
          value: { number: change.effort },
        });
        next.effort = change.effort;
      }
      return next;
    },
  };
}

function toIssue(settings: ProjectSettings, item: GraphItem, updatedAt: string): PlanIssue {
  const values = item.fieldValues?.nodes ?? [];
  const status = values.find((value) => value.field?.name === settings.statusFieldName && typeof value.name === "string")?.name ?? "";
  const effortValue = values.find((value) => value.field?.name === settings.effortFieldName && typeof value.number === "number");
  return {
    issueId: item.content?.id ?? "",
    itemId: item.id ?? null,
    projectId: settings.projectId,
    customerId: settings.customerId,
    number: item.content?.number ?? null,
    title: item.content?.title ?? "Untitled",
    status,
    effort: effortValue?.number ?? null,
    issueState: item.content?.state === "CLOSED" ? "closed" : "open",
    archived: Boolean(item.isArchived),
    deletedAt: null,
    parentIssueId: null,
    milestone: item.content?.milestone?.title?.trim() || null,
    inProject: true,
    updatedAt,
  };
}

const PROJECT_QUERY = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
  repository(owner:$owner,name:$name){
    projectV2(number:$number){
      id
      items(first:100,after:$cursor){
        pageInfo{hasNextPage endCursor}
        nodes{
          id
          isArchived
          content{... on Issue{id number title state milestone{title}}}
          fieldValues(first:20){nodes{
            ... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{id name}}}
            ... on ProjectV2ItemFieldNumberValue{number field{... on ProjectV2Field{id name}}}
          }}
        }
      }
      fields(first:30){nodes{
        ... on ProjectV2SingleSelectField{id name options{id name}}
        ... on ProjectV2Field{id name}
      }}
    }
  }
}`;

const SET_FIELD = `mutation($project:ID!,$item:ID!,$field:ID!,$value:ProjectV2FieldValue!){
  updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:$value}){projectV2Item{id}}
}`;

async function installationToken(appId: string, privateKey: string, owner: string, repo: string): Promise<string> {
  const jwt = appJwt(appId, privateKey);
  const installation = await github(jwt, `/repos/${owner}/${repo}/installation`);
  const installationId = installation.id;
  if (typeof installationId !== "number") throw new Error("GitHub App is not installed on that repository.");
  const token = await github(jwt, `/app/installations/${installationId}/access_tokens`, {});
  if (typeof token.token !== "string") throw new Error("GitHub did not return an installation token.");
  return token.token;
}

function appJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 540, iss: appId })).toString("base64url");
  const data = `${header}.${payload}`;
  const signer = createSign("RSA-SHA256");
  signer.update(data);
  return `${data}.${signer.sign(privateKey).toString("base64url")}`;
}

async function github(token: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.github.com${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "content-type": "application/json",
      "user-agent": "one80compass",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.message === "string" ? payload.message : "GitHub request failed.");
  return payload;
}

async function graphql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "one80compass" },
    body: JSON.stringify({ query, variables }),
  });
  const payload = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (!response.ok || payload.errors?.length) throw new Error(payload.errors?.[0]?.message ?? "GitHub query failed.");
  return payload.data as T;
}
