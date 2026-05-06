import type PhaserType from 'phaser';
import type { GameplayShardSnapshot } from '@/shared/gameplay';
import { buildWorldRenderModel, shortMarkerLabel } from '@/components/game/world-render-model';

export interface ThornwritheGameBridge {
  render(snapshot: GameplayShardSnapshot): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

const MIN_WIDTH = 480;
const MIN_HEIGHT = 420;
const BOARD_PADDING = 34;
const TILE_GAP = 10;
const CLASS_RENDER_COLORS: Record<string, { fill: number; edge: number }> = {
  fighter: { fill: 0xf7d889, edge: 0x31210f },
  ranger: { fill: 0xa8d7a1, edge: 0x143122 },
  wizard: { fill: 0x9fc0ff, edge: 0x16263f },
  cleric: { fill: 0xd8c0ff, edge: 0x2a1d3f },
};

type WorldRenderCell = ReturnType<typeof buildWorldRenderModel>['cells'][number];
type CellMap = Map<string, WorldRenderCell>;

export async function createGame(container: HTMLElement): Promise<ThornwritheGameBridge> {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'test') {
    return createNoopBridge();
  }

  const Phaser = (await import('phaser')).default;
  const width = Math.max(container.clientWidth, MIN_WIDTH);
  const height = Math.max(container.clientHeight, MIN_HEIGHT);

  let activeScene: PhaserType.Scene | null = null;
  let activeGraphics: PhaserType.GameObjects.Graphics | null = null;
  let activeLabels: PhaserType.GameObjects.Text[] = [];
  let pendingSnapshot: GameplayShardSnapshot | null = null;

  const scene = {
    key: 'thornwrithe-world',
    create(this: PhaserType.Scene) {
      activeScene = this;
      activeGraphics = this.add.graphics();

      if (pendingSnapshot) {
        drawSnapshot(this, activeGraphics, activeLabels, pendingSnapshot);
      }
    },
  };

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: container,
    width,
    height,
    backgroundColor: '#07110f',
    render: {
      antialias: true,
      pixelArt: false,
    },
    scene,
  });

  return {
    render(snapshot) {
      pendingSnapshot = snapshot;

      if (!activeScene || !activeGraphics) {
        return;
      }

      drawSnapshot(activeScene, activeGraphics, activeLabels, snapshot);
    },
    resize(nextWidth, nextHeight) {
      const widthValue = Math.max(Math.round(nextWidth), MIN_WIDTH);
      const heightValue = Math.max(Math.round(nextHeight), MIN_HEIGHT);

      game.scale.resize(widthValue, heightValue);

      if (!pendingSnapshot || !activeScene || !activeGraphics) {
        return;
      }

      drawSnapshot(activeScene, activeGraphics, activeLabels, pendingSnapshot);
    },
    destroy() {
      clearLabels(activeLabels);
      pendingSnapshot = null;
      activeScene = null;
      activeGraphics = null;
      game.destroy(true);
    },
  };
}

function createNoopBridge(): ThornwritheGameBridge {
  return {
    render() {},
    resize() {},
    destroy() {},
  };
}

function blendHexColor(colorA: number, colorB: number, weight: number) {
  const ratio = Math.max(0, Math.min(1, weight));
  const red = Math.round(((colorA >> 16) & 0xff) * (1 - ratio) + ((colorB >> 16) & 0xff) * ratio);
  const green = Math.round(((colorA >> 8) & 0xff) * (1 - ratio) + ((colorB >> 8) & 0xff) * ratio);
  const blue = Math.round((colorA & 0xff) * (1 - ratio) + (colorB & 0xff) * ratio);

  return (red << 16) + (green << 8) + blue;
}

function clearLabels(labels: PhaserType.GameObjects.Text[]) {
  for (const label of labels) {
    label.destroy();
  }

  labels.length = 0;
}

function cellKey(x: number, y: number) {
  return `${x}:${y}`;
}

function cellAt(cellMap: CellMap, x: number, y: number) {
  return cellMap.get(cellKey(x, y)) ?? null;
}

function tileCenter(
  x: number,
  y: number,
  bounds: { minX: number; minY: number },
  originX: number,
  originY: number,
  tileSize: number,
  gap: number,
) {
  return {
    x: originX + (x - bounds.minX) * (tileSize + gap) + tileSize / 2,
    y: originY + (y - bounds.minY) * (tileSize + gap) + tileSize / 2,
  };
}

function drawSnapshot(
  scene: PhaserType.Scene,
  graphics: PhaserType.GameObjects.Graphics,
  labels: PhaserType.GameObjects.Text[],
  snapshot: GameplayShardSnapshot
) {
  const model = buildWorldRenderModel(snapshot);
  const cellMap = new Map(model.cells.map((cell) => [cell.key, cell]));
  clearLabels(labels);
  graphics.clear();

  const width = scene.scale.width;
  const height = scene.scale.height;
  const boardWidth = width - BOARD_PADDING * 2;
  const boardHeight = height - BOARD_PADDING * 2;
  const tileWidth = (boardWidth - TILE_GAP * (model.bounds.columns - 1)) / model.bounds.columns;
  const tileHeight = (boardHeight - TILE_GAP * (model.bounds.rows - 1)) / model.bounds.rows;
  const tileSize = Math.max(48, Math.min(88, Math.floor(Math.min(tileWidth, tileHeight))));
  const gap = Math.max(4, Math.min(TILE_GAP, Math.floor(tileSize * 0.14)));
  const worldWidth = tileSize * model.bounds.columns + gap * (model.bounds.columns - 1);
  const worldHeight = tileSize * model.bounds.rows + gap * (model.bounds.rows - 1);
  const originX = (width - worldWidth) / 2;
  const originY = (height - worldHeight) / 2;
  const pulse = 0.48 + Math.sin(Date.now() / 850) * 0.08;

  drawBackdrop(graphics, width, height, originX, originY, worldWidth, worldHeight, pulse);
  drawObjectiveTrail(graphics, snapshot, model, originX, originY, tileSize, gap);

  for (const cell of model.cells) {
    const x = originX + (cell.x - model.bounds.minX) * (tileSize + gap);
    const y = originY + (cell.y - model.bounds.minY) * (tileSize + gap);

    drawTile(graphics, snapshot, cellMap, cell, x, y, tileSize, pulse);

    if (cell.character || cell.monster) {
      drawOccupants(scene, graphics, labels, snapshot, cell, x, y, tileSize);
    }
  }

  const compactCaption = width < 560 || worldWidth < 330;
  const southMarker = scene.add.text(originX, originY + worldHeight + 20, compactCaption ? 'Watchfire route' : 'Watchfire route // live shard visibility', {
    color: '#b9ab8a',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: '11px',
    letterSpacing: 1.2,
  });
  southMarker.setAlpha(0.84);
  labels.push(southMarker);

  if (!compactCaption) {
    const shardMarker = scene.add.text(originX + worldWidth, originY + worldHeight + 20, snapshot.regionId.replace(/-/g, ' ').toUpperCase(), {
      color: '#f7d889',
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '11px',
      letterSpacing: 1.4,
    });
    shardMarker.setOrigin(1, 0);
    shardMarker.setAlpha(0.9);
    labels.push(shardMarker);
  }
}

function drawBackdrop(
  graphics: PhaserType.GameObjects.Graphics,
  width: number,
  height: number,
  originX: number,
  originY: number,
  worldWidth: number,
  worldHeight: number,
  pulse: number
) {
  graphics.fillStyle(0x040807, 1);
  graphics.fillRect(0, 0, width, height);
  graphics.fillGradientStyle(0x12211d, 0x0f1c18, 0x060807, 0x08110f, 1, 1, 1, 1);
  graphics.fillRect(0, 0, width, height);

  graphics.fillStyle(0xf7c978, 0.05 + pulse * 0.04);
  graphics.fillEllipse(width * 0.18, height * 0.14, width * 0.34, height * 0.22);
  graphics.fillStyle(0x88c4a8, 0.04);
  graphics.fillEllipse(width * 0.82, height * 0.2, width * 0.3, height * 0.24);
  graphics.fillStyle(0xffffff, 0.015);
  graphics.fillEllipse(width * 0.42, height * 0.72, width * 0.52, height * 0.18);

  graphics.fillStyle(0x020605, 0.4);
  graphics.fillRoundedRect(originX - 18, originY - 18, worldWidth + 36, worldHeight + 36, 30);

  graphics.fillGradientStyle(0x0d1614, 0x132320, 0x050807, 0x0a120f, 0.98, 0.98, 0.98, 0.98);
  graphics.fillRoundedRect(originX - 10, originY - 10, worldWidth + 20, worldHeight + 20, 28);

  graphics.lineStyle(2, 0x2b3b34, 0.95);
  graphics.strokeRoundedRect(originX - 14, originY - 14, worldWidth + 28, worldHeight + 28, 30);
  graphics.lineStyle(1, 0xf7c978, 0.18 + pulse * 0.08);
  graphics.strokeRoundedRect(originX - 6, originY - 6, worldWidth + 12, worldHeight + 12, 24);
}

function drawObjectiveTrail(
  graphics: PhaserType.GameObjects.Graphics,
  snapshot: GameplayShardSnapshot,
  model: ReturnType<typeof buildWorldRenderModel>,
  originX: number,
  originY: number,
  tileSize: number,
  gap: number
) {
  const focus = snapshot.objectiveFocus;

  if (!focus) {
    return;
  }

  const route: Array<{ x: number; y: number }> = [];
  let currentX = snapshot.position.x;
  let currentY = snapshot.position.y;

  while (currentX !== focus.target.x) {
    currentX += Math.sign(focus.target.x - currentX);
    route.push({ x: currentX, y: currentY });
  }

  while (currentY !== focus.target.y) {
    currentY += Math.sign(focus.target.y - currentY);
    route.push({ x: currentX, y: currentY });
  }

  if (route.length === 0) {
    return;
  }

  const start = tileCenter(snapshot.position.x, snapshot.position.y, model.bounds, originX, originY, tileSize, gap);
  const routePoints = route.map((entry) => tileCenter(entry.x, entry.y, model.bounds, originX, originY, tileSize, gap));

  graphics.lineStyle(8, 0xf7d889, 0.08);
  graphics.beginPath();
  graphics.moveTo(start.x, start.y);
  for (const point of routePoints) {
    graphics.lineTo(point.x, point.y);
  }
  graphics.strokePath();

  graphics.lineStyle(2, 0xf7d889, 0.42);
  graphics.beginPath();
  graphics.moveTo(start.x, start.y);
  for (const point of routePoints) {
    graphics.lineTo(point.x, point.y);
  }
  graphics.strokePath();

  for (const point of routePoints.slice(0, -1)) {
    graphics.fillStyle(0xf7d889, 0.22);
    graphics.fillCircle(point.x, point.y, 4);
  }

  const finalPoint = routePoints[routePoints.length - 1];
  graphics.fillStyle(0xf7d889, 0.3);
  graphics.fillCircle(finalPoint.x, finalPoint.y, tileSize * 0.22);
  graphics.lineStyle(2, 0xf7d889, 0.9);
  graphics.strokeCircle(finalPoint.x, finalPoint.y, tileSize * 0.18);
  graphics.fillStyle(0xf7d889, 0.94);
  graphics.fillTriangle(finalPoint.x, finalPoint.y - 14, finalPoint.x + 10, finalPoint.y + 7, finalPoint.x - 10, finalPoint.y + 7);
}

function drawTile(
  graphics: PhaserType.GameObjects.Graphics,
  snapshot: GameplayShardSnapshot,
  cellMap: CellMap,
  cell: WorldRenderCell,
  x: number,
  y: number,
  tileSize: number,
  pulse: number
) {
  const { palette } = cell.terrain;
  const topFill = blendHexColor(palette.fill, 0xf6edd5, 0.08);
  const bottomFill = blendHexColor(palette.fill, 0x030504, 0.32);

  graphics.fillStyle(0x020605, 0.34);
  graphics.fillRoundedRect(x + 3, y + 6, tileSize, tileSize, 18);

  graphics.fillGradientStyle(topFill, topFill, bottomFill, bottomFill, 1, 1, 1, 1);
  graphics.fillRoundedRect(x, y, tileSize, tileSize, 20);

  graphics.fillStyle(0xffffff, 0.028);
  graphics.fillTriangle(x, y, x + tileSize, y, x, y + tileSize * 0.7);

  graphics.lineStyle(cell.isCurrent ? 3 : 2, cell.isCurrent ? 0xf7c978 : palette.edge, cell.isCurrent ? 1 : 0.86);
  graphics.strokeRoundedRect(x, y, tileSize, tileSize, 20);

  drawTerrainConnections(graphics, cellMap, cell, x, y, tileSize);
  drawTerrainDetail(graphics, cell, x, y, tileSize, pulse);

  if (cell.tile.blocked) {
    graphics.lineStyle(3, 0xf08a6d, 0.9);
    graphics.beginPath();
    graphics.moveTo(x + 12, y + 12);
    graphics.lineTo(x + tileSize - 12, y + tileSize - 12);
    graphics.moveTo(x + tileSize - 12, y + 12);
    graphics.lineTo(x + 12, y + tileSize - 12);
    graphics.strokePath();
  }

  if (cell.monster) {
    const glowColor = cell.monsterRole === 'active-threat' ? 0xff7658 : palette.glow;

    if (glowColor) {
      graphics.lineStyle(cell.monsterRole === 'active-threat' ? 3 : 2, glowColor, cell.monsterRole === 'active-threat' ? 0.58 : 0.24);
      graphics.strokeRoundedRect(x + 6, y + 6, tileSize - 12, tileSize - 12, 16);
    }
  }

  if (cell.monsterRole === 'active-threat') {
    const alertInset = 11 + pulse * 2;
    graphics.lineStyle(2, 0xffc77b, 0.38 + pulse * 0.16);
    graphics.strokeRoundedRect(x + alertInset, y + alertInset, tileSize - alertInset * 2, tileSize - alertInset * 2, 12);
    graphics.lineStyle(2, 0xff7658, 0.5);
    graphics.beginPath();
    graphics.moveTo(x + tileSize * 0.5, y + 10);
    graphics.lineTo(x + tileSize * 0.5, y + 23);
    graphics.moveTo(x + tileSize * 0.5, y + tileSize - 10);
    graphics.lineTo(x + tileSize * 0.5, y + tileSize - 23);
    graphics.moveTo(x + 10, y + tileSize * 0.5);
    graphics.lineTo(x + 23, y + tileSize * 0.5);
    graphics.moveTo(x + tileSize - 10, y + tileSize * 0.5);
    graphics.lineTo(x + tileSize - 23, y + tileSize * 0.5);
    graphics.strokePath();
  }

  if (cell.isObjectiveTarget) {
    graphics.lineStyle(3, 0xf7d889, 0.92);
    graphics.strokeRoundedRect(x + 8, y + 8, tileSize - 16, tileSize - 16, 14);
    graphics.lineStyle(1, 0xf7d889, 0.26);
    graphics.strokeRoundedRect(x + 14, y + 14, tileSize - 28, tileSize - 28, 10);
  }

  if (cell.isCurrent && snapshot.encounter) {
    const encounterEdge =
      snapshot.encounter.status === 'active'
        ? 0xe77757
        : snapshot.encounter.status === 'won'
          ? 0x7fcf8d
          : 0xd9b45f;
    graphics.lineStyle(3, encounterEdge, 0.54);
    graphics.strokeRoundedRect(x - 4, y - 4, tileSize + 8, tileSize + 8, 20);
  }
}

function drawTerrainConnections(
  graphics: PhaserType.GameObjects.Graphics,
  cellMap: CellMap,
  cell: WorldRenderCell,
  x: number,
  y: number,
  tileSize: number
) {
  const centerX = x + tileSize / 2;
  const centerY = y + tileSize / 2;
  const { detail } = cell.terrain.palette;
  const connections = [
    { neighbor: cellAt(cellMap, cell.x, cell.y - 1), point: { x: centerX, y: y + 8 } },
    { neighbor: cellAt(cellMap, cell.x + 1, cell.y), point: { x: x + tileSize - 8, y: centerY } },
    { neighbor: cellAt(cellMap, cell.x, cell.y + 1), point: { x: centerX, y: y + tileSize - 8 } },
    { neighbor: cellAt(cellMap, cell.x - 1, cell.y), point: { x: x + 8, y: centerY } },
  ];

  if (cell.tile.kind === 'road') {
    graphics.lineStyle(Math.max(8, tileSize * 0.14), detail, 0.2);
    for (const { neighbor, point } of connections) {
      if (!neighbor || !['road', 'town', 'shrine', 'ruin'].includes(neighbor.tile.kind)) {
        continue;
      }
      graphics.beginPath();
      graphics.moveTo(centerX, centerY);
      graphics.lineTo(point.x, point.y);
      graphics.strokePath();
    }
  }

  if (cell.tile.kind === 'roots') {
    graphics.lineStyle(Math.max(4, tileSize * 0.07), detail, 0.34);
    for (const { neighbor, point } of connections) {
      if (!neighbor || !['roots', 'ruin'].includes(neighbor.tile.kind)) {
        continue;
      }
      graphics.beginPath();
      graphics.moveTo(centerX, centerY);
      graphics.lineTo((centerX + point.x) / 2, (centerY + point.y) / 2 - 4);
      graphics.lineTo(point.x, point.y);
      graphics.strokePath();
    }
  }

  if (cell.tile.kind === 'water') {
    graphics.lineStyle(Math.max(6, tileSize * 0.11), detail, 0.16);
    for (const { neighbor, point } of connections) {
      if (!neighbor || neighbor.tile.kind !== 'water') {
        continue;
      }
      graphics.beginPath();
      graphics.moveTo(centerX, centerY);
      graphics.lineTo(point.x, point.y);
      graphics.strokePath();
    }
  }
}

function drawTerrainDetail(
  graphics: PhaserType.GameObjects.Graphics,
  cell: WorldRenderCell,
  x: number,
  y: number,
  tileSize: number,
  pulse: number
) {
  const { detail, edge, glow } = cell.terrain.palette;
  const centerX = x + tileSize / 2;
  const centerY = y + tileSize / 2;

  switch (cell.tile.kind) {
    case 'town': {
      const glowRadius = tileSize * 0.14;
      graphics.fillStyle(detail, 0.22 + pulse * 0.06);
      graphics.fillCircle(centerX, centerY + tileSize * 0.12, glowRadius);
      graphics.fillStyle(edge, 0.92);
      graphics.fillTriangle(centerX - 18, centerY + 8, centerX - 6, centerY - 10, centerX + 6, centerY + 8);
      graphics.fillTriangle(centerX - 4, centerY + 4, centerX + 10, centerY - 14, centerX + 24, centerY + 4);
      graphics.fillStyle(detail, 0.95);
      graphics.fillRect(centerX - 16, centerY + 8, 14, 12);
      graphics.fillRect(centerX + 2, centerY + 4, 16, 16);
      graphics.fillStyle(0xf7dd9a, 0.82);
      graphics.fillRect(centerX + 8, centerY + 9, 4, 5);
      break;
    }
    case 'road':
      graphics.lineStyle(8, detail, 0.56);
      graphics.beginPath();
      graphics.moveTo(x + tileSize * 0.18, y + tileSize * 0.8);
      graphics.lineTo(centerX, centerY + 2);
      graphics.lineTo(x + tileSize * 0.82, y + tileSize * 0.22);
      graphics.strokePath();
      graphics.lineStyle(2, edge, 0.48);
      graphics.beginPath();
      graphics.moveTo(x + tileSize * 0.24, y + tileSize * 0.76);
      graphics.lineTo(centerX + 2, centerY + 4);
      graphics.lineTo(x + tileSize * 0.78, y + tileSize * 0.26);
      graphics.strokePath();
      graphics.fillStyle(edge, 0.8);
      graphics.fillCircle(centerX - 8, centerY + 8, 3);
      break;
    case 'forest':
      graphics.fillStyle(detail, 0.88);
      graphics.fillTriangle(centerX - 18, centerY + 10, centerX - 6, centerY - 16, centerX + 6, centerY + 10);
      graphics.fillTriangle(centerX - 2, centerY + 14, centerX + 12, centerY - 14, centerX + 26, centerY + 14);
      graphics.fillStyle(edge, 0.86);
      graphics.fillRect(centerX - 8, centerY + 8, 4, 12);
      graphics.fillRect(centerX + 8, centerY + 10, 4, 10);
      graphics.fillStyle(0x0c130f, 0.2);
      graphics.fillEllipse(centerX + 2, centerY + 16, tileSize * 0.32, tileSize * 0.08);
      break;
    case 'roots':
      graphics.lineStyle(3, detail, 0.92);
      graphics.beginPath();
      graphics.moveTo(x + 12, y + tileSize - 16);
      graphics.lineTo(centerX - 8, centerY + 2);
      graphics.lineTo(centerX + 4, centerY - 6);
      graphics.lineTo(x + tileSize - 12, y + 16);
      graphics.moveTo(x + 20, y + tileSize - 10);
      graphics.lineTo(centerX + 2, centerY + 8);
      graphics.lineTo(x + tileSize - 18, centerY + 10);
      graphics.strokePath();
      graphics.fillStyle(edge, 0.24);
      graphics.fillCircle(centerX - 10, centerY + 10, 6);
      graphics.fillCircle(centerX + 12, centerY - 4, 5);
      break;
    case 'ruin':
      graphics.fillStyle(detail, 0.88);
      graphics.fillRect(centerX - 18, centerY - 10, 8, 26);
      graphics.fillRect(centerX + 10, centerY - 6, 8, 22);
      graphics.fillRect(centerX - 14, centerY - 16, 28, 6);
      graphics.lineStyle(2, edge, 0.7);
      graphics.strokeRect(centerX - 18, centerY - 10, 8, 26);
      graphics.strokeRect(centerX + 10, centerY - 6, 8, 22);
      graphics.strokeRect(centerX - 14, centerY - 16, 28, 6);
      graphics.fillStyle(edge, 0.26);
      graphics.fillRect(centerX - 8, centerY + 12, 10, 4);
      break;
    case 'shrine':
      if (glow) {
        graphics.fillStyle(glow, 0.16 + pulse * 0.08);
        graphics.fillCircle(centerX, centerY, tileSize * 0.3);
      }
      graphics.fillStyle(edge, 0.88);
      graphics.fillRect(centerX - 12, centerY + 6, 24, 8);
      graphics.fillRect(centerX - 6, centerY - 8, 12, 14);
      graphics.fillStyle(detail, 0.98);
      graphics.fillTriangle(centerX, centerY - 20, centerX + 8, centerY - 2, centerX, centerY + 2);
      graphics.fillTriangle(centerX, centerY - 20, centerX - 8, centerY - 2, centerX, centerY + 2);
      graphics.lineStyle(2, glow ?? detail, 0.4 + pulse * 0.12);
      graphics.strokeCircle(centerX, centerY, tileSize * 0.18);
      break;
    case 'water':
      graphics.fillStyle(detail, 0.1);
      graphics.fillEllipse(centerX, centerY + 6, tileSize * 0.42, tileSize * 0.18);
      graphics.lineStyle(3, detail, 0.72);
      graphics.beginPath();
      graphics.moveTo(x + 10, centerY - 8);
      graphics.lineTo(x + 22, centerY - 12);
      graphics.lineTo(x + 34, centerY - 8);
      graphics.lineTo(x + 46, centerY - 12);
      graphics.lineTo(x + 58, centerY - 8);
      graphics.moveTo(x + 14, centerY + 8);
      graphics.lineTo(x + 28, centerY + 4);
      graphics.lineTo(x + 42, centerY + 8);
      graphics.lineTo(x + 56, centerY + 4);
      graphics.strokePath();
      break;
    default:
      break;
  }
}

function drawOccupants(
  scene: PhaserType.Scene,
  graphics: PhaserType.GameObjects.Graphics,
  labels: PhaserType.GameObjects.Text[],
  snapshot: GameplayShardSnapshot,
  cell: WorldRenderCell,
  x: number,
  y: number,
  tileSize: number
) {
  const positions = cell.character && cell.monster ? [0.34, 0.68] : [0.5];
  let offsetIndex = 0;

  if (cell.character) {
    const hero = cell.characterRole === 'hero';
    const centerX = x + tileSize * positions[offsetIndex];
    const centerY = y + tileSize * 0.62;
    const classColors = CLASS_RENDER_COLORS[cell.character.classId ?? snapshot.character.classId] ?? CLASS_RENDER_COLORS.fighter;
    const fill = hero ? classColors.fill : blendHexColor(classColors.fill, 0x213528, 0.42);
    const edge = hero ? classColors.edge : 0x15241b;

    drawCharacterToken(scene, graphics, labels, snapshot, cell, centerX, centerY, hero, fill, edge);
    offsetIndex += 1;
  }

  if (cell.monster) {
    const centerX = x + tileSize * positions[offsetIndex];
    const centerY = y + tileSize * 0.62;
    drawMonsterToken(scene, graphics, labels, cell, centerX, centerY);
  }
}

function drawCharacterToken(
  scene: PhaserType.Scene,
  graphics: PhaserType.GameObjects.Graphics,
  labels: PhaserType.GameObjects.Text[],
  snapshot: GameplayShardSnapshot,
  cell: WorldRenderCell,
  centerX: number,
  centerY: number,
  hero: boolean,
  fill: number,
  edge: number
) {
  const width = hero ? 14 : 12;
  const height = hero ? 18 : 15;

  graphics.fillStyle(0x000000, 0.24);
  graphics.fillEllipse(centerX, centerY + 14, hero ? 28 : 24, hero ? 10 : 8);

  graphics.fillStyle(fill, 1);
  graphics.beginPath();
  graphics.moveTo(centerX, centerY - height);
  graphics.lineTo(centerX + width, centerY - 6);
  graphics.lineTo(centerX + width - 2, centerY + 8);
  graphics.lineTo(centerX, centerY + height);
  graphics.lineTo(centerX - width + 2, centerY + 8);
  graphics.lineTo(centerX - width, centerY - 6);
  graphics.closePath();
  graphics.fillPath();

  graphics.lineStyle(hero ? 3 : 2, edge, 1);
  graphics.strokePath();

  graphics.lineStyle(2, blendHexColor(fill, 0xffffff, 0.28), 0.42);
  graphics.beginPath();
  graphics.moveTo(centerX, centerY - height + 4);
  graphics.lineTo(centerX, centerY + height - 5);
  graphics.strokePath();

  if (hero) {
    graphics.lineStyle(2, 0xf7d889, 0.42);
    graphics.strokeCircle(centerX, centerY, 18);
    graphics.fillStyle(0xf7d889, 0.92);
    graphics.fillTriangle(centerX + 10, centerY - 22, centerX + 22, centerY - 18, centerX + 10, centerY - 12);

    const currentHp = snapshot.character.hitPoints.current;
    const maxHp = snapshot.character.hitPoints.max;
    const ratio = maxHp > 0 ? currentHp / maxHp : 0;
    const filledPips = Math.max(1, Math.ceil(ratio * 5));

    for (let index = 0; index < 5; index += 1) {
      const pipX = centerX - 14 + index * 7;
      graphics.fillStyle(index < filledPips ? 0xf7d889 : 0x31443b, index < filledPips ? 0.94 : 0.72);
      graphics.fillRoundedRect(pipX, centerY + 21, 5, 4, 2);
    }
  }

  const markerLabel = scene.add.text(centerX, centerY - 1, shortMarkerLabel(cell.character?.name ?? snapshot.character.name, hero ? 'ME' : 'AL'), {
    color: hero ? '#2f1f10' : '#102215',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: hero ? '12px' : '11px',
    fontStyle: '700',
  });
  markerLabel.setOrigin(0.5);
  markerLabel.setShadow(0, 1, 'rgba(255,255,255,0.1)', 2);
  labels.push(markerLabel);
}

function drawMonsterToken(
  scene: PhaserType.Scene,
  graphics: PhaserType.GameObjects.Graphics,
  labels: PhaserType.GameObjects.Text[],
  cell: WorldRenderCell,
  centerX: number,
  centerY: number
) {
  const monster = cell.monster;

  if (!monster) {
    return;
  }

  const wolf = /wolf/i.test(monster.label);
  const activeThreat = cell.monsterRole === 'active-threat';
  const fill = wolf ? 0x8a584e : 0xc96d46;
  const edge = wolf ? 0x24110d : 0x32150d;
  const accent = wolf ? 0xf0d2b0 : 0xf5c58f;
  const bodyScale = activeThreat ? 1.1 : 1;
  const bodyHeight = 18 * bodyScale;
  const bodyWidth = 14 * bodyScale;

  graphics.fillStyle(0x000000, 0.26);
  graphics.fillEllipse(centerX, centerY + 14, activeThreat ? 34 : 28, activeThreat ? 12 : 10);
  graphics.lineStyle(activeThreat ? 3 : 2, activeThreat ? 0xffc77b : blendHexColor(fill, 0xffd4a2, 0.18), activeThreat ? 0.56 : 0.3);
  graphics.strokeCircle(centerX, centerY, activeThreat ? 22 : 18);

  if (activeThreat) {
    graphics.lineStyle(2, 0xff7658, 0.62);
    graphics.strokeCircle(centerX, centerY, 27);
  }

  graphics.fillStyle(fill, 1);
  graphics.beginPath();
  if (wolf) {
    graphics.moveTo(centerX, centerY - bodyHeight);
    graphics.lineTo(centerX + bodyWidth, centerY - 4);
    graphics.lineTo(centerX + 10 * bodyScale, centerY + 14 * bodyScale);
    graphics.lineTo(centerX, centerY + bodyHeight);
    graphics.lineTo(centerX - 10 * bodyScale, centerY + 14 * bodyScale);
    graphics.lineTo(centerX - bodyWidth, centerY - 4);
  } else {
    graphics.moveTo(centerX, centerY - 17 * bodyScale);
    graphics.lineTo(centerX + 13 * bodyScale, centerY - 2);
    graphics.lineTo(centerX + 8 * bodyScale, centerY + 16 * bodyScale);
    graphics.lineTo(centerX - 8 * bodyScale, centerY + 16 * bodyScale);
    graphics.lineTo(centerX - 13 * bodyScale, centerY - 2);
  }
  graphics.closePath();
  graphics.fillPath();
  graphics.lineStyle(activeThreat ? 3 : 2, edge, 1);
  graphics.strokePath();

  if (wolf) {
    graphics.fillStyle(edge, 1);
    graphics.fillTriangle(centerX - 10, centerY - 10, centerX - 4, centerY - 22, centerX + 1, centerY - 8);
    graphics.fillTriangle(centerX + 10, centerY - 10, centerX + 4, centerY - 22, centerX - 1, centerY - 8);
    graphics.fillStyle(accent, 0.95);
    graphics.fillCircle(centerX - 4, centerY - 2, 2);
    graphics.fillCircle(centerX + 4, centerY - 2, 2);
  } else {
    graphics.fillStyle(edge, 1);
    graphics.fillRect(centerX + 10, centerY - 12, 2, 24);
    graphics.fillTriangle(centerX + 12, centerY - 12, centerX + 18, centerY - 6, centerX + 12, centerY);
    graphics.fillStyle(accent, 0.92);
    graphics.fillCircle(centerX, centerY - 3, 3);
  }

  const markerLabel = scene.add.text(centerX, centerY + 1, shortMarkerLabel(monster.label, wolf ? 'SW' : 'BG'), {
    color: '#240f0c',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: '10px',
    fontStyle: '700',
  });
  markerLabel.setOrigin(0.5);
  labels.push(markerLabel);

  const levelBadge = scene.add.text(centerX + (activeThreat ? 18 : 15), centerY - (activeThreat ? 21 : 17), activeThreat ? `LV ${monster.level}` : `${monster.level}`, {
    color: activeThreat ? '#2a1009' : '#f7ead2',
    backgroundColor: activeThreat ? '#ffc77bcc' : '#1d0d08cc',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: activeThreat ? '8px' : '9px',
    fontStyle: '700',
    padding: { x: 4, y: 2 },
  });
  levelBadge.setOrigin(0.5);
  labels.push(levelBadge);
}
