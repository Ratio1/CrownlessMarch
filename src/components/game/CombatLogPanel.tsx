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
    <section className="panel play-panel play-panel--terminal">
      <div className="play-panel__terminal-header">
        <div>
          <div className="panel-title">{encounter ? 'Dice Log' : 'Field Notes'}</div>
          <h3 className="terminal-heading">{encounter ? encounter.monsterName ?? 'Encounter feed' : 'March feed'}</h3>
        </div>
        {encounter ? (
          <div className="play-chip-row">
            <span className="status-pill">Status {encounter.status}</span>
            <span className="status-pill">Round {encounter.round}</span>
          </div>
        ) : null}
      </div>
      {!encounter ? (
        activityLog.length > 0 ? (
          <ol className="combat-log combat-log--terminal">
            {activityLog.map((entry, index) => (
              <li
                className={`combat-log__entry combat-log__entry--${entry.kind}${
                  index === activityLog.length - 1 ? ' combat-log__entry--latest' : ''
                }`}
                key={entry.id}
              >
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
            <span className="monospace">
              Rewards {encounter.rewards.xp} XP • {encounter.rewards.gold} gold
            </span>
          </div>

          <ol className="combat-log combat-log--terminal">
            {logs.map((entry, index) => (
              <li
                className={`combat-log__entry combat-log__entry--${entry.kind ?? 'system'}${
                  index === logs.length - 1 ? ' combat-log__entry--latest' : ''
                }`}
                key={`${entry.round}-${index}`}
              >
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
