import * as cdk from 'aws-cdk-lib';
import { Stack, StackProps } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambda_event_sources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as ec2 from 'aws-cdk-lib/aws-ec2'
import * as rds from 'aws-cdk-lib/aws-rds';
import { BuildSpec } from "aws-cdk-lib/aws-codebuild";
import { Construct } from 'constructs';

interface LifeCycleAnalysisChatStackProps extends StackProps {
  frontend?: string;
  modelId?: string;
  embeddingModelId?: string;
}

export class LifeCycleAnalysisChatStack extends Stack {
  constructor(scope: Construct, id: string, props: LifeCycleAnalysisChatStackProps) {
    super(scope, id, props);

    const {
      frontend = 'amplify',
      modelId = 'mistral.mixtral-8x7b-instruct-v0:1' /** originally: 'anthropic.claude-3-sonnet-20240229-v1:0' */,
      embeddingModelId = 'amazon.titan-embed-text-v2:0',
    } = props;
  


    // VPC - verify configuration
    const natGatewayProvider = ec2.NatProvider.gateway()
    const vpc = new ec2.Vpc(this, 'VPC', {
      vpcName: `${this.stackName.toLowerCase()}-${this.region}-${this.account}`,
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
      natGatewayProvider: natGatewayProvider,
      natGateways: 1,
      maxAzs: 2,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ]
    })



    // RDS Postgres
    const rdsDatabaseInstance = new rds.DatabaseInstance(this, 'RdsDatabaseInstance', {
      databaseName: `${this.stackName.toLowerCase()}DBInstance`,
      vpc: vpc,
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
        secretName: "lci_forestry/credentials/db",
      }),
      multiAz: true,
      deletionProtection: true,
      monitoringInterval: cdk.Duration.seconds(60),
    })



    // S3 Bucket
    const documentBucket = new s3.Bucket(this, 'DocumentBucket', {
      bucketName: `${this.stackName.toLowerCase()}-${this.region}-${this.account}`,
      cors: [
        {
          allowedHeaders: ['*'],
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD, s3.HttpMethods.POST, s3.HttpMethods.DELETE],
          allowedOrigins: ['*'], /** TODO: check why this reverts to amplify origin in deployment */
        },
      ],
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // Define the Bucket Policy
    const bucketPolicy = new iam.PolicyStatement({
      sid: 'EnforceHttpsSid',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['s3:*'],
      resources: [documentBucket.bucketArn, `${documentBucket.bucketArn}/*`],
      conditions: {
        Bool: { 'aws:SecureTransport': 'false' },
      },
    });
    documentBucket.addToResourcePolicy(bucketPolicy); // Attach the policy to the bucket



    // SQS Queue
    const embeddingQueue = new sqs.Queue(this, 'EmbeddingQueue', {
      visibilityTimeout: cdk.Duration.seconds(180),
      retentionPeriod: cdk.Duration.hours(1),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Define the Queue Policy
    const queuePolicy = new iam.PolicyStatement({
      sid: 'AllowSecureTransportOnly',
      effect: iam.Effect.DENY,
      principals: [new iam.AnyPrincipal()],
      actions: ['SQS:*'],
      resources: [embeddingQueue.queueArn],
      conditions: {
        Bool: { 'aws:SecureTransport': 'false' },
      },
    });

    // Attach the policy to the queue
    const sqsPolicy = new sqs.QueuePolicy(this, 'EmbeddingQueuePolicy', {
      queues: [embeddingQueue],
    });
    sqsPolicy.document.addStatements(queuePolicy);



    // DynamoDB Tables
    const documentTable = new dynamodb.Table(this, 'DocumentTable', {
      partitionKey: { name: 'userid', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'documentid', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Corresponds to DeletionPolicy: Delete
    });

    const memoryTable = new dynamodb.Table(this, 'MemoryTable', {
      partitionKey: { name: 'SessionId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Corresponds to DeletionPolicy: Delete
    });



    // Cognito User Pool
    const userPool = new cognito.UserPool(this, 'CognitoUserPool', {
      autoVerify: { email: true },
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireSymbols: true,
        requireUppercase: true,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'CognitoUserPoolClient', {
      userPool,
      generateSecret: false,
    });



    // API Gateway
    const api = new apigateway.RestApi(this, 'Api', {
      restApiName: 'life-cycle-analysis-chat',
      deployOptions: {
        stageName: 'dev',
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowHeaders: ['*'],
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [userPool],
    });
    cognitoAuthorizer._attachToApi(api);



    // Lambda Function Layers
    const powertoolsLayer = lambda.LayerVersion.fromLayerVersionArn(this, 'PowertoolsLayer', `arn:aws:lambda:${this.region}:017000801446:layer:AWSLambdaPowertoolsPythonV2:78`);
    const langchainLayer = new lambda.LayerVersion(this, 'LangchainLayer', {
      code: lambda.Code.fromAsset('layers/langchain_layer.zip')
    });
    const pypdfLayer = new lambda.LayerVersion(this, 'PypdfLayer', {
      code: lambda.Code.fromAsset('layers/pypdf2_layer.zip')
    });
    const shortUuidLayer = new lambda.LayerVersion(this, 'ShortUuidLayer', {
      code: lambda.Code.fromAsset('layers/shortuuid_layer.zip')
    });
    const urllibLayer = new lambda.LayerVersion(this, 'UrllibLayer', {
      code: lambda.Code.fromAsset('layers/urllib_layer.zip')
    });

    
    // Lambda Functions
    const createLambdaFunction = (
      id: string,
      codePath: string,
      handler: string,
      vpc?: ec2.IVpc,
      environment?: { [key: string]: string },
      policies?: iam.PolicyStatement[],
    ) => {
      const lambdaFunction = new lambda.Function(this, id, {
        runtime: lambda.Runtime.PYTHON_3_12,
        handler,
        code: lambda.Code.fromAsset(codePath),
        environment,
        timeout: cdk.Duration.seconds(180),
        memorySize: 2048,
        tracing: lambda.Tracing.ACTIVE,
        layers: [powertoolsLayer],
        vpc: (vpc? vpc: undefined),
      });

      if (policies) {
        policies.forEach((policy) => lambdaFunction.addToRolePolicy(policy));
      }

      return lambdaFunction;
    };

    const generatePresignedUrlFunction = createLambdaFunction('GeneratePresignedUrlFunction', 'src/generate_presigned_url/', 'main.lambda_handler', undefined, {
      BUCKET: documentBucket.bucketName,
      REGION: this.region,
    }, [
      new iam.PolicyStatement({
        actions: ['s3:*'],
        resources: [documentBucket.bucketArn, `${documentBucket.bucketArn}/*`],
      }),
    ]);
    generatePresignedUrlFunction.addLayers(shortUuidLayer);
    const generatePresignedUrlIntegration = new apigateway.LambdaIntegration(generatePresignedUrlFunction);
    const generatePresignedUrlResource = api.root.addResource('generate_presigned_url');
    generatePresignedUrlResource.addMethod('GET', generatePresignedUrlIntegration, {
      authorizer: cognitoAuthorizer
    });


    const uploadTriggerFunction = createLambdaFunction('UploadTriggerFunction', 'src/upload_trigger/', 'main.lambda_handler', undefined, {
      DOCUMENT_TABLE: documentTable.tableName,
      MEMORY_TABLE: memoryTable.tableName,
      QUEUE: embeddingQueue.queueName,
      BUCKET: documentBucket.bucketName,
    }, [
      new iam.PolicyStatement({
        actions: ['dynamodb:*'],
        resources: [documentTable.tableArn, memoryTable.tableArn],
      }),
      new iam.PolicyStatement({
        actions: ['s3:*'],
        resources: [documentBucket.bucketArn, `${documentBucket.bucketArn}/*`],
      }),
      new iam.PolicyStatement({
        actions: ['sqs:*'],
        resources: [embeddingQueue.queueArn],
      }),
    ],);
    uploadTriggerFunction.addLayers(pypdfLayer, shortUuidLayer, urllibLayer);
    uploadTriggerFunction.addEventSource(new lambda_event_sources.S3EventSource(documentBucket, {
      events: [s3.EventType.OBJECT_CREATED],
      filters: [{ suffix: '.pdf' }],
    }))


    const getAllDocumentsFunction = createLambdaFunction('GetAllDocuments', 'src/get_all_documents/', 'main.lambda_handler', undefined, {
      DOCUMENT_TABLE: documentTable.tableName,
    }, [
      new iam.PolicyStatement({
        actions: ['dynamodb:*'],
        resources: [documentTable.tableArn],
      }),
    ]);
    const getAllDocumentsFunctionIntegration = new apigateway.LambdaIntegration(getAllDocumentsFunction);
    const root_doc_resource = api.root.addResource('doc');
    root_doc_resource.addMethod('GET', getAllDocumentsFunctionIntegration, {
      authorizer: cognitoAuthorizer
    });


    const getDocumentFunction = createLambdaFunction('GetDocumentFunction', 'src/get_document/', 'main.lambda_handler', undefined, {
      DOCUMENT_TABLE: documentTable.tableName,
      MEMORY_TABLE: memoryTable.tableName,
    }, [
      new iam.PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:Query'],
        resources: [documentTable.tableArn, memoryTable.tableArn],
      }),
    ]);
    const getDocumentFunctionIntegration = new apigateway.LambdaIntegration(getDocumentFunction);
    const root_doc_documentid_resource = root_doc_resource.addResource('{documentid}');
    const root_doc_documentid_conversationid_resource = root_doc_documentid_resource.addResource('{conversationid}');
    root_doc_documentid_conversationid_resource.addMethod('GET', getDocumentFunctionIntegration, {
      authorizer: cognitoAuthorizer
    });


    const addConversationFunction = createLambdaFunction('AddConversationFunction', 'src/add_conversation/', 'main.lambda_handler', undefined, {
      DOCUMENT_TABLE: documentTable.tableName,
      MEMORY_TABLE: memoryTable.tableName,
    }, [
      new iam.PolicyStatement({
        actions: ['dynamodb:*'],
        resources: [documentTable.tableArn, memoryTable.tableArn],
      }),
    ]);
    addConversationFunction.addLayers(shortUuidLayer);
    const addConversationFunctionIntegration = new apigateway.LambdaIntegration(addConversationFunction);
    root_doc_documentid_resource.addMethod('POST', addConversationFunctionIntegration, {
      authorizer: cognitoAuthorizer
    });


    const generateEmbeddingsFunction = createLambdaFunction('GenerateEmbeddingsFunction', 'src/generate_embeddings/', 'main.lambda_handler', vpc, {
      DOCUMENT_TABLE: documentTable.tableName,
      BUCKET: documentBucket.bucketName,
      EMBEDDING_MODEL_ID: embeddingModelId,
      REGION: this.region,
      DATABASE_SECRET_NAME: rdsDatabaseInstance.secret!.secretName,
    }, [
      new iam.PolicyStatement({
        actions: ['sqs:*'],
        resources: [embeddingQueue.queueArn],
      }),
      new iam.PolicyStatement({
        actions: ['s3:*'],
        resources: [documentBucket.bucketArn, `${documentBucket.bucketArn}/*`],
      }),
      new iam.PolicyStatement({
        actions: ['dynamodb:*'],
        resources: [documentTable.tableArn],
      }),
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: [`arn:aws:bedrock:${this.region}::foundation-model/${embeddingModelId}`],
      }),
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [rdsDatabaseInstance.secret!.secretArn],
      })
    ]);
    generateEmbeddingsFunction.connections.allowToDefaultPort(rdsDatabaseInstance);
    generateEmbeddingsFunction.addLayers(langchainLayer);
    generateEmbeddingsFunction.addEventSource(new lambda_event_sources.SqsEventSource(embeddingQueue, {
      batchSize: 1,
    }));


    const generateResponseFunction = createLambdaFunction('GenerateResponseFunction', 'src/generate_response/', 'main.lambda_handler', vpc, {
      MEMORY_TABLE: memoryTable.tableName,
      BUCKET: documentBucket.bucketName,
      MODEL_ID: modelId,
      EMBEDDING_MODEL_ID: embeddingModelId,
      REGION: this.region,
      DATABASE_SECRET_NAME: rdsDatabaseInstance.secret!.secretName,
    },
    [
      new iam.PolicyStatement({
        actions: ['dynamodb:*'],
        resources: [memoryTable.tableArn],
      }),
      new iam.PolicyStatement({
        actions: ['s3:*'],
        resources: [documentBucket.bucketArn, `${documentBucket.bucketArn}/*`],
      }),
      new iam.PolicyStatement({
        sid: 'BedrockScopedAccess',
        effect: iam.Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: [
          `arn:aws:bedrock:${this.region}::foundation-model/${modelId}`,
          `arn:aws:bedrock:${this.region}::foundation-model/${embeddingModelId}`,
        ],
      }),
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [rdsDatabaseInstance.secret!.secretArn],
      })
    ]);
    generateResponseFunction.connections.allowToDefaultPort(rdsDatabaseInstance);
    generateResponseFunction.addLayers(shortUuidLayer, langchainLayer);
    const generateResponseFunctionIntegration = new apigateway.LambdaIntegration(generateResponseFunction);
    const root_documentid_resource = api.root.addResource('{documentid}');
    const root_documentid_conversationid_resource = root_documentid_resource.addResource('{conversationid}');
    root_documentid_conversationid_resource.addMethod('POST', generateResponseFunctionIntegration, {
      authorizer: cognitoAuthorizer
    });


    const deleteDocumentFunction = createLambdaFunction('DeleteDocumentFunction', 'src/delete_document/', 'main.lambda_handler', vpc, {
      DOCUMENT_TABLE: documentTable.tableName,
      MEMORY_TABLE: memoryTable.tableName,
      BUCKET: documentBucket.bucketName,
      EMBEDDING_MODEL_ID: embeddingModelId,
      REGION: this.region,
      DATABASE_SECRET_NAME: rdsDatabaseInstance.secret!.secretName,
    },
    [
      new iam.PolicyStatement({
        actions: ['dynamodb:*'],
        resources: [documentTable.tableArn, memoryTable.tableArn],
      }),
      new iam.PolicyStatement({
        actions: ['s3:*'],
        resources: [documentBucket.bucketArn, `${documentBucket.bucketArn}/*`],
      }),
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [rdsDatabaseInstance.secret!.secretArn],
      }),
    ]);
    deleteDocumentFunction.connections.allowToDefaultPort(rdsDatabaseInstance);
    deleteDocumentFunction.addLayers(langchainLayer);
    const deleteDocumentFunctionIntegration = new apigateway.LambdaIntegration(deleteDocumentFunction);
    root_doc_documentid_resource.addMethod('DELETE', deleteDocumentFunctionIntegration, {
      authorizer: cognitoAuthorizer
    });

    

    // Conditional resources for Amplify deployment
    if (frontend === 'amplify') {

      const username = cdk.aws_ssm.StringParameter.valueForStringParameter(
        this,
        "repository-owner-name"
      );

      const amplifyApp = new amplify.App(this, 'AmplifyApp', {
        appName: `${this.stackName}-${this.region}-${this.account}`,
        sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
          owner: username,
          repository: 'LCI-forestry',
          oauthToken: cdk.SecretValue.secretsManager(
            "github-personal-access-token",
            {
              jsonField: "my-github-token",
            }
          ),
        }),
        buildSpec: BuildSpec.fromObject({
          version: '1',
          applications: [
            {
              frontend: {
                phases: {
                  preBuild: {
                    commands: ['npm ci'],
                  },
                  build: {
                    commands: ['npm run build'],
                  },
                },
                artifacts: {
                  baseDirectory: 'dist',
                  files: ['**/*'],
                },
                cache: {
                  paths: ['node_modules/**/*'],
                },
              },
              appRoot: 'frontend',
            },
          ],
        }),
        environmentVariables: {
          AMPLIFY_MONOREPO_APP_ROOT: 'frontend',
          VITE_REGION: this.region,
          VITE_API_ENDPOINT: `https://${api.restApiId}.execute-api.${this.region}.${cdk.Aws.URL_SUFFIX}/dev`,
          VITE_USER_POOL_ID: userPool.userPoolId,
          VITE_USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
          VITE_APP_NAME: 'Life Cycle Analysis Chat',
          VITE_API_NAME: `${api.restApiName}`
        },
      });

      const amplifyBranch = amplifyApp.addBranch('main', {
        autoBuild: true,
      });

      new cdk.CfnOutput(this, 'AmplifyAppId', {
        value: amplifyApp.appId,
      });

      new cdk.CfnOutput(this, 'AmplifyBranchUrl', {
        value: `https://${amplifyBranch.branchName}.${amplifyApp.defaultDomain}`,
      });

    }



    // Outputs
    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, 'CognitoUserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, 'ApiGatewayBaseUrl', {
      value: `https://${api.restApiId}.execute-api.${this.region}.${cdk.Aws.URL_SUFFIX}/dev`,
    });
  }
}