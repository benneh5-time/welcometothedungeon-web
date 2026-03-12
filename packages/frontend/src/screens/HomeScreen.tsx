import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/http.js';
import type { Session } from '../hooks/useSession.js';

interface Props { session: Session }

export function HomeScreen({ session }: Props) {
  const nav = useNavigate();
  const [name, setName] = useState(session.displayName);
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function create() {
    if (!name.trim()) return setError('Enter your name first');
    setLoading(true);
    try {
      session.setDisplayName(name.trim());
      const { roomCode } = await api.createRoom(session.playerId, name.trim());
      session.setRoomCode(roomCode);
      nav(`/room/${roomCode}`);
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  async function join() {
    if (!name.trim()) return setError('Enter your name first');
    if (!joinCode.trim()) return setError('Enter a room code');
    setLoading(true);
    try {
      session.setDisplayName(name.trim());
      const code = joinCode.trim().toUpperCase();
      await api.joinRoom(code, session.playerId, name.trim());
      session.setRoomCode(code);
      nav(`/room/${code}`);
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  }

  return (
    <div className="screen home-screen">
      <h1>Welcome to the Dungeon</h1>
      <div className="card">
        <label>Your name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Enter your name"
          maxLength={20}
        />
        {error && <p className="error">{error}</p>}
        <div className="button-row">
          <button onClick={create} disabled={loading}>Create Room</button>
        </div>
        <hr />
        <label>Join an existing room</label>
        <input
          value={joinCode}
          onChange={e => setJoinCode(e.target.value.toUpperCase())}
          placeholder="Room code (e.g. XK7M2P)"
          maxLength={6}
        />
        <div className="button-row">
          <button onClick={join} disabled={loading}>Join Room</button>
        </div>
      </div>
    </div>
  );
}
