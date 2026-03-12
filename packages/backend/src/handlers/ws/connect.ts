import type { APIGatewayProxyWebsocketHandlerV2 } from 'aws-lambda';
import { registerConnection } from '../../db/connection-store.js';

/**
 * $connect handler.
 * Query params: ?roomCode=XK7M2P&playerId=<uuid>&spectator=true
 */
export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const qs = event.queryStringParameters ?? {};
  const roomCode = qs.roomCode ?? '';
  const playerId = qs.playerId ?? 'spectator';
  const isSpectator = qs.spectator === 'true';
  const connectionId = event.requestContext.connectionId;

  if (!roomCode) return { statusCode: 400, body: 'roomCode required' };

  await registerConnection({ connectionId, roomCode, playerId, isSpectator });
  return { statusCode: 200, body: 'Connected' };
};
