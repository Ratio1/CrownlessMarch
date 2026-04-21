export interface ProgressionPosition {
  x: number;
  y: number;
}

export interface DurableProgressionSnapshot {
  xp: number;
  level: number;
  inventory: unknown[];
  equipment: Record<string, unknown>;
  currency: number;
  quest_progress: Record<string, unknown>;
  skills: unknown[];
  unlocks: unknown[];
}

export interface ShardLocalProgressionSnapshot {
  position: ProgressionPosition | null;
  last_position: ProgressionPosition | null;
  active_encounter: Record<string, unknown> | null;
  shard_world_progress: Record<string, unknown> | null;
}

export type ProgressionSnapshot = DurableProgressionSnapshot & Partial<ShardLocalProgressionSnapshot> & Record<string, unknown>;

const SHARD_LOCAL_KEYS = [
  'position',
  'last_position',
  'active_encounter',
  'shard_world_progress',
] as const;

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

export function stripShardLocalProgression(snapshot: Record<string, unknown>): Record<string, unknown> {
  const durableSnapshot = clone(snapshot);

  for (const key of SHARD_LOCAL_KEYS) {
    if (key in durableSnapshot) {
      delete durableSnapshot[key];
    }
  }

  return durableSnapshot;
}

export function normalizeDurableProgression(snapshot: Record<string, unknown>): Record<string, unknown> {
  const durableSnapshot = stripShardLocalProgression(snapshot);

  return {
    ...durableSnapshot,
    xp: toFiniteNonNegativeNumber(durableSnapshot.xp),
    level: toFiniteNonNegativeNumber(durableSnapshot.level),
    inventory: Array.isArray(durableSnapshot.inventory) ? clone(durableSnapshot.inventory) : [],
    equipment: isRecord(durableSnapshot.equipment) ? clone(durableSnapshot.equipment) : {},
    currency: toFiniteNonNegativeNumber(durableSnapshot.currency),
    quest_progress: isRecord(durableSnapshot.quest_progress) ? clone(durableSnapshot.quest_progress) : {},
    skills: Array.isArray(durableSnapshot.skills) ? clone(durableSnapshot.skills) : [],
    unlocks: Array.isArray(durableSnapshot.unlocks) ? clone(durableSnapshot.unlocks) : [],
  };
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
  inventory.push(item);

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
    level: toFiniteNonNegativeNumber(level),
  };
}

export function changeCurrency(snapshot: ProgressionSnapshot, delta: number): ProgressionSnapshot {
  const currentCurrency = toFiniteNonNegativeNumber(snapshot.currency);
  const nextCurrency = currentCurrency + toFiniteNumber(delta);

  return {
    ...snapshot,
    currency: nextCurrency >= 0 && Number.isFinite(nextCurrency) ? nextCurrency : 0,
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
  skills.push(skill);

  return {
    ...snapshot,
    skills,
  };
}

export function unlockProgression(snapshot: ProgressionSnapshot, unlock: unknown): ProgressionSnapshot {
  const unlocks = Array.isArray(snapshot.unlocks) ? snapshot.unlocks.slice() : [];
  unlocks.push(unlock);

  return {
    ...snapshot,
    unlocks,
  };
}
