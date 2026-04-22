import type { ContentBundle } from '../content/load-content';
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

const HOSTILE_TILE_MONSTERS: Record<string, string> = {
  roots: 'briar-goblin',
  forest: 'sap-wolf',
  ruin: 'briar-goblin',
};

const ACTIVITY_LOG_LIMIT = 8;
const SURVEY_QUEST_ID = 'survey-the-briar-edge';
const BURN_QUEST_ID = 'burn-the-first-nest';
const SECURE_SHRINE_ROAD_QUEST_ID = 'secure-the-shrine-road';
const SHRINE_UNLOCK_ID = 'location:ember-shrine';
const RUIN_CACHE_UNLOCK_ID = 'location:watchpost-cache';
const DEFEAT_SUPPLY_LOSS_GOLD = 3;

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
          (entry.kind === 'system' || entry.kind === 'quest' || entry.kind === 'reward')
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
    .map((questId) => content.quests.find((entry) => entry.id === questId))
    .filter((entry): entry is ContentBundle['quests'][number] => Boolean(entry))
    .map((quest) => ({
      id: quest.id,
      label: quest.label,
      objective: quest.objective,
      rewardXp: quest.rewardXp,
      status: getQuestStatus(snapshot, quest.id) === 'ready_to_turn_in' ? 'ready_to_turn_in' : 'active',
      progress:
        quest.id === SURVEY_QUEST_ID
          ? getQuestStatus(snapshot, quest.id) === 'ready_to_turn_in'
            ? 'Return to town with the shrine report.'
            : 'Reach the Ember Shrine east of town.'
          : quest.id === BURN_QUEST_ID
            ? getQuestStatus(snapshot, quest.id) === 'ready_to_turn_in'
              ? 'Return to town for the debrief.'
              : `${Math.min(
                  getQuestCounter(snapshot, quest.id, 'goblinsDefeated', 0),
                  getQuestCounter(snapshot, quest.id, 'target', 2),
                )}/${getQuestCounter(snapshot, quest.id, 'target', 2)} Briar Goblins defeated.`
            : quest.id === SECURE_SHRINE_ROAD_QUEST_ID
              ? getQuestStatus(snapshot, quest.id) === 'ready_to_turn_in'
                ? 'Return to town with word that the shrine road is safe.'
                : getQuestProgressRecord(snapshot, quest.id).shrineVisited === true &&
                    getQuestProgressRecord(snapshot, quest.id).wolfDefeated === true
                  ? 'Return to town with word that the shrine road is safe.'
                  : getQuestProgressRecord(snapshot, quest.id).shrineVisited === true
                    ? `${Math.min(
                        getQuestCounter(snapshot, quest.id, 'wolvesDefeated', 0),
                        getQuestCounter(snapshot, quest.id, 'target', 1),
                      )}/${getQuestCounter(snapshot, quest.id, 'target', 1)} Sap Wolves defeated on the shrine road.`
                    : getQuestProgressRecord(snapshot, quest.id).wolfDefeated === true
                      ? 'Return to the Ember Shrine to bless the cleared grove.'
                      : 'Revisit the Ember Shrine, then cull the Sap Wolf in the grove.'
              : 'In progress.',
    }));
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

    const monsterId = HOSTILE_TILE_MONSTERS[tile.kind];
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
    const visibleMonsters = this.getVisibleMonsters(position, vision.radius);
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

  private getVisibleMonsters(position: PresencePosition, radius: number): Record<string, GameplayMonsterMarker> {
    const visible: Record<string, GameplayMonsterMarker> = {};

    for (let y = position.y - radius; y <= position.y + radius; y += 1) {
      for (let x = position.x - radius; x <= position.x + radius; x += 1) {
        if (!this.isWithinBounds({ x, y })) {
          continue;
        }

        const tile = this.getTileAt(x, y);
        const monsterId = HOSTILE_TILE_MONSTERS[tile.kind];
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
        nextSnapshot = addInventoryItem(nextSnapshot, 'field-rations');
        changed = true;
      }
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
}
