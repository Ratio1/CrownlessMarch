import {
  attributes,
  characterClasses,
  type AttributeName,
  type AttributeSet,
  type CharacterAction,
  type CharacterClass,
  type CharacterDefenses,
  type CharacterHitPoints,
  type CharacterModifiers,
  type DurableCharacterSnapshot,
} from './types';
import { buildAttributes, getDefaultAttributes } from './point-buy';

export interface ProgressionPosition {
  x: number;
  y: number;
}

export interface ShardLocalProgressionSnapshot {
  position: ProgressionPosition | null;
  last_position: ProgressionPosition | null;
  active_encounter: Record<string, unknown> | null;
  shard_world_progress: Record<string, unknown> | null;
}

export type ProgressionSnapshot = Partial<DurableCharacterSnapshot> &
  Partial<ShardLocalProgressionSnapshot> &
  Record<string, unknown>;

const SHARD_LOCAL_KEYS = [
  'position',
  'last_position',
  'active_encounter',
  'shard_world_progress',
] as const;

const CLASS_BASES: Record<
  CharacterClass,
  {
    hitPoints: number;
    healingSurges: number;
    speed: number;
    actions: CharacterAction[];
  }
> = {
  fighter: {
    hitPoints: 15,
    healingSurges: 9,
    speed: 5,
    actions: [
      {
        id: 'cleave',
        name: 'Cleave',
        kind: 'at-will',
        description: 'A heavy swing that punishes a nearby foe.',
      },
    ],
  },
  rogue: {
    hitPoints: 12,
    healingSurges: 6,
    speed: 6,
    actions: [
      {
        id: 'sly-flourish',
        name: 'Sly Flourish',
        kind: 'at-will',
        description: 'A quick strike with a flourish of misdirection.',
      },
    ],
  },
  wizard: {
    hitPoints: 10,
    healingSurges: 6,
    speed: 6,
    actions: [
      {
        id: 'magic-missile',
        name: 'Magic Missile',
        kind: 'at-will',
        description: 'Arcane bolts that strike with unfailing force.',
      },
    ],
  },
  cleric: {
    hitPoints: 13,
    healingSurges: 7,
    speed: 5,
    actions: [
      {
        id: 'lance-of-faith',
        name: 'Lance of Faith',
        kind: 'at-will',
        description: 'A radiant strike that steadies an ally.',
      },
    ],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function toFiniteNonNegativeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function toFiniteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function normalizeClassId(value: unknown): CharacterClass {
  return typeof value === 'string' && (characterClasses as readonly string[]).includes(value)
    ? (value as CharacterClass)
    : 'fighter';
}

function normalizeAttributeValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 8 && value <= 18
    ? value
    : 10;
}

function normalizeAttributes(value: unknown): AttributeSet {
  const record = isRecord(value) ? value : {};
  const defaults = getDefaultAttributes();

  return attributes.reduce((result, key) => {
    result[key] = normalizeAttributeValue(record[key] ?? defaults[key]);
    return result;
  }, {} as AttributeSet);
}

function modifierForScore(score: number) {
  return Math.floor((score - 10) / 2);
}

function buildModifiers(attributeSet: AttributeSet): CharacterModifiers {
  return attributes.reduce((result, key) => {
    result[key] = modifierForScore(attributeSet[key]);
    return result;
  }, {} as CharacterModifiers);
}

function highestModifier(modifiers: CharacterModifiers, keys: AttributeName[]) {
  return Math.max(...keys.map((key) => modifiers[key]));
}

function buildDefenses(classId: CharacterClass, modifiers: CharacterModifiers, level: number): CharacterDefenses {
  const halfLevel = Math.floor(level / 2);
  const armorBonus = classId === 'fighter' ? 2 : classId === 'cleric' ? 1 : 0;

  return {
    armorClass: 10 + halfLevel + armorBonus + Math.max(modifiers.dexterity, modifiers.intelligence),
    fortitude: 10 + halfLevel + highestModifier(modifiers, ['strength', 'constitution']),
    reflex: 10 + halfLevel + highestModifier(modifiers, ['dexterity', 'intelligence']),
    will: 10 + halfLevel + highestModifier(modifiers, ['wisdom', 'charisma']),
  };
}

function buildHitPoints(
  classId: CharacterClass,
  modifiers: CharacterModifiers,
  hitPoints: unknown
): CharacterHitPoints {
  const baseMax = Math.max(1, CLASS_BASES[classId].hitPoints + modifiers.constitution);

  if (!isRecord(hitPoints)) {
    return {
      current: baseMax,
      max: baseMax,
      bloodied: Math.max(1, Math.floor(baseMax / 2)),
    };
  }

  const max = toFiniteNonNegativeNumber(hitPoints.max) || baseMax;
  const current = Math.min(toFiniteNonNegativeNumber(hitPoints.current) || max, max);
  const bloodied = toFiniteNonNegativeNumber(hitPoints.bloodied) || Math.max(1, Math.floor(max / 2));

  return {
    current,
    max,
    bloodied,
  };
}

function buildQuestProgress(value: unknown) {
  return isRecord(value) ? clone(value) : {};
}

function buildEquipment(value: unknown) {
  return isRecord(value) ? clone(value) : {};
}

function buildInventory(value: unknown) {
  return Array.isArray(value) ? clone(value) : [];
}

function buildActiveQuestIds(value: unknown, questProgress: Record<string, unknown>) {
  const direct = toStringArray(value);

  if (direct.length > 0) {
    return direct;
  }

  return Object.entries(questProgress)
    .filter((entry) => {
      const progress = isRecord(entry[1]) ? entry[1] : {};
      return progress.status !== 'turned_in';
    })
    .map(([questId]) => questId);
}

export function stripShardLocalProgression(snapshot: Record<string, unknown>): Record<string, unknown> {
  const durableSnapshot = clone(snapshot);

  for (const key of SHARD_LOCAL_KEYS) {
    if (key in durableSnapshot) {
      delete durableSnapshot[key];
    }
  }

  return durableSnapshot;
}

export function buildInitialCharacterSnapshot(input: {
  name: string;
  classId: CharacterClass;
  attributes: AttributeSet;
  inventory?: string[];
  equipment?: Record<string, unknown>;
  currency?: number;
  activeQuestIds?: string[];
  skills?: string[];
  unlocks?: string[];
}): DurableCharacterSnapshot {
  const normalizedAttributes = buildAttributes(input.attributes);
  const modifiers = buildModifiers(normalizedAttributes);
  const defenses = buildDefenses(input.classId, modifiers, 1);
  const hitPoints = buildHitPoints(input.classId, modifiers, null);
  const actions = clone(CLASS_BASES[input.classId].actions);
  const currency = toFiniteNonNegativeNumber(input.currency);

  return {
    name: input.name,
    classId: input.classId,
    level: 1,
    xp: 0,
    attributes: normalizedAttributes,
    modifiers,
    defenses,
    hitPoints,
    healingSurges: CLASS_BASES[input.classId].healingSurges,
    speed: CLASS_BASES[input.classId].speed,
    initiative: modifiers.dexterity,
    passivePerception: 10 + modifiers.wisdom,
    passiveInsight: 10 + modifiers.wisdom,
    inventory: input.inventory ? [...input.inventory] : [],
    equipment: input.equipment ? clone(input.equipment) : {},
    currency,
    gold: currency,
    quest_progress: {},
    activeQuestIds: input.activeQuestIds ? [...input.activeQuestIds] : [],
    skills: input.skills ? [...input.skills] : [],
    unlocks: input.unlocks ? [...input.unlocks] : [],
    actions,
  };
}

export function normalizeDurableProgression(snapshot: Record<string, unknown>): Record<string, unknown> {
  const durableSnapshot = stripShardLocalProgression(snapshot);
  const questProgress = buildQuestProgress(durableSnapshot.quest_progress);
  const currency = toFiniteNonNegativeNumber(
    durableSnapshot.currency ?? durableSnapshot.gold
  );
  const normalized: Record<string, unknown> = {
    ...durableSnapshot,
    xp: toFiniteNonNegativeNumber(durableSnapshot.xp),
    level: toFiniteNonNegativeNumber(durableSnapshot.level),
    inventory: buildInventory(durableSnapshot.inventory),
    equipment: buildEquipment(durableSnapshot.equipment),
    currency,
    quest_progress: questProgress,
    skills: toStringArray(durableSnapshot.skills),
    unlocks: toStringArray(durableSnapshot.unlocks),
  };

  if (typeof durableSnapshot.name === 'string' && durableSnapshot.name.trim()) {
    normalized.name = durableSnapshot.name.trim();
  }

  if (typeof durableSnapshot.gold === 'number' && Number.isFinite(durableSnapshot.gold) && durableSnapshot.gold >= 0) {
    normalized.gold = durableSnapshot.gold;
  } else if ('gold' in durableSnapshot) {
    normalized.gold = currency;
  }

  if (Array.isArray(durableSnapshot.activeQuestIds)) {
    normalized.activeQuestIds = buildActiveQuestIds(durableSnapshot.activeQuestIds, questProgress);
  }

  if (
    typeof durableSnapshot.classId === 'string' ||
    isRecord(durableSnapshot.attributes) ||
    isRecord(durableSnapshot.hitPoints) ||
    isRecord(durableSnapshot.defenses)
  ) {
    const classId = normalizeClassId(durableSnapshot.classId);
    const level = Math.max(1, toFiniteNonNegativeNumber(durableSnapshot.level) || 1);
    const attributesSet = normalizeAttributes(durableSnapshot.attributes);
    const modifiers = buildModifiers(attributesSet);

    normalized.classId = classId;
    normalized.attributes = attributesSet;
    normalized.modifiers = modifiers;
    normalized.defenses = buildDefenses(classId, modifiers, level);
    normalized.hitPoints = buildHitPoints(classId, modifiers, durableSnapshot.hitPoints);
    normalized.healingSurges =
      toFiniteNonNegativeNumber(durableSnapshot.healingSurges) || CLASS_BASES[classId].healingSurges;
    normalized.speed = toFiniteNonNegativeNumber(durableSnapshot.speed) || CLASS_BASES[classId].speed;
    normalized.initiative =
      typeof durableSnapshot.initiative === 'number' && Number.isFinite(durableSnapshot.initiative)
        ? durableSnapshot.initiative
        : modifiers.dexterity;
    normalized.passivePerception =
      toFiniteNonNegativeNumber(durableSnapshot.passivePerception) || 10 + modifiers.wisdom;
    normalized.passiveInsight =
      toFiniteNonNegativeNumber(durableSnapshot.passiveInsight) || 10 + modifiers.wisdom;
    normalized.actions =
      Array.isArray(durableSnapshot.actions) && durableSnapshot.actions.length > 0
        ? clone(durableSnapshot.actions)
        : clone(CLASS_BASES[classId].actions);
  }

  return normalized;
}

export function applyExperienceGain(snapshot: ProgressionSnapshot, xpGain: number): ProgressionSnapshot {
  const currentXp = toFiniteNonNegativeNumber(snapshot.xp);
  const nextXp = currentXp + toFiniteNumber(xpGain);

  return {
    ...snapshot,
    xp: nextXp >= 0 && Number.isFinite(nextXp) ? nextXp : 0,
  };
}

export function addInventoryItem(snapshot: ProgressionSnapshot, item: unknown): ProgressionSnapshot {
  const inventory = Array.isArray(snapshot.inventory) ? snapshot.inventory.slice() : [];
  inventory.push(item as never);

  return {
    ...snapshot,
    inventory,
  };
}

export function removeInventoryItem(snapshot: ProgressionSnapshot, item: unknown): ProgressionSnapshot {
  const inventory = Array.isArray(snapshot.inventory) ? snapshot.inventory.slice() : [];
  const index = inventory.findIndex((entry) => Object.is(entry, item));

  if (index >= 0) {
    inventory.splice(index, 1);
  }

  return {
    ...snapshot,
    inventory,
  };
}

export function setEquipmentSlot(
  snapshot: ProgressionSnapshot,
  slot: string,
  item: unknown
): ProgressionSnapshot {
  const equipment = isRecord(snapshot.equipment) ? { ...snapshot.equipment } : {};
  equipment[slot] = item;

  return {
    ...snapshot,
    equipment,
  };
}

export function setLevel(snapshot: ProgressionSnapshot, level: number): ProgressionSnapshot {
  return {
    ...snapshot,
    level: Math.max(1, toFiniteNonNegativeNumber(level)),
  };
}

export function changeCurrency(snapshot: ProgressionSnapshot, delta: number): ProgressionSnapshot {
  const currentCurrency = toFiniteNonNegativeNumber(snapshot.currency);
  const nextCurrency = currentCurrency + toFiniteNumber(delta);
  const currency = nextCurrency >= 0 && Number.isFinite(nextCurrency) ? nextCurrency : 0;

  return {
    ...snapshot,
    currency,
    gold: currency,
  };
}

export function setQuestProgress(
  snapshot: ProgressionSnapshot,
  questId: string,
  progress: unknown
): ProgressionSnapshot {
  const questProgress = isRecord(snapshot.quest_progress) ? { ...snapshot.quest_progress } : {};
  questProgress[questId] = progress;

  return {
    ...snapshot,
    quest_progress: questProgress,
  };
}

export function unlockSkill(snapshot: ProgressionSnapshot, skill: unknown): ProgressionSnapshot {
  const skills = Array.isArray(snapshot.skills) ? snapshot.skills.slice() : [];
  if (typeof skill === 'string') {
    skills.push(skill);
  }

  return {
    ...snapshot,
    skills,
  };
}

export function unlockProgression(snapshot: ProgressionSnapshot, unlock: unknown): ProgressionSnapshot {
  const unlocks = Array.isArray(snapshot.unlocks) ? snapshot.unlocks.slice() : [];
  if (typeof unlock === 'string') {
    unlocks.push(unlock);
  }

  return {
    ...snapshot,
    unlocks,
  };
}
