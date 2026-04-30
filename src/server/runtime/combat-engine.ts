import type { ContentBundle } from '../content/load-content';
import type { ItemRecord, MonsterRecord } from '../../shared/content/schema';
import type { CombatLogEntry, DefenseType, EncounterCombatant, EncounterSnapshot } from '../../shared/domain/combat';
import {
  addInventoryItem,
  applyExperienceGain,
  changeCurrency,
  normalizeDurableProgression,
  type ProgressionSnapshot,
} from '../../shared/domain/progression';
import type { CharacterClass } from '../../shared/domain/types';

export const ROUND_CADENCE_MS = 2_000;

type RandomSource = () => number;

interface EncounterSeedInput {
  characterId: string;
  characterSnapshot: Record<string, unknown>;
  monster: MonsterRecord;
  tileKind: string;
  content: ContentBundle;
  now: Date;
  random?: RandomSource;
}

interface AdvanceEncounterInput {
  encounter: EncounterSnapshot;
  characterSnapshot: Record<string, unknown>;
  content: ContentBundle;
  now: Date;
  random?: RandomSource;
}

interface EncounterAdvanceResult {
  encounter: EncounterSnapshot;
  characterSnapshot: Record<string, unknown>;
  resolved: boolean;
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function parseDiceSpec(spec: string) {
  const match = spec.trim().match(/^(\d+)d(\d+)$/i);

  if (!match) {
    return { count: 1, sides: 6 };
  }

  return {
    count: Number(match[1]) || 1,
    sides: Number(match[2]) || 6,
  };
}

function rollDie(sides: number, random: RandomSource) {
  return Math.floor(random() * sides) + 1;
}

function rollDice(spec: string, random: RandomSource) {
  const { count, sides } = parseDiceSpec(spec);
  let total = 0;

  for (let index = 0; index < count; index += 1) {
    total += rollDie(sides, random);
  }

  return total;
}

function toCharacterClass(value: unknown): CharacterClass {
  return value === 'rogue' || value === 'wizard' || value === 'cleric' ? value : 'fighter';
}

function toDefenseMap(value: unknown) {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  return {
    ac: typeof record.armorClass === 'number' ? record.armorClass : 10,
    fortitude: typeof record.fortitude === 'number' ? record.fortitude : 10,
    reflex: typeof record.reflex === 'number' ? record.reflex : 10,
    will: typeof record.will === 'number' ? record.will : 10,
  };
}

function toHeroTargetDefense(classId: CharacterClass): DefenseType {
  switch (classId) {
    case 'wizard':
      return 'reflex';
    case 'cleric':
      return 'will';
    default:
      return 'ac';
  }
}

function toHeroDamageDice(classId: CharacterClass) {
  switch (classId) {
    case 'rogue':
      return '1d8';
    case 'wizard':
      return '1d6';
    case 'cleric':
      return '1d8';
    default:
      return '1d10';
  }
}

interface WeaponRules {
  label: string;
  enhancement: number;
  damageDice: string;
  criticalRangeMin: number;
  criticalMultiplier: number;
  modifiers: string[];
}

function defaultWeaponRules(classId: CharacterClass): WeaponRules {
  return {
    label: 'Unarmed strike',
    enhancement: 0,
    damageDice: toHeroDamageDice(classId),
    criticalRangeMin: 20,
    criticalMultiplier: 2,
    modifiers: [],
  };
}

function getEquippedWeapon(snapshot: Record<string, unknown>, content: ContentBundle): ItemRecord | null {
  const equipment = snapshot.equipment && typeof snapshot.equipment === 'object' && !Array.isArray(snapshot.equipment)
    ? (snapshot.equipment as Record<string, unknown>)
    : {};
  const equippedIds = Object.values(equipment).filter((value): value is string => typeof value === 'string');

  for (const itemId of equippedIds) {
    const item = content.items.find((entry) => entry.id === itemId);
    if (item?.slot === 'weapon') {
      return item;
    }
  }

  return null;
}

function getEquippedWeaponRules(
  classId: CharacterClass,
  snapshot: Record<string, unknown>,
  content: ContentBundle
): WeaponRules {
  const fallback = defaultWeaponRules(classId);
  const weapon = getEquippedWeapon(snapshot, content);

  if (!weapon) {
    return fallback;
  }

  return {
    label: weapon.label,
    enhancement: weapon.bonus,
    damageDice: weapon.damage ?? fallback.damageDice,
    criticalRangeMin: weapon.criticalRangeMin ?? fallback.criticalRangeMin,
    criticalMultiplier: weapon.criticalMultiplier ?? fallback.criticalMultiplier,
    modifiers: weapon.modifiers ?? [],
  };
}

function toHeroAttackBonus(classId: CharacterClass, snapshot: Record<string, unknown>, content: ContentBundle) {
  const modifiers = snapshot.modifiers as Record<string, number> | undefined;
  const level = typeof snapshot.level === 'number' ? snapshot.level : 1;
  const weaponBonus = getEquippedWeaponRules(classId, snapshot, content).enhancement;

  switch (classId) {
    case 'rogue':
      return Math.floor(level / 2) + (modifiers?.dexterity ?? 0) + weaponBonus + 3;
    case 'wizard':
      return Math.floor(level / 2) + (modifiers?.intelligence ?? 0) + weaponBonus + 3;
    case 'cleric':
      return Math.floor(level / 2) + (modifiers?.wisdom ?? 0) + weaponBonus + 2;
    default:
      return Math.floor(level / 2) + (modifiers?.strength ?? 0) + weaponBonus + 3;
  }
}

function toHeroDamageBonus(classId: CharacterClass, snapshot: Record<string, unknown>, content: ContentBundle) {
  const modifiers = snapshot.modifiers as Record<string, number> | undefined;
  const weaponBonus = getEquippedWeaponRules(classId, snapshot, content).enhancement;

  switch (classId) {
    case 'rogue':
      return (modifiers?.dexterity ?? 0) + weaponBonus;
    case 'wizard':
      return (modifiers?.intelligence ?? 0) + weaponBonus;
    case 'cleric':
      return (modifiers?.wisdom ?? 0) + weaponBonus;
    default:
      return (modifiers?.strength ?? 0) + weaponBonus;
  }
}

function buildHeroCombatant(
  characterId: string,
  characterSnapshot: Record<string, unknown>,
  content: ContentBundle
): EncounterCombatant {
  const classId = toCharacterClass(characterSnapshot.classId);
  const weapon = getEquippedWeaponRules(classId, characterSnapshot, content);
  const hitPoints =
    characterSnapshot.hitPoints && typeof characterSnapshot.hitPoints === 'object' && !Array.isArray(characterSnapshot.hitPoints)
      ? (characterSnapshot.hitPoints as Record<string, unknown>)
      : {};
  const defenses = toDefenseMap(characterSnapshot.defenses);

  return {
    id: `hero:${characterId}`,
    kind: 'hero',
    name: typeof characterSnapshot.name === 'string' ? characterSnapshot.name : 'Adventurer',
    initiativeModifier:
      characterSnapshot.modifiers && typeof characterSnapshot.modifiers === 'object'
        ? Number((characterSnapshot.modifiers as Record<string, unknown>).dexterity ?? 0)
        : 0,
    currentHp: typeof hitPoints.current === 'number' ? hitPoints.current : 10,
    maxHp: typeof hitPoints.max === 'number' ? hitPoints.max : 10,
    attackBonus: toHeroAttackBonus(classId, characterSnapshot, content),
    damageDice: weapon.damageDice,
    damageBonus: toHeroDamageBonus(classId, characterSnapshot, content),
    targetDefense: toHeroTargetDefense(classId),
    weaponLabel: weapon.label,
    weaponEnhancement: weapon.enhancement,
    criticalRangeMin: weapon.criticalRangeMin,
    criticalMultiplier: weapon.criticalMultiplier,
    weaponModifiers: weapon.modifiers,
    defenses,
  };
}

function buildMonsterCombatant(monster: MonsterRecord): EncounterCombatant {
  return {
    id: `monster:${monster.id}`,
    kind: 'monster',
    name: monster.label,
    initiativeModifier: monster.behavior === 'skirmisher' ? 3 : monster.behavior === 'caster' ? 2 : 1,
    currentHp: monster.hitPoints,
    maxHp: monster.hitPoints,
    attackBonus: monster.attackBonus,
    damageDice: monster.damage.dice,
    damageBonus: monster.damage.bonus,
    targetDefense: 'ac',
    alignment: monster.alignment,
    minimumEnhancementToHit: monster.minimumEnhancementToHit,
    defenses: monster.defenses,
  };
}

function rollInitiativeOrder(combatants: EncounterCombatant[], random: RandomSource) {
  return combatants
    .map((combatant, index) => ({
      id: combatant.id,
      total: rollDie(20, random) + combatant.initiativeModifier,
      orderSeed: index,
    }))
    .sort((left, right) => right.total - left.total || left.orderSeed - right.orderSeed);
}

function defaultRewards(monster: MonsterRecord) {
  return {
    xp: monster.level * 40,
    gold: 4 + monster.level * 2,
    lootItemIds: monster.id === 'briar-goblin' ? ['health-potion'] : monster.id === 'sap-wolf' ? ['field-rations'] : [],
  };
}

function resolveDefenseName(defense: DefenseType) {
  switch (defense) {
    case 'ac':
      return 'AC';
    case 'fortitude':
      return 'Fortitude';
    case 'reflex':
      return 'Reflex';
    case 'will':
      return 'Will';
  }
}

function setHitPoints(snapshot: Record<string, unknown>, currentHp: number) {
  const normalized = normalizeDurableProgression(snapshot);
  const hitPoints =
    normalized.hitPoints && typeof normalized.hitPoints === 'object' && !Array.isArray(normalized.hitPoints)
      ? clone(normalized.hitPoints as Record<string, unknown>)
      : { current: currentHp, max: currentHp, bloodied: Math.max(1, Math.floor(currentHp / 2)) };

  hitPoints.current = Math.max(0, Math.min(Number(hitPoints.max) || currentHp, currentHp));

  return {
    ...normalized,
    hitPoints,
  };
}

function queueLog(logs: CombatLogEntry[], round: number, text: string, kind?: CombatLogEntry['kind']) {
  logs.push({ round, text, kind });
}

function findCombatant(encounter: EncounterSnapshot, id: string) {
  return encounter.combatants.find((entry) => entry.id === id) ?? null;
}

function encounterPowerName(classId: CharacterClass, content: ContentBundle) {
  return content.classes.find((entry) => entry.id === classId)?.encounterAbility ?? 'encounter power';
}

function isEvilAlignment(alignment: string | undefined) {
  return alignment === 'LE' || alignment === 'NE' || alignment === 'CE';
}

function performAttack(input: {
  attacker: EncounterCombatant;
  target: EncounterCombatant;
  round: number;
  random: RandomSource;
  powerBonus?: { attack: number; damage: number; label: string };
}) {
  const roll = rollDie(20, input.random);
  const attackBonus = input.attacker.attackBonus + (input.powerBonus?.attack ?? 0);
  const total = roll + attackBonus;
  const defenseValue = input.target.defenses[input.attacker.targetDefense];
  const hit = roll !== 1 && (roll === 20 || total >= defenseValue);
  const logs: CombatLogEntry[] = [];

  queueLog(
    logs,
    input.round,
    `${input.attacker.name} rolls ${roll} + ${attackBonus} = ${total} vs ${resolveDefenseName(input.attacker.targetDefense)} ${defenseValue}.`,
    'roll'
  );

  if (!hit) {
    queueLog(logs, input.round, `${input.attacker.name} misses ${input.target.name}.`, 'effect');
    return {
      damage: 0,
      logs,
      target: input.target,
    };
  }

  const minimumEnhancement = input.target.minimumEnhancementToHit ?? 0;
  const weaponEnhancement = input.attacker.weaponEnhancement ?? 0;

  if (minimumEnhancement > weaponEnhancement) {
    const weaponLabel = input.attacker.weaponLabel ?? 'weapon';
    queueLog(
      logs,
      input.round,
      `${input.attacker.name}'s ${weaponLabel} strikes ${input.target.name}, but the ward rejects it; ${input.target.name} requires a +${minimumEnhancement} weapon.`,
      'effect'
    );

    return {
      damage: 0,
      logs,
      target: input.target,
    };
  }

  const baseDamage =
    rollDice(input.attacker.damageDice, input.random) + input.attacker.damageBonus + (input.powerBonus?.damage ?? 0);
  const criticalRangeMin = input.attacker.criticalRangeMin ?? 20;
  const criticalMultiplier = input.attacker.criticalMultiplier ?? 2;
  const critical = roll >= criticalRangeMin;
  const holy = (input.attacker.weaponModifiers ?? []).includes('holy') && isEvilAlignment(input.target.alignment);
  let damage = baseDamage;
  const damageNotes: string[] = [];

  if (critical) {
    damage *= criticalMultiplier;
    damageNotes.push(`x${criticalMultiplier} critical`);
  }

  if (holy) {
    damage *= 2;
    damageNotes.push('x2 Holy vs Evil');
  }

  const nextTarget: EncounterCombatant = {
    ...input.target,
    currentHp: Math.max(0, input.target.currentHp - damage),
  };

  queueLog(
    logs,
    input.round,
    `${input.attacker.name} hits ${input.target.name} for ${damage} damage${
      damageNotes.length > 0 ? ` (${damageNotes.join(', ')})` : ''
    }.`,
    'effect'
  );

  return {
    damage,
    logs,
    target: nextTarget,
  };
}

function consumeInventoryItem(snapshot: Record<string, unknown>, itemId: string) {
  const normalized = normalizeDurableProgression(snapshot);
  const inventory = Array.isArray(normalized.inventory) ? [...normalized.inventory] : [];
  const index = inventory.findIndex((entry) => entry === itemId);

  if (index >= 0) {
    inventory.splice(index, 1);
    return {
      snapshot: {
        ...normalized,
        inventory,
      },
      consumed: true,
    };
  }

  return { snapshot: normalized, consumed: false };
}

function hasInventoryItem(snapshot: Record<string, unknown>, itemId: string) {
  return Array.isArray(snapshot.inventory) && snapshot.inventory.includes(itemId);
}

export function createEncounterSnapshot(input: EncounterSeedInput): EncounterSnapshot {
  const random = input.random ?? Math.random;
  const characterSnapshot = normalizeDurableProgression(input.characterSnapshot);
  const hero = buildHeroCombatant(input.characterId, characterSnapshot, input.content);
  const monster = buildMonsterCombatant(input.monster);
  const initiativeOrder = rollInitiativeOrder([hero, monster], random);
  const logs: CombatLogEntry[] = [];

  queueLog(logs, 0, `A ${input.monster.label} stalks the ${input.tileKind}.`, 'system');
  queueLog(
    logs,
    1,
    `Initiative: ${initiativeOrder.map((entry) => `${findCombatant({ combatants: [hero, monster] } as EncounterSnapshot, entry.id)?.name ?? entry.id} ${entry.total}`).join(' // ')}`,
    'initiative'
  );

  return {
    id: `${input.characterId}:${input.monster.id}:${input.now.getTime()}`,
    status: 'active',
    round: 1,
    nextRoundAt: new Date(input.now.getTime() + ROUND_CADENCE_MS).toISOString(),
    logs,
    characterId: input.characterId,
    monsterId: input.monster.id,
    monsterName: input.monster.label,
    combatants: [hero, monster],
    initiativeOrder: initiativeOrder.map((entry) => entry.id),
    queuedOverrides: [],
    rewards: defaultRewards(input.monster),
  };
}

function processRound(
  encounter: EncounterSnapshot,
  characterSnapshot: Record<string, unknown>,
  content: ContentBundle,
  random: RandomSource
) {
  let nextEncounter = clone(encounter);
  let nextSnapshot = normalizeDurableProgression(characterSnapshot);
  const round = nextEncounter.round;
  const logs = [...nextEncounter.logs];
  const queuedOverrides = [...nextEncounter.queuedOverrides];
  const hero = nextEncounter.combatants.find((entry) => entry.kind === 'hero');
  const monster = nextEncounter.combatants.find((entry) => entry.kind === 'monster');

  if (!hero || !monster) {
    return { encounter: nextEncounter, characterSnapshot: nextSnapshot };
  }

  for (const actorId of nextEncounter.initiativeOrder) {
    const currentHero = nextEncounter.combatants.find((entry) => entry.id === hero.id);
    const currentMonster = nextEncounter.combatants.find((entry) => entry.id === monster.id);

    if (!currentHero || !currentMonster) {
      break;
    }

    if (currentHero.currentHp <= 0 || currentMonster.currentHp <= 0) {
      break;
    }

    if (actorId === currentHero.id) {
      const overrideIndex = queuedOverrides.findIndex((entry) => entry.actorId === currentHero.id);
      const override = overrideIndex >= 0 ? queuedOverrides.splice(overrideIndex, 1)[0] : null;
      const command = override?.command.trim().toLowerCase();
      const classId = toCharacterClass(nextSnapshot.classId);

      if (command === 'retreat') {
        queueLog(logs, round, `${currentHero.name} breaks from the roots and retreats alive.`, 'effect');
        nextEncounter.status = 'escaped';
        break;
      }

      if (command === 'potion') {
        const potion = consumeInventoryItem(nextSnapshot, 'health-potion');

        if (potion.consumed) {
          const healing = rollDice('2d6', random) + 4;
          const healedHero = {
            ...currentHero,
            currentHp: Math.min(currentHero.maxHp, currentHero.currentHp + healing),
          };
          nextSnapshot = potion.snapshot;
          nextSnapshot = setHitPoints(nextSnapshot, healedHero.currentHp);
          nextEncounter.combatants = nextEncounter.combatants.map((entry) =>
            entry.id === healedHero.id ? healedHero : entry
          );
          queueLog(logs, round, `${currentHero.name} drinks a health potion and recovers ${healing} HP.`, 'effect');
        } else {
          queueLog(logs, round, `${currentHero.name} reaches for a potion, but the satchel is empty.`, 'effect');
        }
      } else {
        const useEncounterPower = command === 'encounter power' && !currentHero.encounterPowerUsed;
        const powerLabel = encounterPowerName(classId, content);
        if (command === 'encounter power' && currentHero.encounterPowerUsed) {
          queueLog(logs, round, `${currentHero.name} has already spent ${powerLabel}.`, 'effect');
        }

        const attack = performAttack({
          attacker: currentHero,
          target: currentMonster,
          round,
          random,
          powerBonus: useEncounterPower ? { attack: 2, damage: 4, label: powerLabel } : undefined,
        });
        const nextHero = {
          ...currentHero,
          encounterPowerUsed: currentHero.encounterPowerUsed || useEncounterPower,
        };
        nextEncounter.combatants = nextEncounter.combatants.map((entry) => {
          if (entry.id === nextHero.id) {
            return nextHero;
          }
          if (entry.id === currentMonster.id) {
            return attack.target;
          }
          return entry;
        });
        logs.push(...attack.logs);

        if (useEncounterPower) {
          queueLog(logs, round, `${currentHero.name} unleashes ${powerLabel}.`, 'effect');
        }

        if (attack.target.currentHp <= 0) {
          nextEncounter.status = 'won';
          nextSnapshot = applyExperienceGain(nextSnapshot, nextEncounter.rewards.xp);
          nextSnapshot = changeCurrency(nextSnapshot, nextEncounter.rewards.gold);
          for (const lootItemId of nextEncounter.rewards.lootItemIds) {
            nextSnapshot = addInventoryItem(nextSnapshot, lootItemId);
          }
          queueLog(
            logs,
            round,
            `${attack.target.name} falls. ${currentHero.name} gains ${nextEncounter.rewards.xp} XP and ${nextEncounter.rewards.gold} gold.`,
            'reward'
          );
          if (nextEncounter.rewards.lootItemIds.length > 0) {
            queueLog(
              logs,
              round,
              `${currentHero.name} recovers ${nextEncounter.rewards.lootItemIds.join(', ')} from the field.`,
              'reward'
            );
          }
          break;
        }
      }

      continue;
    }

    const currentHeroAfterTurn = nextEncounter.combatants.find((entry) => entry.id === hero.id);
    const currentMonsterAfterTurn = nextEncounter.combatants.find((entry) => entry.id === monster.id);

    if (!currentHeroAfterTurn || !currentMonsterAfterTurn) {
      break;
    }

    const retaliation = performAttack({
      attacker: currentMonsterAfterTurn,
      target: currentHeroAfterTurn,
      round,
      random,
    });
    nextEncounter.combatants = nextEncounter.combatants.map((entry) =>
      entry.id === currentHeroAfterTurn.id ? retaliation.target : entry
    );
    logs.push(...retaliation.logs);

    if (retaliation.target.currentHp <= 0) {
      nextEncounter.status = 'lost';
      const fallbackHp = Math.max(1, Math.floor(currentHeroAfterTurn.maxHp / 2));
      nextSnapshot = setHitPoints(nextSnapshot, fallbackHp);
      queueLog(
        logs,
        round,
        `${currentHeroAfterTurn.name} collapses, but the shard drags them back to safety at ${fallbackHp} HP.`,
        'effect'
      );
      break;
    }

    nextSnapshot = setHitPoints(nextSnapshot, retaliation.target.currentHp);
  }

  nextEncounter.logs = logs;
  nextEncounter.queuedOverrides = queuedOverrides;
  nextEncounter.round = nextEncounter.round + 1;
  nextEncounter.nextRoundAt = new Date(new Date(nextEncounter.nextRoundAt).getTime() + ROUND_CADENCE_MS).toISOString();

  const finalHero = nextEncounter.combatants.find((entry) => entry.kind === 'hero');
  if (finalHero && nextEncounter.status === 'active') {
    nextSnapshot = setHitPoints(nextSnapshot, finalHero.currentHp);
  }

  return {
    encounter: nextEncounter,
    characterSnapshot: nextSnapshot,
  };
}

export function advanceEncounterSnapshot(input: AdvanceEncounterInput): EncounterAdvanceResult {
  const random = input.random ?? Math.random;
  let encounter = clone(input.encounter);
  let characterSnapshot = normalizeDurableProgression(input.characterSnapshot);

  if (encounter.status !== 'active') {
    return {
      encounter,
      characterSnapshot,
      resolved: true,
    };
  }

  while (encounter.status === 'active' && input.now.getTime() >= new Date(encounter.nextRoundAt).getTime()) {
    const advanced = processRound(encounter, characterSnapshot, input.content, random);
    encounter = advanced.encounter;
    characterSnapshot = advanced.characterSnapshot;
  }

  return {
    encounter,
    characterSnapshot,
    resolved: encounter.status !== 'active',
  };
}

export function queueEncounterOverride(encounter: EncounterSnapshot, command: string, queuedAt: string) {
  const hero = encounter.combatants.find((entry) => entry.kind === 'hero');

  if (!hero || !command.trim()) {
    return encounter;
  }

  return {
    ...encounter,
    queuedOverrides: [
      ...encounter.queuedOverrides,
      {
        actorId: hero.id,
        command: command.trim(),
        queuedAt,
      },
    ],
  };
}
