import { createSign } from "node:crypto";
import { createdIssueType } from "../../../packages/domain/src/hierarchy";
import type { GitHubUser, IssueChange, IterationChoice, PlanIssue, ProjectSettings } from "../../../packages/domain/src/index";

export type GitHubGateway = {
  configured: boolean;
  reconcile(settings: ProjectSettings): Promise<{ settings: ProjectSettings; issues: PlanIssue[] }>;
  ensureDateFields(settings: ProjectSettings): Promise<{ settings: ProjectSettings; issues: PlanIssue[] }>;
  updateIssue(settings: ProjectSettings, issue: PlanIssue, change: IssueChange): Promise<PlanIssue>;
  setDependency(settings: ProjectSettings, issue: PlanIssue, predecessorId: string, action: "add" | "remove"): Promise<PlanIssue>;
  createPlanItem(
    settings: ProjectSettings,
    input: {
      kind: "epic" | "feature" | "issue" | "subissue";
      title: string;
      parentIssueId: string | null;
      workstreamNumber: number | null;
    } & IssueChange,
  ): Promise<void>;
};

type GraphItem = {
  id?: string;
  isArchived?: boolean;
  content?: {
    id?: string;
    number?: number;
    title?: string;
    body?: string | null;
    state?: string;
    repository?: { nameWithOwner?: string } | null;
    milestone?: { id?: string; title?: string; dueOn?: string | null } | null;
    parent?: { id?: string } | null;
    issueType?: { name?: string } | null;
    assignees?: { nodes?: ({ id?: string; login?: string; name?: string | null } | null)[] | null } | null;
    blockedBy?: { nodes?: ({ id?: string } | null)[] | null } | null;
  } | null;
  fieldValues?: { nodes?: FieldValue[] };
};

type FieldValue = {
  name?: string;
  number?: number;
  date?: string | null;
  text?: string | null;
  title?: string;
  startDate?: string | null;
  duration?: number;
  iterationId?: string;
  field?: { id?: string; name?: string };
};

type GraphIteration = { id?: string; title?: string; startDate?: string; duration?: number };

type GraphField = {
  id?: string;
  name?: string;
  dataType?: string;
  options?: { id: string; name: string }[];
  configuration?: { iterations?: GraphIteration[]; completedIterations?: GraphIteration[] };
};

type ProjectBody = {
  id: string;
  items: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: GraphItem[] };
  fields: { nodes: GraphField[] };
};

type ProjectLookup = {
  repositoryOwner?: {
    projectV2?: ProjectBody | null;
    repository?: {
      projectV2?: ProjectBody | null;
      assignableUsers?: { nodes?: ({ id?: string; login?: string; name?: string | null } | null)[] | null } | null;
    } | null;
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
      const lookup = await graphql<ProjectLookup>(token, PROJECT_QUERY, {
        owner: settings.owner,
        name: settings.repo,
        number: settings.projectNumber,
        cursor: null,
      });
      const found = chooseProject(lookup);
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
      return readProject(settings, project, found.scope, now().toISOString(), assignableUsers(lookup));
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
      const issuePatch: { title?: string; body?: string } = {};
      if (change.title) issuePatch.title = change.title;
      if (change.description !== undefined) issuePatch.body = change.description ?? "";
      if (issue.number != null && Object.keys(issuePatch).length > 0) {
        await github(token, `/repos/${settings.owner}/${settings.repo}/issues/${issue.number}`, issuePatch, "PATCH");
        if (issuePatch.title) next.title = issuePatch.title;
        if (change.description !== undefined) next.description = change.description?.trim() ? change.description : null;
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
      if (change.iterationId !== undefined) Object.assign(next, await writeIteration(token, settings, issue, change.iterationId));
      if (change.assigneeId !== undefined) next.assignees = await writeAssignee(token, settings, issue, change.assigneeId);
      if (change.comments !== undefined) next.comments = await writeComments(token, settings, issue, change.comments);
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
    async createPlanItem(settings, input) {
      const token = await installationToken(appId, privateKey, settings.owner, settings.repo);
      if (!settings.projectNodeId) throw new Error("Sync the GitHub project before adding a row.");
      const repo = await graphql<{ repository?: { id?: string } | null }>(token, REPO_ID, {
        owner: settings.owner,
        name: settings.repo,
      });
      const repositoryId = repo.repository?.id;
      if (!repositoryId) throw new Error("The GitHub repository was not found.");
      let issueTypeId: string | null = null;
      const typeName = createdIssueType(input.kind);
      if (typeName) {
        const types = await graphql<{ organization?: { issueTypes?: { nodes?: ({ id?: string; name?: string } | null)[] | null } | null } | null }>(
          token,
          ORG_ISSUE_TYPES,
          { owner: settings.owner },
        );
        issueTypeId = types.organization?.issueTypes?.nodes?.find((item) => item?.name === typeName)?.id ?? null;
        if (!issueTypeId) throw new Error(`GitHub has no issue type named ${typeName}.`);
      }
      const needsWorkstream = input.kind === "epic" || (input.kind === "issue" && !input.parentIssueId);
      let workstreamId: string | null = null;
      if (needsWorkstream) {
        const found = await graphql<{ repository?: { issue?: { id?: string } | null } | null }>(token, REPO_ISSUE, {
          owner: settings.owner,
          name: settings.repo,
          number: input.workstreamNumber,
        });
        workstreamId = found.repository?.issue?.id ?? null;
        if (!workstreamId) throw new Error(`Workstream issue #${input.workstreamNumber} was not found.`);
      }
      const parentIssueId = needsWorkstream ? workstreamId : input.parentIssueId;
      const created = await graphql<{ createIssue?: { issue?: { id?: string; number?: number } | null } | null }>(
        token,
        issueTypeId ? CREATE_TYPED_ISSUE : CREATE_ISSUE,
        issueTypeId ? { repo: repositoryId, title: input.title, type: issueTypeId } : { repo: repositoryId, title: input.title },
      );
      const issueId = created.createIssue?.issue?.id;
      const number = created.createIssue?.issue?.number ?? null;
      if (!issueId) throw new Error("GitHub did not create the issue.");
      if (parentIssueId) await graphql(token, ADD_SUB_ISSUE, { parent: parentIssueId, child: issueId });
      const added = await graphql<{ addProjectV2ItemById?: { item?: { id?: string } | null } | null }>(token, ADD_PROJECT_ITEM, {
        project: settings.projectNodeId,
        content: issueId,
      });
      const change = fieldsOnCreate(input);
      if (Object.keys(change).length === 0) return;
      await this.updateIssue(
        settings,
        {
          issueId,
          itemId: added.addProjectV2ItemById?.item?.id ?? null,
          projectId: settings.projectId,
          customerId: settings.customerId,
          number,
          title: input.title,
          description: null,
          status: "",
          effort: null,
          issueState: "open",
          archived: false,
          deletedAt: null,
          parentIssueId,
          issueType: createdIssueType(input.kind),
          milestone: null,
          milestoneId: null,
          milestoneDueOn: null,
          startDate: null,
          finishDate: null,
          iterationTitle: null,
          iterationStart: null,
          iterationDuration: null,
          iterationId: null,
          assignees: [],
          comments: null,
          predecessorIds: [],
          priority: null,
          labels: [],
          relationships: [],
          inProject: true,
          updatedAt: now().toISOString(),
        },
        change,
      );
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
    description: item.content?.body?.trim() ? item.content.body : null,
    status,
    effort: effortValue?.number ?? null,
    issueState: item.content?.state === "CLOSED" ? "closed" : "open",
    archived: Boolean(item.isArchived),
    deletedAt: null,
    parentIssueId: item.content?.parent?.id && item.content.parent.id !== item.content.id ? item.content.parent.id : null,
    issueType: item.content?.issueType?.name?.trim() || null,
    milestone: item.content?.milestone?.title?.trim() || null,
    milestoneId: item.content?.milestone?.id?.trim() || null,
    milestoneDueOn: milestoneDue(item.content?.milestone?.dueOn),
    startDate: milestoneDue(startValue?.date),
    finishDate: milestoneDue(finishValue?.date),
    ...iterationFields(values),
    assignees: assigneesOf(item),
    comments: commentText(values),
    predecessorIds: predecessorIds(item),
    // GitHub has no priority, label, or relationship field. The reconcile save path restores stored values.
    priority: null,
    labels: [],
    relationships: [],
    inProject: true,
    updatedAt,
  };
}

function iterationFields(values: FieldValue[]): { iterationTitle: string | null; iterationStart: string | null; iterationDuration: number | null; iterationId: string | null } {
  const iteration = values.find((value) => value.field?.name?.toLowerCase() === "iteration" && (value.startDate || value.iterationId));
  const start = milestoneDue(iteration?.startDate);
  const duration = typeof iteration?.duration === "number" && Number.isInteger(iteration.duration) && iteration.duration >= 1 ? iteration.duration : null;
  const iterationId = iteration?.iterationId?.trim() || null;
  if (!iteration || !start || duration == null) return { iterationTitle: null, iterationStart: null, iterationDuration: null, iterationId };
  return { iterationTitle: iteration.title?.trim() || null, iterationStart: start, iterationDuration: duration, iterationId };
}

function assigneesOf(item: GraphItem): GitHubUser[] {
  return (item.content?.assignees?.nodes ?? []).flatMap((node) => {
    const id = node?.id?.trim() ?? "";
    const login = node?.login?.trim() ?? "";
    if (!id || !login) return [];
    const name = node?.name?.trim() || null;
    return [{ id, login, name }];
  });
}

function commentText(values: FieldValue[]): string | null {
  const field = values.find((value) => value.field?.name === "Comments" && typeof value.text === "string");
  const text = field?.text?.trim();
  return text || null;
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
      content{... on Issue{id number title body state repository{nameWithOwner} milestone{id title dueOn} parent{id} issueType{name} assignees(first:20){nodes{id login name}} blockedBy(first:20){nodes{id}}}}
      fieldValues(first:40){nodes{
        ... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{id name}}}
        ... on ProjectV2ItemFieldNumberValue{number field{... on ProjectV2Field{id name}}}
        ... on ProjectV2ItemFieldDateValue{date field{... on ProjectV2Field{id name}}}
        ... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2FieldCommon{name}}}
        ... on ProjectV2ItemFieldIterationValue{iterationId title startDate duration field{... on ProjectV2FieldCommon{name}}}
      }}
    }
  }
  fields(first:50){nodes{
    ... on ProjectV2SingleSelectField{id name options{id name}}
    ... on ProjectV2IterationField{id name configuration{iterations{id title startDate duration} completedIterations{id title startDate duration}}}
    ... on ProjectV2Field{id name dataType}
  }}
`;

const PROJECT_QUERY = `query($owner:String!,$name:String!,$number:Int!,$cursor:String){
  repositoryOwner(login:$owner){
    ... on Organization {
      projectV2(number:$number){${PROJECT_FIELDS}}
    }
    repository(name:$name){
      assignableUsers(first:100){nodes{id login name}}
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
          content{... on Issue{id number title body state repository{nameWithOwner} milestone{id title dueOn} parent{id} issueType{name} assignees(first:20){nodes{id login name}} blockedBy(first:20){nodes{id}}}}
          fieldValues(first:40){nodes{
            ... on ProjectV2ItemFieldSingleSelectValue{name field{... on ProjectV2SingleSelectField{id name}}}
            ... on ProjectV2ItemFieldNumberValue{number field{... on ProjectV2Field{id name}}}
            ... on ProjectV2ItemFieldDateValue{date field{... on ProjectV2Field{id name}}}
            ... on ProjectV2ItemFieldTextValue{text field{... on ProjectV2FieldCommon{name}}}
            ... on ProjectV2ItemFieldIterationValue{iterationId title startDate duration field{... on ProjectV2FieldCommon{name}}}
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
  people: GitHubUser[] = [],
): { settings: ProjectSettings; issues: PlanIssue[] } {
  const fields = project.fields.nodes ?? [];
  const statusField = fields.find((field) => field.name === settings.statusFieldName && field.options);
  const effortField = resolveEffortField(fields, settings.effortFieldName);
  const optionNames = statusField?.options?.map((option) => option.name) ?? [];
  const columns = optionNames.length > 0 ? optionNames : settings.columns;
  const matchingDone = settings.doneStatuses.filter((name) => optionNames.length === 0 || optionNames.includes(name));
  const doneStatuses = matchingDone.length > 0 ? matchingDone : optionNames.filter((name) => name.toLowerCase() === "done");
  // `settings` already carries recordSource and the catalogs. Reconcile must not replace those with empty lists.
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
    iterationFieldId: iterationField(fields)?.id ?? null,
    iterations: iterationChoices(iterationField(fields)),
    commentsFieldId: fields.find((field) => field.name === "Comments" && field.dataType === "TEXT")?.id ?? null,
    assignableUsers: people,
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

function iterationField(fields: GraphField[]): GraphField | undefined {
  return fields.find((field) => field.name?.toLowerCase() === "iteration" && field.configuration);
}

function iterationChoices(field: GraphField | undefined): IterationChoice[] {
  const rows = [...(field?.configuration?.iterations ?? []), ...(field?.configuration?.completedIterations ?? [])];
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    const id = row.id?.trim() ?? "";
    const title = row.title?.trim() ?? "";
    const startDate = milestoneDue(row.startDate) ?? "";
    const duration = typeof row.duration === "number" && Number.isInteger(row.duration) && row.duration >= 1 ? row.duration : 0;
    if (!id || !title || !startDate || !duration || seen.has(id)) return [];
    seen.add(id);
    return [{ id, title, startDate, duration }];
  });
}

function assignableUsers(lookup: ProjectLookup): GitHubUser[] {
  return (lookup.repositoryOwner?.repository?.assignableUsers?.nodes ?? []).flatMap((node) => {
    const id = node?.id?.trim() ?? "";
    const login = node?.login?.trim() ?? "";
    if (!id || !login) return [];
    return [{ id, login, name: node?.name?.trim() || null }];
  });
}

function fieldsOnCreate(input: IssueChange & { kind: "epic" | "feature" | "issue" | "subissue" }): IssueChange {
  const change: IssueChange = {};
  if (input.description !== undefined) change.description = input.description;
  if (input.status) change.status = input.status;
  if (typeof input.effort === "number") change.effort = input.effort;
  if (input.startDate !== undefined) change.startDate = input.startDate;
  if (input.finishDate !== undefined) change.finishDate = input.finishDate;
  if (input.iterationId !== undefined) change.iterationId = input.iterationId;
  if (input.assigneeId !== undefined) change.assigneeId = input.assigneeId;
  if (input.comments !== undefined) change.comments = input.comments;
  return change;
}

/** Date fields named Start and Finish that the project does not already have. */
export function missingDateFields(fields: { name?: string; dataType?: string }[]): ("Start" | "Finish")[] {
  const names = new Set(fields.filter((field) => field.dataType === "DATE").map((field) => field.name));
  return (["Start", "Finish"] as const).filter((name) => !names.has(name));
}

async function writeIteration(
  token: string,
  settings: ProjectSettings,
  issue: PlanIssue,
  iterationId: string | null,
): Promise<Pick<PlanIssue, "iterationId" | "iterationTitle" | "iterationStart" | "iterationDuration">> {
  if (!settings.projectNodeId || !issue.itemId || !settings.iterationFieldId) throw new Error("Iteration is not a field on the GitHub project.");
  if (iterationId === null) {
    await graphql(token, CLEAR_FIELD, { project: settings.projectNodeId, item: issue.itemId, field: settings.iterationFieldId });
    return { iterationId: null, iterationTitle: null, iterationStart: null, iterationDuration: null };
  }
  const iteration = settings.iterations.find((item) => item.id === iterationId);
  if (!iteration) throw new Error("That iteration is not on the GitHub project.");
  await graphql(token, SET_FIELD, {
    project: settings.projectNodeId,
    item: issue.itemId,
    field: settings.iterationFieldId,
    value: { iterationId },
  });
  return { iterationId: iteration.id, iterationTitle: iteration.title, iterationStart: iteration.startDate, iterationDuration: iteration.duration };
}

async function writeAssignee(token: string, settings: ProjectSettings, issue: PlanIssue, assigneeId: string | null): Promise<GitHubUser[]> {
  const current = issue.assignees.map((person) => person.id).filter((id) => id !== assigneeId);
  if (current.length > 0) await graphql(token, REMOVE_ASSIGNEES, { issue: issue.issueId, assigneeIds: current });
  if (!assigneeId) return [];
  await graphql(token, ADD_ASSIGNEES, { issue: issue.issueId, assigneeIds: [assigneeId] });
  return [settings.assignableUsers.find((person) => person.id === assigneeId) ?? { id: assigneeId, login: assigneeId, name: null }];
}

async function writeComments(token: string, settings: ProjectSettings, issue: PlanIssue, comments: string): Promise<string> {
  if (!settings.projectNodeId || !issue.itemId) throw new Error("Sync the GitHub project before saving a comment.");
  let fieldId = settings.commentsFieldId;
  if (!fieldId) {
    const created = await graphql<{ createProjectV2Field?: { projectV2Field?: { id?: string } | null } | null }>(token, CREATE_TEXT_FIELD, {
      project: settings.projectNodeId,
      name: "Comments",
    });
    fieldId = created.createProjectV2Field?.projectV2Field?.id ?? null;
    if (!fieldId) throw new Error("GitHub did not create the Comments field.");
    settings.commentsFieldId = fieldId;
  }
  await graphql(token, SET_FIELD, {
    project: settings.projectNodeId,
    item: issue.itemId,
    field: fieldId,
    value: { text: comments },
  });
  return comments;
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

const CREATE_TEXT_FIELD = `mutation($project:ID!,$name:String!){
  createProjectV2Field(input:{projectId:$project,name:$name,dataType:TEXT}){projectV2Field{... on ProjectV2Field{id}}}
}`;

const ADD_ASSIGNEES = `mutation($issue:ID!,$assigneeIds:[ID!]!){
  addAssigneesToAssignable(input:{assignableId:$issue,assigneeIds:$assigneeIds}){assignable{... on Issue{id}}}
}`;

const REMOVE_ASSIGNEES = `mutation($issue:ID!,$assigneeIds:[ID!]!){
  removeAssigneesFromAssignable(input:{assignableId:$issue,assigneeIds:$assigneeIds}){assignable{... on Issue{id}}}
}`;

const ADD_BLOCKED_BY = `mutation($issue:ID!,$blocking:ID!){
  addBlockedBy(input:{issueId:$issue,blockingIssueId:$blocking}){issue{id}}
}`;

const REMOVE_BLOCKED_BY = `mutation($issue:ID!,$blocking:ID!){
  removeBlockedBy(input:{issueId:$issue,blockingIssueId:$blocking}){issue{id}}
}`;

const REPO_ID = `query($owner:String!,$name:String!){
  repository(owner:$owner,name:$name){id}
}`;

const REPO_ISSUE = `query($owner:String!,$name:String!,$number:Int!){
  repository(owner:$owner,name:$name){issue(number:$number){id}}
}`;

const ORG_ISSUE_TYPES = `query($owner:String!){
  organization(login:$owner){issueTypes(first:30){nodes{id name}}}
}`;

const CREATE_ISSUE = `mutation($repo:ID!,$title:String!){
  createIssue(input:{repositoryId:$repo,title:$title}){issue{id number}}
}`;

const CREATE_TYPED_ISSUE = `mutation($repo:ID!,$title:String!,$type:ID!){
  createIssue(input:{repositoryId:$repo,title:$title,issueTypeId:$type}){issue{id number}}
}`;

const ADD_SUB_ISSUE = `mutation($parent:ID!,$child:ID!){
  addSubIssue(input:{issueId:$parent,subIssueId:$child}){issue{id}}
}`;

const ADD_PROJECT_ITEM = `mutation($project:ID!,$content:ID!){
  addProjectV2ItemById(input:{projectId:$project,contentId:$content}){item{id}}
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

async function github(token: string, path: string, body?: unknown, method?: "POST" | "PATCH"): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.github.com${path}`, {
    method: body === undefined ? "GET" : method ?? "POST",
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
