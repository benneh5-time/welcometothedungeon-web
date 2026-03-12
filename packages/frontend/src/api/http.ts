import type { PublicGameState } from '@wttd/shared';

const BASE = import.meta.env.VITE_HTTP_API_URL ?? 'http://localhost:3001';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Request failed');
  return data as T;
}

export const api = {
  createRoom: (playerId: string, displayName: string) =>
    post<{ roomCode: string }>('/rooms', { playerId, displayName }),

  joinRoom: (code: string, playerId: string, displayName: string, spectator = false) =>
    post<{ ok: boolean; reconnected?: boolean; spectator?: boolean; state: PublicGameState }>(
      `/rooms/${code}/join`, { playerId, displayName, spectator },
    ),

  startGame: (code: string, playerId: string) =>
    post<{ ok: boolean }>(`/rooms/${code}/start`, { playerId }),

  getState: (code: string) =>
    get<PublicGameState>(`/rooms/${code}/state`),

  biddingAction: (
    code: string,
    playerId: string,
    action: 'dungeon' | 'discard' | 'pass' | 'polymorph',
    equipmentName?: string,
  ) => post<{ ok: boolean; deckEmpty?: boolean }>(`/rooms/${code}/bidding/action`, { playerId, action, equipmentName }),

  vorpalTarget: (code: string, playerId: string, monsterName: string) =>
    post<{ ok: boolean }>(`/rooms/${code}/dungeon/action`, { playerId, action: 'vorpal-target', monsterName }),

  revealNext: (code: string, playerId: string) =>
    post<{ ok: boolean; axeDecisionRequired?: boolean }>(`/rooms/${code}/dungeon/action`, { playerId, action: 'reveal-next' }),

  axeDecision: (code: string, playerId: string, use: boolean) =>
    post<{ ok: boolean }>(`/rooms/${code}/dungeon/action`, { playerId, action: use ? 'axe-use' : 'axe-skip' }),

  newRound: (code: string, playerId: string, adventurerName: string) =>
    post<{ ok: boolean }>(`/rooms/${code}/new-round`, { playerId, adventurerName }),
};
