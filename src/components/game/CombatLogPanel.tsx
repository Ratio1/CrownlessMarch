import type { GameplayActivityEntry, GameplaySocketStatus } from '@/shared/gameplay';
import type { EncounterSnapshot } from '@/shared/domain/combat';

interface CombatLogPanelProps {
  encounter: EncounterSnapshot | null;
  status: GameplaySocketStatus;
  activityLog: GameplayActivityEntry[];
}

export function CombatLogPanel({ encounter, status, activityLog }: CombatLogPanelProps) {
  const logs = encounter?.logs ?? [];

  return (
    <section className="panel play-panel">
      <div className="panel-title">Dice Log</div>
      {!encounter ? (
        activityLog.length > 0 ? (
          <ol className="combat-log">
            {activityLog.map((entry) => (
              <li key={entry.id}>
                <span className="combat-log__round">{entry.kind.toUpperCase()}</span>
                <span>{entry.text}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">
            {status === 'connected'
              ? 'The forest is listening. Move into hostile ground to start a fight.'
              : 'The combat feed will wake once the shard is bound.'}
          </p>
        )
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
