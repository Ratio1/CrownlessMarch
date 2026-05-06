import type { GameplayShardSnapshot } from '@/shared/gameplay';
import { attributes } from '@/shared/domain/types';

interface ShortCharacterPanelProps {
  snapshot: GameplayShardSnapshot | null;
}

function shortAttributeLabel(attribute: string) {
  switch (attribute) {
    case 'strength':
      return 'STR';
    case 'dexterity':
      return 'DEX';
    case 'constitution':
      return 'END';
    case 'intelligence':
      return 'INT';
    case 'wisdom':
      return 'WIS';
    case 'charisma':
      return 'CHA';
    default:
      return attribute.slice(0, 3).toUpperCase();
  }
}

export function ShortCharacterPanel({ snapshot }: ShortCharacterPanelProps) {
  const card = snapshot?.character ?? null;

  return (
    <section className="panel play-panel play-panel--compact short-character-panel">
      <div className="panel-title">Short Sheet</div>
      {!card ? <p className="muted">No shard-bound hero yet.</p> : null}
      {card ? (
        <div className="short-character-panel__body">
          <div>
            <h3>{card.name}</h3>
            <p className="muted">
              {card.classLabel} | Level {card.level} | XP {card.xp}
            </p>
          </div>
          <div className="status-banner">
            <strong>
              HP {card.hitPoints.current}/{card.hitPoints.max}
            </strong>
            <span className="monospace">
              AC {card.defenses.armorClass} | Fort {card.defenses.fortitude} | Ref {card.defenses.reflex} | Will {card.defenses.will}
            </span>
          </div>
          <div className="short-character-panel__attrs">
            {attributes.map((attribute) => (
              <span className="status-pill" key={attribute}>
                {shortAttributeLabel(attribute)} {card.attributes[attribute]}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
