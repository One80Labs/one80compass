import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import {
  isModuleKey,
  type ApplicationLink,
  type AuditEvent,
  type Customer,
  type DocumentVersion,
  type Membership,
  type PlanIssue,
  type DocumentFolder,
  type PortalDocument,
  type ProgressOverride,
  type Project,
  type ProjectHealth,
  type ProjectOverview,
  type ProjectSettings,
  type ReportVersion,
  type StatusReport,
  type SyncState,
} from "../../../packages/domain/src/index";
import type { BaselineRecord } from "../../../packages/domain/src/baselines";
import type { MilestoneRecord } from "../../../packages/domain/src/milestones";

export interface Store {
  createCustomer(customer: Customer): Promise<void>;
  listCustomers(): Promise<Customer[]>;
  getCustomer(customerId: string): Promise<Customer | null>;
  createProject(project: Project): Promise<void>;
  getProject(projectId: string): Promise<Project | null>;
  listProjects(customerId: string): Promise<Project[]>;
  putMembership(membership: Membership): Promise<void>;
  deleteMembership(customerId: string, userId: string): Promise<void>;
  listMembershipsForUser(userId: string): Promise<Membership[]>;
  listMembershipsForCustomer(customerId: string): Promise<Membership[]>;
  createApplication(application: ApplicationLink): Promise<void>;
  listApplications(projectId: string): Promise<ApplicationLink[]>;
  putAudit(event: AuditEvent): Promise<void>;
  listAudit(customerId: string): Promise<AuditEvent[]>;
  getOverview(projectId: string): Promise<ProjectOverview | null>;
  putOverview(overview: ProjectOverview): Promise<void>;
  createDocument(document: PortalDocument): Promise<void>;
  putDocument(document: PortalDocument): Promise<void>;
  getDocument(documentId: string): Promise<PortalDocument | null>;
  listDocuments(projectId: string): Promise<PortalDocument[]>;
  listFolders(projectId: string): Promise<DocumentFolder[]>;
  putFolder(folder: DocumentFolder): Promise<void>;
  deleteFolder(projectId: string, path: string): Promise<void>;
  putVersion(version: DocumentVersion): Promise<void>;
  getVersion(documentId: string, versionId: string): Promise<DocumentVersion | null>;
  listVersions(documentId: string): Promise<DocumentVersion[]>;
  getSettings(projectId: string): Promise<ProjectSettings | null>;
  putSettings(settings: ProjectSettings): Promise<void>;
  listSettings(): Promise<ProjectSettings[]>;
  getIssue(projectId: string, issueId: string): Promise<PlanIssue | null>;
  putIssue(issue: PlanIssue): Promise<void>;
  listIssues(projectId: string): Promise<PlanIssue[]>;
  listMilestones(projectId: string): Promise<MilestoneRecord[]>;
  putMilestone(record: MilestoneRecord): Promise<void>;
  listBaselines(projectId: string): Promise<BaselineRecord[]>;
  putBaseline(record: BaselineRecord): Promise<void>;
  getOverride(projectId: string): Promise<ProgressOverride | null>;
  putOverride(override: ProgressOverride): Promise<void>;
  getSync(projectId: string): Promise<SyncState | null>;
  putSync(state: SyncState): Promise<void>;
  claimDelivery(deliveryId: string): Promise<boolean>;
  createReport(report: StatusReport): Promise<void>;
  putReport(report: StatusReport): Promise<void>;
  getReport(reportId: string): Promise<StatusReport | null>;
  listReports(projectId: string): Promise<StatusReport[]>;
  putReportVersion(version: ReportVersion): Promise<void>;
  listReportVersions(reportId: string): Promise<ReportVersion[]>;
}

type Item = Record<string, unknown>;

export class DynamoStore implements Store {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async createCustomer(customer: Customer): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: cust(customer.customerId),
          sk: "META",
          gsi1pk: "CUSTOMERS",
          gsi1sk: customer.customerId,
          entity: "customer",
          ...customer,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  }

  async listCustomers(): Promise<Customer[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": "CUSTOMERS" },
      }),
    );
    return (result.Items ?? []).map(asCustomer);
  }

  async getCustomer(customerId: string): Promise<Customer | null> {
    const result = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: cust(customerId), sk: "META" } }),
    );
    return result.Item ? asCustomer(result.Item) : null;
  }

  async createProject(project: Project): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: cust(project.customerId),
          sk: projSk(project.projectId),
          gsi1pk: proj(project.projectId),
          gsi1sk: "META",
          entity: "project",
          ...project,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  }

  async getProject(projectId: string): Promise<Project | null> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk AND gsi1sk = :sk",
        ExpressionAttributeValues: { ":pk": proj(projectId), ":sk": "META" },
        Limit: 1,
      }),
    );
    const item = result.Items?.[0];
    return item ? asProject(item) : null;
  }

  async listProjects(customerId: string): Promise<Project[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": cust(customerId), ":sk": "PROJ#" },
      }),
    );
    return (result.Items ?? []).map(asProject);
  }

  async putMembership(membership: Membership): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: cust(membership.customerId),
          sk: memberSk(membership.userId),
          gsi1pk: user(membership.userId),
          gsi1sk: cust(membership.customerId),
          entity: "membership",
          ...membership,
        },
      }),
    );
  }

  async deleteMembership(customerId: string, userId: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { pk: cust(customerId), sk: memberSk(userId) },
      }),
    );
  }

  async listMembershipsForUser(userId: string): Promise<Membership[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": user(userId) },
      }),
    );
    return (result.Items ?? []).map(asMembership);
  }

  async listMembershipsForCustomer(customerId: string): Promise<Membership[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": cust(customerId), ":sk": "MEMBER#" },
      }),
    );
    return (result.Items ?? []).map(asMembership);
  }

  async createApplication(application: ApplicationLink): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: proj(application.projectId),
          sk: appSk(application.applicationId),
          entity: "application",
          ...application,
        },
        ConditionExpression: "attribute_not_exists(pk)",
      }),
    );
  }

  async listApplications(projectId: string): Promise<ApplicationLink[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": proj(projectId), ":sk": "APP#" },
      }),
    );
    return (result.Items ?? []).map(asApplication);
  }

  async putAudit(event: AuditEvent): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: cust(event.customerId),
          sk: `AUDIT#${event.at}#${event.eventId}`,
          entity: "audit",
          ...event,
        },
      }),
    );
  }

  async listAudit(customerId: string): Promise<AuditEvent[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": cust(customerId), ":sk": "AUDIT#" },
        ScanIndexForward: false,
        Limit: 50,
      }),
    );
    return (result.Items ?? []).map(asAudit);
  }

  async getOverview(projectId: string): Promise<ProjectOverview | null> {
    const result = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: proj(projectId), sk: "OVERVIEW" } }),
    );
    return result.Item ? asOverview(result.Item) : null;
  }

  async putOverview(overview: ProjectOverview): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: proj(overview.projectId), sk: "OVERVIEW", entity: "overview", ...overview },
      }),
    );
  }

  async createDocument(document: PortalDocument): Promise<void> {
    await this.writeDocument(document, true);
  }

  async putDocument(document: PortalDocument): Promise<void> {
    await this.writeDocument(document, false);
  }

  async getDocument(documentId: string): Promise<PortalDocument | null> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk AND gsi1sk = :sk",
        ExpressionAttributeValues: { ":pk": doc(documentId), ":sk": "META" },
        Limit: 1,
      }),
    );
    const item = result.Items?.[0];
    return item ? asDocument(item) : null;
  }

  async listFolders(projectId: string): Promise<DocumentFolder[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": proj(projectId), ":sk": "FOLDER#" },
      }),
    );
    return (result.Items ?? []).map(asFolder);
  }

  async putFolder(folder: DocumentFolder): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: proj(folder.projectId), sk: folderSk(folder.path), entity: "folder", ...folder },
      }),
    );
  }

  async deleteFolder(projectId: string, path: string): Promise<void> {
    await this.doc.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { pk: proj(projectId), sk: folderSk(path) },
      }),
    );
  }

  async listDocuments(projectId: string): Promise<PortalDocument[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": proj(projectId), ":sk": "DOC#" },
      }),
    );
    return (result.Items ?? []).map(asDocument);
  }

  async putVersion(version: DocumentVersion): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: doc(version.documentId), sk: ver(version.versionId), entity: "documentVersion", ...version },
      }),
    );
  }

  async getVersion(documentId: string, versionId: string): Promise<DocumentVersion | null> {
    const result = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: doc(documentId), sk: ver(versionId) } }),
    );
    return result.Item ? asVersion(result.Item) : null;
  }

  async listVersions(documentId: string): Promise<DocumentVersion[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": doc(documentId), ":sk": "VER#" },
      }),
    );
    return (result.Items ?? []).map(asVersion);
  }

  async getSettings(projectId: string): Promise<ProjectSettings | null> {
    const result = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: { pk: proj(projectId), sk: "SETTINGS" } }));
    return result.Item ? asSettings(result.Item) : null;
  }

  async putSettings(settings: ProjectSettings): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: proj(settings.projectId), sk: "SETTINGS", gsi1pk: "SETTINGS", gsi1sk: settings.projectId, entity: "settings", ...settings },
      }),
    );
  }

  async listSettings(): Promise<ProjectSettings[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk",
        ExpressionAttributeValues: { ":pk": "SETTINGS" },
      }),
    );
    return (result.Items ?? []).map(asSettings);
  }

  async getIssue(projectId: string, issueId: string): Promise<PlanIssue | null> {
    const result = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: { pk: proj(projectId), sk: issueSk(issueId) } }));
    return result.Item ? asIssue(result.Item) : null;
  }

  async putIssue(issue: PlanIssue): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: proj(issue.projectId), sk: issueSk(issue.issueId), entity: "issue", ...issue },
      }),
    );
  }

  async listIssues(projectId: string): Promise<PlanIssue[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": proj(projectId), ":sk": "ISSUE#" },
      }),
    );
    return (result.Items ?? []).map(asIssue);
  }

  async listMilestones(projectId: string): Promise<MilestoneRecord[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": proj(projectId), ":sk": "MILESTONE#" },
      }),
    );
    return (result.Items ?? []).map(asMilestone);
  }

  async putMilestone(record: MilestoneRecord): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: proj(record.projectId), sk: `MILESTONE#${encodeURIComponent(record.milestoneKey)}`, entity: "milestone", ...record },
      }),
    );
  }

  async listBaselines(projectId: string): Promise<BaselineRecord[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": proj(projectId), ":sk": "BASELINE#" },
      }),
    );
    return (result.Items ?? []).map(asBaseline);
  }

  async putBaseline(record: BaselineRecord): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: proj(record.projectId), sk: `BASELINE#${record.baselineId}`, entity: "baseline", ...record },
      }),
    );
  }

  async getOverride(projectId: string): Promise<ProgressOverride | null> {
    const result = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: { pk: proj(projectId), sk: "OVERRIDE" } }));
    return result.Item ? asOverride(result.Item) : null;
  }

  async putOverride(override: ProgressOverride): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: proj(override.projectId), sk: "OVERRIDE", entity: "override", ...override },
      }),
    );
  }

  async getSync(projectId: string): Promise<SyncState | null> {
    const result = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: { pk: proj(projectId), sk: "SYNC" } }));
    return result.Item ? asSync(result.Item) : null;
  }

  async putSync(state: SyncState): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: proj(state.projectId), sk: "SYNC", entity: "sync", ...state },
      }),
    );
  }

  async createReport(report: StatusReport): Promise<void> {
    await this.writeReport(report, true);
  }

  async putReport(report: StatusReport): Promise<void> {
    await this.writeReport(report, false);
  }

  async getReport(reportId: string): Promise<StatusReport | null> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "gsi1",
        KeyConditionExpression: "gsi1pk = :pk AND gsi1sk = :sk",
        ExpressionAttributeValues: { ":pk": rpt(reportId), ":sk": "META" },
        Limit: 1,
      }),
    );
    const item = result.Items?.[0];
    return item ? asReport(item) : null;
  }

  async listReports(projectId: string): Promise<StatusReport[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": proj(projectId), ":sk": "RPT#" },
      }),
    );
    return (result.Items ?? []).filter((item) => item.entity === "report").map(asReport);
  }

  async putReportVersion(version: ReportVersion): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: { pk: rpt(version.reportId), sk: `VER#${version.publishedAt}#${version.versionId}`, entity: "reportVersion", ...version },
      }),
    );
  }

  async listReportVersions(reportId: string): Promise<ReportVersion[]> {
    const result = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: { ":pk": rpt(reportId), ":sk": "VER#" },
        ScanIndexForward: false,
      }),
    );
    return (result.Items ?? []).map(asReportVersion);
  }

  async claimDelivery(deliveryId: string): Promise<boolean> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.tableName,
          Item: { pk: `DELIVERY#${deliveryId}`, sk: "META", entity: "delivery", deliveryId },
          ConditionExpression: "attribute_not_exists(pk)",
        }),
      );
      return true;
    } catch (error) {
      if (error && typeof error === "object" && "name" in error && error.name === "ConditionalCheckFailedException") return false;
      throw error;
    }
  }

  private async writeReport(report: StatusReport, creating: boolean): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: proj(report.projectId),
          sk: `RPT#${report.reportId}`,
          gsi1pk: rpt(report.reportId),
          gsi1sk: "META",
          entity: "report",
          ...report,
        },
        ConditionExpression: creating ? "attribute_not_exists(pk)" : undefined,
      }),
    );
  }

  private async writeDocument(document: PortalDocument, creating: boolean): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: proj(document.projectId),
          sk: docSk(document.documentId),
          gsi1pk: doc(document.documentId),
          gsi1sk: "META",
          entity: "document",
          ...document,
        },
        ConditionExpression: creating ? "attribute_not_exists(pk)" : undefined,
      }),
    );
  }
}

function cust(id: string): string {
  return `CUST#${id}`;
}
function proj(id: string): string {
  return `PROJ#${id}`;
}
function user(id: string): string {
  return `USER#${id}`;
}
function projSk(id: string): string {
  return `PROJ#${id}`;
}
function memberSk(id: string): string {
  return `MEMBER#${id}`;
}
function appSk(id: string): string {
  return `APP#${id}`;
}
function doc(id: string): string {
  return `DOC#${id}`;
}
function docSk(id: string): string {
  return `DOC#${id}`;
}
function folderSk(path: string): string {
  return `FOLDER#${encodeURIComponent(path)}`;
}
function ver(id: string): string {
  return `VER#${id}`;
}
function issueSk(id: string): string {
  return `ISSUE#${id}`;
}
function rpt(id: string): string {
  return `RPT#${id}`;
}

function asCustomer(item: Item): Customer {
  return { customerId: String(item.customerId), name: String(item.name), createdAt: String(item.createdAt) };
}
function asProject(item: Item): Project {
  return {
    projectId: String(item.projectId),
    customerId: String(item.customerId),
    name: String(item.name),
    createdAt: String(item.createdAt),
  };
}
function asMembership(item: Item): Membership {
  const savedProjects = item.projectIds;
  return {
    customerId: String(item.customerId),
    userId: String(item.userId),
    email: String(item.email),
    name: typeof item.name === "string" ? item.name : "",
    role: "employee",
    createdAt: String(item.createdAt),
    projectIds: Array.isArray(savedProjects) ? savedProjects.map(String) : null,
  };
}
function asApplication(item: Item): ApplicationLink {
  return {
    applicationId: String(item.applicationId),
    projectId: String(item.projectId),
    customerId: String(item.customerId),
    moduleKey: isModuleKey(String(item.moduleKey)) ? String(item.moduleKey) as ApplicationLink["moduleKey"] : "overview",
    displayName: String(item.displayName),
    createdAt: String(item.createdAt),
  };
}
function asAudit(item: Item): AuditEvent {
  return {
    eventId: String(item.eventId),
    customerId: String(item.customerId),
    projectId: item.projectId == null ? null : String(item.projectId),
    actorUserId: String(item.actorUserId),
    action: String(item.action),
    targetType: String(item.targetType),
    targetId: String(item.targetId),
    before: item.before ?? null,
    after: item.after ?? null,
    at: String(item.at),
    correlationId: String(item.correlationId),
  };
}

function asOverview(item: Item): ProjectOverview {
  const health = item.health == null ? null : (String(item.health) as ProjectHealth);
  return {
    projectId: String(item.projectId),
    customerId: String(item.customerId),
    health,
    healthExplanation: item.healthExplanation == null ? null : String(item.healthExplanation),
    notes: String(item.notes ?? ""),
    updatedAt: item.updatedAt == null ? null : String(item.updatedAt),
  };
}

function asFolder(item: Item): DocumentFolder {
  return {
    projectId: String(item.projectId),
    customerId: String(item.customerId),
    path: String(item.path),
    name: String(item.name),
    parent: String(item.parent ?? ""),
    createdAt: String(item.createdAt),
  };
}

function asDocument(item: Item): PortalDocument {
  return {
    documentId: String(item.documentId),
    projectId: String(item.projectId),
    customerId: String(item.customerId),
    name: String(item.name),
    folder: String(item.folder ?? ""),
    currentVersionId: item.currentVersionId == null ? null : String(item.currentVersionId),
    deletedAt: item.deletedAt == null ? null : String(item.deletedAt),
    createdAt: String(item.createdAt),
  };
}

function asVersion(item: Item): DocumentVersion {
  return {
    versionId: String(item.versionId),
    documentId: String(item.documentId),
    projectId: String(item.projectId),
    customerId: String(item.customerId),
    fileName: String(item.fileName),
    contentType: String(item.contentType),
    sizeBytes: Number(item.sizeBytes),
    objectKey: String(item.objectKey),
    status: item.status === "stored" ? "stored" : "pending",
    createdAt: String(item.createdAt),
    createdBy: String(item.createdBy),
  };
}

function asSettings(item: Item): ProjectSettings {
  const options = Array.isArray(item.statusOptions) ? item.statusOptions : [];
  return {
    projectId: String(item.projectId),
    customerId: String(item.customerId),
    owner: String(item.owner),
    repo: String(item.repo),
    projectNumber: Number(item.projectNumber),
    projectNodeId: item.projectNodeId == null ? null : String(item.projectNodeId),
    statusFieldName: String(item.statusFieldName ?? "Status"),
    effortFieldName: String(item.effortFieldName ?? "Effort"),
    statusFieldId: item.statusFieldId == null ? null : String(item.statusFieldId),
    effortFieldId: item.effortFieldId == null ? null : String(item.effortFieldId),
    startFieldName: String(item.startFieldName ?? "Start"),
    finishFieldName: String(item.finishFieldName ?? "Finish"),
    startFieldId: item.startFieldId == null || item.startFieldId === "" ? null : String(item.startFieldId),
    finishFieldId: item.finishFieldId == null || item.finishFieldId === "" ? null : String(item.finishFieldId),
    statusOptions: options.map((option) => {
      const record = option as Item;
      return { id: String(record.id), name: String(record.name) };
    }),
    doneStatuses: Array.isArray(item.doneStatuses) ? item.doneStatuses.map(String) : ["Done"],
    columns: Array.isArray(item.columns) ? item.columns.map(String) : ["Todo", "In Progress", "Done"],
  };
}

function asIssue(item: Item): PlanIssue {
  return {
    issueId: String(item.issueId),
    itemId: item.itemId == null ? null : String(item.itemId),
    projectId: String(item.projectId),
    customerId: String(item.customerId),
    number: item.number == null ? null : Number(item.number),
    title: String(item.title),
    status: String(item.status ?? ""),
    effort: item.effort == null ? null : Number(item.effort),
    issueState: item.issueState === "closed" ? "closed" : "open",
    archived: Boolean(item.archived),
    deletedAt: item.deletedAt == null ? null : String(item.deletedAt),
    parentIssueId: item.parentIssueId == null ? null : String(item.parentIssueId),
    milestone: item.milestone == null || item.milestone === "" ? null : String(item.milestone),
    milestoneId: item.milestoneId == null || item.milestoneId === "" ? null : String(item.milestoneId),
    milestoneDueOn: typeof item.milestoneDueOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.milestoneDueOn) ? item.milestoneDueOn : null,
    startDate: typeof item.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.startDate) ? item.startDate : null,
    finishDate: typeof item.finishDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.finishDate) ? item.finishDate : null,
    predecessorIds: Array.isArray(item.predecessorIds) ? [...new Set(item.predecessorIds.map(String).filter((id) => id && id !== String(item.issueId)))] : [],
    inProject: item.inProject !== false,
    updatedAt: String(item.updatedAt),
  };
}

function asBaseline(item: Item): BaselineRecord {
  const tasks = Array.isArray(item.tasks) ? item.tasks : [];
  const state = item.state === "approved" || item.state === "rejected" ? item.state : "proposed";
  return {
    baselineId: String(item.baselineId),
    projectId: String(item.projectId),
    customerId: String(item.customerId),
    number: typeof item.number === "number" && Number.isInteger(item.number) ? item.number : null,
    state,
    explanation: String(item.explanation ?? ""),
    rejection: item.rejection == null || item.rejection === "" ? null : String(item.rejection),
    tasks: tasks.flatMap((entry) => {
      const task = entry as Item;
      if (typeof task.issueId !== "string" || !task.issueId) return [];
      const start = typeof task.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(task.startDate) ? task.startDate : null;
      const finish = typeof task.finishDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(task.finishDate) ? task.finishDate : null;
      return [{ issueId: task.issueId, title: String(task.title ?? "Untitled"), startDate: start, finishDate: finish }];
    }),
    createdAt: String(item.createdAt ?? ""),
    createdBy: String(item.createdBy ?? ""),
    decidedAt: item.decidedAt == null || item.decidedAt === "" ? null : String(item.decidedAt),
    decidedBy: item.decidedBy == null || item.decidedBy === "" ? null : String(item.decidedBy),
  };
}

function asMilestone(item: Item): MilestoneRecord {
  const history = Array.isArray(item.history) ? item.history : [];
  return {
    projectId: String(item.projectId),
    customerId: String(item.customerId),
    milestoneKey: String(item.milestoneKey),
    title: String(item.title),
    confirmedAt: item.confirmedAt == null || item.confirmedAt === "" ? null : String(item.confirmedAt),
    confirmedBy: item.confirmedBy == null || item.confirmedBy === "" ? null : String(item.confirmedBy),
    history: history.map((entry) => {
      const record = entry as Item;
      const action = record.action === "reopened" ? "reopened" : "confirmed";
      return {
        action,
        at: String(record.at ?? ""),
        actorUserId: String(record.actorUserId ?? ""),
        explanation: record.explanation == null || record.explanation === "" ? null : String(record.explanation),
      };
    }),
  };
}

function asOverride(item: Item): ProgressOverride {
  return {
    projectId: String(item.projectId),
    customerId: String(item.customerId),
    percent: Number(item.percent),
    explanation: String(item.explanation),
    calculatedPercent: item.calculatedPercent == null ? null : Number(item.calculatedPercent),
    actorUserId: String(item.actorUserId),
    at: String(item.at),
  };
}

function asReport(item: Item): StatusReport {
  const status = String(item.status);
  return {
    reportId: String(item.reportId),
    projectId: String(item.projectId),
    customerId: String(item.customerId),
    title: String(item.title),
    body: String(item.body ?? ""),
    status: status === "in_review" || status === "approved" || status === "published" || status === "draft" ? status : "draft",
    updatedAt: String(item.updatedAt),
    createdAt: String(item.createdAt),
  };
}

function asReportVersion(item: Item): ReportVersion {
  return {
    versionId: String(item.versionId),
    reportId: String(item.reportId),
    projectId: String(item.projectId),
    customerId: String(item.customerId),
    title: String(item.title),
    body: String(item.body ?? ""),
    publishedAt: String(item.publishedAt),
    publishedBy: String(item.publishedBy),
  };
}

function asSync(item: Item): SyncState {
  const status = String(item.status);
  return {
    projectId: String(item.projectId),
    customerId: String(item.customerId),
    status: status === "pending" || status === "ok" || status === "failed" || status === "not_configured" ? status : "failed",
    detail: item.detail == null ? null : String(item.detail),
    updatedAt: String(item.updatedAt),
  };
}
