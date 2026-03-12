import { useEffect, useState } from 'react';
import type { AxeDecisionState } from '../hooks/useGameState.js';

interface Props {
  decision: AxeDecisionState;
  isRunner: boolean;
  onUse: () => void;
  onSkip: () => void;
}

export function VorpalAxeModal({ decision, isRunner, onUse, onSkip }: Props) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((decision.decisionDeadline - Date.now()) / 1000)),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      const s = Math.max(0, Math.ceil((decision.decisionDeadline - Date.now()) / 1000));
      setSecondsLeft(s);
    }, 500);
    return () => clearInterval(interval);
  }, [decision.decisionDeadline]);

  return (
    <div className="modal-overlay">
      <div className="modal vorpal-axe-modal">
        <h3>Vorpal Axe</h3>
        <p>
          Next monster: <strong>{decision.monster.name}</strong> (STR {decision.monster.strength})
        </p>
        {isRunner ? (
          <>
            <p>Use the Vorpal Axe to defeat it?</p>
            <div className="timer">{secondsLeft}s</div>
            <div className="modal-actions">
              <button className="btn-use" onClick={onUse}>Use Axe</button>
              <button className="btn-skip" onClick={onSkip}>Skip</button>
            </div>
          </>
        ) : (
          <>
            <p>Runner is deciding whether to use the Vorpal Axe...</p>
            <div className="timer">{secondsLeft}s</div>
          </>
        )}
      </div>
    </div>
  );
}
