import type { PublicGameState } from '@wttd/shared';
import type { Session } from '../hooks/useSession.js';
import type { useGameState } from '../hooks/useGameState.js';
import { MonsterCard } from '../components/MonsterCard.js';
import { PlayerList } from '../components/PlayerList.js';
import { api } from '../api/http.js';

type GameHook = ReturnType<typeof useGameState>;

interface Props {
  state: PublicGameState;
  session: Session;
  game: GameHook;
}

export function BiddingScreen({ state, session, game }: Props) {
  const isMyTurn = state.currentPlayerId === session.playerId;
  const showPolymorph = state.availableEquipmentNames.includes('Polymorph') && isMyTurn;

  async function dungeon() {
    try {
      await api.biddingAction(state.roomCode, session.playerId, 'dungeon');
      game.clearPrivateCard();
    } catch (e: any) { alert(e.message); }
  }

  async function discard(equipmentName: string) {
    try {
      await api.biddingAction(state.roomCode, session.playerId, 'discard', equipmentName);
      game.clearPrivateCard();
    } catch (e: any) { alert(e.message); }
  }

  async function pass() {
    try {
      await api.biddingAction(state.roomCode, session.playerId, 'pass');
      game.clearPrivateCard();
    } catch (e: any) { alert(e.message); }
  }

  async function polymorph() {
    try {
      await api.biddingAction(state.roomCode, session.playerId, 'polymorph');
      // Private card will be updated via WS PRIVATE_DRAW
    } catch (e: any) { alert(e.message); }
  }

  return (
    <div className="screen bidding-screen">
      <div className="game-header">
        <h2>{state.adventurerName.charAt(0).toUpperCase() + state.adventurerName.slice(1)}</h2>
        <div className="info-row">
          <span>Equipment left: {state.availableEquipmentCount}</span>
          <span>Dungeon pile: {state.dungeonPileSize}</span>
        </div>
        <div className="equipment-names">
          {state.availableEquipmentNames.join(', ')}
        </div>
      </div>

      <PlayerList
        players={state.players}
        currentPlayerId={state.currentPlayerId}
        myPlayerId={session.playerId}
      />

      {isMyTurn && !game.privateCard && (
        <p className="your-turn-hint">Your turn — drawing card...</p>
      )}
      {!isMyTurn && (
        <p className="waiting">
          Waiting for {state.players.find(p => p.playerId === state.currentPlayerId)?.displayName ?? '...'}
        </p>
      )}

      {game.privateCard && isMyTurn && (
        <MonsterCard
          monster={game.privateCard.monster}
          defeatingEquipment={game.privateCard.defeatingEquipment}
          availableEquipment={state.availableEquipmentNames}
          showPolymorph={showPolymorph}
          onDungeon={dungeon}
          onDiscard={discard}
          onPass={pass}
          onPolymorph={polymorph}
        />
      )}
    </div>
  );
}
