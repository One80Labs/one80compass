import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as cr from "aws-cdk-lib/custom-resources";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";

export { VAULT_LAMBDA_IAM_ACTIONS, vaultLambdaIamActions } from "./vault-iam-actions";

export type VaultDatabaseProps = {
  table: dynamodb.ITable;
  documentsBucket: s3.IBucket;
};

export class VaultDatabase extends Construct {
  readonly cluster: rds.DatabaseCluster;
  readonly vaultFunction: nodejs.NodejsFunction;

  constructor(scope: Construct, id: string, props: VaultDatabaseProps) {
    super(scope, id);

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    const cluster = new rds.DatabaseCluster(this, "Cluster", {
      engine: rds.DatabaseClusterEngine.auroraPostgres({
        version: rds.AuroraPostgresEngineVersion.VER_16_6,
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      writer: rds.ClusterInstance.serverlessV2("Writer"),
      serverlessV2MinCapacity: 0.5,
      serverlessV2MaxCapacity: 1,
      defaultDatabaseName: "vault",
      enableDataApi: true,
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      credentials: rds.Credentials.fromGeneratedSecret("vaultadmin", {
        secretName: "one80compass-dev-vault",
      }),
      storageEncrypted: true,
    });
    cluster.secret?.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
    this.cluster = cluster;

    const secret = cluster.secret;
    if (!secret) {
      throw new Error("Vault cluster secret was not created");
    }

    const vaultFunction = new nodejs.NodejsFunction(this, "Function", {
      functionName: "one80compass-dev-vault",
      entry: path.join(__dirname, "../../services/vault/src/main.ts"),
      projectRoot: path.join(__dirname, "../.."),
      depsLockFilePath: path.join(__dirname, "../../package-lock.json"),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(120),
      environment: {
        VAULT_SECRET_ARN: secret.secretArn,
        VAULT_CLUSTER_ARN: cluster.clusterArn,
        VAULT_DATABASE: "vault",
        TABLE_NAME: props.table.tableName,
        BUCKET_NAME: props.documentsBucket.bucketName,
      },
      bundling: {
        sourceMap: true,
        minify: true,
        commandHooks: {
          beforeBundling: () => [],
          beforeInstall: () => [],
          afterBundling: (inputDir, outputDir) => [
            `cp "${inputDir}/services/vault/src/schema.sql" "${outputDir}/schema.sql"`,
          ],
        },
      },
    });
    this.vaultFunction = vaultFunction;

    vaultFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction",
        ],
        resources: [cluster.clusterArn],
      }),
    );
    vaultFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [secret.secretArn],
      }),
    );
    vaultFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:BatchGetItem"],
        resources: [props.table.tableArn, `${props.table.tableArn}/index/*`],
      }),
    );
    vaultFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [props.documentsBucket.arnForObjects("*")],
      }),
    );
    vaultFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel"],
        resources: [
          `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/amazon.titan-embed-text-v2:0`,
        ],
      }),
    );

    const applySchema = new cr.AwsCustomResource(this, "ApplySchema", {
      onCreate: {
        service: "Lambda",
        action: "invoke",
        parameters: {
          FunctionName: vaultFunction.functionName,
          InvocationType: "RequestResponse",
          Payload: JSON.stringify({ type: "apply-schema" }),
        },
        physicalResourceId: cr.PhysicalResourceId.of("one80compass-dev-vault-schema"),
      },
      onUpdate: {
        service: "Lambda",
        action: "invoke",
        parameters: {
          FunctionName: vaultFunction.functionName,
          InvocationType: "RequestResponse",
          Payload: JSON.stringify({ type: "apply-schema" }),
        },
        physicalResourceId: cr.PhysicalResourceId.of("one80compass-dev-vault-schema"),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ["lambda:InvokeFunction"],
          resources: [vaultFunction.functionArn],
        }),
      ]),
      timeout: cdk.Duration.minutes(5),
      installLatestAwsSdk: false,
    });
    applySchema.node.addDependency(cluster);
    applySchema.node.addDependency(vaultFunction);
  }
}
