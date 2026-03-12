import { useParams } from 'react-router-dom';
import type { Session } from '../hooks/useSession.js';
import { useGameState } from '../hooks/useGameState.js';
import { LobbyScreen } from './LobbyScreen.js';
import { BiddingScreen } from './BiddingScreen.js';
import { DungeonScreen } from './DungeonScreen.js';
import { EndScreen } from './EndScreen.js';

interface Props { session: Session }

export function RoomScreen({ session }: Props) {
  const { code } = useParams<{ code: string }>();
  const roomCode = code?.toUpperCase() ?? null;
  const game = useGameState(roomCode, session.playerId);
  const { publicState } = game;

  if (!publicState) {
    return <div className="screen"><p>Connecting...</p></div>;
  }

  switch (publicState.phase) {
    case 'lobby':
      return <LobbyScreen state={publicState} session={session} />;
    case 'bidding':
      return <BiddingScreen state={publicState} session={session} game={game} />;
    case 'dungeon':
      return <DungeonScreen state={publicState} session={session} game={game} />;
    case 'ended':
      return <EndScreen state={publicState} session={session} />;
    default:
      return <div className="screen"><p>Unknown game state</p></div>;
  }
}
