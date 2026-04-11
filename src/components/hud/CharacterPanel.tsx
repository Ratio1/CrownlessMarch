import type { EncounterSnapshot } from '@/shared/domain/combat';
import type { WorldSnapshot } from '@/client/hooks/useGameSnapshot';

interface CharacterPanelProps {
  snapshot: WorldSnapshot | null;
  encounter: EncounterSnapshot | null;
}

export function CharacterPanel({ snapshot, encounter }: CharacterPanelProps) {
  const hero = encounter?.combatants?.find((entry) => entry.kind === 'hero');

  return (
    <section className="hud-panel">
      <h2>Character Panel</h2>
      {!snapshot ? <p>Loading field state...</p> : null}
      {snapshot ? (
        <div className="character-panel">
          <p>
            Region: <strong>{snapshot.regionId}</strong>
          </p>
          <p>
            Position: <strong>{snapshot.position.x}</strong>, <strong>{snapshot.position.y}</strong>
          </p>
          <p>
            Vision Radius: <strong>{snapshot.vision.radius}</strong> ({snapshot.vision.size}x{snapshot.vision.size})
          </p>
          <p>
            Encounter: <strong>{encounter?.status ?? 'none'}</strong>
          </p>
          {hero ? (
            <p>
              Active Hero: <strong>{hero.name}</strong>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
