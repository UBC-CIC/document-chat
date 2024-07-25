import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3notification from 'aws-cdk-lib/aws-s3-notifications';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';

import { VpcStack } from './vpc-stack';

export class BackendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, vpcStack: VpcStack, props?: cdk.StackProps) {
    super(scope, id, props);
    
    const documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: "lci-documents",
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // TODO: change to RETAIN for production
      autoDeleteObjects: true, // TODO: remove for production
    })

    const uploaderFunction = new lambda.Function(this, 'UploaderFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'uploader.handler',
      code: lambda.Code.fromAsset('lambda'),
      timeout: cdk.Duration.seconds(15),
      environment: {
        DOCUMENTS_BUCKET: documentsBucket.bucketName,
      }
    });

    documentsBucket.grantPut(uploaderFunction); // TODO: double check permission for generate_presigned_post

    const dbInstance = new rds.DatabaseInstance(this, "LCI", {
      databaseName: "lci",
      vpc: vpcStack.vpc,
      vpcSubnets: {
        subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
      },
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_3,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MEDIUM,
      ),
      credentials: rds.Credentials.fromUsername('lci_admin', {
        secretName: "lci/credentials/db",
      }),
      multiAz: true,
      deletionProtection: true,
      monitoringInterval: cdk.Duration.seconds(60),
    })

    const langchainLayer = new lambda.LayerVersion(this, "LangchainLayer", {
      code: lambda.Code.fromAsset('layers/langchain.zip'),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_12],
      description: "langchain, langchain_core, langchain_postgers, pypdf"
    })

    const documentProcessorFunction = new lambda.Function(this, 'DocumentProcessorFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'processor.handler',
      code: lambda.Code.fromAsset('lambda'),
      memorySize: 3008,
      timeout: cdk.Duration.minutes(15),
      vpc: vpcStack.vpc,
      layers: [langchainLayer],
      environment: {
        DATABASE_SECRET_NAME: dbInstance.secret!.secretName,
      }
    });
    documentProcessorFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      effect: iam.Effect.ALLOW,
      resources: [`arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`]
    }))

    documentsBucket.grantRead(documentProcessorFunction);
    documentsBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3notification.LambdaDestination(documentProcessorFunction));
    dbInstance.secret!.grantRead(documentProcessorFunction);
    documentProcessorFunction.connections.allowToDefaultPort(dbInstance);

    const chatFunction = new lambda.Function(this, 'ChatFunction', {
      runtime: lambda.Runtime.PYTHON_3_12,
      handler: 'chat.handler',
      code: lambda.Code.fromAsset('lambda'),
      timeout: cdk.Duration.minutes(1),
      vpc: vpcStack.vpc,
      layers: [langchainLayer],
      environment: {
        DATABASE_SECRET_NAME: dbInstance.secret!.secretName,
      }
    })
    chatFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel'],
      effect: iam.Effect.ALLOW,
      resources: [
        `arn:aws:bedrock:${this.region}::foundation-model/mistral.mixtral-8x7b-instruct-v0:1`,
        `arn:aws:bedrock:${this.region}::foundation-model/amazon.titan-embed-text-v2:0`,
      ]
    }))

    dbInstance.secret!.grantRead(chatFunction);
    chatFunction.connections.allowToDefaultPort(dbInstance);

    const apiGWLogGroup = new logs.LogGroup(this, "APIGWLog");

    const apiGW = new apigateway.RestApi(this, 'Api', {
      restApiName: "LCI",
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS
      },
      cloudWatchRole: true,
      deploy: true,
      deployOptions: {
        metricsEnabled: true,
        dataTraceEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        accessLogDestination: new apigateway.LogGroupLogDestination(apiGWLogGroup)
      }
    });

    const uploadIntegration = new apigateway.LambdaIntegration(uploaderFunction);
    const chatIntegration = new apigateway.LambdaIntegration(chatFunction);

    const uploadLinkResource = apiGW.root.addResource('get-upload-url');
    const chatResource = apiGW.root.addResource('prompt');

    const uploadMethod = uploadLinkResource.addMethod('GET', uploadIntegration);
    chatResource.addMethod('GET', chatIntegration);
  }
}
