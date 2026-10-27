import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2Authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cw_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as cr from "aws-cdk-lib/custom-resources";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sources from "aws-cdk-lib/aws-lambda-event-sources";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";
import { VaultDatabase } from "./vault-database";

const ADMIN_EMAIL = "nick@one80labs.com";
const SITE_DOMAIN = "one80compass.ai";
const SITE_CERTIFICATE_ARN = "arn:aws:acm:us-east-1:168034219908:certificate/c630a40c-640f-43ec-898f-11aec9c02ece";
const SITE_HOSTED_ZONE_ID = "Z0060300L4EB8CFDVZ1D";

export class DevStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const pool = new cognito.UserPool(this, "Users", {
      userPoolName: "one80compass-dev",
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      // Dev sign-in is email and password. Stage and production must set this
      // back to REQUIRED with a software-token second factor before a pilot.
      mfa: cognito.Mfa.OFF,
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      standardAttributes: { email: { required: true, mutable: true } },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const client = pool.addClient("Web", {
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      generateSecret: false,
      idTokenValidity: cdk.Duration.hours(1),
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    const adminGroup = new cognito.CfnUserPoolGroup(this, "PlatformAdmins", {
      userPoolId: pool.userPoolId,
      groupName: "one80-admin",
      description: "One80Labs administrators",
    });

    const seedUser = new cr.AwsCustomResource(this, "SeedAdminUser", {
      onCreate: {
        service: "CognitoIdentityServiceProvider",
        action: "adminCreateUser",
        parameters: {
          UserPoolId: pool.userPoolId,
          Username: ADMIN_EMAIL,
          DesiredDeliveryMediums: ["EMAIL"],
          UserAttributes: [
            { Name: "email", Value: ADMIN_EMAIL },
            { Name: "email_verified", Value: "true" },
          ],
        },
        physicalResourceId: cr.PhysicalResourceId.of("seed-admin-nick"),
        ignoreErrorCodesMatching: "UsernameExistsException",
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ["cognito-idp:AdminCreateUser"],
          resources: [pool.userPoolArn],
        }),
      ]),
      installLatestAwsSdk: false,
    });

    const seedGroup = new cr.AwsCustomResource(this, "SeedAdminGroup", {
      onCreate: {
        service: "CognitoIdentityServiceProvider",
        action: "adminAddUserToGroup",
        parameters: {
          UserPoolId: pool.userPoolId,
          Username: ADMIN_EMAIL,
          GroupName: "one80-admin",
        },
        physicalResourceId: cr.PhysicalResourceId.of("seed-admin-group"),
      },
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({
          actions: ["cognito-idp:AdminAddUserToGroup"],
          resources: [pool.userPoolArn],
        }),
      ]),
      installLatestAwsSdk: false,
    });
    seedGroup.node.addDependency(seedUser);
    seedGroup.node.addDependency(adminGroup);

    const table = new dynamodb.Table(this, "Portal", {
      tableName: "one80compass-dev",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
    table.addGlobalSecondaryIndex({
      indexName: "gsi1",
      partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const web = new s3.Bucket(this, "Web", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });
    const site = new cloudfront.Distribution(this, "Site", {
      comment: "One80Compass dev",
      domainNames: [SITE_DOMAIN, `www.${SITE_DOMAIN}`],
      certificate: acm.Certificate.fromCertificateArn(this, "SiteCert", SITE_CERTIFICATE_ARN),
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultRootObject: "index.html",
      defaultBehavior: {
        origin: new origins.S3Origin(web),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: cdk.Duration.seconds(0) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: cdk.Duration.seconds(0) },
      ],
    });
    const browserOrigins = [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      `https://${site.distributionDomainName}`,
      `https://${SITE_DOMAIN}`,
      `https://www.${SITE_DOMAIN}`,
    ];

    const documents = new s3.Bucket(this, "Documents", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: browserOrigins,
          allowedHeaders: ["content-type"],
          maxAge: 3000,
        },
      ],
    });

    const deadLetters = new sqs.Queue(this, "SyncDeadLetters", {
      queueName: "one80compass-dev-sync-dlq",
      retentionPeriod: cdk.Duration.days(14),
    });
    const syncQueue = new sqs.Queue(this, "SyncQueue", {
      queueName: "one80compass-dev-sync",
      visibilityTimeout: cdk.Duration.seconds(60),
      deadLetterQueue: { queue: deadLetters, maxReceiveCount: 5 },
    });

    const apiFunction = new nodejs.NodejsFunction(this, "Api", {
      functionName: "one80compass-dev-api",
      entry: path.join(__dirname, "../../services/api/src/main.ts"),
      projectRoot: path.join(__dirname, "../.."),
      depsLockFilePath: path.join(__dirname, "../../package-lock.json"),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(60),
      environment: {
        TABLE_NAME: table.tableName,
        USER_POOL_ID: pool.userPoolId,
        BUCKET_NAME: documents.bucketName,
        MAX_UPLOAD_BYTES: String(25 * 1024 * 1024),
        SYNC_QUEUE_URL: syncQueue.queueUrl,
        GITHUB_APP_ID: process.env.GITHUB_APP_ID ?? "",
        GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY ?? "",
        GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET ?? "",
      },
      bundling: { sourceMap: true, minify: true },
    });
    table.grantReadWriteData(apiFunction);
    documents.grantPut(apiFunction);
    documents.grantRead(apiFunction);
    syncQueue.grantSendMessages(apiFunction);
    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser",
          "cognito-idp:ListUsersInGroup",
        ],
        resources: [pool.userPoolArn],
      }),
    );

    const authorizer = new apigwv2Authorizers.HttpUserPoolAuthorizer("Cognito", pool, {
      userPoolClients: [client],
    });

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "one80compass-dev",
      corsPreflight: {
        allowOrigins: browserOrigins,
        allowHeaders: ["authorization", "content-type", "x-correlation-id"],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
      },
    });

    const syncFunction = new nodejs.NodejsFunction(this, "Sync", {
      functionName: "one80compass-dev-sync",
      entry: path.join(__dirname, "../../services/sync/src/handler.ts"),
      projectRoot: path.join(__dirname, "../.."),
      depsLockFilePath: path.join(__dirname, "../../package-lock.json"),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      environment: {
        TABLE_NAME: table.tableName,
        GITHUB_APP_ID: process.env.GITHUB_APP_ID ?? "",
        GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY ?? "",
        GITHUB_WEBHOOK_SECRET: process.env.GITHUB_WEBHOOK_SECRET ?? "",
      },
      bundling: { sourceMap: true, minify: true },
    });
    table.grantReadWriteData(syncFunction);
    syncFunction.addEventSource(new sources.SqsEventSource(syncQueue, { batchSize: 1 }));
    new events.Rule(this, "Reconcile", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
      targets: [new targets.LambdaFunction(syncFunction)],
    });

    httpApi.addRoutes({
      path: "/webhooks/github",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("WebhookIntegration", apiFunction),
    });

    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.POST,
        apigwv2.HttpMethod.PUT,
        apigwv2.HttpMethod.PATCH,
        apigwv2.HttpMethod.DELETE,
      ],
      integration: new integrations.HttpLambdaIntegration("ApiIntegration", apiFunction),
      authorizer,
    });

    const alerts = new sns.Topic(this, "Alerts", { topicName: "one80compass-dev-alerts" });
    alerts.addSubscription(new subscriptions.EmailSubscription(ADMIN_EMAIL));
    const notify = new cw_actions.SnsAction(alerts);
    for (const [id, metric, name] of [
      ["ApiErrorAlarm", apiFunction.metricErrors({ period: cdk.Duration.minutes(5) }), "one80compass-dev-api-errors"],
      ["SyncErrorAlarm", syncFunction.metricErrors({ period: cdk.Duration.minutes(5) }), "one80compass-dev-sync-errors"],
      ["SyncDlqAlarm", deadLetters.metricApproximateNumberOfMessagesVisible({ period: cdk.Duration.minutes(5) }), "one80compass-dev-sync-dlq"],
    ] as const) {
      const alarm = new cloudwatch.Alarm(this, id, {
        alarmName: name,
        metric,
        threshold: 1,
        evaluationPeriods: 1,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(notify);
    }

    new s3deploy.BucketDeployment(this, "WebFiles", {
      sources: [s3deploy.Source.asset(path.join(__dirname, "../../apps/web/dist"))],
      destinationBucket: web,
      distribution: site,
      distributionPaths: ["/*"],
    });

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, "SiteZone", {
      hostedZoneId: SITE_HOSTED_ZONE_ID,
      zoneName: SITE_DOMAIN,
    });
    const alias = route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(site));
    new route53.ARecord(this, "SiteA", { zone, target: alias });
    new route53.AaaaRecord(this, "SiteAaaa", { zone, target: alias });
    new route53.ARecord(this, "WwwA", { zone, recordName: "www", target: alias });
    new route53.AaaaRecord(this, "WwwAaaa", { zone, recordName: "www", target: alias });

    const vault = new VaultDatabase(this, "Vault", {
      table,
      documentsBucket: documents,
    });
    apiFunction.addEnvironment("VAULT_FUNCTION_NAME", vault.vaultFunction.functionName);
    vault.vaultFunction.grantInvoke(apiFunction);

    new cdk.CfnOutput(this, "SiteUrl", { value: `https://${SITE_DOMAIN}` });
    new cdk.CfnOutput(this, "VaultFunctionName", { value: vault.vaultFunction.functionName });
    new cdk.CfnOutput(this, "UserPoolId", { value: pool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: client.userPoolClientId });
    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "WebhookUrl", { value: `${httpApi.apiEndpoint}/webhooks/github` });
  }
}
