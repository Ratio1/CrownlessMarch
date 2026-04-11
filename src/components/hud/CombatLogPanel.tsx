import type { EncounterSnapshot } from '@/shared/domain/combat';

interface CombatLogPanelProps {
  encounter: EncounterSnapshot | null;
  loading: boolean;
}

export function CombatLogPanel({ encounter, loading }: CombatLogPanelProps) {
  const logs = encounter?.logs ?? [];

  return (
    <section className="hud-panel">
      <h2>Combat Log</h2>
      {!encounter && loading ? <p>Scanning the briarline for threats...</p> : null}
      {!encounter && !loading ? <p>No active encounter. The forest is tense but quiet.</p> : null}
      {encounter ? (
        <div>
          <p>
            Status: <strong>{encounter.status}</strong> | Round: <strong>{encounter.round}</strong>
          </p>
          <ol className="combat-log">
            {logs.length === 0 ? <li>No combat events yet.</li> : null}
            {logs.map((entry, index) => (
              <li key={`${entry.round}-${index}`}>
                <span>R{entry.round}</span> {entry.text}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
