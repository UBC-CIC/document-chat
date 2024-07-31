#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { BackendStack } from '../lib/backend-stack';
import { AmplifyStack } from '../lib/amplify-stack';
import { VpcStack } from "../lib/vpc-stack";

const app = new cdk.App();

const env = { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION 
  };

// const vpcStack = new VpcStack(app, 'VpcStack', {env})
// const backendStack = new BackendStack(app, 'BackendStack', vpcStack, { env });
const frondendStack = new AmplifyStack(app, 'FrontendStack', { env });
