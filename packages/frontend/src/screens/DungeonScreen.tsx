import type { PublicGameState } from '@wttd/shared';
import type { Session } from '../hooks/useSession.js';
import type { useGameState } from '../hooks/useGameState.js';
import { PlayerList } from '../components/PlayerList.js';
import { DungeonLog } from '../components/DungeonLog.js';
import { VorpalAxeModal } from '../components/VorpalAxeModal.js';
import { VorpalTargetModal } from '../components/VorpalTargetModal.js';
import { api } from '../api/http.js';

type GameHook = ReturnType<typeof useGameState>;

interface Props {
  state: PublicGameState;
  session: Session;
  game: GameHook;
}

export function DungeonScreen({ state, session, game }: Props) {
  const isRunner = state.dungeonRunnerId === session.playerId;
  const monstersLeft = state.dungeonMonsterQueueSize - state.dungeonMonsterIndex;

  async function reveal() {
    try {
      await api.revealNext(state.roomCode, session.playerId);
    } catch (e: any) { alert(e.message); }
  }

  async function setVorpal(monsterName: string) {
    try {
      await api.vorpalTarget(state.roomCode, session.playerId, monsterName);
    } catch (e: any) { alert(e.message); }
  }

  async function axeUse() {
    try {
      await api.axeDecision(state.roomCode, session.playerId, true);
      game.clearAxeDecision();
    } catch (e: any) { alert(e.message); }
  }

  async function axeSkip() {
    try {
      await api.axeDecision(state.roomCode, session.playerId, false);
      game.clearAxeDecision();
    } catch (e: any) { alert(e.message); }
  }

  return (
    <div className="screen dungeon-screen">
      {/* Vorpal target modal — must be resolved before dungeon starts */}
      {state.needsVorpalChoice && isRunner && (
        <VorpalTargetModal onSelect={setVorpal} />
      )}

      {/* Vorpal axe decision modal */}
      {game.axeDecision && (
        <VorpalAxeModal
          decision={game.axeDecision}
          isRunner={isRunner}
          onUse={axeUse}
          onSkip={axeSkip}
        />
      )}

      <div className="dungeon-header">
        <h2>Dungeon — {state.players.find(p => p.playerId === state.dungeonRunnerId)?.displayName}</h2>
        <div className="hp-bar">
          <span>HP: {state.dungeonHp}</span>
        </div>
        <div className="equipment-row">
          Equipment: {state.dungeonEquipment.length ? state.dungeonEquipment.join(', ') : '(none)'}
        </div>
        {state.vorpalTarget && (
          <div className="vorpal-target">Vorpal target: <strong>{state.vorpalTarget}</strong></div>
        )}
        <div className="monsters-left">
          {monstersLeft} monster{monstersLeft !== 1 ? 's' : ''} remaining
        </div>
      </div>

      <PlayerList
        players={state.players}
        currentPlayerId={null}
        myPlayerId={session.playerId}
        runnerId={state.dungeonRunnerId}
      />

      <DungeonLog log={game.dungeonLog} />

      {isRunner && !state.needsVorpalChoice && !state.axeDecisionPending && monstersLeft > 0 && (
        <button className="primary reveal-btn" onClick={reveal}>
          Reveal Next Monster
        </button>
      )}
      {!isRunner && !state.axeDecisionPending && (
        <p className="waiting">
          Watching {state.players.find(p => p.playerId === state.dungeonRunnerId)?.displayName} run the dungeon...
        </p>
      )}
    </div>
  );
}
