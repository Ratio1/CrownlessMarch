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
import { DEFAULT_GAME_RULES, getClassRule } from '../content/game-rules';
import type { GameRules } from '../content/schema';

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

export interface LevelEffect {
  id: string;
  label?: string;
  levelDelta: number;
  expiresAt?: string;
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

export const MAX_CHARACTER_LEVEL = DEFAULT_GAME_RULES.progression.maxLevel;

export const XP_LEVEL_TABLE = DEFAULT_GAME_RULES.progression.xpLevelTable;

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

function clampLevel(level: number, rules: GameRules = DEFAULT_GAME_RULES) {
  return Math.min(rules.progression.maxLevel, Math.max(1, level));
}

export function levelForExperience(xp: unknown, rules: GameRules = DEFAULT_GAME_RULES) {
  const normalizedXp = toFiniteNonNegativeNumber(xp);
  let level = 1;

  for (let index = 0; index < rules.progression.xpLevelTable.length; index += 1) {
    if (normalizedXp >= rules.progression.xpLevelTable[index]) {
      level = index + 1;
    }
  }

  return clampLevel(level, rules);
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function buildLevelEffects(value: unknown): LevelEffect[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): LevelEffect[] => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || !entry.id.trim()) {
      return [];
    }

    const levelDelta = toFiniteNumber(entry.levelDelta);
    if (!Number.isInteger(levelDelta) || levelDelta === 0) {
      return [];
    }

    const effect: LevelEffect = {
      id: entry.id.trim(),
      levelDelta,
    };

    if (typeof entry.label === 'string' && entry.label.trim()) {
      effect.label = entry.label.trim();
    }

    if (typeof entry.expiresAt === 'string' && entry.expiresAt.trim()) {
      effect.expiresAt = entry.expiresAt.trim();
    }

    return [effect];
  });
}

function totalLevelDelta(levelEffects: LevelEffect[]) {
  return levelEffects.reduce((total, effect) => total + effect.levelDelta, 0);
}

function resolveRealLevel(snapshot: Record<string, unknown>, xp: number, rules: GameRules) {
  const explicitRealLevel = toFiniteNonNegativeNumber(snapshot.realLevel);
  const legacyLevel = toFiniteNonNegativeNumber(snapshot.level);
  return clampLevel(
    Math.max(explicitRealLevel || 1, legacyLevel || 1, levelForExperience(xp, rules)),
    rules
  );
}

function resolveCurrentLevel(realLevel: number, snapshot: Record<string, unknown>, levelEffects: LevelEffect[], rules: GameRules) {
  const effectiveLevel = levelEffects.length > 0 ? realLevel + totalLevelDelta(levelEffects) : realLevel;

  return clampLevel(effectiveLevel, rules);
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

function buildDefenses(
  classId: CharacterClass,
  modifiers: CharacterModifiers,
  level: number,
  rules: GameRules = DEFAULT_GAME_RULES
): CharacterDefenses {
  const halfLevel = Math.floor(level / 2);
  const armorBonus = getClassRule(rules, classId).armorClassBonus;

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
  hitPoints: unknown,
  rules: GameRules = DEFAULT_GAME_RULES
): CharacterHitPoints {
  const baseMax = Math.max(1, getClassRule(rules, classId).hitPoints + modifiers.constitution);

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
}, rules: GameRules = DEFAULT_GAME_RULES): DurableCharacterSnapshot {
  const normalizedAttributes = buildAttributes(input.attributes);
  const modifiers = buildModifiers(normalizedAttributes);
  const defenses = buildDefenses(input.classId, modifiers, 1, rules);
  const hitPoints = buildHitPoints(input.classId, modifiers, null, rules);
  const classRule = getClassRule(rules, input.classId);
  const actions = clone(classRule.actions);
  const currency = toFiniteNonNegativeNumber(input.currency);

  return {
    name: input.name,
    classId: input.classId,
    level: 1,
    realLevel: 1,
    currentLevel: 1,
    levelEffects: [],
    xp: 0,
    attributes: normalizedAttributes,
    modifiers,
    defenses,
    hitPoints,
    healingSurges: classRule.healingSurges,
    speed: classRule.speed,
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

export function normalizeDurableProgression(
  snapshot: Record<string, unknown>,
  rules: GameRules = DEFAULT_GAME_RULES
): Record<string, unknown> {
  const durableSnapshot = stripShardLocalProgression(snapshot);
  const questProgress = buildQuestProgress(durableSnapshot.quest_progress);
  const currency = toFiniteNonNegativeNumber(
    durableSnapshot.currency ?? durableSnapshot.gold
  );
  const xp = toFiniteNonNegativeNumber(durableSnapshot.xp);
  const levelEffects = buildLevelEffects(durableSnapshot.levelEffects);
  const realLevel = resolveRealLevel(durableSnapshot, xp, rules);
  const currentLevel = resolveCurrentLevel(realLevel, durableSnapshot, levelEffects, rules);
  const normalized: Record<string, unknown> = {
    ...durableSnapshot,
    xp,
    realLevel,
    currentLevel,
    level: currentLevel,
    levelEffects,
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
    const level = currentLevel;
    const attributesSet = normalizeAttributes(durableSnapshot.attributes);
    const modifiers = buildModifiers(attributesSet);
    const classRule = getClassRule(rules, classId);

    normalized.classId = classId;
    normalized.attributes = attributesSet;
    normalized.modifiers = modifiers;
    normalized.defenses = buildDefenses(classId, modifiers, level, rules);
    normalized.hitPoints = buildHitPoints(classId, modifiers, durableSnapshot.hitPoints, rules);
    normalized.healingSurges =
      toFiniteNonNegativeNumber(durableSnapshot.healingSurges) || classRule.healingSurges;
    normalized.speed = toFiniteNonNegativeNumber(durableSnapshot.speed) || classRule.speed;
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
        : clone(classRule.actions);
  }

  return normalized;
}

export function applyExperienceGain(snapshot: ProgressionSnapshot, xpGain: number): ProgressionSnapshot {
  const currentXp = toFiniteNonNegativeNumber(snapshot.xp);
  const nextXp = currentXp + toFiniteNumber(xpGain);
  const xp = nextXp >= 0 && Number.isFinite(nextXp) ? nextXp : 0;
  const levelEffects = buildLevelEffects(snapshot.levelEffects);
  const realLevel = levelForExperience(xp);
  const currentLevel = resolveCurrentLevel(realLevel, snapshot, levelEffects, DEFAULT_GAME_RULES);

  return {
    ...snapshot,
    xp,
    realLevel,
    currentLevel,
    level: currentLevel,
    levelEffects,
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
  const realLevel = clampLevel(toFiniteNonNegativeNumber(level) || 1);
  const levelEffects = buildLevelEffects(snapshot.levelEffects);
  const currentLevel = resolveCurrentLevel(realLevel, snapshot, levelEffects, DEFAULT_GAME_RULES);

  return {
    ...snapshot,
    realLevel,
    currentLevel,
    level: currentLevel,
    levelEffects,
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
