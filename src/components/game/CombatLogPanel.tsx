import type { EncounterSnapshot } from '@/shared/domain/combat';
import type { GameplaySocketStatus } from '@/shared/gameplay';

interface CombatLogPanelProps {
  encounter: EncounterSnapshot | null;
  status: GameplaySocketStatus;
}

export function CombatLogPanel({ encounter, status }: CombatLogPanelProps) {
  const logs = encounter?.logs ?? [];

  return (
    <section className="panel play-panel">
      <div className="panel-title">Dice Log</div>
      {!encounter ? (
        <p className="muted">
          {status === 'connected'
            ? 'The forest is listening. Move into hostile ground to start a fight.'
            : 'The combat feed will wake once the shard is bound.'}
        </p>
      ) : (
        <div className="play-card-stack">
          <div className="status-banner">
            <strong>{encounter.status.toUpperCase()}</strong>
            <span className="monospace">Round {encounter.round}</span>
          </div>

          <ol className="combat-log">
            {logs.map((entry, index) => (
              <li key={`${entry.round}-${index}`}>
                <span className="combat-log__round">R{entry.round}</span>
                <span>{entry.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
