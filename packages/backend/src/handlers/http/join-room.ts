import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { addPlayer, toPublicState } from '@wttd/shared';
import { getGameWithVersion, saveGame } from '../../db/game-store.js';
import { broadcastToRoom, wsEndpoint } from '../ws/broadcast.js';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const roomCode = event.pathParameters?.code?.toUpperCase() ?? '';
  const body = JSON.parse(event.body ?? '{}');
  const { playerId, displayName, spectator } = body as {
    playerId: string;
    displayName: string;
    spectator?: boolean;
  };

  if (!playerId || !displayName?.trim()) {
    return { statusCode: 400, body: JSON.stringify({ error: 'playerId and displayName required' }) };
  }

  const record = await getGameWithVersion(roomCode);
  if (!record) return { statusCode: 404, body: JSON.stringify({ error: 'Room not found' }) };

  const { state, version } = record;

  // Reconnect: player already in game
  if (state.players.some(p => p.playerId === playerId)) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, reconnected: true, state: toPublicState(state) }) };
  }

  // Spectators don't join the player list
  if (spectator) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, spectator: true, state: toPublicState(state) }) };
  }

  const result = addPlayer(state, playerId, displayName.trim());
  if (!result.ok) return { statusCode: 400, body: JSON.stringify({ error: result.error }) };

  state.version = version + 1;
  await saveGame(state, version);

  await broadcastToRoom(wsEndpoint(), roomCode, {
    type: 'PLAYER_JOINED',
    payload: { player: state.players.find(p => p.playerId === playerId) },
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, state: toPublicState(state) }),
  };
};
