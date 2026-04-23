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
const BOARD_PADDING = 28;
const TILE_GAP = 8;
const CLASS_RENDER_COLORS: Record<string, { fill: number; edge: number }> = {
  fighter: { fill: 0xf7d889, edge: 0x31210f },
  ranger: { fill: 0xa8d7a1, edge: 0x143122 },
  wizard: { fill: 0x9fc0ff, edge: 0x16263f },
  cleric: { fill: 0xd8c0ff, edge: 0x2a1d3f },
};

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
    type: Phaser.AUTO,
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
      for (const label of activeLabels) {
        label.destroy();
      }

      activeLabels = [];
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

function drawSnapshot(
  scene: PhaserType.Scene,
  graphics: PhaserType.GameObjects.Graphics,
  labels: PhaserType.GameObjects.Text[],
  snapshot: GameplayShardSnapshot
) {
  const model = buildWorldRenderModel(snapshot);
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

  graphics.fillStyle(0x07110f, 1);
  graphics.fillRect(0, 0, width, height);
  graphics.fillGradientStyle(0x11231e, 0x11231e, 0x050909, 0x050909, 1, 1, 1, 1);
  graphics.fillRect(0, 0, width, height);

  graphics.lineStyle(2, 0x283a33, 0.9);
  graphics.strokeRoundedRect(originX - 14, originY - 14, worldWidth + 28, worldHeight + 28, 24);

  for (const cell of model.cells) {
    const x = originX + (cell.x - model.bounds.minX) * (tileSize + gap);
    const y = originY + (cell.y - model.bounds.minY) * (tileSize + gap);

    drawTile(graphics, snapshot, cell, x, y, tileSize);

    if (cell.character || cell.monster) {
      drawOccupants(scene, graphics, labels, snapshot, cell, x, y, tileSize);
    }
  }

  const caption = scene.add.text(originX, originY + worldHeight + 18, 'Phaser field renderer // shard-local visibility', {
    color: '#b1a791',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: '12px',
    letterSpacing: 1.4,
  });

  labels.push(caption);
}

function drawTile(
  graphics: PhaserType.GameObjects.Graphics,
  snapshot: GameplayShardSnapshot,
  cell: ReturnType<typeof buildWorldRenderModel>['cells'][number],
  x: number,
  y: number,
  tileSize: number
) {
  const { palette } = cell.terrain;

  graphics.fillStyle(0x020605, 0.38);
  graphics.fillRoundedRect(x + 2, y + 5, tileSize, tileSize, 18);

  graphics.fillStyle(palette.fill, 1);
  graphics.fillRoundedRect(x, y, tileSize, tileSize, 18);

  graphics.lineStyle(cell.isCurrent ? 3 : 2, cell.isCurrent ? 0xf7c978 : palette.edge, cell.isCurrent ? 1 : 0.84);
  graphics.strokeRoundedRect(x, y, tileSize, tileSize, 18);

  drawTerrainDetail(graphics, cell, x, y, tileSize);

  if (cell.tile.blocked) {
    graphics.lineStyle(3, 0xf08a6d, 0.9);
    graphics.beginPath();
    graphics.moveTo(x + 12, y + 12);
    graphics.lineTo(x + tileSize - 12, y + tileSize - 12);
    graphics.moveTo(x + tileSize - 12, y + 12);
    graphics.lineTo(x + 12, y + tileSize - 12);
    graphics.strokePath();
  }

  if (cell.monster && palette.glow) {
    graphics.lineStyle(2, palette.glow, 0.3);
    graphics.strokeRoundedRect(x + 5, y + 5, tileSize - 10, tileSize - 10, 14);
  }

  if (cell.isObjectiveTarget) {
    graphics.lineStyle(3, 0xf7d889, 0.9);
    graphics.strokeRoundedRect(x + 8, y + 8, tileSize - 16, tileSize - 16, 14);
    graphics.lineStyle(1, 0xf7d889, 0.32);
    graphics.strokeRoundedRect(x + 13, y + 13, tileSize - 26, tileSize - 26, 10);
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

function drawTerrainDetail(
  graphics: PhaserType.GameObjects.Graphics,
  cell: ReturnType<typeof buildWorldRenderModel>['cells'][number],
  x: number,
  y: number,
  tileSize: number
) {
  const { detail, edge, glow } = cell.terrain.palette;
  const centerX = x + tileSize / 2;
  const centerY = y + tileSize / 2;

  switch (cell.tile.kind) {
    case 'town':
      graphics.fillStyle(detail, 0.95);
      graphics.fillTriangle(centerX - 12, centerY + 4, centerX, centerY - 14, centerX + 12, centerY + 4);
      graphics.fillRect(centerX - 10, centerY + 2, 20, 12);
      graphics.fillStyle(edge, 0.88);
      graphics.fillCircle(centerX, centerY + 9, 4);
      break;
    case 'road':
      graphics.lineStyle(7, detail, 0.64);
      graphics.beginPath();
      graphics.moveTo(x + 10, y + tileSize - 18);
      graphics.lineTo(x + tileSize / 2, y + tileSize / 2);
      graphics.lineTo(x + tileSize - 10, y + 16);
      graphics.strokePath();
      break;
    case 'forest':
      graphics.fillStyle(detail, 0.34);
      graphics.fillCircle(centerX - 13, centerY + 2, 14);
      graphics.fillCircle(centerX + 2, centerY - 10, 15);
      graphics.fillCircle(centerX + 16, centerY + 5, 12);
      graphics.fillStyle(edge, 0.88);
      graphics.fillRect(centerX - 3, centerY + 8, 6, 16);
      break;
    case 'roots':
      graphics.lineStyle(3, detail, 0.84);
      graphics.beginPath();
      graphics.moveTo(x + 10, y + tileSize - 16);
      graphics.lineTo(x + tileSize / 2, y + tileSize / 2);
      graphics.lineTo(x + tileSize - 14, y + 18);
      graphics.moveTo(x + 18, y + tileSize - 12);
      graphics.lineTo(x + tileSize - 16, y + tileSize / 2 + 6);
      graphics.strokePath();
      break;
    case 'ruin':
      graphics.fillStyle(detail, 0.9);
      graphics.fillRect(centerX - 16, centerY - 12, 8, 28);
      graphics.fillRect(centerX + 6, centerY - 8, 8, 24);
      graphics.lineStyle(2, edge, 0.7);
      graphics.strokeRect(centerX - 16, centerY - 12, 8, 28);
      graphics.strokeRect(centerX + 6, centerY - 8, 8, 24);
      break;
    case 'shrine':
      if (glow) {
        graphics.fillStyle(glow, 0.18);
        graphics.fillCircle(centerX, centerY, 22);
      }
      graphics.fillStyle(detail, 0.96);
      graphics.fillTriangle(centerX, centerY - 18, centerX + 14, centerY, centerX, centerY + 18);
      graphics.fillTriangle(centerX, centerY - 18, centerX - 14, centerY, centerX, centerY + 18);
      break;
    case 'water':
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
  cell: ReturnType<typeof buildWorldRenderModel>['cells'][number],
  x: number,
  y: number,
  tileSize: number
) {
  const positions = cell.character && cell.monster ? [0.36, 0.66] : [0.5];
  let offsetIndex = 0;

  if (cell.character) {
    const hero = cell.character.cid === snapshot.character.cid;
    const centerX = x + tileSize * positions[offsetIndex];
    const centerY = y + tileSize - 18;
    const classColors = CLASS_RENDER_COLORS[cell.character.classId ?? snapshot.character.classId] ?? CLASS_RENDER_COLORS.fighter;
    const fill = hero ? classColors.fill : blendHexColor(classColors.fill, 0x294432, 0.38);
    const edge = hero ? classColors.edge : 0x143122;

    graphics.fillStyle(fill, 1);
    graphics.fillCircle(centerX, centerY, hero ? 12 : 10);
    graphics.lineStyle(hero ? 3 : 2, edge, 1);
    graphics.strokeCircle(centerX, centerY, hero ? 12 : 10);

    if (hero) {
      graphics.lineStyle(2, 0xf7d889, 0.34);
      graphics.strokeCircle(centerX, centerY, 16);
    }

    const label = scene.add.text(
      centerX,
      centerY - 1,
      shortMarkerLabel(cell.character.name ?? snapshot.character.name, hero ? 'ME' : 'AL'),
      {
        color: hero ? '#2f1f10' : '#102215',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: hero ? '12px' : '11px',
        fontStyle: '700',
      }
    );
    label.setOrigin(0.5);
    labels.push(label);
    offsetIndex += 1;
  }

  if (cell.monster) {
    const centerX = x + tileSize * positions[offsetIndex];
    const centerY = y + tileSize - 18;

    graphics.fillStyle(0xd96f4e, 1);
    graphics.fillCircle(centerX, centerY, 11);
    graphics.lineStyle(2, 0x2f140f, 1);
    graphics.strokeCircle(centerX, centerY, 11);
    graphics.lineStyle(2, 0xf4c198, 0.84);
    graphics.beginPath();
    graphics.moveTo(centerX - 6, centerY - 10);
    graphics.lineTo(centerX - 2, centerY - 16);
    graphics.lineTo(centerX + 1, centerY - 10);
    graphics.moveTo(centerX + 6, centerY - 10);
    graphics.lineTo(centerX + 2, centerY - 16);
    graphics.lineTo(centerX - 1, centerY - 10);
    graphics.strokePath();

    const label = scene.add.text(centerX, centerY - 1, shortMarkerLabel(cell.monster.label, 'MN'), {
      color: '#240f0c',
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: '11px',
      fontStyle: '700',
    });
    label.setOrigin(0.5);
    labels.push(label);
  }
}
