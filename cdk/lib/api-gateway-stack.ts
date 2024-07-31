import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import { Duration } from "aws-cdk-lib";
import {
  Architecture,
  Code,
  Function,
  LayerVersion,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
//import { VpcStack } from './vpc-stack';
import * as cognito from "aws-cdk-lib/aws-cognito";
import { CfnJson } from "aws-cdk-lib";
import { VpcStack } from "./vpc-stack";
import { BackendStack } from "./backend-stack";
import { parse, stringify } from "yaml";
import { Fn } from "aws-cdk-lib";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

export class ApiGatewayStack extends cdk.Stack {
  private readonly api: apigateway.SpecRestApi;
  public readonly appClient: cognito.UserPoolClient;
  public readonly userPool: cognito.UserPool;
  public readonly identityPool: cognito.CfnIdentityPool;
  private readonly layerList: { [key: string]: LayerVersion };
  public readonly stageARN_APIGW: string;
  public readonly apiGW_basedURL: string;
  public readonly secret: secretsmanager.ISecret;
  public getEndpointUrl = () => this.api.url;
  public getUserPoolId = () => this.userPool.userPoolId;
  public getUserPoolClientId = () => this.appClient.userPoolClientId;
  public getIdentityPoolId = () => this.identityPool.ref;
  public addLayer = (name: string, layer: LayerVersion) =>
    (this.layerList[name] = layer);
  public getLayers = () => this.layerList;
  constructor(
    scope: Construct,
    id: string,
    // db: DatabaseStack,
    vpcStack: VpcStack,
    props?: cdk.StackProps
  ) {
    super(scope, id, props);

    this.layerList = {};

    /**
     *
     * Create Integration Lambda layer for aws-jwt-verify
     */
    const jwt = new lambda.LayerVersion(this, "aws-jwt-verify", {
      code: lambda.Code.fromAsset("./layers/aws-jwt-verify.zip"),
      compatibleRuntimes: [lambda.Runtime.NODEJS_16_X],
      description: "Contains the aws-jwt-verify library for JS",
    });

    /**
     *
     * Create Integration Lambda layer for PSQL
     */
    const postgres = new lambda.LayerVersion(this, "postgres", {
      code: lambda.Code.fromAsset("./layers/postgres.zip"),
      compatibleRuntimes: [lambda.Runtime.NODEJS_16_X],
      description: "Contains the postgres library for JS",
    });

    //create psycopglayer
    const psycopgLayer = new LayerVersion(this, "psycopgLambdaLayer", {
      code: Code.fromAsset("./layers/psycopg2.zip"),
      compatibleRuntimes: [Runtime.PYTHON_3_9],
      description: "Lambda layer containing the psycopg2 Python library",
    });

    this.layerList["psycopg2"] = psycopgLayer;
    this.layerList["postgres"] = postgres;
    this.layerList["jwt"] = jwt;

    // Create Cognito user pool

    /**
     *
     * Create Cognito User Pool
     * Using verification code
     * Inspiration from http://buraktas.com/create-cognito-user-pool-aws-cdk/
     */
    const userPoolName = "ailaUserPool";
    this.userPool = new cognito.UserPool(this, "aila-pool", {
      userPoolName: userPoolName,
      signInAliases: {
        email: true,
      },
      selfSignUpEnabled: true, // Enabled to allow mobile user sign up
      autoVerify: {
        email: true,
      },
      userVerification: {
        emailSubject: "You need to verify your email",
        emailBody:
          "Thanks for signing up to AI Learning Assistant. \n Your verification code is {####}",
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create app client
    this.appClient = this.userPool.addClient("aila-pool", {
      userPoolClientName: userPoolName,
      authFlows: {
        userPassword: true,
        custom: true,
        userSrp: true,
      },
    });

    this.identityPool = new cognito.CfnIdentityPool(
      this,
      "aila-identity-pool",
      {
        allowUnauthenticatedIdentities: true, // don't allow unauthenticated users
        identityPoolName: "ailaIdentityPool",
        cognitoIdentityProviders: [
          {
            clientId: this.appClient.userPoolClientId,
            providerName: this.userPool.userPoolProviderName,
          },
        ],
      }
    );

    const secretsName = "AILA_Cognito_Secrets";

    this.secret = new secretsmanager.Secret(this, secretsName, {
      secretName: secretsName,
      description: "Cognito Secrets for authentication",
      secretObjectValue: {
        VITE_COGNITO_USER_POOL_ID: cdk.SecretValue.unsafePlainText(
          this.userPool.userPoolId
        ),
        VITE_COGNITO_USER_POOL_CLIENT_ID: cdk.SecretValue.unsafePlainText(
          this.appClient.userPoolClientId
        ),
        VITE_AWS_REGION: cdk.SecretValue.unsafePlainText(this.region),
        VITE_IDENTITY_POOL_ID: cdk.SecretValue.unsafePlainText(
          this.identityPool.ref
        ),
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Create roles and policies
    const createPolicyStatement = (actions: string[], resources: string[]) => {
      return new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: actions,
        resources: resources,
      });
    };

    /**
     *
     * Load OpenAPI file into API Gateway using REST API
     */

    // Read OpenAPI file and load file to S3
    const asset = new Asset(this, "SampleAsset", {
      path: "OpenAPI_Swagger_Definition.yaml",
    });

    const data = Fn.transform("AWS::Include", { Location: asset.s3ObjectUrl });

    // Create the API Gateway REST API
    this.api = new apigateway.SpecRestApi(this, "APIGateway", {
      apiDefinition: apigateway.AssetApiDefinition.fromInline(data),
      endpointTypes: [apigateway.EndpointType.REGIONAL],
      restApiName: "ailaAPI",
      deploy: true,
      cloudWatchRole: true,
      deployOptions: {
        metricsEnabled: true,
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
        dataTraceEnabled: true,
        stageName: "prod",
        methodOptions: {
          "/*/*": {
            throttlingRateLimit: 100,
            throttlingBurstLimit: 200,
          },
        },
      },
    });

    this.stageARN_APIGW = this.api.deploymentStage.stageArn;
    this.apiGW_basedURL = this.api.urlForPath();

    const studentRole = new iam.Role(this, "StudentRole", {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    studentRole.attachInlinePolicy(
      new iam.Policy(this, "StudentPolicy", {
        statements: [
          createPolicyStatement(
            ["execute-api:Invoke"],
            [
              `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/student/*`,
            ]
          ),
        ],
      })
    );

    const instructorRole = new iam.Role(this, "InstructorRole", {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    instructorRole.attachInlinePolicy(
      new iam.Policy(this, "InstructorPolicy", {
        statements: [
          createPolicyStatement(
            ["execute-api:Invoke"],
            [
              `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/instructor/*`,
            ]
          ),
        ],
      })
    );

    const adminRole = new iam.Role(this, "AdminRole", {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    adminRole.attachInlinePolicy(
      new iam.Policy(this, "AdminPolicy", {
        statements: [
          createPolicyStatement(
            ["execute-api:Invoke"],
            [
              `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/admin/*`,
              `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/instructor/*`,
              `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/student/*`,
            ]
          ),
        ],
      })
    );

    const techAdminRole = new iam.Role(this, "TechAdminRole", {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    techAdminRole.attachInlinePolicy(
      new iam.Policy(this, "TechAdminPolicy", {
        statements: [
          createPolicyStatement(
            ["execute-api:Invoke"],
            [
              `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*`,
            ]
          ),
        ],
      })
    );


    // Create Cognito user pool groups
    const studentGroup = new cognito.CfnUserPoolGroup(this, "StudentGroup", {
      groupName: "student",
      userPoolId: this.userPool.userPoolId,
      roleArn: studentRole.roleArn,
    });

    const instructorGroup = new cognito.CfnUserPoolGroup(
      this,
      "InstructorGroup",
      {
        groupName: "instructor",
        userPoolId: this.userPool.userPoolId,
        roleArn: instructorRole.roleArn,
      }
    );

    const adminGroup = new cognito.CfnUserPoolGroup(this, "AdminGroup", {
      groupName: "admin",
      userPoolId: this.userPool.userPoolId,
      roleArn: adminRole.roleArn,
    });

    const techAdminGroup = new cognito.CfnUserPoolGroup(
      this,
      "TechAdminGroup",
      {
        groupName: "techadmin",
        userPoolId: this.userPool.userPoolId,
        roleArn: techAdminRole.roleArn,
      }
    );

    // Create unauthenticated role with no permissions
    const unauthenticatedRole = new iam.Role(this, "UnauthenticatedRole", {
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "unauthenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
    });

    const lambdaRole = new iam.Role(this, "postgresLambdaRole", {
      roleName: "postgresLambdaRole",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    // Grant access to Secret Manager
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Secrets Manager
          "secretsmanager:GetSecretValue",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
        ],
      })
    );

    // Grant access to EC2
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:AssignPrivateIpAddresses",
          "ec2:UnassignPrivateIpAddresses",
        ],
        resources: ["*"], // must be *
      })
    );

    // Grant access to log
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Logs
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: ["arn:aws:logs:*:*:*"],
      })
    );

    // Attach roles to the identity pool
    new cognito.CfnIdentityPoolRoleAttachment(this, "IdentityPoolRoles", {
      identityPoolId: this.identityPool.ref,
      roles: {
        authenticated: studentRole.roleArn,
        unauthenticated: unauthenticatedRole.roleArn,
      },
    });

    const lambdaStudentFunction = new lambda.Function(
      this,
      "studentFunction",
      {
        runtime: lambda.Runtime.NODEJS_16_X, // Execution environment
        code: lambda.Code.fromAsset("lambda"), // Code loaded from "lambda" directory
        handler: "studentFunction.handler", // Code handler
        timeout: Duration.seconds(300),
        vpc: vpcStack.vpc,
        environment: {
          SM_DB_CREDENTIALS: db.secretPathUser.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        },
        functionName: "studentFunction",
        memorySize: 512,
        layers: [postgres],
        role: lambdaRole,
      }
    );

    // Add the permission to the Lambda function's policy to allow API Gateway access
    lambdaStudentFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/student*`,

    });

    const cfnLambda_student = lambdaStudentFunction.node.defaultChild as lambda.CfnFunction;
    cfnLambda_student.overrideLogicalId("studentFunction");

    const lambdaInstructorFunction = new lambda.Function(
      this,
      "instructorFunction",
      {
        runtime: lambda.Runtime.NODEJS_16_X, // Execution environment
        code: lambda.Code.fromAsset("lambda"), // Code loaded from "lambda" directory
        handler: "instructorFunction.handler", // Code handler
        timeout: Duration.seconds(300),
        vpc: vpcStack.vpc,
        environment: {
          SM_DB_CREDENTIALS: db.secretPathUser.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        },
        functionName: "instructorFunction",
        memorySize: 512,
        layers: [postgres],
        role: lambdaRole,
      }
    );

    // Add the permission to the Lambda function's policy to allow API Gateway access
    lambdaInstructorFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/instructor*`,
    });


    const cfnLambda_Instructor = lambdaInstructorFunction.node.defaultChild as lambda.CfnFunction;
    cfnLambda_Instructor.overrideLogicalId("instructorFunction");

    
    const lambdaAdminFunction = new lambda.Function(
      this,
      "adminFunction",
      {
        runtime: lambda.Runtime.NODEJS_16_X, // Execution environment
        code: lambda.Code.fromAsset("lambda"), // Code loaded from "lambda" directory
        handler: "adminFunction.handler", // Code handler
        timeout: Duration.seconds(300),
        vpc: vpcStack.vpc,
        environment: {
          SM_DB_CREDENTIALS: db.secretPathUser.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        },
        functionName: "adminFunction",
        memorySize: 512,
        layers: [postgres],
        role: lambdaRole,
      }
    );

    // Add the permission to the Lambda function's policy to allow API Gateway access
    lambdaAdminFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/admin*`,
    });

    const cfnLambda_Admin = lambdaAdminFunction.node.defaultChild as lambda.CfnFunction;
    cfnLambda_Admin.overrideLogicalId("adminFunction");

    const lambdaTechAdminFunction = new lambda.Function(
      this,
      "techadminFunction",
      {
        runtime: lambda.Runtime.NODEJS_16_X, // Execution environment
        code: lambda.Code.fromAsset("lambda"), // Code loaded from "lambda" directory
        handler: "techadminFunction.handler", // Code handler
        timeout: Duration.seconds(300),
        vpc: vpcStack.vpc,
        environment: {
          SM_DB_CREDENTIALS: db.secretPathUser.secretName,
          RDS_PROXY_ENDPOINT: db.rdsProxyEndpoint,
        },
        functionName: "techadminFunction",
        memorySize: 512,
        layers: [postgres],
        role: lambdaRole,
      }
    );

    // Add the permission to the Lambda function's policy to allow API Gateway access
    lambdaTechAdminFunction.addPermission("AllowApiGatewayInvoke", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: `arn:aws:execute-api:${this.region}:${this.account}:${this.api.restApiId}/*/*/*`,
    });

    const cfnLambda_Tech_Admin = lambdaTechAdminFunction.node.defaultChild as lambda.CfnFunction;
    cfnLambda_Tech_Admin.overrideLogicalId("techadminFunction");


    const coglambdaRole = new iam.Role(this, "cognitoLambdaRole", {
      roleName: "cognitoLambdaRole",
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    // Grant access to Secret Manager
    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Secrets Manager
          "secretsmanager:GetSecretValue",
        ],
        resources: [
          `arn:aws:secretsmanager:${this.region}:${this.account}:secret:*`,
        ],
      })
    );

    // Grant access to EC2
    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface",
          "ec2:AssignPrivateIpAddresses",
          "ec2:UnassignPrivateIpAddresses",
        ],
        resources: ["*"], // must be *
      })
    );

    // Grant access to log
    coglambdaRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          //Logs
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ],
        resources: ["arn:aws:logs:*:*:*"],
      })
    );

    // Grant permission to add users to an IAM group
    coglambdaRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
          "iam:AddUserToGroup",
      ],
      resources: [
          `arn:aws:iam::${this.account}:user/*`,
          `arn:aws:iam::${this.account}:group/*`,
      ],
  }));

    //cognito auto assign authenticated users to the student group
    const addUserGroupOnSignUp = new lambda.Function(
      this,
      "addUserGroupOnSignUp",
      {
        runtime: lambda.Runtime.NODEJS_16_X, // Execution environment
        code: lambda.Code.fromAsset("lambda"), // Code loaded from "lambda" directory
        handler: "addUserGroupOnSignUp.handler", // Code handler
        timeout: Duration.seconds(300),
        vpc: vpcStack.vpc,
        functionName: "addUserGroupOnSignUp",
        memorySize: 128,
        role: coglambdaRole,
      }
    );
    // const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'ailaAuthorizer', {
    //   cognitoUserPools: [this.userPool],
    // });
    new cdk.CfnOutput(this, 'UserPoolIdOutput', {
      value: this.userPool.userPoolId,
      description: 'The ID of the Cognito User Pool',
    });
  }
}