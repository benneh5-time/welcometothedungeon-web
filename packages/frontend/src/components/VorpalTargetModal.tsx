import { useState } from 'react';
import { MONSTER_NAMES } from '@wttd/shared';

interface Props {
  onSelect: (monsterName: string) => void;
}

export function VorpalTargetModal({ onSelect }: Props) {
  const [selected, setSelected] = useState('');

  return (
    <div className="modal-overlay">
      <div className="modal vorpal-target-modal">
        <h3>Choose Vorpal Target</h3>
        <p>Select a monster type. Your Vorpal weapon will defeat ALL monsters of that type.</p>
        <div className="monster-grid">
          {MONSTER_NAMES.map(name => (
            <button
              key={name}
              className={`btn-monster ${selected === name ? 'selected' : ''}`}
              onClick={() => setSelected(name)}
            >
              {name}
            </button>
          ))}
        </div>
        <button
          className="btn-confirm"
          disabled={!selected}
          onClick={() => selected && onSelect(selected)}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}
