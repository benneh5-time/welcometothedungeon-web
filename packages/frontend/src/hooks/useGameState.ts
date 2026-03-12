import { useEffect, useReducer, useRef } from 'react';
import type { PublicGameState, Monster, DungeonResult, RoundEndResult, WsMessage } from '@wttd/shared';
import { GameSocket } from '../api/ws.js';
import { api } from '../api/http.js';

export interface DungeonLogEntry {
  id: number;
  result: DungeonResult;
}

export interface AxeDecisionState {
  monster: Monster;
  decisionDeadline: number;
}

export interface GameContextState {
  publicState: PublicGameState | null;
  privateCard: { monster: Monster; defeatingEquipment: string[] } | null;
  axeDecision: AxeDecisionState | null;
  dungeonLog: DungeonLogEntry[];
  error: string | null;
  connected: boolean;
}

type Action =
  | { type: 'STATE_UPDATE'; payload: PublicGameState }
  | { type: 'PRIVATE_DRAW'; payload: { monster: Monster; defeatingEquipment: string[] } }
  | { type: 'CLEAR_PRIVATE_CARD' }
  | { type: 'DUNGEON_REVEAL'; payload: { result: DungeonResult; publicState: PublicGameState } }
  | { type: 'VORPAL_AXE_DECISION'; payload: AxeDecisionState }
  | { type: 'CLEAR_AXE_DECISION' }
  | { type: 'SET_ERROR'; payload: string }
  | { type: 'CLEAR_DUNGEON_LOG' }
  | { type: 'CONNECTED' };

let logIdCounter = 0;

function reducer(state: GameContextState, action: Action): GameContextState {
  switch (action.type) {
    case 'CONNECTED':
      return { ...state, connected: true };
    case 'STATE_UPDATE':
      return { ...state, publicState: action.payload, error: null };
    case 'PRIVATE_DRAW':
      return { ...state, privateCard: action.payload };
    case 'CLEAR_PRIVATE_CARD':
      return { ...state, privateCard: null };
    case 'DUNGEON_REVEAL':
      return {
        ...state,
        publicState: action.payload.publicState,
        dungeonLog: [...state.dungeonLog, { id: logIdCounter++, result: action.payload.result }],
        axeDecision: null,
      };
    case 'VORPAL_AXE_DECISION':
      return { ...state, axeDecision: action.payload };
    case 'CLEAR_AXE_DECISION':
      return { ...state, axeDecision: null };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'CLEAR_DUNGEON_LOG':
      return { ...state, dungeonLog: [] };
    default:
      return state;
  }
}

const initial: GameContextState = {
  publicState: null,
  privateCard: null,
  axeDecision: null,
  dungeonLog: [],
  error: null,
  connected: false,
};

export function useGameState(roomCode: string | null, playerId: string) {
  const [state, dispatch] = useReducer(reducer, initial);
  const socketRef = useRef<GameSocket | null>(null);

  useEffect(() => {
    if (!roomCode) return;

    // Fetch initial state
    api.getState(roomCode)
      .then(s => dispatch({ type: 'STATE_UPDATE', payload: s }))
      .catch(() => {});

    const socket = new GameSocket(roomCode, playerId);
    socketRef.current = socket;

    const unsub = socket.onMessage((msg: WsMessage) => {
      switch (msg.type) {
        case 'GAME_STATE_UPDATE':
          dispatch({ type: 'STATE_UPDATE', payload: msg.payload as PublicGameState });
          break;
        case 'PRIVATE_DRAW':
          dispatch({ type: 'PRIVATE_DRAW', payload: msg.payload as { monster: Monster; defeatingEquipment: string[] } });
          break;
        case 'DUNGEON_STARTED':
          dispatch({ type: 'STATE_UPDATE', payload: (msg.payload as any).publicState as PublicGameState });
          dispatch({ type: 'CLEAR_DUNGEON_LOG' });
          break;
        case 'VORPAL_AXE_DECISION':
          dispatch({ type: 'VORPAL_AXE_DECISION', payload: msg.payload as AxeDecisionState });
          break;
        case 'DUNGEON_REVEAL':
          dispatch({ type: 'DUNGEON_REVEAL', payload: msg.payload as { result: DungeonResult; publicState: PublicGameState } });
          break;
        case 'ROUND_ENDED':
        case 'GAME_ENDED':
          dispatch({ type: 'STATE_UPDATE', payload: (msg.payload as any).publicState as PublicGameState });
          break;
        case 'PLAYER_JOINED':
          // Refetch full state to keep in sync
          api.getState(roomCode).then(s => dispatch({ type: 'STATE_UPDATE', payload: s })).catch(() => {});
          break;
      }
    });

    return () => {
      unsub();
      socket.destroy();
    };
  }, [roomCode, playerId]);

  const clearPrivateCard = () => dispatch({ type: 'CLEAR_PRIVATE_CARD' });
  const clearAxeDecision = () => dispatch({ type: 'CLEAR_AXE_DECISION' });

  return { ...state, clearPrivateCard, clearAxeDecision };
}
