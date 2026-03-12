import type {
  DungeonResult,
  Equipment,
  GameState,
  Monster,
  Player,
  PublicGameState,
  RoundEndResult,
  SpecialEffect,
} from './types.js';
import {
  ADVENTURERS,
  ADVENTURER_NAMES,
  deserializeMonster,
  findEquipmentByName,
  makeMonsterDeck,
  serializeMonster,
} from './data.js';

// ── Utilities ─────────────────────────────────────────────────────────────────

function fisherYates<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ── Factory / hydration ───────────────────────────────────────────────────────

export function createGameState(roomCode: string): GameState {
  const now = Math.floor(Date.now() / 1000);
  return {
    roomCode,
    phase: 'lobby',
    hostPlayerId: null,
    players: [],
    adventurerName: 'warrior',
    availableEquipment: [],
    monsterDeck: [],
    dungeonPile: [],
    currentPlayerIndex: 0,
    pendingDraw: null,
    dungeonRunnerId: null,
    dungeonHp: 0,
    dungeonEquipment: [],
    dungeonMonsterQueue: [],
    dungeonMonsterIndex: 0,
    healingPotionUsed: false,
    vorpalTarget: null,
    vorpalAxeUsed: false,
    vorpalAxeQueued: false,
    axeDecisionPending: false,
    ringOfPowerBonus: 0,
    demonicPactTriggered: false,
    version: 0,
    ttl: now + 86400,
  };
}

// ── Helpers operating on GameState ───────────────────────────────────────────

function activePlayers(state: GameState): Player[] {
  return state.players.filter(p => !p.eliminated && !p.passed);
}

function currentPlayer(state: GameState): Player | null {
  const ap = activePlayers(state);
  if (!ap.length) return null;
  return ap[state.currentPlayerIndex % ap.length];
}

function getPlayer(state: GameState, playerId: string): Player | null {
  return state.players.find(p => p.playerId === playerId) ?? null;
}

function findEquipmentInList(names: string[], name: string): Equipment | null {
  const lower = name.toLowerCase();
  const found = names.find(n => n.toLowerCase() === lower);
  if (!found) return null;
  return findEquipmentByName(found);
}

function resolveEquipment(names: string[]): Equipment[] {
  return names.map(n => findEquipmentByName(n)).filter(Boolean) as Equipment[];
}

function advanceTurn(state: GameState): void {
  const ap = activePlayers(state);
  if (ap.length) {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % ap.length;
  }
}

// ── Lobby ─────────────────────────────────────────────────────────────────────

export function addPlayer(
  state: GameState,
  playerId: string,
  displayName: string,
): { ok: boolean; error?: string } {
  if (state.phase !== 'lobby') return { ok: false, error: 'Game already started.' };
  if (state.players.some(p => p.playerId === playerId)) {
    return { ok: false, error: 'You have already joined.' };
  }
  if (state.players.length >= 4) {
    return { ok: false, error: 'The game is full (4 players max).' };
  }
  state.players.push({
    playerId,
    displayName,
    failures: 0,
    successes: 0,
    passed: false,
    eliminated: false,
  });
  if (!state.hostPlayerId) state.hostPlayerId = playerId;
  return { ok: true };
}

export function startGame(
  state: GameState,
  playerId: string,
): { ok: boolean; error?: string } {
  if (playerId !== state.hostPlayerId) return { ok: false, error: 'Only the host can start the game.' };
  if (state.players.length < 2) return { ok: false, error: 'Need at least 2 players to start.' };
  if (state.phase !== 'lobby') return { ok: false, error: 'Game already started.' };
  state.players = fisherYates(state.players);
  startRound(state, 'warrior');
  return { ok: true };
}

// ── Round setup ───────────────────────────────────────────────────────────────

function startRound(state: GameState, adventurerName: string): void {
  const adv = ADVENTURERS[adventurerName.toLowerCase()];
  state.adventurerName = adventurerName.toLowerCase();
  state.availableEquipment = adv.equipment.map(e => e.name);
  state.monsterDeck = fisherYates(makeMonsterDeck().map(serializeMonster));
  state.dungeonPile = [];
  state.pendingDraw = null;
  state.dungeonRunnerId = null;
  state.currentPlayerIndex = 0;
  state.phase = 'bidding';
  for (const p of state.players) p.passed = false;
}

export function newRound(
  state: GameState,
  adventurerName: string,
): { ok: boolean; error?: string } {
  if (!ADVENTURER_NAMES.includes(adventurerName.toLowerCase())) {
    return { ok: false, error: `Unknown adventurer. Choose from: ${ADVENTURER_NAMES.join(', ')}` };
  }
  startRound(state, adventurerName);
  return { ok: true };
}

// ── Bidding phase ─────────────────────────────────────────────────────────────

export function beginTurn(
  state: GameState,
): { monster: Monster | null; deckEmpty: boolean } {
  if (!state.monsterDeck.length) {
    return { monster: null, deckEmpty: true };
  }
  const raw = state.monsterDeck.pop()!;
  state.pendingDraw = raw;
  return { monster: deserializeMonster(raw), deckEmpty: false };
}

function checkBiddingTurn(state: GameState, playerId: string): { ok: boolean; error?: string } {
  if (state.phase !== 'bidding') return { ok: false, error: 'Not in the bidding phase.' };
  const cp = currentPlayer(state);
  if (!cp || cp.playerId !== playerId) return { ok: false, error: "It's not your turn." };
  return { ok: true };
}

export function addToDungeon(
  state: GameState,
  playerId: string,
): { ok: boolean; error?: string; dungeonSize?: number; equipmentRemaining?: number } {
  const check = checkBiddingTurn(state, playerId);
  if (!check.ok) return check;
  if (!state.pendingDraw) return { ok: false, error: 'No pending draw to place.' };

  state.dungeonPile.push(state.pendingDraw);
  state.pendingDraw = null;
  const dungeonSize = state.dungeonPile.length;
  const equipmentRemaining = state.availableEquipment.length;
  advanceTurn(state);
  return { ok: true, dungeonSize, equipmentRemaining };
}

export function discardWithEquipment(
  state: GameState,
  playerId: string,
  equipmentName: string,
): { ok: boolean; error?: string; equipment?: Equipment; monster?: Monster; dungeonSize?: number; equipmentRemaining?: number } {
  const check = checkBiddingTurn(state, playerId);
  if (!check.ok) return check;
  if (!state.pendingDraw) return { ok: false, error: 'No pending draw to discard.' };
  if (!state.availableEquipment.length) {
    return { ok: false, error: 'No equipment left — you must add the monster to the dungeon.' };
  }

  const equipment = findEquipmentInList(state.availableEquipment, equipmentName);
  if (!equipment) {
    return { ok: false, error: `Equipment not found. Available: ${state.availableEquipment.join(', ')}` };
  }

  const monster = deserializeMonster(state.pendingDraw);
  state.availableEquipment = state.availableEquipment.filter(n => n !== equipment.name);
  state.pendingDraw = null;
  const dungeonSize = state.dungeonPile.length;
  const equipmentRemaining = state.availableEquipment.length;
  advanceTurn(state);
  return { ok: true, equipment, monster, dungeonSize, equipmentRemaining };
}

export function usePolymorph(
  state: GameState,
  playerId: string,
): { ok: boolean; error?: string; monster?: Monster } {
  const check = checkBiddingTurn(state, playerId);
  if (!check.ok) return check;
  if (!state.pendingDraw) return { ok: false, error: 'No pending draw to polymorph.' };
  if (!state.availableEquipment.includes('Polymorph')) {
    return { ok: false, error: 'Polymorph is not available.' };
  }
  if (!state.monsterDeck.length) {
    return { ok: false, error: 'Monster deck is empty — cannot use Polymorph.' };
  }

  // Shuffle current card back into deck at a random position
  const insertAt = randomInt(0, state.monsterDeck.length);
  state.monsterDeck.splice(insertAt, 0, state.pendingDraw);
  const newRaw = state.monsterDeck.pop()!;
  state.pendingDraw = newRaw;
  return { ok: true, monster: deserializeMonster(newRaw) };
}

export function passPlayer(
  state: GameState,
  playerId: string,
): { ok: boolean; error?: string; biddingOver?: boolean } {
  const check = checkBiddingTurn(state, playerId);
  if (!check.ok) return check;

  const player = getPlayer(state, playerId)!;
  player.passed = true;
  state.pendingDraw = null;

  const remaining = activePlayers(state);
  if (remaining.length === 1) {
    state.dungeonRunnerId = remaining[0].playerId;
    return { ok: true, biddingOver: true };
  }
  advanceTurn(state);
  return { ok: true, biddingOver: false };
}

// ── Dungeon phase ─────────────────────────────────────────────────────────────

export function startDungeonPhase(
  state: GameState,
): { hp: number; equipment: string[]; dungeonSize: number; needsVorpalChoice: boolean } {
  state.phase = 'dungeon';
  state.dungeonEquipment = [...state.availableEquipment];
  state.healingPotionUsed = false;
  state.vorpalTarget = null;
  state.vorpalAxeUsed = false;
  state.vorpalAxeQueued = false;
  state.axeDecisionPending = false;
  state.ringOfPowerBonus = 0;
  state.demonicPactTriggered = false;

  const adv = ADVENTURERS[state.adventurerName];
  const equipment = resolveEquipment(state.dungeonEquipment);
  let hp = adv.baseHp + equipment.reduce((sum, e) => sum + e.hpBonus, 0);
  state.dungeonHp = hp;

  state.dungeonMonsterQueue = [...state.dungeonPile];
  state.dungeonMonsterIndex = 0;

  const needsVorpalChoice = equipment.some(
    e => e.special === 'vorpal_sword' || e.special === 'vorpal_dagger',
  );

  return { hp: state.dungeonHp, equipment: state.dungeonEquipment, dungeonSize: state.dungeonMonsterQueue.length, needsVorpalChoice };
}

export function setVorpalTarget(
  state: GameState,
  monsterName: string,
): { ok: boolean; error?: string } {
  const valid = makeMonsterDeck().map(m => m.name.toLowerCase());
  if (!valid.includes(monsterName.toLowerCase())) {
    return { ok: false, error: `Unknown monster type: ${monsterName}` };
  }
  // Capitalise first letter to match stored names
  state.vorpalTarget = monsterName.charAt(0).toUpperCase() + monsterName.slice(1).toLowerCase();
  return { ok: true };
}

export function peekNextMonster(state: GameState): Monster | null {
  if (state.dungeonMonsterIndex >= state.dungeonMonsterQueue.length) return null;
  return deserializeMonster(state.dungeonMonsterQueue[state.dungeonMonsterIndex]);
}

function findDefeatingEquipment(state: GameState, monster: Monster): Equipment | null {
  const equipment = resolveEquipment(state.dungeonEquipment);
  for (const eq of equipment) {
    if (equipmentDefeats(state, eq, monster)) return eq;
  }
  return null;
}

function equipmentDefeats(state: GameState, eq: Equipment, monster: Monster): boolean {
  const s: SpecialEffect = eq.special;
  if (s === 'torch') return monster.strength <= 3;
  if (s === 'dragon_spear') return monster.name === 'Dragon';
  if (s === 'holy_grail') return monster.strength % 2 === 0;
  if (s === 'war_hammer') return monster.name === 'Golem';
  if (s === 'vorpal_sword' || s === 'vorpal_dagger') {
    return state.vorpalTarget !== null && monster.name === state.vorpalTarget;
  }
  if (s === 'vorpal_axe') return state.vorpalAxeQueued;
  if (s === 'ring_of_power') return monster.strength <= 2;
  if (s === 'invisibility_cloak') return monster.strength >= 6;
  if (s === 'demonic_pact') return monster.name === 'Demon';
  return false;
}

function findEquipmentBySpecial(state: GameState, special: SpecialEffect): Equipment | null {
  return resolveEquipment(state.dungeonEquipment).find(e => e.special === special) ?? null;
}

export function useVorpalAxe(state: GameState): { ok: boolean; error?: string } {
  const eq = findEquipmentBySpecial(state, 'vorpal_axe');
  if (!eq) return { ok: false, error: 'Vorpal Axe not available.' };
  state.vorpalAxeQueued = true;
  return { ok: true };
}

export function revealNextMonster(state: GameState): DungeonResult | null {
  if (state.dungeonMonsterIndex >= state.dungeonMonsterQueue.length) return null;

  const monster = deserializeMonster(state.dungeonMonsterQueue[state.dungeonMonsterIndex]);
  state.dungeonMonsterIndex++;
  state.vorpalAxeUsed = false;
  state.axeDecisionPending = false;

  let equipmentUsed = findDefeatingEquipment(state, monster);
  state.vorpalAxeQueued = false; // reset after _findDefeatingEquipment reads it

  const hpBefore = state.dungeonHp;
  let healed = false;
  let healHp = 0;
  let hpLost = 0;

  if (equipmentUsed) {
    if (equipmentUsed.special === 'ring_of_power') {
      state.ringOfPowerBonus += monster.strength;
      state.dungeonHp += monster.strength;
    } else if (equipmentUsed.special === 'demonic_pact') {
      state.demonicPactTriggered = true;
    }
    if (equipmentUsed.special === 'vorpal_axe') {
      state.dungeonEquipment = state.dungeonEquipment.filter(n => n !== 'Vorpal Axe');
    }
  } else {
    hpLost = monster.strength;
    state.dungeonHp -= hpLost;

    const healingEq = findEquipmentBySpecial(state, 'healing_potion');
    if (state.dungeonHp <= 0 && healingEq && !state.healingPotionUsed) {
      state.healingPotionUsed = true;
      state.dungeonEquipment = state.dungeonEquipment.filter(n => n !== 'Healing Potion');
      state.dungeonHp = hpBefore;
      healed = true;
      healHp = hpBefore;
    }
  }

  // Demonic Pact: if previous monster was Demon, this one is also defeated
  if (state.demonicPactTriggered && !equipmentUsed) {
    state.demonicPactTriggered = false;
    const pactEq = findEquipmentBySpecial(state, 'demonic_pact');
    if (pactEq) {
      state.dungeonHp += hpLost;
      hpLost = 0;
      equipmentUsed = pactEq; // show as "defeated by Demonic Pact" in the log
    }
  }

  return {
    monster,
    hpLost,
    equipmentUsed: equipmentUsed ?? null,
    hpBefore,
    hpAfter: state.dungeonHp,
    healed,
    healHp,
  };
}

function checkOmnipotence(state: GameState): boolean {
  if (!findEquipmentBySpecial(state, 'omnipotence')) return false;
  const names = state.dungeonMonsterQueue.map(s => deserializeMonster(s).name);
  return new Set(names).size === names.length;
}

export function resolveDungeon(state: GameState): RoundEndResult {
  const runner = getPlayer(state, state.dungeonRunnerId!)!;
  const success = state.dungeonHp > 0 || checkOmnipotence(state);

  const eliminatedIds: string[] = [];
  let winnerId: string | null = null;

  if (success) {
    runner.successes++;
    if (runner.successes >= 2) winnerId = runner.playerId;
  } else {
    runner.failures++;
    if (runner.failures >= 2) {
      runner.eliminated = true;
      eliminatedIds.push(runner.playerId);
    }
  }

  const alive = state.players.filter(p => !p.eliminated);
  if (alive.length === 1 && !winnerId) winnerId = alive[0].playerId;

  if (winnerId) state.phase = 'ended';

  return { runnerId: runner.playerId, success, hpRemaining: state.dungeonHp, eliminatedIds, winnerId };
}

// ── Public state projection ───────────────────────────────────────────────────

export function toPublicState(state: GameState): PublicGameState {
  const cp = currentPlayer(state);
  const equipment = resolveEquipment(state.dungeonEquipment);
  const needsVorpalChoice =
    state.phase === 'dungeon' &&
    !state.vorpalTarget &&
    equipment.some(e => e.special === 'vorpal_sword' || e.special === 'vorpal_dagger');

  return {
    roomCode: state.roomCode,
    phase: state.phase,
    hostPlayerId: state.hostPlayerId,
    players: state.players,
    adventurerName: state.adventurerName,
    availableEquipmentCount: state.availableEquipment.length,
    availableEquipmentNames: state.availableEquipment,
    dungeonPileSize: state.dungeonPile.length,
    currentPlayerId: cp?.playerId ?? null,
    dungeonRunnerId: state.dungeonRunnerId,
    dungeonHp: state.dungeonHp,
    dungeonEquipment: state.dungeonEquipment,
    dungeonMonsterQueueSize: state.dungeonMonsterQueue.length,
    dungeonMonsterIndex: state.dungeonMonsterIndex,
    axeDecisionPending: state.axeDecisionPending,
    vorpalTarget: state.vorpalTarget,
    needsVorpalChoice,
  };
}

/** Determine which equipment names in a list would defeat a given monster (for PRIVATE_DRAW hint). */
export function defeatingEquipmentNames(equipmentNames: string[], monster: Monster, vorpalTarget: string | null): string[] {
  return equipmentNames.filter(name => {
    const eq = findEquipmentByName(name);
    if (!eq) return false;
    const s = eq.special;
    if (s === 'torch') return monster.strength <= 3;
    if (s === 'dragon_spear') return monster.name === 'Dragon';
    if (s === 'holy_grail') return monster.strength % 2 === 0;
    if (s === 'war_hammer') return monster.name === 'Golem';
    if (s === 'vorpal_sword' || s === 'vorpal_dagger') return vorpalTarget !== null && monster.name === vorpalTarget;
    if (s === 'vorpal_axe') return true; // runner can always choose to use axe
    if (s === 'ring_of_power') return monster.strength <= 2;
    if (s === 'invisibility_cloak') return monster.strength >= 6;
    if (s === 'demonic_pact') return monster.name === 'Demon';
    return false;
  });
}
