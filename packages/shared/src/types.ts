// ── Enums ────────────────────────────────────────────────────────────────────

export type GamePhase = 'lobby' | 'bidding' | 'dungeon' | 'ended';

export type SpecialEffect =
  | 'none'
  | 'hp_bonus'
  | 'torch'
  | 'dragon_spear'
  | 'holy_grail'
  | 'vorpal_sword'
  | 'vorpal_dagger'
  | 'vorpal_axe'
  | 'war_hammer'
  | 'healing_potion'
  | 'ring_of_power'
  | 'omnipotence'
  | 'demonic_pact'
  | 'polymorph'
  | 'invisibility_cloak';

// ── Game entities ─────────────────────────────────────────────────────────────

export interface Monster {
  name: string;
  strength: number;
}

export interface Equipment {
  name: string;
  hpBonus: number;
  special: SpecialEffect;
  description: string;
}

export interface Adventurer {
  name: string;
  baseHp: number;
  equipment: Equipment[];
}

export interface Player {
  playerId: string;
  displayName: string;
  failures: number;
  successes: number;
  passed: boolean;
  eliminated: boolean;
}

// ── Game state (serialisable — stored in DynamoDB) ────────────────────────────

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  hostPlayerId: string | null;
  players: Player[];

  // Round setup
  adventurerName: string;
  availableEquipment: string[];   // equipment names remaining for bidding
  monsterDeck: string[];          // serialised as "name:strength", top = last element
  dungeonPile: string[];          // same format
  currentPlayerIndex: number;
  pendingDraw: string | null;     // "name:strength"
  dungeonRunnerId: string | null;

  // Dungeon phase
  dungeonHp: number;
  dungeonEquipment: string[];     // equipment names
  dungeonMonsterQueue: string[];  // "name:strength"
  dungeonMonsterIndex: number;
  healingPotionUsed: boolean;
  vorpalTarget: string | null;
  vorpalAxeUsed: boolean;
  vorpalAxeQueued: boolean;
  axeDecisionPending: boolean;
  ringOfPowerBonus: number;
  demonicPactTriggered: boolean;

  // Optimistic locking + TTL
  version: number;
  ttl: number;
}

// ── Results returned from game methods ────────────────────────────────────────

export interface DungeonResult {
  monster: Monster;
  hpLost: number;
  equipmentUsed: Equipment | null;
  hpBefore: number;
  hpAfter: number;
  healed: boolean;
  healHp: number;
}

export interface RoundEndResult {
  runnerId: string;
  success: boolean;
  hpRemaining: number;
  eliminatedIds: string[];
  winnerId: string | null;
}

// ── Public state broadcast to all clients (no pendingDraw) ───────────────────

export interface PublicGameState {
  roomCode: string;
  phase: GamePhase;
  hostPlayerId: string | null;
  players: Player[];
  adventurerName: string;
  availableEquipmentCount: number;
  availableEquipmentNames: string[];   // visible to all (names only)
  dungeonPileSize: number;
  currentPlayerId: string | null;
  dungeonRunnerId: string | null;
  dungeonHp: number;
  dungeonEquipment: string[];
  dungeonMonsterQueueSize: number;
  dungeonMonsterIndex: number;
  axeDecisionPending: boolean;
  vorpalTarget: string | null;
  needsVorpalChoice: boolean;
}

// ── WebSocket message shapes ──────────────────────────────────────────────────

export type WsEventType =
  | 'GAME_STATE_UPDATE'
  | 'PRIVATE_DRAW'
  | 'PLAYER_JOINED'
  | 'DUNGEON_STARTED'
  | 'VORPAL_AXE_DECISION'
  | 'DUNGEON_REVEAL'
  | 'ROUND_ENDED'
  | 'GAME_ENDED'
  | 'ERROR';

export interface WsMessage {
  type: WsEventType;
  payload: unknown;
}

export interface PrivateDrawPayload {
  monster: Monster;
  defeatingEquipment: string[];  // equipment names that defeat this monster
}

export interface VorpalAxeDecisionPayload {
  monster: Monster;
  decisionDeadline: number;  // Unix ms timestamp
}
