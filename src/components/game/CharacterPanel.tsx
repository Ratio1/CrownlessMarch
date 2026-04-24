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
          <div className="character-hero">
            <div>
              <h2 className="play-panel__heading">{card.name}</h2>
              <p className="muted">
                {card.classLabel} • level {card.level} • XP {card.xp}
              </p>
            </div>
            <div className="character-crest">{card.classId.slice(0, 3).toUpperCase()}</div>
          </div>

          <div className="status-banner">
            <strong>
              HP {card.hitPoints.current}/{card.hitPoints.max}
            </strong>
            <span className="monospace">
              AC {card.defenses.armorClass} • Fort {card.defenses.fortitude} • Ref {card.defenses.reflex} • Will {card.defenses.will}
            </span>
          </div>

          <div className="play-metric-grid">
            <span className="status-pill">Gold {card.gold}</span>
            <span className="status-pill">Ground {snapshot?.currentTile.kind ?? 'unknown'}</span>
            <span className="status-pill">Passive: {card.passive}</span>
            <span className="status-pill">Encounter: {card.encounterAbility}</span>
          </div>

          <div className="play-info-block">
            <h3>Actions</h3>
            <div className="token-strip">
              {card.actions.map((action) => (
                <span className="status-pill" key={action.id}>
                  {action.name} • {action.kind}
                </span>
              ))}
            </div>
          </div>

          <div className="play-info-block">
            <h3>Kit</h3>
            <div className="token-strip">
              {card.equipment.length === 0 ? <span className="status-pill">No field kit equipped.</span> : null}
              {card.equipment.map((entry) => (
                <span className="status-pill" key={`${entry.slot}:${entry.id}`}>
                  {entry.slot} • {entry.label}
                </span>
              ))}
            </div>
          </div>

          <div className="play-info-block">
            <h3>Inventory</h3>
            <div className="token-strip">
              {card.inventory.length === 0 ? <span className="status-pill">Pack is empty.</span> : null}
              {card.inventory.map((entry, index) => (
                <span className="status-pill" key={`${entry.id}:${index}`}>
                  {entry.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
