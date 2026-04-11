import { loadStarterRegion, type RegionRecord } from '@/server/world/region-loader';
import { getCStore } from '@/server/platform/cstore';
import { createEncounter } from '@/server/combat/encounter-service';
import { type EncounterSnapshot } from '@/shared/domain/combat';
import { getVisionWindow } from '@/shared/domain/fog';
import { type CharacterRecord } from '@/shared/domain/types';
import { keys } from '@/shared/persistence/keys';

type RegionTile = RegionRecord['tiles'][number];
type TileKind = RegionTile['kind'];

const hostileTileKinds = new Set<TileKind>(['roots', 'forest', 'ruin']);
const defaultTile: RegionTile = {
  x: 0,
  y: 0,
  kind: 'forest',
  blocked: false
};

const directionDelta = {
  north: { x: 0, y: -1 },
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 }
} as const;

export type MoveDirection = keyof typeof directionDelta;

export interface WorldSnapshot {
  regionId: string;
  position: { x: number; y: number };
  vision: {
    radius: number;
    size: number;
  };
  visibleTiles: RegionTile[];
  activeEncounter: EncounterSnapshot | null;
}

export interface MoveCharacterResult {
  snapshot: WorldSnapshot;
  encounter: EncounterSnapshot | null;
}

export class WorldServiceError extends Error {
  constructor(
    readonly code: 'CHARACTER_NOT_FOUND' | 'MOVE_BLOCKED' | 'OUT_OF_BOUNDS' | 'ENCOUNTER_ACTIVE',
    message: string
  ) {
    super(message);
    this.name = 'WorldServiceError';
  }
}

export async function getWorldSnapshot(characterId: string): Promise<WorldSnapshot> {
  const [character, region] = await Promise.all([loadCharacter(characterId), loadStarterRegion()]);
  return buildSnapshot(character, region);
}

export async function moveCharacter(characterId: string, direction: MoveDirection): Promise<MoveCharacterResult> {
  const [character, region] = await Promise.all([loadCharacter(characterId), loadStarterRegion()]);
  const activeEncounter = await loadActiveEncounter(character);
  if (activeEncounter?.status === 'active') {
    throw new WorldServiceError('ENCOUNTER_ACTIVE', 'Cannot move while an encounter is active.');
  }
  const delta = directionDelta[direction];
  const nextPosition = {
    x: character.position.x + delta.x,
    y: character.position.y + delta.y
  };

  if (!isWithinBounds(nextPosition, region)) {
    throw new WorldServiceError('OUT_OF_BOUNDS', 'Movement is out of region bounds.');
  }

  const nextTile = getTileAt(region, nextPosition.x, nextPosition.y);
  if (nextTile.blocked) {
    throw new WorldServiceError('MOVE_BLOCKED', 'Movement is blocked by terrain.');
  }

  const encounter = await maybeStartEncounter(character, nextTile);
  const updatedCharacter: CharacterRecord = {
    ...character,
    position: nextPosition,
    activeEncounterId: encounter?.id
  };

  await getCStore().setJson(keys.character(updatedCharacter.id), updatedCharacter);

  return {
    snapshot: await buildSnapshot(updatedCharacter, region),
    encounter
  };
}

async function buildSnapshot(character: CharacterRecord, region: RegionRecord): Promise<WorldSnapshot> {
  const vision = getVisionWindow(character.level);
  const visibleTiles: RegionTile[] = [];

  for (let y = character.position.y - vision.radius; y <= character.position.y + vision.radius; y += 1) {
    for (let x = character.position.x - vision.radius; x <= character.position.x + vision.radius; x += 1) {
      if (!isWithinBounds({ x, y }, region)) {
        continue;
      }
      visibleTiles.push(getTileAt(region, x, y));
    }
  }

  return {
    regionId: region.id,
    position: { ...character.position },
    vision,
    visibleTiles,
    activeEncounter: await loadActiveEncounter(character)
  };
}

async function loadCharacter(characterId: string): Promise<CharacterRecord> {
  const character = await getCStore().getJson<CharacterRecord>(keys.character(characterId));
  if (!character) {
    throw new WorldServiceError('CHARACTER_NOT_FOUND', 'Character not found.');
  }
  return character;
}

function isWithinBounds(position: { x: number; y: number }, region: RegionRecord) {
  return position.x >= 0 && position.y >= 0 && position.x < region.width && position.y < region.height;
}

function getTileAt(region: RegionRecord, x: number, y: number): RegionTile {
  const tile = region.tiles.find((entry) => entry.x === x && entry.y === y);
  if (tile) {
    return tile;
  }

  return {
    ...defaultTile,
    x,
    y
  };
}

async function maybeStartEncounter(
  character: CharacterRecord,
  tile: RegionTile
): Promise<EncounterSnapshot | null> {
  if (!hostileTileKinds.has(tile.kind)) {
    return null;
  }

  if (character.activeEncounterId) {
    const existing = await getCStore().getJson<EncounterSnapshot>(keys.encounter(character.activeEncounterId));
    if (existing?.status === 'active') {
      return existing;
    }
  }

  return createEncounter({
    characterId: character.id,
    characterName: character.name,
    monsterName: 'Briar Goblin',
    tileKind: tile.kind
  });
}

async function loadActiveEncounter(character: CharacterRecord): Promise<EncounterSnapshot | null> {
  if (!character.activeEncounterId) {
    return null;
  }
  return getCStore().getJson<EncounterSnapshot>(keys.encounter(character.activeEncounterId));
}
