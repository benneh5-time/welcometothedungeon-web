import type { PublicGameState } from '@wttd/shared';
import type { Session } from '../hooks/useSession.js';
import { ADVENTURER_NAMES } from '@wttd/shared';
import { api } from '../api/http.js';
import { useState } from 'react';

interface Props {
  state: PublicGameState;
  session: Session;
}

export function EndScreen({ state, session }: Props) {
  const winner = state.players.find(p => p.successes >= 2 || (state.players.filter(x => !x.eliminated).length === 1 && !p.eliminated));
  const [nextAdventurer, setNextAdventurer] = useState('warrior');

  async function playAgain() {
    try {
      await api.newRound(state.roomCode, session.playerId, nextAdventurer);
    } catch (e: any) { alert(e.message); }
  }

  return (
    <div className="screen end-screen">
      <h2>{winner ? `${winner.displayName} wins!` : 'Game Over'}</h2>
      <table className="score-table">
        <thead>
          <tr><th>Player</th><th>Wins</th><th>Deaths</th><th>Status</th></tr>
        </thead>
        <tbody>
          {state.players.map(p => (
            <tr key={p.playerId} className={p.eliminated ? 'eliminated' : ''}>
              <td>{p.displayName}{p.playerId === session.playerId ? ' (you)' : ''}</td>
              <td>{'⭐'.repeat(p.successes)}</td>
              <td>{'💀'.repeat(p.failures)}</td>
              <td>{p.eliminated ? 'Eliminated' : 'Active'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {state.dungeonRunnerId === session.playerId && (
        <div className="new-round">
          <h3>Start a new round?</h3>
          <label>Choose adventurer:</label>
          <select value={nextAdventurer} onChange={e => setNextAdventurer(e.target.value)}>
            {ADVENTURER_NAMES.map(name => (
              <option key={name} value={name}>{name.charAt(0).toUpperCase() + name.slice(1)}</option>
            ))}
          </select>
          <button className="primary" onClick={playAgain}>Play Again</button>
        </div>
      )}
    </div>
  );
}
