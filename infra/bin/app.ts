import * as cdk from "aws-cdk-lib";
import { DevStack } from "../lib/dev-stack";

const app = new cdk.App();

new DevStack(app, "One80Compass-dev", {
  env: { account: "168034219908", region: "us-east-2" },
  description: "One80Compass development stack",
});
