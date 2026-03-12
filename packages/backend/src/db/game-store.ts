import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import type { GameState } from '@wttd/shared';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME ?? 'wttd-games';

export async function getGame(roomCode: string): Promise<GameState | null> {
  const res = await client.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: `ROOM#${roomCode}`, SK: 'GAME' },
  }));
  if (!res.Item) return null;
  const { PK, SK, ...state } = res.Item;
  return state as GameState;
}

export async function putGame(state: GameState): Promise<void> {
  await client.send(new PutCommand({
    TableName: TABLE,
    Item: { PK: `ROOM#${state.roomCode}`, SK: 'GAME', ...state },
  }));
}

/**
 * Conditional write — fails with ConditionalCheckFailedException if version
 * does not match. Call this for all state mutations to prevent lost updates.
 */
export async function saveGame(state: GameState, expectedVersion: number): Promise<void> {
  const newVersion = expectedVersion + 1;
  await client.send(new UpdateCommand({
    TableName: TABLE,
    Key: { PK: `ROOM#${state.roomCode}`, SK: 'GAME' },
    UpdateExpression: 'SET #state = :state, version = :newVersion, #ttl = :ttl',
    ConditionExpression: 'version = :expectedVersion',
    ExpressionAttributeNames: { '#state': 'gameData', '#ttl': 'ttl' },
    ExpressionAttributeValues: {
      ':state': JSON.stringify(state),
      ':newVersion': newVersion,
      ':expectedVersion': expectedVersion,
      ':ttl': state.ttl,
    },
  }));
}

/** Create a brand-new game room (fails if room code already exists). */
export async function createGame(state: GameState): Promise<boolean> {
  try {
    await client.send(new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `ROOM#${state.roomCode}`,
        SK: 'GAME',
        gameData: JSON.stringify(state),
        version: 0,
        ttl: state.ttl,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    }));
    return true;
  } catch (e: any) {
    if (e.name === 'ConditionalCheckFailedException') return false;
    throw e;
  }
}

/** Fetch full raw item including version (used before saveGame). */
export async function getGameWithVersion(
  roomCode: string,
): Promise<{ state: GameState; version: number } | null> {
  const res = await client.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: `ROOM#${roomCode}`, SK: 'GAME' },
  }));
  if (!res.Item) return null;
  return {
    state: JSON.parse(res.Item.gameData as string) as GameState,
    version: res.Item.version as number,
  };
}
