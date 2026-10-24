import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { ApplicationLink, AuditEvent, Customer, Membership, Project } from "../../../packages/domain/src/index";

export interface Store {
  createCustomer(customer: Customer): Promise<void>;
  listCustomers(): Promise<Customer[]>;
  getCustomer(customerId: string): Promise<Customer | null>;
  createProject(project: Project): Promise<void>;
  getProject(projectId: string): Promise<Project | null>;
  listProjects(customerId: string): Promise<Project[]>;
  putMembership(membership: Membership): Promise<void>;
  listMembershipsForUser(userId: string): Promise<Membership[]>;
  createApplication(application: ApplicationLink): Promise<void>;
  listApplications(projectId: string): Promise<ApplicationLink[]>;
  putAudit(event: AuditEvent): Promise<void>;
  listAudit(customerId: string): Promise<AuditEvent[]>;
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
  return {
    customerId: String(item.customerId),
    userId: String(item.userId),
    email: String(item.email),
    role: "employee",
    createdAt: String(item.createdAt),
  };
}
function asApplication(item: Item): ApplicationLink {
  return {
    applicationId: String(item.applicationId),
    projectId: String(item.projectId),
    customerId: String(item.customerId),
    moduleKey: "overview",
    displayName: String(item.displayName),
    createdAt: String(item.createdAt),
  };
}
function asAudit(item: Item): AuditEvent {
  return {
    eventId: String(item.eventId),
    customerId: String(item.customerId),
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
