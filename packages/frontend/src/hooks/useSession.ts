import { useState } from 'react';

function uuid(): string {
  return crypto.randomUUID();
}

function load(key: string, fallback: () => string): string {
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  const val = fallback();
  localStorage.setItem(key, val);
  return val;
}

export interface Session {
  playerId: string;
  displayName: string;
  roomCode: string | null;
  setDisplayName: (name: string) => void;
  setRoomCode: (code: string | null) => void;
}

export function useSession(): Session {
  const [playerId] = useState(() => load('wttd_playerId', uuid));
  const [displayName, setDisplayNameState] = useState(() => localStorage.getItem('wttd_displayName') ?? '');
  const [roomCode, setRoomCodeState] = useState<string | null>(() => localStorage.getItem('wttd_roomCode'));

  const setDisplayName = (name: string) => {
    localStorage.setItem('wttd_displayName', name);
    setDisplayNameState(name);
  };

  const setRoomCode = (code: string | null) => {
    if (code) localStorage.setItem('wttd_roomCode', code);
    else localStorage.removeItem('wttd_roomCode');
    setRoomCodeState(code);
  };

  return { playerId, displayName, roomCode, setDisplayName, setRoomCode };
}
