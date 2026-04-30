import type { ContentBundle } from '../content/load-content';
import type { ItemRecord, MonsterRecord } from '../../shared/content/schema';
import { getVisionWindow } from '../../shared/domain/fog';
import {
  addInventoryItem,
  applyExperienceGain,
  changeCurrency,
  normalizeDurableProgression,
  setQuestProgress,
} from '../../shared/domain/progression';
import type { EncounterSnapshot } from '../../shared/domain/combat';
import type {
  GameplayActivityEntry,
  GameplayCharacterCard,
  GameplayMonsterMarker,
  GameplayObjectiveFocus,
  GameplayQuestEntry,
  GameplayShardSnapshot,
  GameplayTileSnapshot,
} from '../../shared/gameplay';
import { advanceEncounterSnapshot, createEncounterSnapshot, queueEncounterOverride } from './combat-engine';

export interface PresencePosition {
  x: number;
  y: number;
}

export type Direction = 'north' | 'south' | 'west' | 'east';

export interface CharacterSnapshot extends Record<string, unknown> {
  cid: string;
  position?: PresencePosition;
}

export interface ShardRuntimeUpdate {
  snapshot: GameplayShardSnapshot;
  progressionToPersist?: Record<string, unknown>;
}

export interface ShardRuntimeLike {
  addPlayer(character: CharacterSnapshot): ShardRuntimeUpdate;
  removePlayer(characterId: string): void;
  movePlayer(characterId: string, direction: Direction): ShardRuntimeUpdate;
  tickPlayer(characterId: string): ShardRuntimeUpdate;
  queueOverride(characterId: string, command: string): ShardRuntimeUpdate;
  commandPlayer(characterId: string, command: string): ShardRuntimeUpdate;
  snapshotFor(characterId: string): GameplayShardSnapshot;
  markProgressionPersisted(characterId: string, nextCharacterId?: string): void;
}

interface RuntimePlayerState {
  cid: string;
  snapshot: Record<string, unknown>;
  position: PresencePosition;
  activeEncounter: EncounterSnapshot | null;
  pendingProgression: Record<string, unknown> | null;
}

interface ShardRuntimeOptions {
  content?: ContentBundle;
  now?: () => number;
  random?: () => number;
}

const DEFAULT_TILE = {
  kind: 'forest',
  blocked: false,
} as const;

const DIRECTION_DELTAS: Record<Direction, PresencePosition> = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
  east: { x: 1, y: 0 },
};

const ACTIVITY_LOG_LIMIT = 8;
const SURVEY_QUEST_ID = 'survey-the-briar-edge';
const BURN_QUEST_ID = 'burn-the-first-nest';
const SECURE_SHRINE_ROAD_QUEST_ID = 'secure-the-shrine-road';
const SHRINE_UNLOCK_ID = 'location:ember-shrine';
const RUIN_CACHE_UNLOCK_ID = 'location:watchpost-cache';
const SHRINE_ROAD_SECURED_UNLOCK_ID = 'route:shrine-road-secured';
const DEFEAT_SUPPLY_LOSS_GOLD = 3;
const TOWN_TILE = { x: 5, y: 5 } as const;
const WATCHPOST_LANE_TILE = { x: 6, y: 5 } as const;
const EMBER_SHRINE_TILE = { x: 7, y: 6 } as const;
const SHRINE_ROAD_GROVE_TILE = { x: 7, y: 5 } as const;
const ALIGNMENT_LABELS: Record<string, string> = {
  LG: 'Lawful Good',
  NG: 'Neutral Good',
  CG: 'Chaotic Good',
  LN: 'Lawful Neutral',
  N: 'True Neutral',
  CN: 'Chaotic Neutral',
  LE: 'Lawful Evil',
  NE: 'Neutral Evil',
  CE: 'Chaotic Evil',
};

const TERRAIN_COMMAND_DETAILS: Record<
  GameplayTileSnapshot['kind'],
  {
    label: string;
    summary: string;
    dc: number;
    success: string;
    failure: string;
  }
> = {
  town: {
    label: 'Town Hearth',
    summary: 'Safe ground for rest, debriefs, and regrouping under ember watchfires.',
    dc: 10,
    success: 'You read the road signs, watch posts, and fresh boot tracks around the hearth.',
    failure: 'The hearth noise hides anything subtler than the open road.',
  },
  road: {
    label: 'Road Lane',
    summary: 'A worn lane where the forest has not yet swallowed the route.',
    dc: 10,
    success: 'You spot wagon ruts and safe footing along the lane.',
    failure: 'The road gives up no new sign beyond its worn direction.',
  },
  forest: {
    label: 'Dark Forest',
    summary: 'Dense canopy and low-visibility hunting ground.',
    dc: 13,
    success: 'You pick out bent moss, listening branches, and the cleanest line forward.',
    failure: 'The canopy shifts and swallows the trail signs before they settle.',
  },
  roots: {
    label: 'Briar Roots',
    summary: 'Aggressive thorn corridors where goblins break cover.',
    dc: 14,
    success: 'You spot snare roots, goblin scuffs, and a narrow path through the briars.',
    failure: 'The roots twitch underfoot and blur the safer path.',
  },
  ruin: {
    label: 'Watchpost Ruin',
    summary: 'Broken stone lanes with loot and old blood in the moss.',
    dc: 14,
    success: 'You find old claw tracks, loose stones, and the safest line through the ruin.',
    failure: 'The broken watchpost keeps its useful marks under moss and old ash.',
  },
  shrine: {
    label: 'Ember Shrine',
    summary: 'Ancient refuge where the march briefly loosens its grip.',
    dc: 12,
    success: 'You read the ember rite and feel the shrine answer under the ash.',
    failure: 'The shrine glows, but its older marks remain shut.',
  },
  water: {
    label: 'Blackwater',
    summary: 'Flooded and blocked ground.',
    dc: 15,
    success: 'You spot the flooded edge and the point where the bank gives way.',
    failure: 'The blackwater reflects only the canopy and your own lantern.',
  },
};

const FALLBACK_CONTENT: ContentBundle = {
  classes: [
    {
      id: 'fighter',
      label: 'Fighter',
      primaryAttributes: ['strength', 'constitution'],
      passive: 'Steelbound Presence',
      encounterAbility: 'Shield Rush',
      utilityAbility: 'Second Wind',
    },
  ],
  items: [],
  monsters: [
    {
      id: 'briar-goblin',
      label: 'Briar Goblin',
      level: 1,
      defenses: { ac: 14, fortitude: 12, reflex: 13, will: 11 },
      hitPoints: 18,
      attackBonus: 4,
      damage: { dice: '1d6', bonus: 2 },
      behavior: 'skirmisher',
      alignment: 'CE',
      minimumEnhancementToHit: 0,
      vulnerabilities: [],
    },
    {
      id: 'sap-wolf',
      label: 'Sap Wolf',
      level: 2,
      defenses: { ac: 15, fortitude: 13, reflex: 14, will: 11 },
      hitPoints: 24,
      attackBonus: 5,
      damage: { dice: '1d8', bonus: 3 },
      behavior: 'skirmisher',
      alignment: 'N',
      minimumEnhancementToHit: 0,
      vulnerabilities: [],
    },
  ],
  quests: [],
  region: {
    id: 'briar-march',
    width: 11,
    height: 11,
    spawn: { x: 5, y: 5 },
    tiles: [
      { x: 5, y: 5, kind: 'town', blocked: false },
      { x: 6, y: 5, kind: 'roots', blocked: false },
    ],
  },
};

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPosition(value: unknown): value is PresencePosition {
  return !!value && typeof value === 'object' && !Array.isArray(value) && typeof (value as PresencePosition).x === 'number' && typeof (value as PresencePosition).y === 'number';
}

function getUnlocks(snapshot: Record<string, unknown>) {
  return Array.isArray(snapshot.unlocks)
    ? snapshot.unlocks.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function hasUnlock(snapshot: Record<string, unknown>, unlockId: string) {
  return getUnlocks(snapshot).includes(unlockId);
}

function withUnlock(snapshot: Record<string, unknown>, unlockId: string): Record<string, unknown> {
  const unlocks = getUnlocks(snapshot);

  if (unlocks.includes(unlockId)) {
    return snapshot;
  }

  return {
    ...snapshot,
    unlocks: [...unlocks, unlockId],
  };
}

function getQuestProgressRecord(snapshot: Record<string, unknown>, questId: string) {
  const questProgress = isRecord(snapshot.quest_progress) ? snapshot.quest_progress : {};
  const entry = questProgress[questId];

  return isRecord(entry) ? clone(entry) : {};
}

function getQuestStatus(snapshot: Record<string, unknown>, questId: string) {
  const status = getQuestProgressRecord(snapshot, questId).status;
  return status === 'ready_to_turn_in' || status === 'turned_in' ? status : 'active';
}

function getQuestCounter(snapshot: Record<string, unknown>, questId: string, key: string, fallback: number) {
  const value = Number(getQuestProgressRecord(snapshot, questId)[key] ?? fallback);
  return Number.isFinite(value) ? value : fallback;
}

function isTilePosition(tile: { x: number; y: number }, target: { x: number; y: number }) {
  return tile.x === target.x && tile.y === target.y;
}

function isShrineRoadSecured(snapshot: Record<string, unknown>) {
  return hasUnlock(snapshot, SHRINE_ROAD_SECURED_UNLOCK_ID) || getQuestStatus(snapshot, SECURE_SHRINE_ROAD_QUEST_ID) === 'turned_in';
}

function getActiveQuestIds(snapshot: Record<string, unknown>) {
  return Array.isArray(snapshot.activeQuestIds)
    ? snapshot.activeQuestIds.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function setActiveQuestIds(snapshot: Record<string, unknown>, questIds: string[]): Record<string, unknown> {
  return {
    ...snapshot,
    activeQuestIds: questIds,
  };
}

function withActiveQuest(snapshot: Record<string, unknown>, questId: string): Record<string, unknown> {
  const activeQuestIds = getActiveQuestIds(snapshot);

  if (activeQuestIds.includes(questId)) {
    return snapshot;
  }

  return setActiveQuestIds(snapshot, [...activeQuestIds, questId]);
}

function withoutActiveQuest(snapshot: Record<string, unknown>, questId: string): Record<string, unknown> {
  return setActiveQuestIds(
    snapshot,
    getActiveQuestIds(snapshot).filter((entry) => entry !== questId)
  );
}

function withQuestState(
  snapshot: Record<string, unknown>,
  questId: string,
  updates: Record<string, unknown>
): Record<string, unknown> {
  return setQuestProgress(snapshot, questId, {
    ...getQuestProgressRecord(snapshot, questId),
    ...updates,
  });
}

function getActivityLog(snapshot: Record<string, unknown>): GameplayActivityEntry[] {
  return Array.isArray(snapshot.activityLog)
    ? snapshot.activityLog.filter((entry): entry is GameplayActivityEntry => {
        return (
          isRecord(entry) &&
          typeof entry.id === 'string' &&
          typeof entry.text === 'string' &&
          (entry.kind === 'system' || entry.kind === 'quest' || entry.kind === 'reward' || entry.kind === 'check')
        );
      })
    : [];
}

function appendActivityLog(
  snapshot: Record<string, unknown>,
  text: string,
  kind: GameplayActivityEntry['kind'],
  now: string,
): Record<string, unknown> {
  const activityLog = getActivityLog(snapshot);

  return {
    ...snapshot,
    activityLog: [
      ...activityLog,
      {
        id: `${kind}:${now}:${activityLog.length}`,
        text,
        kind,
      },
    ].slice(-ACTIVITY_LOG_LIMIT),
  };
}

function normalizeCommand(command: string) {
  return command.trim().toLowerCase().replace(/\s+/g, ' ');
}

function rollD20(random: () => number) {
  return Math.floor(random() * 20) + 1;
}

function getModifier(snapshot: Record<string, unknown>, key: 'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma') {
  if (!isRecord(snapshot.modifiers)) {
    return 0;
  }

  const value = snapshot.modifiers[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function matchesTargetText(target: string, id: string, label: string) {
  if (!target) {
    return true;
  }

  const normalizedId = id.toLowerCase().replace(/-/g, ' ');
  const normalizedLabel = label.toLowerCase();

  return normalizedId.includes(target) || normalizedLabel.includes(target) || target.includes(normalizedLabel);
}

function formatSignedBonus(value: number) {
  return value >= 0 ? `+${value}` : String(value);
}

function formatCriticalRange(minimum: number | undefined, multiplier: number | undefined) {
  const range = minimum && minimum < 20 ? `${minimum}-20` : '20';
  return `${range}/x${multiplier ?? 2}`;
}

function directionFromCommand(command: string): Direction | null {
  switch (command) {
    case 'n':
    case 'north':
      return 'north';
    case 's':
    case 'south':
      return 'south';
    case 'w':
    case 'west':
      return 'west';
    case 'e':
    case 'east':
      return 'east';
    default:
      return null;
  }
}

function overrideFromCommand(command: string) {
  switch (command) {
    case 'power':
    case 'encounter':
    case 'encounter power':
    case 'use power':
      return 'encounter power';
    case 'potion':
    case 'drink potion':
    case 'use potion':
      return 'potion';
    case 'retreat':
    case 'flee':
      return 'retreat';
    default:
      return null;
  }
}

function exitsForTile(
  position: PresencePosition,
  getTileAt: (x: number, y: number) => { blocked: boolean },
  isWithinBounds: (position: PresencePosition) => boolean,
) {
  return (Object.entries(DIRECTION_DELTAS) as Array<[Direction, PresencePosition]>)
    .filter(([, delta]) => {
      const nextPosition = {
        x: position.x + delta.x,
        y: position.y + delta.y,
      };
      return isWithinBounds(nextPosition) && !getTileAt(nextPosition.x, nextPosition.y).blocked;
    })
    .map(([direction]) => direction);
}

function questProgressText(snapshot: Record<string, unknown>, questId: string) {
  if (questId === SURVEY_QUEST_ID) {
    const status = getQuestStatus(snapshot, questId);
    if (status === 'turned_in') {
      return 'Debrief complete. Captain Mire now holds the shrine report.';
    }
    return status === 'ready_to_turn_in'
      ? 'Return to town with the shrine report.'
      : 'Reach the Ember Shrine east of town.';
  }

  if (questId === BURN_QUEST_ID) {
    const status = getQuestStatus(snapshot, questId);
    if (status === 'turned_in') {
      return 'Debrief complete. The first goblin nest burned clean.';
    }
    return status === 'ready_to_turn_in'
      ? 'Return to town for the debrief.'
      : `${Math.min(
          getQuestCounter(snapshot, questId, 'goblinsDefeated', 0),
          getQuestCounter(snapshot, questId, 'target', 2),
        )}/${getQuestCounter(snapshot, questId, 'target', 2)} Briar Goblins defeated.`;
  }

  if (questId === SECURE_SHRINE_ROAD_QUEST_ID) {
    const status = getQuestStatus(snapshot, questId);
    if (status === 'turned_in') {
      return 'Debrief complete. The shrine road is holding under ember watchfires.';
    }
    if (status === 'ready_to_turn_in') {
      return 'Return to town with word that the shrine road is safe.';
    }

    const progress = getQuestProgressRecord(snapshot, questId);
    if (progress.shrineVisited === true && progress.wolfDefeated === true) {
      return 'Return to town with word that the shrine road is safe.';
    }
    if (progress.shrineVisited === true) {
      return `${Math.min(
        getQuestCounter(snapshot, questId, 'wolvesDefeated', 0),
        getQuestCounter(snapshot, questId, 'target', 1),
      )}/${getQuestCounter(snapshot, questId, 'target', 1)} Sap Wolves defeated on the shrine road.`;
    }
    if (progress.wolfDefeated === true) {
      return 'Return to the Ember Shrine to bless the cleared grove.';
    }
    return 'Revisit the Ember Shrine, then cull the Sap Wolf in the grove.';
  }

  return 'In progress.';
}

function toQuestEntry(snapshot: Record<string, unknown>, content: ContentBundle, questId: string): GameplayQuestEntry | null {
  const quest = content.quests.find((entry) => entry.id === questId);

  if (!quest) {
    return null;
  }

  const progress = getQuestProgressRecord(snapshot, questId);
  const status = getQuestStatus(snapshot, questId);
  const entry: GameplayQuestEntry = {
    id: quest.id,
    label: quest.label,
    objective: quest.objective,
    rewardXp: quest.rewardXp,
    status,
    progress: questProgressText(snapshot, quest.id),
  };

  if (status === 'turned_in' && typeof progress.turnedInAt === 'string') {
    entry.completedAt = progress.turnedInAt;
  }

  return entry;
}

function toCompletedQuestEntries(snapshot: Record<string, unknown>, content: ContentBundle): GameplayQuestEntry[] {
  const questProgress = isRecord(snapshot.quest_progress) ? snapshot.quest_progress : {};

  return Object.keys(questProgress)
    .map((questId) => toQuestEntry(snapshot, content, questId))
    .filter((entry): entry is GameplayQuestEntry => {
      if (!entry) {
        return false;
      }

      return entry.status === 'turned_in';
    })
    .sort((left, right) => {
      const leftTime = left.completedAt ? Date.parse(left.completedAt) : 0;
      const rightTime = right.completedAt ? Date.parse(right.completedAt) : 0;
      return rightTime - leftTime;
    });
}

function toObjectiveFocus(snapshot: Record<string, unknown>, content: ContentBundle): GameplayObjectiveFocus | null {
  const questId = getActiveQuestIds(snapshot)[0];

  if (!questId) {
    return null;
  }

  const quest = content.quests.find((entry) => entry.id === questId);

  if (!quest) {
    return null;
  }

  if (questId === SURVEY_QUEST_ID) {
    const ready = getQuestStatus(snapshot, questId) === 'ready_to_turn_in';
    return {
      label: quest.label,
      detail: ready ? 'Carry the shrine report back to Captain Mire.' : 'Reach the Ember Shrine east of town.',
      stateLabel: ready ? 'Return to town' : 'March to shrine',
      target: ready ? TOWN_TILE : EMBER_SHRINE_TILE,
      terrain: ready ? 'town' : 'shrine',
    };
  }

  if (questId === BURN_QUEST_ID) {
    const ready = getQuestStatus(snapshot, questId) === 'ready_to_turn_in';
    return {
      label: quest.label,
      detail: ready ? 'Return to town for the watchpost debrief.' : 'Cull Briar Goblins on the watchpost lane.',
      stateLabel: ready ? 'Return to town' : 'Cull goblins',
      target: ready ? TOWN_TILE : WATCHPOST_LANE_TILE,
      terrain: ready ? 'town' : 'roots',
    };
  }

  if (questId === SECURE_SHRINE_ROAD_QUEST_ID) {
    const status = getQuestStatus(snapshot, questId);
    const progress = getQuestProgressRecord(snapshot, questId);

    if (status === 'ready_to_turn_in') {
      return {
        label: quest.label,
        detail: 'Report back to town that the shrine road is holding.',
        stateLabel: 'Return to town',
        target: TOWN_TILE,
        terrain: 'town',
      };
    }

    if (progress.wolfDefeated === true && progress.shrineVisited !== true) {
      return {
        label: quest.label,
        detail: 'Return to the Ember Shrine to bless the cleared grove.',
        stateLabel: 'Revisit shrine',
        target: EMBER_SHRINE_TILE,
        terrain: 'shrine',
      };
    }

    if (progress.shrineVisited === true) {
      return {
        label: quest.label,
        detail: isShrineRoadSecured(snapshot)
          ? 'The grove is quiet, but return to town and close the contract.'
          : 'Bring down the Sap Wolf in the grove north of the shrine.',
        stateLabel: 'Break the grove wolf',
        target: SHRINE_ROAD_GROVE_TILE,
        terrain: 'forest',
      };
    }

    return {
      label: quest.label,
      detail: 'Revisit the Ember Shrine and prepare the grove hunt.',
      stateLabel: 'Revisit shrine',
      target: EMBER_SHRINE_TILE,
      terrain: 'shrine',
    };
  }

  return {
    label: quest.label,
    detail: quest.objective,
    stateLabel: 'Hold course',
    target: TOWN_TILE,
    terrain: 'town',
  };
}

function resolveHostileMonsterId(
  snapshot: Record<string, unknown>,
  tile: { x: number; y: number; kind: GameplayTileSnapshot['kind'] }
) {
  if (tile.kind === 'roots' || tile.kind === 'ruin') {
    return 'briar-goblin';
  }

  if (tile.kind !== 'forest') {
    return null;
  }

  if (isTilePosition(tile, SHRINE_ROAD_GROVE_TILE)) {
    return isShrineRoadSecured(snapshot) ? null : 'sap-wolf';
  }

  return null;
}

function healToFull(snapshot: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeDurableProgression(snapshot);
  const hitPoints = isRecord(normalized.hitPoints) ? clone(normalized.hitPoints) : { current: 10, max: 10, bloodied: 5 };
  const max = typeof hitPoints.max === 'number' && Number.isFinite(hitPoints.max) ? hitPoints.max : 10;
  const bloodied =
    typeof hitPoints.bloodied === 'number' && Number.isFinite(hitPoints.bloodied)
      ? hitPoints.bloodied
      : Math.max(1, Math.floor(max / 2));

  return {
    ...normalized,
    hitPoints: {
      current: max,
      max,
      bloodied,
    },
  };
}

function getQuestById(content: ContentBundle, questId: string) {
  return content.quests.find((entry) => entry.id === questId) ?? null;
}

function toQuestEntries(snapshot: Record<string, unknown>, content: ContentBundle): GameplayQuestEntry[] {
  const questIds = Array.isArray(snapshot.activeQuestIds)
    ? snapshot.activeQuestIds.filter((entry): entry is string => typeof entry === 'string')
    : [];

  return questIds
    .map((questId) => toQuestEntry(snapshot, content, questId))
    .filter((entry): entry is GameplayQuestEntry => {
      if (!entry) {
        return false;
      }

      return entry.status === 'active' || entry.status === 'ready_to_turn_in';
    });
}

function toInventory(snapshot: Record<string, unknown>, content: ContentBundle) {
  const inventoryIds = Array.isArray(snapshot.inventory)
    ? snapshot.inventory.filter((entry): entry is string => typeof entry === 'string')
    : [];

  return inventoryIds.map((itemId) => {
    const item = content.items.find((entry) => entry.id === itemId);
    return {
      id: itemId,
      label: item?.label ?? itemId,
      effect: item?.effect ?? 'Unknown field gear.',
    };
  });
}

function toEquipment(snapshot: Record<string, unknown>, content: ContentBundle) {
  const equipment =
    snapshot.equipment && typeof snapshot.equipment === 'object' && !Array.isArray(snapshot.equipment)
      ? (snapshot.equipment as Record<string, unknown>)
      : {};

  return Object.entries(equipment)
    .filter((entry) => typeof entry[1] === 'string')
    .map(([slot, rawItemId]) => {
      const itemId = String(rawItemId);
      const item = content.items.find((entry) => entry.id === itemId);
      return {
        slot,
        id: itemId,
        label: item?.label ?? itemId,
        effect: item?.effect ?? 'Unknown field gear.',
      };
    });
}

function toCharacterCard(
  player: RuntimePlayerState,
  content: ContentBundle
): GameplayCharacterCard {
  const classId = typeof player.snapshot.classId === 'string' ? player.snapshot.classId : 'fighter';
  const classRecord = content.classes.find((entry) => entry.id === classId) ?? content.classes[0];
  const hitPoints =
    player.snapshot.hitPoints && typeof player.snapshot.hitPoints === 'object' && !Array.isArray(player.snapshot.hitPoints)
      ? clone(player.snapshot.hitPoints as GameplayCharacterCard['hitPoints'])
      : { current: 10, max: 10, bloodied: 5 };
  const defenses =
    player.snapshot.defenses && typeof player.snapshot.defenses === 'object' && !Array.isArray(player.snapshot.defenses)
      ? clone(player.snapshot.defenses as GameplayCharacterCard['defenses'])
      : { armorClass: 10, fortitude: 10, reflex: 10, will: 10 };
  const actions = Array.isArray(player.snapshot.actions) ? clone(player.snapshot.actions) : [];

  return {
    cid: player.cid,
    name: typeof player.snapshot.name === 'string' ? player.snapshot.name : 'Adventurer',
    classId,
    classLabel: classRecord?.label ?? 'Adventurer',
    passive: classRecord?.passive ?? 'Hold the line.',
    encounterAbility: classRecord?.encounterAbility ?? 'Encounter power',
    utilityAbility: classRecord?.utilityAbility ?? 'Utility',
    level: typeof player.snapshot.level === 'number' ? player.snapshot.level : 1,
    xp: typeof player.snapshot.xp === 'number' ? player.snapshot.xp : 0,
    gold: typeof player.snapshot.gold === 'number' ? player.snapshot.gold : 0,
    hitPoints,
    defenses,
    position: clone(player.position),
    actions,
    inventory: toInventory(player.snapshot, content),
    equipment: toEquipment(player.snapshot, content),
    unlocks: getUnlocks(player.snapshot),
    quests: toQuestEntries(player.snapshot, content),
    completedQuests: toCompletedQuestEntries(player.snapshot, content),
  };
}

function toActivityEntries(snapshot: Record<string, unknown>) {
  return getActivityLog(snapshot);
}

function normalizePlayerSnapshot(character: CharacterSnapshot) {
  return normalizeDurableProgression(character);
}

export class ShardRuntime implements ShardRuntimeLike {
  private readonly players = new Map<string, RuntimePlayerState>();
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly content: ContentBundle;

  constructor(private readonly options: ShardRuntimeOptions = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.content = options.content ?? FALLBACK_CONTENT;
  }

  addPlayer(character: CharacterSnapshot): ShardRuntimeUpdate {
    const normalizedSnapshot = normalizePlayerSnapshot(character);
    const position = isPosition(character.position) ? clone(character.position) : clone(this.content.region.spawn);
    const nextPlayer: RuntimePlayerState = {
      cid: character.cid,
      snapshot: normalizedSnapshot,
      position,
      activeEncounter: null,
      pendingProgression: null,
    };

    this.applyTileInteractions(nextPlayer, this.getTileAt(position.x, position.y), 'attach');
    this.players.set(character.cid, nextPlayer);

    return {
      snapshot: this.snapshotFor(character.cid),
      progressionToPersist: nextPlayer.pendingProgression ?? undefined,
    };
  }

  removePlayer(characterId: string): void {
    this.players.delete(characterId);
  }

  movePlayer(characterId: string, direction: Direction): ShardRuntimeUpdate {
    const player = this.players.get(characterId);

    if (!player) {
      return {
        snapshot: this.snapshotFor(characterId),
      };
    }

    if (player.activeEncounter?.status === 'active') {
      return {
        snapshot: this.snapshotFor(characterId),
      };
    }

    if (player.activeEncounter) {
      player.activeEncounter = null;
    }

    const delta = DIRECTION_DELTAS[direction];
    const nextPosition = {
      x: player.position.x + delta.x,
      y: player.position.y + delta.y,
    };

    if (!this.isWithinBounds(nextPosition)) {
      return {
        snapshot: this.snapshotFor(characterId),
      };
    }

    const tile = this.getTileAt(nextPosition.x, nextPosition.y);
    if (tile.blocked) {
      return {
        snapshot: this.snapshotFor(characterId),
      };
    }

    player.position = nextPosition;
    this.applyTileInteractions(player, tile, 'move');

    const monsterId = resolveHostileMonsterId(player.snapshot, tile);
    if (monsterId) {
      const monster = this.content.monsters.find((entry) => entry.id === monsterId);
      if (monster) {
        player.activeEncounter = createEncounterSnapshot({
          characterId,
          characterSnapshot: player.snapshot,
          monster,
          tileKind: tile.kind,
          content: this.content,
          now: new Date(this.now()),
          random: this.random,
        });
      }
    }

    return {
      snapshot: this.snapshotFor(characterId),
      progressionToPersist: player.pendingProgression ?? undefined,
    };
  }

  tickPlayer(characterId: string): ShardRuntimeUpdate {
    const player = this.players.get(characterId);

    if (!player) {
      return {
        snapshot: this.snapshotFor(characterId),
      };
    }

    if (player.activeEncounter) {
      const advanced = advanceEncounterSnapshot({
        encounter: player.activeEncounter,
        characterSnapshot: player.snapshot,
        content: this.content,
        now: new Date(this.now()),
        random: this.random,
      });

      player.activeEncounter = advanced.encounter;
      player.snapshot = normalizeDurableProgression(advanced.characterSnapshot);
      this.applyEncounterOutcome(player, advanced.encounter);

      if (advanced.resolved && !player.pendingProgression) {
        player.pendingProgression = clone(player.snapshot);
      }
    }

    return {
      snapshot: this.snapshotFor(characterId),
      progressionToPersist: player.pendingProgression ?? undefined,
    };
  }

  queueOverride(characterId: string, command: string): ShardRuntimeUpdate {
    const player = this.players.get(characterId);

    if (!player) {
      return {
        snapshot: this.snapshotFor(characterId),
      };
    }

    if (player.activeEncounter?.status === 'active') {
      player.activeEncounter = queueEncounterOverride(
        player.activeEncounter,
        command,
        new Date(this.now()).toISOString()
      );
    }

    return {
      snapshot: this.snapshotFor(characterId),
    };
  }

  commandPlayer(characterId: string, command: string): ShardRuntimeUpdate {
    const player = this.players.get(characterId);

    if (!player) {
      return {
        snapshot: this.snapshotFor(characterId),
      };
    }

    const normalizedCommand = normalizeCommand(command);
    const direction = directionFromCommand(normalizedCommand);

    if (direction) {
      return this.movePlayer(characterId, direction);
    }

    const overrideCommand = overrideFromCommand(normalizedCommand);

    if (overrideCommand && player.activeEncounter?.status === 'active') {
      return this.queueOverride(characterId, overrideCommand);
    }

    const nowIso = new Date(this.now()).toISOString();
    const text = this.resolveMudCommandText(player, normalizedCommand);
    const isCheckCommand =
      text.startsWith(`${this.characterName(player)} rolls `) ||
      normalizedCommand === 'consider' ||
      normalizedCommand.startsWith('consider ') ||
      normalizedCommand === 'con' ||
      normalizedCommand.startsWith('con ');
    const kind: GameplayActivityEntry['kind'] = isCheckCommand
      ? 'check'
      : 'system';
    player.snapshot = normalizeDurableProgression(appendActivityLog(player.snapshot, text, kind, nowIso));

    return {
      snapshot: this.snapshotFor(characterId),
    };
  }

  markProgressionPersisted(characterId: string, nextCharacterId?: string): void {
    const player = this.players.get(characterId);

    if (!player) {
      return;
    }

    player.pendingProgression = null;

    if (nextCharacterId && nextCharacterId !== characterId) {
      this.players.delete(characterId);
      player.cid = nextCharacterId;
      this.players.set(nextCharacterId, player);
    }
  }

  private characterName(player: RuntimePlayerState) {
    return typeof player.snapshot.name === 'string' ? player.snapshot.name : 'Adventurer';
  }

  private describeCurrentRoom(player: RuntimePlayerState) {
    const tile = this.getTileAt(player.position.x, player.position.y);
    const terrain = TERRAIN_COMMAND_DETAILS[tile.kind];
    const exits = exitsForTile(
      player.position,
      (x, y) => this.getTileAt(x, y),
      (position) => this.isWithinBounds(position)
    );
    const hostileId = resolveHostileMonsterId(player.snapshot, tile);
    const hostile = hostileId ? this.content.monsters.find((entry) => entry.id === hostileId) : null;
    const hostileText = hostile ? ` Threat: ${hostile.label}.` : '';

    return `${terrain.label}. ${terrain.summary}${hostileText} Exits: ${exits.join(', ') || 'none'}.`;
  }

  private describeExamine(player: RuntimePlayerState, command: string) {
    const tile = this.getTileAt(player.position.x, player.position.y);
    const terrain = TERRAIN_COMMAND_DETAILS[tile.kind];
    const target = command.replace(/^(examine|x|look at)\s*/, '').trim();

    if (!target || target === 'ground' || target === 'room' || target === tile.kind || target === terrain.label.toLowerCase()) {
      return `${terrain.label}: ${terrain.summary}`;
    }

    if (target === 'self' || target === 'me') {
      const card = toCharacterCard(player, this.content);
      return `${card.name}: ${card.classLabel} level ${card.level}, HP ${card.hitPoints.current}/${card.hitPoints.max}, AC ${card.defenses.armorClass}.`;
    }

    const visibleMonster = Object.values(this.getVisibleMonsters(player.snapshot, player.position, 0))[0] ?? null;
    if (visibleMonster && (target.includes('monster') || target.includes('goblin') || target.includes('wolf'))) {
      return `${visibleMonster.label}: level ${visibleMonster.level} ${visibleMonster.behavior}, close enough to force the next exchange.`;
    }

    return `You study ${target}, but the ${terrain.label} offers no clear answer.`;
  }

  private resolveFieldCheck(player: RuntimePlayerState, command: string) {
    const tile = this.getTileAt(player.position.x, player.position.y);
    const terrain = TERRAIN_COMMAND_DETAILS[tile.kind];
    const roll = rollD20(this.random);
    const modifier = getModifier(player.snapshot, 'wisdom');
    const total = roll + modifier;
    const success = total >= terrain.dc;
    const verb = command.split(' ')[0] || 'search';

    return `${this.characterName(player)} rolls ${roll} + ${modifier} = ${total} vs DC ${terrain.dc} to ${verb} ${terrain.label}: ${
      success ? 'success' : 'failure'
    }. ${success ? terrain.success : terrain.failure}`;
  }

  private getEquippedWeapon(player: RuntimePlayerState): ItemRecord | null {
    const equipment =
      player.snapshot.equipment && typeof player.snapshot.equipment === 'object' && !Array.isArray(player.snapshot.equipment)
        ? (player.snapshot.equipment as Record<string, unknown>)
        : {};
    const equippedIds = Object.values(equipment).filter((value): value is string => typeof value === 'string');

    for (const itemId of equippedIds) {
      const item = this.content.items.find((entry) => entry.id === itemId);
      if (item?.slot === 'weapon') {
        return item;
      }
    }

    return null;
  }

  private findConsiderTarget(player: RuntimePlayerState, target: string): MonsterRecord | null {
    if (player.activeEncounter?.monsterId) {
      const activeMonster = this.content.monsters.find((entry) => entry.id === player.activeEncounter?.monsterId) ?? null;
      if (activeMonster && matchesTargetText(target, activeMonster.id, activeMonster.label)) {
        return activeMonster;
      }
    }

    const visibleMonsters = Object.values(this.getVisibleMonsters(player.snapshot, player.position, getVisionWindow(
      typeof player.snapshot.level === 'number' ? player.snapshot.level : 1
    ).radius));

    for (const marker of visibleMonsters) {
      const monster = this.content.monsters.find((entry) => entry.label === marker.label) ?? null;
      if (monster && matchesTargetText(target, monster.id, monster.label)) {
        return monster;
      }
    }

    return null;
  }

  private resolveConsider(player: RuntimePlayerState, command: string) {
    const target = command.replace(/^(consider|con)\s*/, '').trim();
    const monster = this.findConsiderTarget(player, target);

    if (!monster) {
      return target
        ? `You consider ${target}, but no clear threat answers from the visible field.`
        : 'You consider the field, but no immediate threat stands out.';
    }

    const weapon = this.getEquippedWeapon(player);
    const weaponLabel = weapon?.label ?? 'unarmed strike';
    const weaponEnhancement = weapon?.bonus ?? 0;
    const damage = monster.damage.bonus === 0 ? monster.damage.dice : `${monster.damage.dice}+${monster.damage.bonus}`;
    const minimumEnhancement = monster.minimumEnhancementToHit ?? 0;
    const alignment = ALIGNMENT_LABELS[monster.alignment] ?? monster.alignment;
    const critical = weapon ? `, ${formatCriticalRange(weapon.criticalRangeMin, weapon.criticalMultiplier)}` : '';
    const holyHint =
      weapon?.modifiers.includes('holy') && (monster.alignment === 'LE' || monster.alignment === 'NE' || monster.alignment === 'CE')
        ? ' Holy damage applies.'
        : '';
    const gateHint =
      minimumEnhancement > 0 && weaponEnhancement < minimumEnhancement
        ? ` Your ${formatSignedBonus(weaponEnhancement)} ${weaponLabel} cannot pierce its ward; it requires a +${minimumEnhancement} weapon.`
        : minimumEnhancement > 0
          ? ` Your ${formatSignedBonus(weaponEnhancement)} ${weaponLabel} can pierce its +${minimumEnhancement} ward.`
          : ` Your ${weaponLabel} can affect it.`;

    return `${this.characterName(player)} considers ${monster.label}: ${monster.behavior}, ${alignment}, ${monster.hitPoints} HP, ${formatSignedBonus(
      monster.attackBonus
    )} Attack, ${damage} damage. Wielding ${weaponLabel}${
      weapon ? ` (${formatSignedBonus(weapon.bonus)}, ${weapon.damage}${critical})` : ''
    }.${gateHint}${holyHint}`;
  }

  private resolveMudCommandText(player: RuntimePlayerState, command: string) {
    if (!command || command === 'help' || command === '?') {
      return 'Commands: look, consider <target>, examine <thing>, search, scout, pray, north, south, east, west, potion, power, retreat.';
    }

    if (command === 'look' || command === 'l') {
      return this.describeCurrentRoom(player);
    }

    if (command.startsWith('examine ') || command.startsWith('x ') || command.startsWith('look at ')) {
      return this.describeExamine(player, command);
    }

    if (command === 'consider' || command.startsWith('consider ') || command === 'con' || command.startsWith('con ')) {
      return this.resolveConsider(player, command);
    }

    if (command === 'search' || command.startsWith('search ') || command === 'scout' || command.startsWith('scout ') || command === 'pray' || command.startsWith('pray ')) {
      return this.resolveFieldCheck(player, command);
    }

    if (overrideFromCommand(command)) {
      return 'That override only matters while an encounter is active.';
    }

    return `Unknown command "${command}". Try look, consider, examine, search, scout, pray, north, south, east, west, potion, power, or retreat.`;
  }

  snapshotFor(characterId: string): GameplayShardSnapshot {
    const player = this.players.get(characterId);
    const fallbackPosition = clone(this.content.region.spawn);
    const vision = getVisionWindow(
      typeof player?.snapshot.level === 'number' ? player.snapshot.level : 1
    );
    const position = player ? clone(player.position) : fallbackPosition;
    const currentTile = this.toGameplayTileSnapshot(this.getTileAt(position.x, position.y));
    const visibleTiles = this.getVisibleTiles(position, vision.radius);
    const visibleCharacters = this.getVisibleCharacters(characterId, position, vision.radius);
    const visibleMonsters = this.getVisibleMonsters(player?.snapshot ?? {}, position, vision.radius);
    const fallbackCard = player
      ? toCharacterCard(player, this.content)
      : {
          cid: characterId,
          name: 'Adventurer',
          classId: 'fighter',
          classLabel: 'Fighter',
          passive: 'Hold the line.',
          encounterAbility: 'Shield Rush',
          utilityAbility: 'Second Wind',
          level: 1,
          xp: 0,
          gold: 0,
          hitPoints: { current: 10, max: 10, bloodied: 5 },
          defenses: { armorClass: 10, fortitude: 10, reflex: 10, will: 10 },
          position,
          actions: [],
          inventory: [],
          equipment: [],
          unlocks: [],
          quests: [],
          completedQuests: [],
        };

    return {
      regionId: this.content.region.id,
      position,
      vision,
      currentTile,
      visibleTiles,
      characters: visibleCharacters,
      monsters: visibleMonsters,
      character: fallbackCard,
      objectiveFocus: player ? toObjectiveFocus(player.snapshot, this.content) : null,
      encounter: player?.activeEncounter ? clone(player.activeEncounter) : null,
      movementLocked: player?.activeEncounter?.status === 'active',
      activityLog: player ? toActivityEntries(player.snapshot) : [],
    };
  }

  private getVisibleTiles(position: PresencePosition, radius: number) {
    const tiles: GameplayShardSnapshot['visibleTiles'] = [];

    for (let y = position.y - radius; y <= position.y + radius; y += 1) {
      for (let x = position.x - radius; x <= position.x + radius; x += 1) {
        if (!this.isWithinBounds({ x, y })) {
          continue;
        }

        const tile = this.getTileAt(x, y);
        tiles.push(this.toGameplayTileSnapshot(tile));
      }
    }

    return tiles;
  }

  private getVisibleCharacters(characterId: string, position: PresencePosition, radius: number) {
    const visible: GameplayShardSnapshot['characters'] = {};

    for (const [playerId, player] of this.players.entries()) {
      const visibleX = Math.abs(player.position.x - position.x) <= radius;
      const visibleY = Math.abs(player.position.y - position.y) <= radius;

      if (!visibleX || !visibleY) {
        continue;
      }

      visible[playerId] = {
        cid: playerId,
        name: typeof player.snapshot.name === 'string' ? player.snapshot.name : playerId,
        classId: typeof player.snapshot.classId === 'string' ? player.snapshot.classId : undefined,
        position: clone(player.position),
      };

      if (playerId === characterId) {
        visible[playerId].cid = player.cid;
      }
    }

    return visible;
  }

  private getVisibleMonsters(
    snapshot: Record<string, unknown>,
    position: PresencePosition,
    radius: number
  ): Record<string, GameplayMonsterMarker> {
    const visible: Record<string, GameplayMonsterMarker> = {};

    for (let y = position.y - radius; y <= position.y + radius; y += 1) {
      for (let x = position.x - radius; x <= position.x + radius; x += 1) {
        if (!this.isWithinBounds({ x, y })) {
          continue;
        }

        const tile = this.getTileAt(x, y);
        const monsterId = resolveHostileMonsterId(snapshot, tile);
        if (!monsterId) {
          continue;
        }

        const monster = this.content.monsters.find((entry) => entry.id === monsterId);
        if (!monster) {
          continue;
        }

        visible[`monster:${x}:${y}`] = {
          id: `monster:${x}:${y}`,
          label: monster.label,
          position: { x, y },
          behavior: monster.behavior,
          level: monster.level,
        };
      }
    }

    return visible;
  }

  private getTileAt(x: number, y: number) {
    const tile = this.content.region.tiles.find((entry) => entry.x === x && entry.y === y);
    if (tile) {
      return tile;
    }

    return {
      x,
      y,
      ...DEFAULT_TILE,
    };
  }

  private toGameplayTileSnapshot(tile: {
    x: number;
    y: number;
    kind: GameplayTileSnapshot['kind'];
    blocked: boolean;
  }): GameplayTileSnapshot {
    return {
      x: tile.x,
      y: tile.y,
      kind: tile.kind,
      blocked: tile.blocked,
    };
  }

  private updatePlayerSnapshot(player: RuntimePlayerState, nextSnapshot: Record<string, unknown>) {
    player.snapshot = normalizeDurableProgression(nextSnapshot);
    player.pendingProgression = clone(player.snapshot);
  }

  private turnInQuest(
    snapshot: Record<string, unknown>,
    questId: string,
    goldReward: number,
    note: string,
    nowIso: string,
  ): Record<string, unknown> {
    const quest = getQuestById(this.content, questId);

    if (!quest) {
      return snapshot;
    }

    let nextSnapshot = withoutActiveQuest(snapshot, questId);
    nextSnapshot = withQuestState(nextSnapshot, questId, {
      status: 'turned_in',
      turnedInAt: nowIso,
    });
    nextSnapshot = applyExperienceGain(nextSnapshot, quest.rewardXp);
    nextSnapshot = changeCurrency(nextSnapshot, goldReward);
    nextSnapshot = appendActivityLog(
      nextSnapshot,
      `${quest.label} is turned in. ${quest.rewardXp} XP and ${goldReward} gold claimed. ${note}`,
      'reward',
      nowIso,
    );

    return nextSnapshot;
  }

  private applyTileInteractions(
    player: RuntimePlayerState,
    tile: { kind: GameplayTileSnapshot['kind']; blocked: boolean; x: number; y: number },
    source: 'attach' | 'move',
  ) {
    let nextSnapshot = player.snapshot;
    let changed = false;
    const nowIso = new Date(this.now()).toISOString();
    const currentHp =
      isRecord(nextSnapshot.hitPoints) && typeof nextSnapshot.hitPoints.current === 'number'
        ? nextSnapshot.hitPoints.current
        : null;
    const maxHp =
      isRecord(nextSnapshot.hitPoints) && typeof nextSnapshot.hitPoints.max === 'number'
        ? nextSnapshot.hitPoints.max
        : null;

    if (tile.kind === 'shrine' && !getUnlocks(nextSnapshot).includes(SHRINE_UNLOCK_ID)) {
      nextSnapshot = withUnlock(nextSnapshot, SHRINE_UNLOCK_ID);
      nextSnapshot = healToFull(nextSnapshot);
      nextSnapshot = addInventoryItem(nextSnapshot, 'health-potion');
      nextSnapshot = appendActivityLog(
        nextSnapshot,
        'The Ember Shrine restores your strength and grants a fresh health potion.',
        'reward',
        nowIso,
      );

      if (getActiveQuestIds(nextSnapshot).includes(SURVEY_QUEST_ID) && getQuestStatus(nextSnapshot, SURVEY_QUEST_ID) !== 'ready_to_turn_in') {
        nextSnapshot = withQuestState(nextSnapshot, SURVEY_QUEST_ID, {
          status: 'ready_to_turn_in',
          reachedShrineAt: nowIso,
        });
        nextSnapshot = appendActivityLog(
          nextSnapshot,
          'Survey the Briar Edge is ready to turn in. Return to town with the shrine report.',
          'quest',
          nowIso,
        );
      }

      changed = true;
    }

    if (tile.kind === 'ruin' && !getUnlocks(nextSnapshot).includes(RUIN_CACHE_UNLOCK_ID)) {
      nextSnapshot = withUnlock(nextSnapshot, RUIN_CACHE_UNLOCK_ID);
      nextSnapshot = changeCurrency(nextSnapshot, 4);
      nextSnapshot = addInventoryItem(nextSnapshot, 'field-rations');
      nextSnapshot = appendActivityLog(
        nextSnapshot,
        'The ruined watchpost yields stale rations and 4 gold from a split lockbox.',
        'reward',
        nowIso,
      );
      changed = true;
    }

    if (tile.kind === 'town') {
      const townArrival = this.resolveTownArrival(nextSnapshot, source, nowIso);
      nextSnapshot = townArrival.snapshot;
      changed = changed || townArrival.changed;
    }

    if (
      tile.kind === 'shrine' &&
      getActiveQuestIds(nextSnapshot).includes(SECURE_SHRINE_ROAD_QUEST_ID) &&
      getQuestStatus(nextSnapshot, SECURE_SHRINE_ROAD_QUEST_ID) !== 'ready_to_turn_in'
    ) {
      const progress = getQuestProgressRecord(nextSnapshot, SECURE_SHRINE_ROAD_QUEST_ID);
      const alreadyVisited = progress.shrineVisited === true;
      const wolfDefeated = progress.wolfDefeated === true;

      if (!alreadyVisited) {
        nextSnapshot = withQuestState(nextSnapshot, SECURE_SHRINE_ROAD_QUEST_ID, {
          status: wolfDefeated ? 'ready_to_turn_in' : 'active',
          shrineVisited: true,
          wolfDefeated,
          wolvesDefeated: wolfDefeated ? 1 : 0,
          target: Number(progress.target ?? 1) || 1,
          updatedAt: nowIso,
        });
        nextSnapshot = appendActivityLog(
          nextSnapshot,
          wolfDefeated
            ? 'The Ember Shrine flares bright. Secure the Shrine Road is ready to turn in.'
            : 'The Ember Shrine answers the rite. One Sap Wolf still prowls the grove.',
          'quest',
          nowIso,
        );
        changed = true;
      }
    }

    if (changed) {
      this.updatePlayerSnapshot(player, nextSnapshot);
    }
  }

  private applyEncounterOutcome(player: RuntimePlayerState, encounter: EncounterSnapshot) {
    const nowIso = new Date(this.now()).toISOString();
    let nextSnapshot = player.snapshot;
    let changed = false;

    if (
      encounter.status === 'won' &&
      encounter.monsterId === 'briar-goblin' &&
      getActiveQuestIds(nextSnapshot).includes(BURN_QUEST_ID) &&
      getQuestStatus(nextSnapshot, BURN_QUEST_ID) !== 'ready_to_turn_in'
    ) {
      const progress = getQuestProgressRecord(nextSnapshot, BURN_QUEST_ID);
      const nextDefeated = Math.min(Number(progress.goblinsDefeated ?? 0) + 1, Number(progress.target ?? 2));

      nextSnapshot = withQuestState(nextSnapshot, BURN_QUEST_ID, {
        status: nextDefeated >= Number(progress.target ?? 2) ? 'ready_to_turn_in' : 'active',
        goblinsDefeated: nextDefeated,
        target: Number(progress.target ?? 2),
        updatedAt: nowIso,
      });
      nextSnapshot = appendActivityLog(
        nextSnapshot,
        nextDefeated >= Number(progress.target ?? 2)
          ? 'Burn the First Nest is ready to turn in. Return to town for the debrief.'
          : `Burn the First Nest advances to ${nextDefeated}/${Number(progress.target ?? 2)} Briar Goblins defeated.`,
        'quest',
        nowIso,
      );
      changed = true;
    }

    if (
      encounter.status === 'won' &&
      encounter.monsterId === 'sap-wolf' &&
      getActiveQuestIds(nextSnapshot).includes(SECURE_SHRINE_ROAD_QUEST_ID) &&
      getQuestStatus(nextSnapshot, SECURE_SHRINE_ROAD_QUEST_ID) !== 'ready_to_turn_in'
    ) {
      const progress = getQuestProgressRecord(nextSnapshot, SECURE_SHRINE_ROAD_QUEST_ID);
      const shrineVisited = progress.shrineVisited === true;

      nextSnapshot = withQuestState(nextSnapshot, SECURE_SHRINE_ROAD_QUEST_ID, {
        status: shrineVisited ? 'ready_to_turn_in' : 'active',
        shrineVisited,
        wolfDefeated: true,
        wolvesDefeated: 1,
        target: Number(progress.target ?? 1) || 1,
        updatedAt: nowIso,
      });
      nextSnapshot = appendActivityLog(
        nextSnapshot,
        shrineVisited
          ? 'Secure the Shrine Road is ready to turn in. Return to town with the road report.'
          : 'The Sap Wolf is down. Revisit the Ember Shrine to bless the cleared grove.',
        'quest',
        nowIso,
      );
      changed = true;
    }

    if (encounter.status === 'lost') {
      player.position = clone(this.content.region.spawn);
      const supplyLoss = Math.min(
        DEFEAT_SUPPLY_LOSS_GOLD,
        typeof nextSnapshot.gold === 'number' && Number.isFinite(nextSnapshot.gold) ? nextSnapshot.gold : 0
      );
      nextSnapshot = changeCurrency(nextSnapshot, -supplyLoss);
      nextSnapshot = healToFull(nextSnapshot);
      nextSnapshot = appendActivityLog(
        nextSnapshot,
        supplyLoss > 0
          ? `The shard drags you back to town. The hearth restores your strength, but ${supplyLoss} gold goes to spent salves and lantern oil.`
          : 'The shard drags you back to town and the hearth restores your strength for the next march.',
        'system',
        nowIso,
      );
      const townArrival = this.resolveTownArrival(nextSnapshot, 'move', nowIso);
      nextSnapshot = townArrival.snapshot;
      changed = true;
    }

    if (changed) {
      this.updatePlayerSnapshot(player, nextSnapshot);
    }
  }

  private isWithinBounds(position: PresencePosition) {
    return (
      position.x >= 0 &&
      position.y >= 0 &&
      position.x < this.content.region.width &&
      position.y < this.content.region.height
    );
  }

  private resolveTownArrival(
    snapshot: Record<string, unknown>,
    source: 'attach' | 'move',
    nowIso: string,
  ) {
    let nextSnapshot = snapshot;
    let changed = false;
    const currentHp =
      isRecord(nextSnapshot.hitPoints) && typeof nextSnapshot.hitPoints.current === 'number'
        ? nextSnapshot.hitPoints.current
        : null;
    const maxHp =
      isRecord(nextSnapshot.hitPoints) && typeof nextSnapshot.hitPoints.max === 'number'
        ? nextSnapshot.hitPoints.max
        : null;

    if (currentHp !== null && maxHp !== null && currentHp < maxHp) {
      nextSnapshot = healToFull(nextSnapshot);
      if (source === 'move') {
        nextSnapshot = appendActivityLog(
          nextSnapshot,
          'Town hearths mend your wounds before the next march.',
          'system',
          nowIso,
        );
      }
      changed = true;
    }

    if (getActiveQuestIds(nextSnapshot).includes(SURVEY_QUEST_ID) && getQuestStatus(nextSnapshot, SURVEY_QUEST_ID) === 'ready_to_turn_in') {
      nextSnapshot = this.turnInQuest(
        nextSnapshot,
        SURVEY_QUEST_ID,
        5,
        'Captain Mire sets a goblin cull on the ruined watchpost lanes.',
        nowIso,
      );

      if (getQuestStatus(nextSnapshot, BURN_QUEST_ID) !== 'turned_in') {
        nextSnapshot = withActiveQuest(nextSnapshot, BURN_QUEST_ID);
        nextSnapshot = withQuestState(nextSnapshot, BURN_QUEST_ID, {
          status: 'active',
          goblinsDefeated: Number(getQuestProgressRecord(nextSnapshot, BURN_QUEST_ID).goblinsDefeated ?? 0),
          target: 2,
          acceptedAt: nowIso,
        });
      }

      changed = true;
    }

    if (getActiveQuestIds(nextSnapshot).includes(BURN_QUEST_ID) && getQuestStatus(nextSnapshot, BURN_QUEST_ID) === 'ready_to_turn_in') {
      nextSnapshot = this.turnInQuest(
        nextSnapshot,
        BURN_QUEST_ID,
        8,
        'The watchpost lanes are quieter, if only for tonight.',
        nowIso,
      );
      nextSnapshot = addInventoryItem(nextSnapshot, 'health-potion');
      if (getQuestStatus(nextSnapshot, SECURE_SHRINE_ROAD_QUEST_ID) !== 'turned_in') {
        nextSnapshot = withActiveQuest(nextSnapshot, SECURE_SHRINE_ROAD_QUEST_ID);
        nextSnapshot = withQuestState(nextSnapshot, SECURE_SHRINE_ROAD_QUEST_ID, {
          status: 'active',
          shrineVisited: false,
          wolfDefeated: false,
          wolvesDefeated: 0,
          target: 1,
          acceptedAt: nowIso,
        });
        nextSnapshot = appendActivityLog(
          nextSnapshot,
          'Captain Mire orders the shrine road reopened. Revisit the Ember Shrine, then break the Sap Wolf stalking the grove.',
          'quest',
          nowIso,
        );
      }
      changed = true;
    }

    if (
      getActiveQuestIds(nextSnapshot).includes(SECURE_SHRINE_ROAD_QUEST_ID) &&
      getQuestStatus(nextSnapshot, SECURE_SHRINE_ROAD_QUEST_ID) === 'ready_to_turn_in'
    ) {
      nextSnapshot = this.turnInQuest(
        nextSnapshot,
        SECURE_SHRINE_ROAD_QUEST_ID,
        10,
        'The shrine road holds for another night under ember watchfires.',
        nowIso,
      );
      nextSnapshot = withUnlock(nextSnapshot, SHRINE_ROAD_SECURED_UNLOCK_ID);
      nextSnapshot = addInventoryItem(nextSnapshot, 'field-rations');
      nextSnapshot = appendActivityLog(
        nextSnapshot,
        'Captain Mire posts ember watchfires through the grove. The shrine road now reads as secured on the field map.',
        'system',
        nowIso,
      );
      changed = true;
    }

    return {
      snapshot: nextSnapshot,
      changed,
    };
  }
}
