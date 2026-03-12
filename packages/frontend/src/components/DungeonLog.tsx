import type { DungeonLogEntry } from '../hooks/useGameState.js';

interface Props {
  log: DungeonLogEntry[];
}

export function DungeonLog({ log }: Props) {
  if (!log.length) return null;

  return (
    <div className="dungeon-log">
      <h4>Dungeon Log</h4>
      <ul>
        {log.map(entry => {
          const { result } = entry;
          let text: string;
          if (result.healed) {
            text = `${result.monster.name} (${result.monster.strength}) dealt ${result.monster.strength} damage — Healing Potion triggered! HP restored to ${result.hpAfter}.`;
          } else if (result.equipmentUsed) {
            text = `${result.monster.name} (${result.monster.strength}) defeated by ${result.equipmentUsed.name}.${result.equipmentUsed.special === 'ring_of_power' ? ` HP +${result.monster.strength}!` : ''}`;
          } else {
            text = `${result.monster.name} (${result.monster.strength}) dealt ${result.hpLost} damage. HP: ${result.hpBefore} → ${result.hpAfter}.`;
          }
          return (
            <li key={entry.id} className={result.hpAfter <= 0 ? 'dead' : result.equipmentUsed ? 'defeated' : 'damaged'}>
              {text}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
