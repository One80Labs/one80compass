import { createSign } from "node:crypto";
import type { PlanIssue, ProjectSettings } from "../../../packages/domain/src/index";

export type GitHubGateway = {
  configured: boolean;
  reconcile(settings: ProjectSettings): Promise<{ settings: ProjectSettings; issues: PlanIssue[] }>;
  ensureDateFields(settings: ProjectSettings): Promise<{ settings: ProjectSettings; issues: PlanIssue[] }>;
  updateIssue(
    settings: ProjectSettings,
    issue: PlanIssue,
    change: { title?: string; status?: string; effort?: number | null; startDate?: string | null; finishDate?: string | null },
  ): Promise<PlanIssue>;
  setDependency(settings: ProjectSettings, issue: PlanIssue, predecessorId: string, action: "add" | "remove"): Promise<PlanIssue>;
};

type GraphItem = {
  id?: string;
  isArchived?: boolean;
  content?: {
    id?: string;
    number?: number;
    title?: string;
    state?: string;
    repository?: { nameWithOwner?: string } | null;
    milestone?: { id?: string; title?: string; dueOn?: string | null } | null;
    parent?: { id?: string } | null;
    blockedBy?: { nodes?: ({ id?: string } | null)[] | null } | null;
  } | null;
  fieldValues?: { nodes?: FieldValue[] };
};

type FieldValue = {
  name?: string;
  number?: number;
  date?: string | null;
  field?: { id?: string; name?: string };
};

type GraphField = { id?: string; name?: string; dataType?: string; options?: { id: string; name: string }[] };

type ProjectBody = {
  id: string;
  items: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GraphItem[] };
  fields: { nodes: GraphField[] };
};

type ProjectLookup = {
  repositoryOwner?: {
    projectV2?: ProjectBody | null;
    repository?: { projectV2?: ProjectBody | null } | null;
  } | null;
};

type ProjectScope = "organization" | "repository";

type ProjectPage = {
  node?: { items?: ProjectBody["items"] } | null;
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
      const found = chooseProject(
        await graphql<ProjectLookup>(token, PROJECT_QUERY, {
          owner: settings.owner,
          name: settings.repo,
          number: settings.projectNumber,
          cursor: null,
        }),
      );
      if (!found) throw new Error("The GitHub Project was not found for that owner and repository.");
      const project = found.project;
      project.items.nodes = project.items.nodes ?? [];
      let cursor = project.items.pageInfo.hasNextPage ? project.items.pageInfo.endCursor : null;
      for (let page = 0; page < 9 && cursor; page += 1) {
        const data = await graphql<ProjectPage>(token, PROJECT_PAGE_QUERY, { id: project.id, cursor });
        const items = data.node?.items;
        if (!items) break;
        project.items.nodes.push(...(items.nodes ?? []));
        if (!items.pageInfo.hasNextPage) break;
        cursor = items.pageInfo.endCursor;
      }
      return readProject(settings, project, found.scope, now().toISOString());
    },
    async ensureDateFields(settings) {
      const token = await installationToken(appId, privateKey, settings.owner, settings.repo);
      const found = chooseProject(
        await graphql<ProjectLookup>(token, PROJECT_QUERY, {
          owner: settings.owner,
          name: settings.repo,
          number: settings.projectNumber,
          cursor: null,
        }),
      );
      if (!found) throw new Error("The GitHub Project was not found for that owner and repository.");
      for (const name of missingDateFields(found.project.fields.nodes ?? [])) {
        await graphql(token, CREATE_DATE_FIELD, { project: found.project.id, name, dataType: "DATE" });
      }
      return this.reconcile(settings);
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
      if (change.startDate !== undefined) next.startDate = await writeDate(token, settings, issue, settings.startFieldId, "Start", change.startDate);
      if (change.finishDate !== undefined) next.finishDate = await writeDate(token, settings, issue, settings.finishFieldId, "Finish", change.finishDate);
      return next;
    },
    async setDependency(settings, issue, predecessorId, action) {
      const token = await installationToken(appId, privateKey, settings.owner, settings.repo);
      await graphql(token, action === "add" ? ADD_BLOCKED_BY : REMOVE_BLOCKED_BY, { issue: issue.issueId, blocking: predecessorId });
      const ids = new Set(issue.predecessorIds);
      if (action === "add") ids.add(predecessorId);
      else ids.delete(predecessorId);
      return { ...issue, predecessorIds: [...ids], updatedAt: now().toISOString() };
    },
  };
}

function toIssue(settings: ProjectSettings, item: GraphItem, updatedAt: string): PlanIssue {
  const values = item.fieldValues?.nodes ?? [];
  const status = values.find((value) => value.field?.name === settings.statusFieldName && typeof value.name === "string")?.name ?? "";
  const effortValue = values.find((value) => value.field?.name === settings.effortFieldName && typeof value.number === "number");
  const startValue = values.find((value) => value.field?.name === settings.startFieldName);
  const finishValue = values.find((value) => value.field?.name === settings.finishFieldName);
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
    parentIssueId: item.content?.parent?.id && item.content.parent.id !== item.content.id ? item.content.parent.id : null,
    milestone: item.content?.milestone?.title?.trim() || null,
    milestoneId: item.content?.milestone?.id?.trim() || null,
    milestoneDueOn: milestoneDue(item.content?.milestone?.dueOn),
    startDate: milestoneDue(startValue?.date),
    finishDate: milestoneDue(finishValue?.date),
    predecessorIds: predecessorIds(item),
    inProject: true,
    updatedAt,
  };
}

function predecessorIds(item: GraphItem): string[] {
  const ids = item.content?.blockedBy?.nodes ?? [];
  const own = item.content?.id;
  return [...new Set(ids.map((node) => node?.id).filter((id): id is string => Boolean(id && id !== own)))];
}

const PROJECT_FIELDS = `
  id
  items(first:100,after:$cursor){
    pageInfo{hasNextPage endCursor}
    nodes{
      id
      isArchived
      content{... on Issue{id number title state repository{nameWithOwner} milestone{id title dueOn} parent{id} blockedBy(first:20){nodes{id}}}}
      fieldValues(first:30){nodes{
        ... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{id name}}}
        ... on ProjectV2ItemFieldNumberValue{number field{... on ProjectV2Field{id name}}}
        ... on ProjectV2ItemFieldDateValue{date field{... on ProjectV2Field{id name}}}
      }}
    }
  }
  fields(first:30){nodes{
    ... on ProjectV2SingleSelectField{id name options{id name}}
    ... on ProjectV2Field{id name dataType}
  }}
`;

const PROJECT_QUERY = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
  repositoryOwner(login:$owner){
    ... on Organization {
      projectV2(number:$number){${PROJECT_FIELDS}}
    }
    repository(name:$name){
      projectV2(number:$number){${PROJECT_FIELDS}}
    }
  }
}`;

const PROJECT_PAGE_QUERY = `query($id:ID!,$cursor:String){
  node(id:$id){
    ... on ProjectV2 {
      items(first:100,after:$cursor){
        pageInfo{hasNextPage endCursor}
        nodes{
          id
          isArchived
          content{... on Issue{id number title state repository{nameWithOwner} milestone{id title dueOn} parent{id} blockedBy(first:20){nodes{id}}}}
          fieldValues(first:30){nodes{
            ... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{id name}}}
            ... on ProjectV2ItemFieldNumberValue{number field{... on ProjectV2Field{id name}}}
            ... on ProjectV2ItemFieldDateValue{date field{... on ProjectV2Field{id name}}}
          }}
        }
      }
    }
  }
}`;

/** Prefers a repository project, then an organization project with the same number. */
export function chooseProject(data: ProjectLookup): { project: ProjectBody; scope: ProjectScope } | null {
  const owner = data.repositoryOwner;
  const repositoryProject = owner?.repository?.projectV2;
  if (repositoryProject) return { project: repositoryProject, scope: "repository" };
  const organizationProject = owner?.projectV2;
  if (organizationProject) return { project: organizationProject, scope: "organization" };
  return null;
}

/** Copies Status options onto the board and keeps issues from the mapped repository. */
export function readProject(
  settings: ProjectSettings,
  project: ProjectBody,
  scope: ProjectScope,
  now: string,
): { settings: ProjectSettings; issues: PlanIssue[] } {
  const fields = project.fields.nodes ?? [];
  const statusField = fields.find((field) => field.name === settings.statusFieldName && field.options);
  const effortField = resolveEffortField(fields, settings.effortFieldName);
  const optionNames = statusField?.options?.map((option) => option.name) ?? [];
  const columns = optionNames.length > 0 ? optionNames : settings.columns;
  const matchingDone = settings.doneStatuses.filter((name) => optionNames.length === 0 || optionNames.includes(name));
  const doneStatuses = matchingDone.length > 0 ? matchingDone : optionNames.filter((name) => name.toLowerCase() === "done");
  const nextSettings: ProjectSettings = {
    ...settings,
    projectNodeId: project.id,
    statusFieldId: statusField?.id ?? null,
    effortFieldId: effortField?.id ?? null,
    effortFieldName: effortField?.name ?? settings.effortFieldName,
    startFieldName: "Start",
    finishFieldName: "Finish",
    startFieldId: resolveDateField(fields, "Start")?.id ?? null,
    finishFieldId: resolveDateField(fields, "Finish")?.id ?? null,
    statusOptions: statusField?.options ?? [],
    columns,
    doneStatuses: doneStatuses.length > 0 ? doneStatuses : settings.doneStatuses,
  };
  const issues = (project.items.nodes ?? [])
    .filter((item) => item.content?.id && belongsToRepo(settings, item, scope))
    .map((item) => toIssue(nextSettings, item, now));
  return { settings: nextSettings, issues };
}

function resolveEffortField(fields: GraphField[], name: string): GraphField | undefined {
  const numberFields = fields.filter((field) => field.name && !field.options && field.dataType !== "DATE");
  return numberFields.find((field) => field.name === name) ?? numberFields.find((field) => field.name === "Estimate");
}

function resolveDateField(fields: GraphField[], name: string): GraphField | undefined {
  return fields.find((field) => field.name === name && field.dataType === "DATE");
}

/** Date fields named Start and Finish that the project does not already have. */
export function missingDateFields(fields: { name?: string; dataType?: string }[]): ("Start" | "Finish")[] {
  const names = new Set(fields.filter((field) => field.dataType === "DATE").map((field) => field.name));
  return (["Start", "Finish"] as const).filter((name) => !names.has(name));
}

async function writeDate(
  token: string,
  settings: ProjectSettings,
  issue: PlanIssue,
  fieldId: string | null,
  label: string,
  value: string | null,
): Promise<string | null> {
  if (!settings.projectNodeId || !issue.itemId || !fieldId) throw new Error(`${label} is not a date field on the GitHub project.`);
  if (value === null) {
    await graphql(token, CLEAR_FIELD, { project: settings.projectNodeId, item: issue.itemId, field: fieldId });
    return null;
  }
  await graphql(token, SET_FIELD, {
    project: settings.projectNodeId,
    item: issue.itemId,
    field: fieldId,
    value: { date: value },
  });
  return value;
}

function milestoneDue(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function belongsToRepo(settings: ProjectSettings, item: GraphItem, scope: ProjectScope): boolean {
  const fullName = item.content?.repository?.nameWithOwner;
  if (!fullName) return scope === "repository";
  return fullName.toLowerCase() === `${settings.owner}/${settings.repo}`.toLowerCase();
}

const SET_FIELD = `mutation($project:ID!,$item:ID!,$field:ID!,$value:ProjectV2FieldValue!){
  updateProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field,value:$value}){projectV2Item{id}}
}`;

const CLEAR_FIELD = `mutation($project:ID!,$item:ID!,$field:ID!){
  clearProjectV2ItemFieldValue(input:{projectId:$project,itemId:$item,fieldId:$field}){projectV2Item{id}}
}`;

const CREATE_DATE_FIELD = `mutation($project:ID!,$name:String!,$dataType:ProjectV2CustomFieldType!){
  createProjectV2Field(input:{projectId:$project,name:$name,dataType:$dataType}){projectV2Field{... on ProjectV2Field{id name}}}
}`;

const ADD_BLOCKED_BY = `mutation($issue:ID!,$blocking:ID!){
  addBlockedBy(input:{issueId:$issue,blockingIssueId:$blocking}){issue{id}}
}`;

const REMOVE_BLOCKED_BY = `mutation($issue:ID!,$blocking:ID!){
  removeBlockedBy(input:{issueId:$issue,blockingIssueId:$blocking}){issue{id}}
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
