import type { ContentBundle } from '../content/load-content';
import { getVisionWindow } from '../../shared/domain/fog';
import { normalizeDurableProgression } from '../../shared/domain/progression';
import type { EncounterSnapshot } from '../../shared/domain/combat';
import type { GameplayCharacterCard, GameplayMonsterMarker, GameplayQuestEntry, GameplayShardSnapshot } from '../../shared/gameplay';
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

function isPosition(value: unknown): value is PresencePosition {
  return !!value && typeof value === 'object' && !Array.isArray(value) && typeof (value as PresencePosition).x === 'number' && typeof (value as PresencePosition).y === 'number';
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
    quests: toQuestEntries(player.snapshot, content),
  };
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

    this.players.set(character.cid, nextPlayer);

    return {
      snapshot: this.snapshotFor(character.cid),
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
          quests: [],
        };

    return {
      regionId: this.content.region.id,
      position,
      vision,
      visibleTiles,
      characters: visibleCharacters,
      monsters: visibleMonsters,
      character: fallbackCard,
      encounter: player?.activeEncounter ? clone(player.activeEncounter) : null,
      movementLocked: player?.activeEncounter?.status === 'active',
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
        tiles.push({
          x,
          y,
          kind: tile.kind,
          blocked: tile.blocked,
        });
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

  private isWithinBounds(position: PresencePosition) {
    return (
      position.x >= 0 &&
      position.y >= 0 &&
      position.x < this.content.region.width &&
      position.y < this.content.region.height
    );
  }
}
