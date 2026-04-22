import type {
  GameplayCharacterMarker,
  GameplayMonsterMarker,
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
  town: {
    code: 'TN',
    label: 'Town Hearth',
    summary: 'Safe ground for rest, turn-ins, and regrouping.',
    palette: {
      fill: 0x647b55,
      edge: 0xd9be7c,
      detail: 0xf7dda4,
      glow: 0xf0c56f,
    },
  },
  road: {
    code: 'RD',
    label: 'Road Lane',
    summary: 'Clear travel lines with better sight.',
    palette: {
      fill: 0x71552f,
      edge: 0xc4a56b,
      detail: 0xe3c88b,
    },
  },
  forest: {
    code: 'FR',
    label: 'Dark Forest',
    summary: 'Dense canopy and low-visibility hunting ground.',
    palette: {
      fill: 0x23452f,
      edge: 0x7faa73,
      detail: 0xa8cb8b,
    },
  },
  roots: {
    code: 'RT',
    label: 'Briar Roots',
    summary: 'Aggressive thorn corridors where goblins break cover.',
    palette: {
      fill: 0x59371f,
      edge: 0xd78654,
      detail: 0x9c5633,
      glow: 0xca7047,
    },
  },
  ruin: {
    code: 'RU',
    label: 'Watchpost Ruin',
    summary: 'Broken stone lanes with loot and old blood in the moss.',
    palette: {
      fill: 0x535363,
      edge: 0xd2c9bc,
      detail: 0xa7a0b2,
    },
  },
  shrine: {
    code: 'SH',
    label: 'Ember Shrine',
    summary: 'Ancient refuge where the march briefly loosens its grip.',
    palette: {
      fill: 0x4d6844,
      edge: 0xffdd8a,
      detail: 0xf6c76f,
      glow: 0xf7d889,
    },
  },
  water: {
    code: 'WT',
    label: 'Blackwater',
    summary: 'Flooded and blocked ground.',
    palette: {
      fill: 0x224e68,
      edge: 0x8cc7df,
      detail: 0xb7e4f0,
    },
  },
};

export const WORLD_LEGEND_ORDER: Array<keyof typeof WORLD_TERRAIN_DETAILS> = [
  'town',
  'road',
  'forest',
  'roots',
  'ruin',
  'shrine',
  'water',
];

export interface WorldRenderCell {
  key: string;
  x: number;
  y: number;
  tile: GameplayTileSnapshot;
  terrain: WorldTerrainDetails;
  isCurrent: boolean;
  character: GameplayCharacterMarker | null;
  monster: GameplayMonsterMarker | null;
}

export interface WorldRenderModel {
  activeQuest: GameplayQuestEntry | null;
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

      cells.push({
        key: `${x}:${y}`,
        x,
        y,
        tile,
        terrain: WORLD_TERRAIN_DETAILS[tile.kind],
        isCurrent: snapshot.position.x === x && snapshot.position.y === y,
        character: characterAt(snapshot, x, y),
        monster: monsterAt(snapshot, x, y),
      });
    }
  }

  return {
    activeQuest: snapshot.character.quests[0] ?? null,
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
