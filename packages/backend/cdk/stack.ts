import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2_integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as iam from 'aws-cdk-lib/aws-iam';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as path from 'path';
import { Construct } from 'constructs';

export class WttdStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── DynamoDB ──────────────────────────────────────────────────────────────

    const table = new dynamodb.Table(this, 'WttdTable', {
      tableName: 'wttd-games',
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: 'ttl',
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // ── Lambda defaults ───────────────────────────────────────────────────────

    const handlerDir = path.join(__dirname, '..', 'src', 'handlers');
    const libDir = path.join(__dirname, '..', 'src', 'lib');

    const commonEnv = {
      TABLE_NAME: table.tableName,
      NODE_OPTIONS: '--enable-source-maps',
    };

    function makeHandler(id: string, entryPath: string, extraEnv?: Record<string, string>) {
      return new NodejsFunction(scope, id, {
        entry: entryPath,
        runtime: lambda.Runtime.NODEJS_20_X,
        architecture: lambda.Architecture.ARM_64,
        bundling: { minify: true, sourceMap: true },
        environment: { ...commonEnv, ...extraEnv },
        timeout: cdk.Duration.seconds(10),
      });
    }

    // ── HTTP handlers ─────────────────────────────────────────────────────────

    const createRoom   = makeHandler('CreateRoom',    path.join(handlerDir, 'http', 'create-room.ts'));
    const joinRoom     = makeHandler('JoinRoom',      path.join(handlerDir, 'http', 'join-room.ts'));
    const startGame    = makeHandler('StartGame',     path.join(handlerDir, 'http', 'start-game.ts'));
    const getState     = makeHandler('GetState',      path.join(handlerDir, 'http', 'get-state.ts'));
    const biddingAction = makeHandler('BiddingAction', path.join(handlerDir, 'http', 'bidding-action.ts'));
    const dungeonAction = makeHandler('DungeonAction', path.join(handlerDir, 'http', 'dungeon-action.ts'));
    const newRound     = makeHandler('NewRound',      path.join(handlerDir, 'http', 'new-round.ts'));

    // ── WebSocket handlers ────────────────────────────────────────────────────

    const wsConnect    = makeHandler('WsConnect',    path.join(handlerDir, 'ws', 'connect.ts'));
    const wsDisconnect = makeHandler('WsDisconnect', path.join(handlerDir, 'ws', 'disconnect.ts'));

    // ── WebSocket API ─────────────────────────────────────────────────────────

    const wsApi = new apigwv2.WebSocketApi(this, 'WttdWsApi', {
      connectRouteOptions: {
        integration: new apigwv2_integrations.WebSocketLambdaIntegration('WsConnectIntegration', wsConnect),
      },
      disconnectRouteOptions: {
        integration: new apigwv2_integrations.WebSocketLambdaIntegration('WsDisconnectIntegration', wsDisconnect),
      },
    });

    const wsStage = new apigwv2.WebSocketStage(this, 'WttdWsStage', {
      webSocketApi: wsApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    const wsCallbackUrl = wsStage.callbackUrl;

    // Grant broadcast lambdas permission to post to WS connections
    const wsManageConnectionsPolicy = new iam.PolicyStatement({
      actions: ['execute-api:ManageConnections'],
      resources: [`${wsApi.arnForExecuteApiV2('prod', '*', '*')}`],
    });

    for (const fn of [startGame, biddingAction, dungeonAction, newRound, joinRoom]) {
      fn.addToRolePolicy(wsManageConnectionsPolicy);
      fn.addEnvironment('WS_CALLBACK_URL', wsCallbackUrl);
    }

    // ── HTTP API ──────────────────────────────────────────────────────────────

    const httpApi = new apigwv2.HttpApi(this, 'WttdHttpApi', {
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const I = apigwv2_integrations.HttpLambdaIntegration;

    httpApi.addRoutes({ path: '/rooms',                              methods: [apigwv2.HttpMethod.POST],   integration: new I('CreateRoomInt',    createRoom) });
    httpApi.addRoutes({ path: '/rooms/{code}/join',                  methods: [apigwv2.HttpMethod.POST],   integration: new I('JoinRoomInt',      joinRoom) });
    httpApi.addRoutes({ path: '/rooms/{code}/start',                 methods: [apigwv2.HttpMethod.POST],   integration: new I('StartGameInt',     startGame) });
    httpApi.addRoutes({ path: '/rooms/{code}/state',                 methods: [apigwv2.HttpMethod.GET],    integration: new I('GetStateInt',      getState) });
    httpApi.addRoutes({ path: '/rooms/{code}/bidding/action',        methods: [apigwv2.HttpMethod.POST],   integration: new I('BiddingActionInt', biddingAction) });
    httpApi.addRoutes({ path: '/rooms/{code}/dungeon/action',        methods: [apigwv2.HttpMethod.POST],   integration: new I('DungeonActionInt', dungeonAction) });
    httpApi.addRoutes({ path: '/rooms/{code}/new-round',             methods: [apigwv2.HttpMethod.POST],   integration: new I('NewRoundInt',      newRound) });

    // ── DynamoDB grants ───────────────────────────────────────────────────────

    for (const fn of [createRoom, joinRoom, startGame, getState, biddingAction, dungeonAction, newRound, wsConnect, wsDisconnect]) {
      table.grantReadWriteData(fn);
    }

    // ── Vorpal Axe timeout (EventBridge Scheduler) ────────────────────────────

    const axeTimeoutFn = makeHandler('AxeTimeout', path.join(handlerDir, 'http', 'dungeon-action.ts'));
    table.grantReadWriteData(axeTimeoutFn);
    axeTimeoutFn.addToRolePolicy(wsManageConnectionsPolicy);
    axeTimeoutFn.addEnvironment('WS_CALLBACK_URL', wsCallbackUrl);

    const schedulerRole = new iam.Role(this, 'SchedulerRole', {
      assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
    });
    schedulerRole.addToPolicy(new iam.PolicyStatement({
      actions: ['lambda:InvokeFunction'],
      resources: [axeTimeoutFn.functionArn],
    }));

    for (const fn of [dungeonAction, biddingAction]) {
      fn.addEnvironment('SCHEDULER_ROLE_ARN', schedulerRole.roleArn);
      fn.addEnvironment('AXE_TIMEOUT_LAMBDA_ARN', axeTimeoutFn.functionArn);
    }
    // Grant Lambda permission to create/delete schedules
    const schedulerPolicy = new iam.PolicyStatement({
      actions: ['scheduler:CreateSchedule', 'scheduler:DeleteSchedule'],
      resources: ['*'],
    });
    dungeonAction.addToRolePolicy(schedulerPolicy);
    biddingAction.addToRolePolicy(schedulerPolicy);
    dungeonAction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['iam:PassRole'],
      resources: [schedulerRole.roleArn],
    }));

    // ── Outputs ───────────────────────────────────────────────────────────────

    new cdk.CfnOutput(this, 'HttpApiUrl', {
      value: httpApi.apiEndpoint,
      exportName: 'WttdHttpApiUrl',
    });
    new cdk.CfnOutput(this, 'WsApiUrl', {
      value: `wss://${wsApi.apiId}.execute-api.${this.region}.amazonaws.com/${wsStage.stageName}`,
      exportName: 'WttdWsApiUrl',
    });
  }
}

// ── App entry ─────────────────────────────────────────────────────────────────

const app = new cdk.App();
new WttdStack(app, 'WttdStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1',
  },
});
