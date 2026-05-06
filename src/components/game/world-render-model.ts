import type {
  GameplayCharacterMarker,
  GameplayMonsterMarker,
  GameplayObjectiveFocus,
  GameplayQuestEntry,
  GameplayShardSnapshot,
  GameplayTileSnapshot,
} from '@/shared/gameplay';

export interface WorldTerrainPalette {
  fill: number;
  edge: number;
  detail: number;
  glow?: number;
}

export interface WorldTerrainDetails {
  code: string;
  label: string;
  summary: string;
  palette: WorldTerrainPalette;
}

export const WORLD_TERRAIN_DETAILS: Record<GameplayTileSnapshot['kind'], WorldTerrainDetails> = {
  grass: {
    code: 'GR',
    label: 'Grass',
    summary: 'Normal green ground. You can walk here.',
    palette: {
      fill: 0x3f7d45,
      edge: 0x91c96f,
      detail: 0xb8e08a,
      glow: 0x8fd36d,
    },
  },
  mud: {
    code: 'MD',
    label: 'Mud',
    summary: 'Brown mud and dungeon ground. You can walk here.',
    palette: {
      fill: 0x765033,
      edge: 0xb88958,
      detail: 0xd1a36f,
      glow: 0xc17a4d,
    },
  },
  forest: {
    code: 'TR',
    label: 'Forest',
    summary: 'A tree obstacle. You cannot walk here.',
    palette: {
      fill: 0x24472d,
      edge: 0x5f8f48,
      detail: 0xa9cf6c,
    },
  },
  stone: {
    code: 'ST',
    label: 'Stone',
    summary: 'A rock obstacle. You cannot walk here.',
    palette: {
      fill: 0x535363,
      edge: 0xd2c9bc,
      detail: 0xa7a0b2,
    },
  },
};

export const WORLD_LEGEND_ORDER: Array<keyof typeof WORLD_TERRAIN_DETAILS> = [
  'grass',
  'mud',
  'forest',
  'stone',
];

export interface WorldRenderCell {
  key: string;
  x: number;
  y: number;
  tile: GameplayTileSnapshot;
  terrain: WorldTerrainDetails;
  isCurrent: boolean;
  isObjectiveTarget: boolean;
  character: GameplayCharacterMarker | null;
  characterRole: 'hero' | 'ally' | null;
  monster: GameplayMonsterMarker | null;
  monsterRole: 'active-threat' | 'visible-threat' | null;
  threatLabel: string | null;
}

export interface WorldRenderModel {
  activeQuest: GameplayQuestEntry | null;
  objectiveFocus: GameplayObjectiveFocus | null;
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    columns: number;
    rows: number;
  };
  cells: WorldRenderCell[];
  currentTerrain: WorldTerrainDetails;
}

function tileAt(snapshot: GameplayShardSnapshot, x: number, y: number) {
  return snapshot.visibleTiles.find((entry) => entry.x === x && entry.y === y) ?? null;
}

function characterAt(snapshot: GameplayShardSnapshot, x: number, y: number) {
  return Object.values(snapshot.characters).find((entry) => entry.position.x === x && entry.position.y === y) ?? null;
}

function monsterAt(snapshot: GameplayShardSnapshot, x: number, y: number) {
  return Object.values(snapshot.monsters).find((entry) => entry.position.x === x && entry.position.y === y) ?? null;
}

export function shortMarkerLabel(value: string, fallback: string) {
  const compact = value
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return compact || fallback;
}

export function buildWorldRenderModel(snapshot: GameplayShardSnapshot): WorldRenderModel {
  const xs = snapshot.visibleTiles.map((tile) => tile.x);
  const ys = snapshot.visibleTiles.map((tile) => tile.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const cells: WorldRenderCell[] = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const tile = tileAt(snapshot, x, y);

      if (!tile) {
        continue;
      }
      const character = characterAt(snapshot, x, y);
      const monster = monsterAt(snapshot, x, y);
      const activeEncounterThreat =
        Boolean(monster) &&
        snapshot.encounter?.status === 'active' &&
        snapshot.position.x === x &&
        snapshot.position.y === y &&
        (snapshot.encounter.monsterId === monster?.id || snapshot.encounter.monsterName === monster?.label);
      const monsterRole = monster ? (activeEncounterThreat ? 'active-threat' : 'visible-threat') : null;

      cells.push({
        key: `${x}:${y}`,
        x,
        y,
        tile,
        terrain: WORLD_TERRAIN_DETAILS[tile.kind],
        isCurrent: snapshot.position.x === x && snapshot.position.y === y,
        isObjectiveTarget: snapshot.objectiveFocus?.target.x === x && snapshot.objectiveFocus?.target.y === y,
        character,
        characterRole: character ? (character.cid === snapshot.character.cid ? 'hero' : 'ally') : null,
        monster,
        monsterRole,
        threatLabel: monster ? `LV ${monster.level}${monsterRole === 'active-threat' ? ' ACTIVE' : ''}` : null,
      });
    }
  }

  return {
    activeQuest: snapshot.character.quests[0] ?? null,
    objectiveFocus: snapshot.objectiveFocus,
    bounds: {
      minX,
      maxX,
      minY,
      maxY,
      columns: maxX - minX + 1,
      rows: maxY - minY + 1,
    },
    cells,
    currentTerrain: WORLD_TERRAIN_DETAILS[snapshot.currentTile.kind],
  };
}
