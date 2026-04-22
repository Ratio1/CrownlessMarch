import type { GameplayShardSnapshot } from '@/shared/gameplay';

interface CharacterPanelProps {
  snapshot: GameplayShardSnapshot | null;
}

export function CharacterPanel({ snapshot }: CharacterPanelProps) {
  const card = snapshot?.character;

  return (
    <section className="panel play-panel">
      <div className="panel-title">Character</div>
      {!card ? <p className="muted">No shard-bound hero yet.</p> : null}
      {card ? (
        <div className="play-card-stack">
          <div>
            <h2 className="play-panel__heading">{card.name}</h2>
            <p className="muted">
              {card.classLabel} • level {card.level} • XP {card.xp}
            </p>
          </div>

          <div className="status-banner">
            <strong>
              HP {card.hitPoints.current}/{card.hitPoints.max}
            </strong>
            <span className="monospace">
              AC {card.defenses.armorClass} • Fort {card.defenses.fortitude} • Ref {card.defenses.reflex} • Will {card.defenses.will}
            </span>
          </div>

          <div className="play-chip-row">
            <span className="status-pill">Gold {card.gold}</span>
            <span className="status-pill">Passive: {card.passive}</span>
          </div>

          <div className="play-info-block">
            <h3>Actions</h3>
            <ul className="plain-list">
              {card.actions.map((action) => (
                <li key={action.id}>
                  <strong>{action.name}</strong> • {action.kind}
                </li>
              ))}
            </ul>
          </div>

          <div className="play-info-block">
            <h3>Kit</h3>
            <ul className="plain-list">
              {card.equipment.length === 0 ? <li>No field kit equipped.</li> : null}
              {card.equipment.map((entry) => (
                <li key={`${entry.slot}:${entry.id}`}>
                  <strong>{entry.slot}</strong> • {entry.label}
                </li>
              ))}
            </ul>
          </div>

          <div className="play-info-block">
            <h3>Inventory</h3>
            <ul className="plain-list">
              {card.inventory.length === 0 ? <li>Pack is empty.</li> : null}
              {card.inventory.map((entry) => (
                <li key={entry.id}>{entry.label}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </section>
  );
}
