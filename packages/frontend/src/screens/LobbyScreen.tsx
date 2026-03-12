import { api } from '../api/http.js';
import type { PublicGameState } from '@wttd/shared';
import type { Session } from '../hooks/useSession.js';

interface Props {
  state: PublicGameState;
  session: Session;
}

export function LobbyScreen({ state, session }: Props) {
  const isHost = state.hostPlayerId === session.playerId;
  const shareUrl = `${window.location.origin}/room/${state.roomCode}`;

  async function start() {
    try {
      await api.startGame(state.roomCode, session.playerId);
    } catch (e: any) {
      alert(e.message);
    }
  }

  function copy() {
    navigator.clipboard.writeText(shareUrl).catch(() => {});
  }

  return (
    <div className="screen lobby-screen">
      <h2>Room: <span className="room-code">{state.roomCode}</span></h2>

      <div className="share-row">
        <input readOnly value={shareUrl} />
        <button onClick={copy}>Copy link</button>
      </div>

      <h3>Players ({state.players.length}/4)</h3>
      <ul className="player-list">
        {state.players.map(p => (
          <li key={p.playerId} className={p.playerId === session.playerId ? 'me' : ''}>
            {p.displayName}
            {p.playerId === state.hostPlayerId && <span className="badge">Host</span>}
          </li>
        ))}
      </ul>

      {isHost ? (
        <button
          className="primary"
          onClick={start}
          disabled={state.players.length < 2}
        >
          {state.players.length < 2 ? 'Waiting for players...' : 'Start Game'}
        </button>
      ) : (
        <p className="waiting">Waiting for host to start...</p>
      )}
    </div>
  );
}
