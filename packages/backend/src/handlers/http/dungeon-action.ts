import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import {
  setVorpalTarget,
  peekNextMonster,
  revealNextMonster,
  useVorpalAxe,
  resolveDungeon,
  toPublicState,
  findEquipmentByName,
} from '@wttd/shared';
import { getGameWithVersion, saveGame } from '../../db/game-store.js';
import { broadcastToRoom, wsEndpoint } from '../ws/broadcast.js';
import { scheduleAxeTimeout, cancelAxeTimeout } from '../../lib/axe-scheduler.js';

type DungeonAction = 'vorpal-target' | 'reveal-next' | 'axe-use' | 'axe-skip';

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  const roomCode = event.pathParameters?.code?.toUpperCase() ?? '';
  const body = JSON.parse(event.body ?? '{}');
  const { playerId, action, monsterName, use } = body as {
    playerId: string;
    action: DungeonAction;
    monsterName?: string;  // for vorpal-target
    use?: boolean;          // for axe-use / axe-skip (also used by timeout Lambda)
  };

  const record = await getGameWithVersion(roomCode);
  if (!record) return { statusCode: 404, body: JSON.stringify({ error: 'Room not found' }) };

  const { state, version } = record;
  const endpoint = wsEndpoint();

  // Only the dungeon runner can act in dungeon phase
  if (state.phase !== 'dungeon') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Not in dungeon phase' }) };
  }
  const isTimeout = playerId === '__scheduler__';
  if (!isTimeout && state.dungeonRunnerId !== playerId) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Only the dungeon runner can act' }) };
  }

  // ── vorpal-target ───────────────────────────────────────────────────────────
  if (action === 'vorpal-target') {
    if (!monsterName) return { statusCode: 400, body: JSON.stringify({ error: 'monsterName required' }) };
    const r = setVorpalTarget(state, monsterName);
    if (!r.ok) return { statusCode: 400, body: JSON.stringify({ error: r.error }) };

    state.version = version + 1;
    await saveGame(state, version);
    await broadcastToRoom(endpoint, roomCode, {
      type: 'VORPAL_TARGET_SET',
      payload: { monsterName: state.vorpalTarget, publicState: toPublicState(state) },
    });
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  // ── axe-use / axe-skip (including scheduler timeout) ──────────────────────
  if (action === 'axe-use' || action === 'axe-skip') {
    // No-op if axe decision was already resolved (idempotent)
    if (!state.axeDecisionPending) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, noOp: true }) };
    }

    await cancelAxeTimeout(roomCode).catch(() => {});

    if (action === 'axe-use' || use === true) {
      useVorpalAxe(state);
    }
    state.axeDecisionPending = false;

    // Now resolve the monster
    const result = revealNextMonster(state);
    if (!result) return { statusCode: 400, body: JSON.stringify({ error: 'No monster to reveal' }) };

    const roundDone = peekNextMonster(state) === null;
    let roundResult = null;
    if (roundDone) {
      roundResult = resolveDungeon(state);
    }

    state.version = version + 1;
    await saveGame(state, version);

    await broadcastToRoom(endpoint, roomCode, {
      type: 'DUNGEON_REVEAL',
      payload: { result, publicState: toPublicState(state) },
    });
    if (roundResult) {
      await broadcastToRoom(endpoint, roomCode, {
        type: roundResult.winnerId ? 'GAME_ENDED' : 'ROUND_ENDED',
        payload: { result: roundResult, publicState: toPublicState(state) },
      });
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  // ── reveal-next ─────────────────────────────────────────────────────────────
  if (action === 'reveal-next') {
    const nextMonster = peekNextMonster(state);
    if (!nextMonster) return { statusCode: 400, body: JSON.stringify({ error: 'Dungeon is exhausted' }) };

    // Check if Vorpal Axe decision is needed
    const hasAxe = state.dungeonEquipment.includes('Vorpal Axe');
    const axeEq = findEquipmentByName('Vorpal Axe')!;
    // Check if any OTHER equipment auto-defeats this monster
    const otherEquipment = state.dungeonEquipment.filter(n => n !== 'Vorpal Axe');
    const autoDefeated = otherEquipment.some(n => {
      const eq = findEquipmentByName(n);
      if (!eq) return false;
      const s = eq.special;
      if (s === 'torch') return nextMonster.strength <= 3;
      if (s === 'dragon_spear') return nextMonster.name === 'Dragon';
      if (s === 'holy_grail') return nextMonster.strength % 2 === 0;
      if (s === 'war_hammer') return nextMonster.name === 'Golem';
      if (s === 'vorpal_sword' || s === 'vorpal_dagger') return state.vorpalTarget !== null && nextMonster.name === state.vorpalTarget;
      if (s === 'ring_of_power') return nextMonster.strength <= 2;
      if (s === 'invisibility_cloak') return nextMonster.strength >= 6;
      if (s === 'demonic_pact') return nextMonster.name === 'Demon';
      return false;
    });

    if (hasAxe && !autoDefeated) {
      // Pause for axe decision
      const decisionDeadline = Date.now() + 45_000;
      state.axeDecisionPending = true;
      state.version = version + 1;
      await saveGame(state, version);

      // Schedule timeout Lambda
      await scheduleAxeTimeout(roomCode, decisionDeadline);

      await broadcastToRoom(endpoint, roomCode, {
        type: 'VORPAL_AXE_DECISION',
        payload: { monster: nextMonster, decisionDeadline },
      });
      return { statusCode: 200, body: JSON.stringify({ ok: true, axeDecisionRequired: true }) };
    }

    // No axe decision needed — reveal immediately
    const result = revealNextMonster(state);
    if (!result) return { statusCode: 400, body: JSON.stringify({ error: 'No monster to reveal' }) };

    const roundDone = peekNextMonster(state) === null;
    let roundResult = null;
    if (roundDone) {
      roundResult = resolveDungeon(state);
    }

    state.version = version + 1;
    await saveGame(state, version);

    await broadcastToRoom(endpoint, roomCode, {
      type: 'DUNGEON_REVEAL',
      payload: { result, publicState: toPublicState(state) },
    });
    if (roundResult) {
      await broadcastToRoom(endpoint, roomCode, {
        type: roundResult.winnerId ? 'GAME_ENDED' : 'ROUND_ENDED',
        payload: { result: roundResult, publicState: toPublicState(state) },
      });
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 400, body: JSON.stringify({ error: 'Unknown action' }) };
};
