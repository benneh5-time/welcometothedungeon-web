import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
  GoneException,
} from '@aws-sdk/client-apigatewaymanagementapi';
import type { WsMessage } from '@wttd/shared';
import { getConnectionsForRoom, removeConnection } from '../../db/connection-store.js';

function makeClient(endpoint: string) {
  return new ApiGatewayManagementApiClient({ endpoint });
}

/** Send a message to a single connection. Returns false if connection is stale. */
export async function sendToConnection(
  endpoint: string,
  connectionId: string,
  message: WsMessage,
): Promise<boolean> {
  const client = makeClient(endpoint);
  try {
    await client.send(new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(JSON.stringify(message)),
    }));
    return true;
  } catch (e: any) {
    if (e instanceof GoneException || e.name === 'GoneException') return false;
    throw e;
  }
}

/** Broadcast to all connections in a room. Stale connections are cleaned up. */
export async function broadcastToRoom(
  endpoint: string,
  roomCode: string,
  message: WsMessage,
  excludeConnectionId?: string,
): Promise<void> {
  const connections = await getConnectionsForRoom(roomCode);
  await Promise.all(
    connections
      .filter(c => c.connectionId !== excludeConnectionId)
      .map(async c => {
        const ok = await sendToConnection(endpoint, c.connectionId, message);
        if (!ok) await removeConnection(c.connectionId).catch(() => {});
      }),
  );
}

/** Send a targeted private message to a specific player in a room. */
export async function sendToPlayer(
  endpoint: string,
  roomCode: string,
  playerId: string,
  message: WsMessage,
): Promise<void> {
  const connections = await getConnectionsForRoom(roomCode);
  const conn = connections.find(c => c.playerId === playerId);
  if (!conn) return;
  const ok = await sendToConnection(endpoint, conn.connectionId, message);
  if (!ok) await removeConnection(conn.connectionId).catch(() => {});
}

export function wsEndpoint(): string {
  const url = process.env.WS_CALLBACK_URL;
  if (!url) throw new Error('WS_CALLBACK_URL env var not set');
  return url;
}
