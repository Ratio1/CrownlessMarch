import type { GameplayShardSnapshot } from '@/shared/gameplay';
import { attributes, type AttributeName } from '@/shared/domain/types';

interface CharacterPanelProps {
  snapshot: GameplayShardSnapshot | null;
}

const ATTRIBUTE_LABELS: Record<AttributeName, { short: string; label: string; description: string }> = {
  strength: {
    short: 'STR',
    label: 'Strength',
    description: 'Melee force, climbing, hauling, and breaking physical resistance.',
  },
  dexterity: {
    short: 'DEX',
    label: 'Dexterity',
    description: 'Agility, stealth, balance, quick hands, and reflexive defense.',
  },
  constitution: {
    short: 'END',
    label: 'Endurance',
    description: 'Stamina, poison resistance, wounds, marches, and survival under pressure.',
  },
  intelligence: {
    short: 'INT',
    label: 'Intelligence',
    description: 'Lore, arcane reasoning, puzzle solving, and tactical reading.',
  },
  wisdom: {
    short: 'WIS',
    label: 'Wisdom',
    description: 'Perception, insight, tracking, and instinctive field judgment.',
  },
  charisma: {
    short: 'CHA',
    label: 'Charisma',
    description: 'Presence, bargaining, command, deception, and social pressure.',
  },
};

const D20_SKILLS: Array<{ name: string; attribute: AttributeName; description: string }> = [
  { name: 'Athletics', attribute: 'strength', description: 'Force doors, climb rough stone, swim, shove, or jump.' },
  { name: 'Acrobatics', attribute: 'dexterity', description: 'Keep footing, tumble, squeeze through danger, or cross narrow ground.' },
  { name: 'Stealth', attribute: 'dexterity', description: 'Move quietly, hide, or approach a threat without drawing notice.' },
  { name: 'Endurance', attribute: 'constitution', description: 'Resist fatigue, poison, hunger, cold, and punishing marches.' },
  { name: 'Arcana', attribute: 'intelligence', description: 'Read magic, old runes, wards, rituals, and unnatural effects.' },
  { name: 'History', attribute: 'intelligence', description: 'Recall places, factions, ruins, and old campaign lore.' },
  { name: 'Perception', attribute: 'wisdom', description: 'Notice tracks, ambushes, hidden doors, movement, and danger.' },
  { name: 'Insight', attribute: 'wisdom', description: 'Read motive, fear, lies, and intent.' },
  { name: 'Survival', attribute: 'wisdom', description: 'Navigate wild ground, follow tracks, forage, and read weather.' },
  { name: 'Persuasion', attribute: 'charisma', description: 'Negotiate, rally, bargain, or calm a hostile exchange.' },
  { name: 'Intimidation', attribute: 'charisma', description: 'Force hesitation through threat, presence, or reputation.' },
];

function abilityModifier(score: number) {
  return Math.floor((score - 10) / 2);
}

function formatModifier(value: number) {
  return value >= 0 ? `+${value}` : String(value);
}

function formatDamage(dice: string | undefined, bonus: number | undefined) {
  if (!dice) {
    return 'unlisted';
  }

  if (!bonus) {
    return dice;
  }

  return `${dice}${formatModifier(bonus)}`;
}

export function CharacterPanel({ snapshot }: CharacterPanelProps) {
  const card = snapshot?.character;
  const weapon = card?.equipment.find((entry) => entry.slot === 'weapon') ?? null;

  return (
    <section className="panel play-panel character-sheet">
      <div className="panel-title">Character Sheet</div>
      {!card ? <p className="muted">No shard-bound hero yet.</p> : null}
      {card ? (
        <div className="play-card-stack">
          <div className="character-hero">
            <div>
              <h2 className="play-panel__heading">{card.name}</h2>
              <p className="muted">
                {card.classLabel} | Level {card.level} | XP {card.xp} | Gold {card.gold}
              </p>
            </div>
            <div className="character-crest">{card.classId.slice(0, 3).toUpperCase()}</div>
          </div>

          <div className="status-banner">
            <strong>
              HP {card.hitPoints.current}/{card.hitPoints.max}
            </strong>
            <span className="monospace">
              AC {card.defenses.armorClass} | Fort {card.defenses.fortitude} | Ref {card.defenses.reflex} | Will {card.defenses.will}
            </span>
          </div>

          <div className="character-sheet__section">
            <div>
              <h3>Ability Scores</h3>
              <p className="muted">Each score describes the raw capability before a D20 roll is made.</p>
            </div>
            <div className="character-sheet__ability-grid">
              {attributes.map((attribute) => {
                const score = card.attributes[attribute];
                const modifier = abilityModifier(score);

                return (
                  <article
                    className="character-sheet__ability"
                    key={attribute}
                    title={ATTRIBUTE_LABELS[attribute].description}
                  >
                    <div className="character-sheet__ability-head">
                      <span>{ATTRIBUTE_LABELS[attribute].short}</span>
                      <strong>{score}</strong>
                      <span>{formatModifier(modifier)}</span>
                    </div>
                    <h4>{ATTRIBUTE_LABELS[attribute].label}</h4>
                  </article>
                );
              })}
            </div>
          </div>

          <div className="character-sheet__section">
            <div>
              <h3>Ability Modifiers</h3>
              <p className="muted">Roll d20, add the matching modifier, then compare the total against the field DC or defense.</p>
            </div>
            <div className="token-strip">
              {attributes.map((attribute) => (
                <span className="status-pill" key={attribute}>
                  {ATTRIBUTE_LABELS[attribute].short} {formatModifier(abilityModifier(card.attributes[attribute]))}
                </span>
              ))}
            </div>
          </div>

          <div className="character-sheet__section">
            <div>
              <h3>D20 Skills</h3>
              <p className="muted">Skill checks currently use Roll d20 plus the listed ability modifier.</p>
            </div>
            <div className="character-sheet__skill-grid">
              {D20_SKILLS.map((skill) => (
                <article className="character-sheet__skill" key={skill.name} title={skill.description}>
                  <strong>{skill.name}</strong>
                  <span>
                    {ATTRIBUTE_LABELS[skill.attribute].short} {formatModifier(abilityModifier(card.attributes[skill.attribute]))}
                  </span>
                </article>
              ))}
            </div>
          </div>

          <div className="character-sheet__section">
            <div>
              <h3>Equipped Weapon</h3>
              <p className="muted">Roll d20 plus hit bonus against the target defense; damage uses the listed dice plus bonus on a hit.</p>
            </div>
            <div className="token-strip">
              {weapon ? (
                <>
                  <span className="status-pill">{weapon.label} x{weapon.quantity}</span>
                  <span className="status-pill">Hit {formatModifier(weapon.attackBonus ?? 0)}</span>
                  <span className="status-pill">Damage {formatDamage(weapon.damageDice, weapon.damageBonus)}</span>
                </>
              ) : (
                <span className="status-pill">Unarmed | Hit +0 | Damage unlisted</span>
              )}
            </div>
          </div>

          <div className="character-sheet__section">
            <div>
              <h3>Inventory</h3>
              <p className="muted">Carried items and equipped gear available to the current character checkpoint.</p>
            </div>
            <div className="token-strip">
              {card.equipment.length === 0 && card.inventory.length === 0 ? <span className="status-pill">Pack is empty.</span> : null}
              {card.equipment.map((entry) => (
                <span className="status-pill" key={`${entry.slot}:${entry.id}`}>
                  {entry.slot} | {entry.label} x{entry.quantity}
                </span>
              ))}
              {card.inventory.map((entry) => (
                <span className="status-pill" key={entry.id}>
                  {entry.label} x{entry.quantity}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
