import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import {
  addToDungeon,
  discardWithEquipment,
  passPlayer,
  usePolymorph,
  startDungeonPhase,
  beginTurn,
  toPublicState,
  defeatingEquipmentNames,
} from '@wttd/shared';
import { getGameWithVersion, saveGame } from '../../db/game-store.js';
import { broadcastToRoom, sendToPlayer, wsEndpoint } from '../ws/broadcast.js';

type BiddingAction = 'dungeon' | 'discard' | 'pass' | 'polymorph';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const roomCode = event.pathParameters?.code?.toUpperCase() ?? '';
  const body = JSON.parse(event.body ?? '{}');
  const { playerId, action, equipmentName } = body as {
    playerId: string;
    action: BiddingAction;
    equipmentName?: string;
  };

  const record = await getGameWithVersion(roomCode);
  if (!record) return { statusCode: 404, body: JSON.stringify({ error: 'Room not found' }) };

  const { state, version } = record;
  const endpoint = wsEndpoint();

  let actionResult: { ok: boolean; error?: string };
  let biddingOver = false;

  switch (action) {
    case 'dungeon': {
      const r = addToDungeon(state, playerId);
      actionResult = r;
      break;
    }
    case 'discard': {
      if (!equipmentName) return { statusCode: 400, body: JSON.stringify({ error: 'equipmentName required for discard' }) };
      const r = discardWithEquipment(state, playerId, equipmentName);
      actionResult = r;
      break;
    }
    case 'pass': {
      const r = passPlayer(state, playerId);
      actionResult = r;
      biddingOver = r.biddingOver ?? false;
      break;
    }
    case 'polymorph': {
      const r = usePolymorph(state, playerId);
      actionResult = r;
      break;
    }
    default:
      return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
  }

  if (!actionResult.ok) return { statusCode: 400, body: JSON.stringify({ error: actionResult.error }) };

  // If bidding is over, transition to dungeon phase
  if (biddingOver) {
    const dungeonInfo = startDungeonPhase(state);
    state.version = version + 1;
    await saveGame(state, version);

    await broadcastToRoom(endpoint, roomCode, {
      type: 'DUNGEON_STARTED',
      payload: { ...dungeonInfo, publicState: toPublicState(state) },
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true, dungeonStarted: true }) };
  }

  // For polymorph, send updated private draw to same player
  if (action === 'polymorph' && (actionResult as any).monster) {
    const monster = (actionResult as any).monster;
    const defeating = defeatingEquipmentNames(state.availableEquipment, monster, state.vorpalTarget);
    state.version = version + 1;
    await saveGame(state, version);

    await sendToPlayer(endpoint, roomCode, playerId, {
      type: 'PRIVATE_DRAW',
      payload: { monster, defeatingEquipment: defeating },
    });
    await broadcastToRoom(endpoint, roomCode, { type: 'GAME_STATE_UPDATE', payload: toPublicState(state) });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  // Draw next card for the next player
  const { monster: nextMonster, deckEmpty } = beginTurn(state);

  state.version = version + 1;
  await saveGame(state, version);

  // Broadcast public state update
  await broadcastToRoom(endpoint, roomCode, { type: 'GAME_STATE_UPDATE', payload: toPublicState(state) });

  // Send private draw to next player (unless deck was empty — they must pass)
  if (nextMonster) {
    const currentPlayer = state.players[state.currentPlayerIndex % state.players.length];
    const defeating = defeatingEquipmentNames(state.availableEquipment, nextMonster, state.vorpalTarget);
    await sendToPlayer(endpoint, roomCode, currentPlayer.playerId, {
      type: 'PRIVATE_DRAW',
      payload: { monster: nextMonster, defeatingEquipment: defeating },
    });
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, deckEmpty }),
  };
};
