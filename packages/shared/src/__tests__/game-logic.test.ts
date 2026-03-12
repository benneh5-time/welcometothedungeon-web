import { describe, it, expect } from 'vitest';
import type { GameState, Monster } from '../types.js';
import {
  createGameState,
  addPlayer,
  startGame,
  beginTurn,
  addToDungeon,
  discardWithEquipment,
  passPlayer,
  usePolymorph,
  startDungeonPhase,
  setVorpalTarget,
  peekNextMonster,
  revealNextMonster,
  useVorpalAxe,
  resolveDungeon,
  newRound,
} from '../game-logic.js';
import { ADVENTURERS, serializeMonster } from '../data.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeGame(numPlayers = 2): GameState {
  const state = createGameState('TEST1');
  for (let i = 0; i < numPlayers; i++) {
    addPlayer(state, `player${i + 1}`, `Player${i + 1}`);
  }
  // Force deterministic player order
  state.players.sort((a, b) => a.playerId.localeCompare(b.playerId));
  state.hostPlayerId = state.players[0].playerId;
  startRound(state, 'warrior');
  return state;
}

function startRound(state: GameState, adventurerName: string): void {
  const adv = ADVENTURERS[adventurerName];
  state.adventurerName = adventurerName;
  state.availableEquipment = adv.equipment.map(e => e.name);
  // Fixed deck order so tests are deterministic (no shuffle)
  state.monsterDeck = [
    'Goblin:1', 'Goblin:1', 'Skeleton:2', 'Skeleton:2',
    'Orc:3', 'Orc:3', 'Vampire:4', 'Vampire:4',
    'Golem:5', 'Golem:5', 'Lich:6', 'Demon:7', 'Dragon:9',
  ];
  state.dungeonPile = [];
  state.pendingDraw = null;
  state.dungeonRunnerId = null;
  state.currentPlayerIndex = 0;
  state.phase = 'bidding';
  for (const p of state.players) p.passed = false;
}

function drainBidding(state: GameState, winnerIndex = 0): void {
  const winnerId = state.players[winnerIndex].playerId;
  for (const p of state.players) {
    if (p.playerId !== winnerId) p.passed = true;
  }
  while (state.monsterDeck.length) {
    beginTurn(state);
    addToDungeon(state, winnerId);
  }
  state.dungeonRunnerId = winnerId;
}

function beginDungeon(state: GameState, monsters?: Monster[]): ReturnType<typeof startDungeonPhase> {
  state.dungeonRunnerId = state.players[0].playerId;
  const info = startDungeonPhase(state);
  if (monsters !== undefined) {
    state.dungeonMonsterQueue = monsters.map(serializeMonster);
    state.dungeonMonsterIndex = 0;
  }
  return info;
}

function gameWithMonsters(adventurer: string, monsters: Monster[]): GameState {
  const state = makeGame(2);
  startRound(state, adventurer);
  drainBidding(state);
  beginDungeon(state, monsters);
  return state;
}

function runDungeon(monsters: Monster[], adventurer = 'warrior', stripEquipment = true): { state: GameState; result: ReturnType<typeof resolveDungeon> } {
  const state = makeGame(2);
  startRound(state, adventurer);
  if (stripEquipment) state.availableEquipment = [];
  drainBidding(state);
  beginDungeon(state, monsters);
  while (peekNextMonster(state)) revealNextMonster(state);
  const result = resolveDungeon(state);
  return { state, result };
}

// ── 1. Lobby ──────────────────────────────────────────────────────────────────

describe('Lobby', () => {
  it('first player becomes host', () => {
    const state = createGameState('ABC123');
    addPlayer(state, 'p1', 'Alice');
    expect(state.hostPlayerId).toBe('p1');
  });

  it('join success', () => {
    const state = createGameState('ABC123');
    const result = addPlayer(state, 'p1', 'Alice');
    expect(result.ok).toBe(true);
  });

  it('duplicate join rejected', () => {
    const state = createGameState('ABC123');
    addPlayer(state, 'p1', 'Alice');
    const result = addPlayer(state, 'p1', 'Alice');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already joined/i);
  });

  it('full game rejected', () => {
    const state = createGameState('ABC123');
    for (let i = 0; i < 4; i++) addPlayer(state, `p${i}`, `P${i}`);
    const result = addPlayer(state, 'p99', 'Extra');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/full/i);
  });

  it('join after game started rejected', () => {
    const state = makeGame(2);
    const result = addPlayer(state, 'p99', 'Late');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/already started/i);
  });

  it('non-host cannot start', () => {
    const state = createGameState('ABC123');
    addPlayer(state, 'alice', 'Alice');
    addPlayer(state, 'bob', 'Bob');
    const result = startGame(state, 'bob');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/host/i);
  });

  it('start with one player rejected', () => {
    const state = createGameState('ABC123');
    addPlayer(state, 'alice', 'Alice');
    const result = startGame(state, 'alice');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/2/);
  });

  it('start game transitions to bidding', () => {
    const state = createGameState('ABC123');
    addPlayer(state, 'alice', 'Alice');
    addPlayer(state, 'bob', 'Bob');
    const result = startGame(state, 'alice');
    expect(result.ok).toBe(true);
    expect(state.phase).toBe('bidding');
  });
});

// ── 2. Bidding ────────────────────────────────────────────────────────────────

describe('Bidding', () => {
  it('beginTurn draws monster', () => {
    const state = makeGame(2);
    const { monster, deckEmpty } = beginTurn(state);
    expect(monster).not.toBeNull();
    expect(deckEmpty).toBe(false);
    expect(state.pendingDraw).not.toBeNull();
  });

  it('beginTurn with empty deck', () => {
    const state = makeGame(2);
    state.monsterDeck = [];
    const { monster, deckEmpty } = beginTurn(state);
    expect(monster).toBeNull();
    expect(deckEmpty).toBe(true);
  });

  it('addToDungeon works', () => {
    const state = makeGame(2);
    beginTurn(state);
    const currentId = state.players[state.currentPlayerIndex % state.players.length].playerId;
    const result = addToDungeon(state, currentId);
    expect(result.ok).toBe(true);
    expect(result.dungeonSize).toBe(1);
  });

  it('wrong player cannot dungeon', () => {
    const state = makeGame(2);
    beginTurn(state);
    const currentId = state.players[state.currentPlayerIndex % state.players.length].playerId;
    const wrongId = state.players.find(p => p.playerId !== currentId)!.playerId;
    const result = addToDungeon(state, wrongId);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not your turn/i);
  });

  it('discard with equipment', () => {
    const state = makeGame(2);
    beginTurn(state);
    const currentId = state.players[state.currentPlayerIndex % state.players.length].playerId;
    const result = discardWithEquipment(state, currentId, 'Plate Armour');
    expect(result.ok).toBe(true);
    expect(result.equipment?.name).toBe('Plate Armour');
    expect(result.dungeonSize).toBe(0);
  });

  it('discard unknown equipment rejected', () => {
    const state = makeGame(2);
    beginTurn(state);
    const currentId = state.players[state.currentPlayerIndex % state.players.length].playerId;
    const result = discardWithEquipment(state, currentId, 'Magic Wand');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('discard with no equipment rejected', () => {
    const state = makeGame(2);
    state.availableEquipment = [];
    beginTurn(state);
    const currentId = state.players[state.currentPlayerIndex % state.players.length].playerId;
    const result = discardWithEquipment(state, currentId, 'Plate Armour');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/no equipment/i);
  });

  it('pass marks player passed', () => {
    const state = makeGame(2);
    beginTurn(state);
    const currentId = state.players[state.currentPlayerIndex % state.players.length].playerId;
    passPlayer(state, currentId);
    expect(state.players.find(p => p.playerId === currentId)!.passed).toBe(true);
  });

  it('last pass ends bidding (2 players)', () => {
    const state = makeGame(2);
    beginTurn(state);
    const currentId = state.players[state.currentPlayerIndex % state.players.length].playerId;
    const result = passPlayer(state, currentId);
    expect(result.ok).toBe(true);
    expect(result.biddingOver).toBe(true);
    expect(state.dungeonRunnerId).not.toBeNull();
  });

  it('pass with 3 players does not end bidding', () => {
    const state = makeGame(3);
    beginTurn(state);
    const currentId = state.players[state.currentPlayerIndex % state.players.length].playerId;
    const result = passPlayer(state, currentId);
    expect(result.ok).toBe(true);
    expect(result.biddingOver).toBe(false);
  });

  it('polymorph swaps pending draw (mage)', () => {
    const state = makeGame(2);
    startRound(state, 'mage');
    beginTurn(state);
    const currentId = state.players[state.currentPlayerIndex % state.players.length].playerId;
    const result = usePolymorph(state, currentId);
    expect(result.ok).toBe(true);
    expect(result.monster).not.toBeNull();
  });

  it('polymorph without equipment rejected (warrior)', () => {
    const state = makeGame(2);
    beginTurn(state);
    const currentId = state.players[state.currentPlayerIndex % state.players.length].playerId;
    const result = usePolymorph(state, currentId);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not available/i);
  });

  it('polymorph with empty deck rejected', () => {
    const state = makeGame(2);
    startRound(state, 'mage');
    state.monsterDeck = [];
    state.pendingDraw = serializeMonster({ name: 'Goblin', strength: 1 });
    const currentId = state.players[state.currentPlayerIndex % state.players.length].playerId;
    const result = usePolymorph(state, currentId);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });
});

// ── 3. Dungeon setup ──────────────────────────────────────────────────────────

describe('Dungeon setup', () => {
  it('HP calculated correctly for warrior (all equipment)', () => {
    const state = makeGame(2);
    drainBidding(state);
    const info = startDungeonPhase(state);
    // Warrior base 3 + Plate Armour 5 + Knight Shield 3 = 11
    expect(info.hp).toBe(11);
  });

  it('HP reduced when equipment sacrificed', () => {
    const state = makeGame(2);
    state.availableEquipment = state.availableEquipment.filter(n => n !== 'Plate Armour');
    drainBidding(state);
    const info = startDungeonPhase(state);
    expect(info.hp).toBe(6); // Warrior 3 + Knight Shield 3
  });

  it('vorpal choice flagged for warrior', () => {
    const state = makeGame(2);
    drainBidding(state);
    const info = startDungeonPhase(state);
    expect(info.needsVorpalChoice).toBe(true);
  });

  it('no vorpal choice when no vorpal equipment', () => {
    const state = makeGame(2);
    state.availableEquipment = state.availableEquipment.filter(
      n => n !== 'Vorpal Sword' && n !== 'Vorpal Dagger',
    );
    drainBidding(state);
    const info = startDungeonPhase(state);
    expect(info.needsVorpalChoice).toBe(false);
  });
});

// ── 4. Monster resolution ─────────────────────────────────────────────────────

describe('Monster resolution', () => {
  it('undefeated monster deals damage', () => {
    const state = makeGame(2);
    startRound(state, 'warrior');
    state.availableEquipment = [];
    drainBidding(state);
    beginDungeon(state, [{ name: 'Orc', strength: 3 }]);
    const hpBefore = state.dungeonHp;
    const result = revealNextMonster(state)!;
    expect(result.hpLost).toBe(3);
    expect(state.dungeonHp).toBe(hpBefore - 3);
  });

  it('Torch defeats str <= 3', () => {
    const state = gameWithMonsters('warrior', [{ name: 'Orc', strength: 3 }]);
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed?.special).toBe('torch');
    expect(result.hpLost).toBe(0);
  });

  it('Torch does not defeat str 4', () => {
    const state = gameWithMonsters('warrior', [{ name: 'Vampire', strength: 4 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Torch');
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed).toBeNull();
    expect(result.hpLost).toBe(4);
  });

  it('Dragon Spear defeats Dragon', () => {
    const state = gameWithMonsters('warrior', [{ name: 'Dragon', strength: 9 }]);
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed?.special).toBe('dragon_spear');
  });

  it('Dragon Spear does not defeat non-Dragon', () => {
    const state = makeGame(2);
    startRound(state, 'warrior');
    state.availableEquipment = ['Dragon Spear'];
    drainBidding(state);
    beginDungeon(state, [{ name: 'Goblin', strength: 1 }]);
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed).toBeNull();
  });

  it('Holy Grail defeats even-strength', () => {
    const state = gameWithMonsters('warrior', [{ name: 'Vampire', strength: 4 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Holy Grail');
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed?.special).toBe('holy_grail');
  });

  it('Holy Grail does not defeat odd-strength', () => {
    const state = gameWithMonsters('warrior', [{ name: 'Orc', strength: 3 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Holy Grail');
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed).toBeNull();
  });

  it('Vorpal Sword defeats chosen type', () => {
    const state = gameWithMonsters('warrior', [{ name: 'Goblin', strength: 1 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Vorpal Sword');
    setVorpalTarget(state, 'Goblin');
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed?.special).toBe('vorpal_sword');
  });

  it('Vorpal Sword does not defeat unchosen type', () => {
    const state = gameWithMonsters('warrior', [{ name: 'Orc', strength: 3 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Vorpal Sword');
    setVorpalTarget(state, 'Goblin');
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed).toBeNull();
  });

  it('Vorpal target invalid monster rejected', () => {
    const state = makeGame(2);
    const result = setVorpalTarget(state, 'FakeMonster');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown/i);
  });

  it('Vorpal Axe queued defeats monster', () => {
    const state = gameWithMonsters('barbarian', [{ name: 'Demon', strength: 7 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Vorpal Axe');
    useVorpalAxe(state);
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed?.special).toBe('vorpal_axe');
  });

  it('Vorpal Axe not queued does not defeat', () => {
    const state = gameWithMonsters('barbarian', [{ name: 'Demon', strength: 7 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Vorpal Axe');
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed).toBeNull();
    expect(result.hpLost).toBe(7);
  });

  it('Vorpal Axe removed after use', () => {
    const state = gameWithMonsters('barbarian', [{ name: 'Goblin', strength: 1 }, { name: 'Goblin', strength: 1 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Vorpal Axe');
    useVorpalAxe(state);
    revealNextMonster(state);
    expect(state.dungeonEquipment.includes('Vorpal Axe')).toBe(false);
  });

  it('War Hammer defeats Golem', () => {
    const state = gameWithMonsters('barbarian', [{ name: 'Golem', strength: 5 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'War Hammer');
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed?.special).toBe('war_hammer');
  });

  it('War Hammer does not defeat non-Golem', () => {
    const state = gameWithMonsters('barbarian', [{ name: 'Dragon', strength: 9 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'War Hammer');
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed).toBeNull();
  });

  it('Healing Potion triggers at zero HP', () => {
    const state = gameWithMonsters('barbarian', [{ name: 'Dragon', strength: 9 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Healing Potion');
    state.dungeonHp = 5;
    const result = revealNextMonster(state)!;
    expect(result.healed).toBe(true);
    expect(state.dungeonHp).toBe(5);
  });

  it('Healing Potion does not trigger when HP positive', () => {
    const state = gameWithMonsters('barbarian', [{ name: 'Goblin', strength: 1 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Healing Potion');
    state.dungeonHp = 10;
    const result = revealNextMonster(state)!;
    expect(result.healed).toBe(false);
    expect(state.dungeonHp).toBe(9);
  });

  it('Healing Potion only triggers once', () => {
    const state = gameWithMonsters('barbarian', [{ name: 'Dragon', strength: 9 }, { name: 'Dragon', strength: 9 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Healing Potion');
    state.dungeonHp = 5;
    revealNextMonster(state);
    expect(state.healingPotionUsed).toBe(true);
    state.dungeonHp = 1;
    const result2 = revealNextMonster(state)!;
    expect(result2.healed).toBe(false);
    expect(state.dungeonHp).toBeLessThanOrEqual(0);
  });

  it('Ring of Power defeats weak and adds HP', () => {
    const state = gameWithMonsters('rogue', [{ name: 'Goblin', strength: 1 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Ring of Power');
    const hpBefore = state.dungeonHp;
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed?.special).toBe('ring_of_power');
    expect(state.dungeonHp).toBe(hpBefore + 1);
  });

  it('Ring of Power does not defeat str 3', () => {
    const state = gameWithMonsters('rogue', [{ name: 'Orc', strength: 3 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Ring of Power');
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed).toBeNull();
  });

  it('Invisibility Cloak defeats str >= 6', () => {
    const state = gameWithMonsters('rogue', [{ name: 'Lich', strength: 6 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Invisibility Cloak');
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed?.special).toBe('invisibility_cloak');
  });

  it('Invisibility Cloak does not defeat str 5', () => {
    const state = gameWithMonsters('rogue', [{ name: 'Golem', strength: 5 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Invisibility Cloak');
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed).toBeNull();
  });

  it('Demonic Pact defeats Demon and next monster', () => {
    const state = gameWithMonsters('mage', [{ name: 'Demon', strength: 7 }, { name: 'Dragon', strength: 9 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Demonic Pact');
    const result1 = revealNextMonster(state)!;
    expect(result1.equipmentUsed?.special).toBe('demonic_pact');
    const result2 = revealNextMonster(state)!;
    expect(result2.hpLost).toBe(0);
  });

  it('Demonic Pact does not defeat non-Demon', () => {
    const state = gameWithMonsters('mage', [{ name: 'Dragon', strength: 9 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Demonic Pact');
    const result = revealNextMonster(state)!;
    expect(result.equipmentUsed).toBeNull();
  });

  it('Omnipotence wins at zero HP with unique monsters', () => {
    const state = gameWithMonsters('mage', [{ name: 'Dragon', strength: 9 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Omnipotence');
    state.dungeonHp = 1;
    revealNextMonster(state);
    expect(state.dungeonHp).toBeLessThanOrEqual(0);
    // Omnipotence check happens in resolveDungeon — verify success
    const result = resolveDungeon(state);
    expect(result.success).toBe(true);
  });

  it('Omnipotence fails with duplicate monsters', () => {
    const state = gameWithMonsters('mage', [{ name: 'Goblin', strength: 1 }, { name: 'Goblin', strength: 1 }]);
    state.dungeonEquipment = state.dungeonEquipment.filter(n => n === 'Omnipotence');
    state.dungeonHp = 1;
    revealNextMonster(state);
    revealNextMonster(state);
    const result = resolveDungeon(state);
    expect(result.success).toBe(false);
  });

  it('revealNextMonster returns null when dungeon exhausted', () => {
    const state = makeGame(2);
    startRound(state, 'warrior');
    drainBidding(state);
    beginDungeon(state, []);
    expect(revealNextMonster(state)).toBeNull();
  });
});

// ── 5. Dungeon resolution & win/lose ─────────────────────────────────────────

describe('Dungeon resolution', () => {
  it('success when HP positive', () => {
    const { result } = runDungeon([]);
    expect(result.success).toBe(true);
    expect(result.hpRemaining).toBeGreaterThan(0);
  });

  it('failure when HP zero', () => {
    const { result } = runDungeon([{ name: 'Dragon', strength: 9 }]);
    expect(result.success).toBe(false);
  });

  it('success increments successes', () => {
    const { state, result } = runDungeon([]);
    const runner = state.players.find(p => p.playerId === result.runnerId)!;
    expect(runner.successes).toBe(1);
  });

  it('failure increments failures', () => {
    const { state, result } = runDungeon([{ name: 'Dragon', strength: 9 }]);
    const runner = state.players.find(p => p.playerId === result.runnerId)!;
    expect(runner.failures).toBe(1);
  });

  it('two successes triggers win', () => {
    const state = makeGame(2);
    state.players[0].successes = 1;
    startRound(state, 'warrior');
    state.availableEquipment = [];
    drainBidding(state);
    beginDungeon(state, []);
    while (peekNextMonster(state)) revealNextMonster(state);
    const result = resolveDungeon(state);
    expect(result.winnerId).toBe(state.players[0].playerId);
    expect(state.phase).toBe('ended');
  });

  it('two failures eliminates player', () => {
    const state = makeGame(2);
    state.players[0].failures = 1;
    startRound(state, 'warrior');
    state.availableEquipment = [];
    drainBidding(state);
    beginDungeon(state, [{ name: 'Dragon', strength: 9 }]);
    while (peekNextMonster(state)) revealNextMonster(state);
    const result = resolveDungeon(state);
    expect(result.eliminatedIds).toContain(state.players[0].playerId);
    expect(state.players[0].eliminated).toBe(true);
  });

  it('last player standing wins', () => {
    const state = makeGame(2);
    state.players[1].eliminated = true;
    startRound(state, 'warrior');
    state.availableEquipment = [];
    drainBidding(state, 0);
    beginDungeon(state, [{ name: 'Dragon', strength: 9 }]);
    while (peekNextMonster(state)) revealNextMonster(state);
    const result = resolveDungeon(state);
    expect(result.winnerId).toBe(state.players[0].playerId);
  });
});

// ── 6. New round ──────────────────────────────────────────────────────────────

describe('New round', () => {
  it('new round with valid adventurer', () => {
    const state = makeGame(2);
    const result = newRound(state, 'barbarian');
    expect(result.ok).toBe(true);
    expect(state.adventurerName).toBe('barbarian');
    expect(state.phase).toBe('bidding');
  });

  it('new round with invalid adventurer rejected', () => {
    const state = makeGame(2);
    const result = newRound(state, 'wizard');
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown/i);
  });

  it('new round resets passed flags', () => {
    const state = makeGame(2);
    for (const p of state.players) p.passed = true;
    newRound(state, 'rogue');
    expect(state.players.every(p => !p.passed)).toBe(true);
  });

  it('new round gives fresh deck of 13', () => {
    const state = makeGame(2);
    newRound(state, 'warrior');
    expect(state.monsterDeck.length).toBe(13);
  });
});
