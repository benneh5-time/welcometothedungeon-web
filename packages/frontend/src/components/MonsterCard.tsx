import type { Monster } from '@wttd/shared';

interface Props {
  monster: Monster;
  defeatingEquipment: string[];
  onDungeon: () => void;
  onDiscard: (equipmentName: string) => void;
  onPass: () => void;
  onPolymorph?: () => void;
  availableEquipment: string[];
  showPolymorph: boolean;
}

export function MonsterCard({
  monster, defeatingEquipment, onDungeon, onDiscard, onPass, onPolymorph,
  availableEquipment, showPolymorph,
}: Props) {
  return (
    <div className="monster-card-overlay">
      <div className="monster-card">
        <div className="monster-header">
          <span className="monster-name">{monster.name}</span>
          <span className="monster-strength">STR {monster.strength}</span>
        </div>
        {defeatingEquipment.length > 0 && (
          <p className="defeating-hint">
            Defeated by: {defeatingEquipment.join(', ')}
          </p>
        )}
        <div className="monster-actions">
          <button className="btn-dungeon" onClick={onDungeon}>
            Add to Dungeon
          </button>
          {availableEquipment.length > 0 && (
            <div className="discard-group">
              <span>Discard with:</span>
              <div className="equipment-buttons">
                {availableEquipment.map(name => (
                  <button key={name} className="btn-equipment" onClick={() => onDiscard(name)}>
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {showPolymorph && (
            <button className="btn-polymorph" onClick={onPolymorph}>
              Polymorph (swap card)
            </button>
          )}
          <button className="btn-pass" onClick={onPass}>
            Pass
          </button>
        </div>
      </div>
    </div>
  );
}
