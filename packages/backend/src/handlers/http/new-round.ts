import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { newRound, beginTurn, toPublicState, defeatingEquipmentNames } from '@wttd/shared';
import { getGameWithVersion, saveGame } from '../../db/game-store.js';
import { broadcastToRoom, sendToPlayer, wsEndpoint } from '../ws/broadcast.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const roomCode = event.pathParameters?.code?.toUpperCase() ?? '';
  const body = JSON.parse(event.body ?? '{}');
  const { playerId, adventurerName } = body as { playerId: string; adventurerName: string };

  if (!adventurerName) return { statusCode: 400, body: JSON.stringify({ error: 'adventurerName required' }) };

  const record = await getGameWithVersion(roomCode);
  if (!record) return { statusCode: 404, body: JSON.stringify({ error: 'Room not found' }) };

  const { state, version } = record;

  // Only the previous dungeon runner picks the next adventurer
  if (state.dungeonRunnerId !== playerId && state.hostPlayerId !== playerId) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Only the dungeon runner chooses the next adventurer' }) };
  }

  const r = newRound(state, adventurerName);
  if (!r.ok) return { statusCode: 400, body: JSON.stringify({ error: r.error }) };

  const { monster } = beginTurn(state);

  state.version = version + 1;
  await saveGame(state, version);

  const endpoint = wsEndpoint();

  await broadcastToRoom(endpoint, roomCode, {
    type: 'GAME_STATE_UPDATE',
    payload: toPublicState(state),
  });

  if (monster) {
    const currentPlayer = state.players[state.currentPlayerIndex % state.players.length];
    const defeating = defeatingEquipmentNames(state.availableEquipment, monster, state.vorpalTarget);
    await sendToPlayer(endpoint, roomCode, currentPlayer.playerId, {
      type: 'PRIVATE_DRAW',
      payload: { monster, defeatingEquipment: defeating },
    });
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true }),
  };
};
