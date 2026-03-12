import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { toPublicState } from '@wttd/shared';
import { getGameWithVersion } from '../../db/game-store.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const roomCode = event.pathParameters?.code?.toUpperCase() ?? '';

  const record = await getGameWithVersion(roomCode);
  if (!record) return { statusCode: 404, body: JSON.stringify({ error: 'Room not found' }) };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(toPublicState(record.state)),
  };
};
