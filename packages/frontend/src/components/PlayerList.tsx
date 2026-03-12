import type { Player } from '@wttd/shared';

interface Props {
  players: Player[];
  currentPlayerId: string | null;
  myPlayerId: string;
  runnerId?: string | null;
}

export function PlayerList({ players, currentPlayerId, myPlayerId, runnerId }: Props) {
  return (
    <ul className="player-list game">
      {players.map(p => (
        <li
          key={p.playerId}
          className={[
            p.playerId === myPlayerId ? 'me' : '',
            p.eliminated ? 'eliminated' : '',
            p.passed ? 'passed' : '',
            p.playerId === currentPlayerId ? 'active-turn' : '',
            p.playerId === runnerId ? 'runner' : '',
          ].filter(Boolean).join(' ')}
        >
          <span className="player-name">{p.displayName}</span>
          <span className="player-stats">
            {'⭐'.repeat(p.successes)}{'💀'.repeat(p.failures)}
          </span>
          {p.eliminated && <span className="badge eliminated">Out</span>}
          {p.passed && !p.eliminated && <span className="badge passed">Passed</span>}
          {p.playerId === runnerId && <span className="badge runner">Runner</span>}
          {p.playerId === currentPlayerId && !p.eliminated && <span className="badge turn">Turn</span>}
        </li>
      ))}
    </ul>
  );
}
