import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { startGame, startDungeonPhase, beginTurn, toPublicState, defeatingEquipmentNames } from '@wttd/shared';
import { getGameWithVersion, saveGame } from '../../db/game-store.js';
import { broadcastToRoom, sendToPlayer, wsEndpoint } from '../ws/broadcast.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const roomCode = event.pathParameters?.code?.toUpperCase() ?? '';
  const body = JSON.parse(event.body ?? '{}');
  const { playerId } = body as { playerId: string };

  const record = await getGameWithVersion(roomCode);
  if (!record) return { statusCode: 404, body: JSON.stringify({ error: 'Room not found' }) };

  const { state, version } = record;
  const result = startGame(state, playerId);
  if (!result.ok) return { statusCode: 400, body: JSON.stringify({ error: result.error }) };

  // Draw first card for first player
  const { monster } = beginTurn(state);

  state.version = version + 1;
  await saveGame(state, version);

  const endpoint = wsEndpoint();

  // Broadcast game started
  await broadcastToRoom(endpoint, roomCode, {
    type: 'GAME_STATE_UPDATE',
    payload: toPublicState(state),
  });

  // Send private draw to current player
  if (monster && state.dungeonRunnerId === null) {
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
