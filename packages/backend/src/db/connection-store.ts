import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
  QueryCommand,
  GetCommand,
} from '@aws-sdk/lib-dynamodb';

const client = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE = process.env.TABLE_NAME ?? 'wttd-games';

const TTL_2H = () => Math.floor(Date.now() / 1000) + 7200;

export interface ConnectionRecord {
  connectionId: string;
  roomCode: string;
  playerId: string;
  isSpectator: boolean;
}

export async function registerConnection(rec: ConnectionRecord): Promise<void> {
  const ttl = TTL_2H();
  // Forward index: room → connection
  await client.send(new PutCommand({
    TableName: TABLE,
    Item: {
      PK: `ROOM#${rec.roomCode}`,
      SK: `CONN#${rec.connectionId}`,
      connectionId: rec.connectionId,
      playerId: rec.playerId,
      isSpectator: rec.isSpectator,
      ttl,
    },
  }));
  // Reverse index: connection → room (for disconnect lookup)
  await client.send(new PutCommand({
    TableName: TABLE,
    Item: {
      PK: `CONN#${rec.connectionId}`,
      SK: 'META',
      roomCode: rec.roomCode,
      playerId: rec.playerId,
      ttl,
    },
  }));
}

export async function removeConnection(connectionId: string): Promise<ConnectionRecord | null> {
  // Look up reverse index first
  const meta = await client.send(new GetCommand({
    TableName: TABLE,
    Key: { PK: `CONN#${connectionId}`, SK: 'META' },
  }));
  if (!meta.Item) return null;

  const { roomCode, playerId } = meta.Item as { roomCode: string; playerId: string };

  await Promise.all([
    client.send(new DeleteCommand({
      TableName: TABLE,
      Key: { PK: `ROOM#${roomCode}`, SK: `CONN#${connectionId}` },
    })),
    client.send(new DeleteCommand({
      TableName: TABLE,
      Key: { PK: `CONN#${connectionId}`, SK: 'META' },
    })),
  ]);

  return { connectionId, roomCode, playerId, isSpectator: false };
}

export async function getConnectionsForRoom(roomCode: string): Promise<ConnectionRecord[]> {
  const res = await client.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk': `ROOM#${roomCode}`,
      ':prefix': 'CONN#',
    },
  }));
  return (res.Items ?? []).map(item => ({
    connectionId: item.connectionId as string,
    roomCode,
    playerId: item.playerId as string,
    isSpectator: item.isSpectator as boolean,
  }));
}

/** Update TTL on a connection to keep it alive. */
export async function refreshConnection(connectionId: string, roomCode: string): Promise<void> {
  const ttl = TTL_2H();
  await Promise.all([
    client.send(new PutCommand({
      TableName: TABLE,
      Item: { PK: `ROOM#${roomCode}`, SK: `CONN#${connectionId}`, ttl },
    })),
    client.send(new PutCommand({
      TableName: TABLE,
      Item: { PK: `CONN#${connectionId}`, SK: 'META', roomCode, ttl },
    })),
  ]);
}
