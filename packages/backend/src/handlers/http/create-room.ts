import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { createGameState, addPlayer } from '@wttd/shared';
import { createGame } from '../../db/game-store.js';

function randomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const body = JSON.parse(event.body ?? '{}');
  const { displayName, playerId } = body as { displayName: string; playerId: string };

  if (!displayName?.trim() || !playerId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'displayName and playerId required' }) };
  }

  // Retry on collision (astronomically rare)
  for (let attempt = 0; attempt < 5; attempt++) {
    const roomCode = randomCode();
    const state = createGameState(roomCode);
    addPlayer(state, playerId, displayName.trim());

    const created = await createGame(state);
    if (created) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomCode }),
      };
    }
  }

  return { statusCode: 500, body: JSON.stringify({ error: 'Could not generate unique room code' }) };
};
