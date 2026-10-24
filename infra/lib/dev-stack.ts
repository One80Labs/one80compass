import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwv2Authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as cr from "aws-cdk-lib/custom-resources";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

const ADMIN_EMAIL = "nick@one80labs.com";

export class DevStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const pool = new cognito.UserPool(this, "Users", {
      userPoolName: "one80compass-dev",
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
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

    const apiFunction = new nodejs.NodejsFunction(this, "Api", {
      functionName: "one80compass-dev-api",
      entry: path.join(__dirname, "../../services/api/src/main.ts"),
      projectRoot: path.join(__dirname, "../.."),
      depsLockFilePath: path.join(__dirname, "../../package-lock.json"),
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(15),
      environment: {
        TABLE_NAME: table.tableName,
        USER_POOL_ID: pool.userPoolId,
      },
      bundling: { sourceMap: true, minify: true },
    });
    table.grantReadWriteData(apiFunction);
    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cognito-idp:AdminCreateUser", "cognito-idp:AdminGetUser"],
        resources: [pool.userPoolArn],
      }),
    );

    const authorizer = new apigwv2Authorizers.HttpUserPoolAuthorizer("Cognito", pool, {
      userPoolClients: [client],
    });

    const httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      apiName: "one80compass-dev",
      corsPreflight: {
        allowOrigins: ["http://localhost:5173"],
        allowHeaders: ["authorization", "content-type", "x-correlation-id"],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
      },
    });

    httpApi.addRoutes({
      path: "/{proxy+}",
      methods: [apigwv2.HttpMethod.ANY],
      integration: new integrations.HttpLambdaIntegration("ApiIntegration", apiFunction),
      authorizer,
    });

    new cdk.CfnOutput(this, "UserPoolId", { value: pool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: client.userPoolClientId });
    new cdk.CfnOutput(this, "ApiUrl", { value: httpApi.apiEndpoint });
  }
}
