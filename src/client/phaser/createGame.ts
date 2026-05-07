import type PhaserType from 'phaser';
import type { GameplayShardSnapshot } from '@/shared/gameplay';
import { buildWorldRenderModel } from '@/components/game/world-render-model';
import {
  ACTOR_SPRITES,
  actorSpriteAnimationKey,
  actorSpriteTextureKey,
  characterSpriteKey,
  monsterSpriteKey,
  type ActorSpritePose,
  type ActorSpriteSpec,
  type ActorSpritePixelBlock,
} from './sprite-catalog';

export interface ThornwritheGameBridge {
  render(snapshot: GameplayShardSnapshot, options?: ThornwritheRenderOptions): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

export interface ThornwritheRenderOptions {
  revealFog?: boolean;
}

const MIN_WIDTH = 480;
const MIN_HEIGHT = 420;
const BOARD_PADDING = 34;
const TILE_GAP = 0;
const TEXTURE_FILTER_NEAREST = 1 as PhaserType.Textures.FilterMode;
const WORLD_GRASS_BASE_FILL = 0x3f7d45;
const WORLD_GRASS_BASE_DARK = 0x254b30;
const WORLD_MUD_PATCH_FILL = 0x765033;
const HERO_SPRITE_TILE_RATIO = 0.42;
const ALLY_SPRITE_TILE_RATIO = 0.37;
const MONSTER_SPRITE_TILE_RATIO = 0.4;
const ACTIVE_MONSTER_SPRITE_TILE_RATIO = 0.46;

type WorldRenderCell = ReturnType<typeof buildWorldRenderModel>['cells'][number];
type WorldRenderBounds = ReturnType<typeof buildWorldRenderModel>['bounds'];
type CellMap = Map<string, WorldRenderCell>;
type RuntimeGameObject = PhaserType.GameObjects.GameObject;

export async function createGame(container: HTMLElement): Promise<ThornwritheGameBridge> {
  if (typeof window === 'undefined' || process.env.NODE_ENV === 'test') {
    return createNoopBridge();
  }

  const Phaser = (await import('phaser')).default;
  const width = Math.max(container.clientWidth, MIN_WIDTH);
  const height = Math.max(container.clientHeight, MIN_HEIGHT);

  let activeScene: PhaserType.Scene | null = null;
  let activeGraphics: PhaserType.GameObjects.Graphics | null = null;
  let activeLabels: RuntimeGameObject[] = [];
  let pendingSnapshot: GameplayShardSnapshot | null = null;
  let pendingOptions: ThornwritheRenderOptions = {};

  const scene = {
    key: 'thornwrithe-world',
    create(this: PhaserType.Scene) {
      activeScene = this;
      activeGraphics = this.add.graphics();
      ensureActorSpriteTextures(this);
      ensureActorSpriteAnimations(this);

      if (pendingSnapshot) {
        drawSnapshot(this, activeGraphics, activeLabels, pendingSnapshot, pendingOptions);
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
      antialias: false,
      pixelArt: true,
    },
    scene,
  });

  return {
    render(snapshot, options = {}) {
      pendingSnapshot = snapshot;
      pendingOptions = options;

      if (!activeScene || !activeGraphics) {
        return;
      }

      drawSnapshot(activeScene, activeGraphics, activeLabels, snapshot, options);
    },
    resize(nextWidth, nextHeight) {
      const widthValue = Math.max(Math.round(nextWidth), MIN_WIDTH);
      const heightValue = Math.max(Math.round(nextHeight), MIN_HEIGHT);

      game.scale.resize(widthValue, heightValue);

      if (!pendingSnapshot || !activeScene || !activeGraphics) {
        return;
      }

      drawSnapshot(activeScene, activeGraphics, activeLabels, pendingSnapshot, pendingOptions);
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

function clearLabels(labels: RuntimeGameObject[]) {
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

function drawSnapshot(
  scene: PhaserType.Scene,
  graphics: PhaserType.GameObjects.Graphics,
  labels: RuntimeGameObject[],
  snapshot: GameplayShardSnapshot,
  options: ThornwritheRenderOptions = {}
) {
  const model = buildWorldRenderModel(snapshot, { revealFog: options.revealFog });
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
  const gap = TILE_GAP;
  const worldWidth = tileSize * model.bounds.columns + gap * (model.bounds.columns - 1);
  const worldHeight = tileSize * model.bounds.rows + gap * (model.bounds.rows - 1);
  const originX = (width - worldWidth) / 2;
  const originY = (height - worldHeight) / 2;
  const pulse = 0.48 + Math.sin(Date.now() / 850) * 0.08;

  drawBackdrop(graphics, width, height, originX, originY, worldWidth, worldHeight, pulse);
  drawWorldGroundBase(graphics, originX, originY, worldWidth, worldHeight);

  for (const cell of model.cells) {
    const x = originX + (cell.x - model.bounds.minX) * (tileSize + gap);
    const y = originY + (cell.y - model.bounds.minY) * (tileSize + gap);

    drawTile(graphics, snapshot, cellMap, cell, x, y, tileSize, pulse);
  }

  drawContinuousFogLayer(graphics, model.cells, model.bounds, originX, originY, tileSize, gap, pulse);

  for (const cell of model.cells) {
    const x = originX + (cell.x - model.bounds.minX) * (tileSize + gap);
    const y = originY + (cell.y - model.bounds.minY) * (tileSize + gap);

    if (!cell.fogged && (cell.character || cell.monster)) {
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

function drawWorldGroundBase(
  graphics: PhaserType.GameObjects.Graphics,
  originX: number,
  originY: number,
  worldWidth: number,
  worldHeight: number
) {
  graphics.fillGradientStyle(
    blendHexColor(WORLD_GRASS_BASE_FILL, 0xf3dca6, 0.05),
    blendHexColor(WORLD_GRASS_BASE_FILL, 0x122416, 0.18),
    WORLD_GRASS_BASE_DARK,
    blendHexColor(WORLD_GRASS_BASE_DARK, 0x050807, 0.2),
    1,
    1,
    1,
    1
  );
  graphics.fillRect(originX - 1, originY - 1, worldWidth + 2, worldHeight + 2);

  graphics.fillStyle(0x6a9b54, 0.24);
  for (let index = 0; index < 36; index += 1) {
    const x = originX + ((index * 37) % Math.max(1, Math.floor(worldWidth)));
    const y = originY + ((index * 53) % Math.max(1, Math.floor(worldHeight)));
    graphics.fillRect(x, y, 4, 4);
  }
}

function ensureActorSpriteTextures(scene: PhaserType.Scene) {
  for (const spec of Object.values(ACTOR_SPRITES)) {
    for (const pose of spec.animation.poses) {
      const textureKey = actorSpriteTextureKey(spec.key, pose);

      if (scene.textures.exists(textureKey)) {
        continue;
      }

      const spriteGraphics = scene.add.graphics();
      drawActorSpriteTexture(spriteGraphics, spec, pose);
      spriteGraphics.generateTexture(textureKey, spec.frame.width, spec.frame.height);
      scene.textures.get(textureKey).setFilter(TEXTURE_FILTER_NEAREST);
      spriteGraphics.destroy();
    }
  }
}

function ensureActorSpriteAnimations(scene: PhaserType.Scene) {
  for (const spec of Object.values(ACTOR_SPRITES)) {
    const idleKey = actorSpriteAnimationKey(spec.key, 'idle');
    const combatKey = actorSpriteAnimationKey(spec.key, 'combat');

    if (!scene.anims.exists(idleKey)) {
      scene.anims.create({
        key: idleKey,
        frames: ['idle', 'step-left', 'idle', 'step-right'].map((pose) => ({
          key: actorSpriteTextureKey(spec.key, pose as ActorSpritePose),
        })),
        frameRate: spec.animation.fps,
        repeat: -1,
      });
    }

    if (!scene.anims.exists(combatKey)) {
      scene.anims.create({
        key: combatKey,
        frames: ['idle', 'strike', 'step-left', 'strike', 'step-right'].map((pose) => ({
          key: actorSpriteTextureKey(spec.key, pose as ActorSpritePose),
        })),
        frameRate: spec.animation.fps + 1,
        repeat: -1,
      });
    }
  }
}

function drawActorSpriteTexture(graphics: PhaserType.GameObjects.Graphics, spec: ActorSpriteSpec, pose: ActorSpritePose) {
  graphics.clear();

  for (const block of spec.pixelArt.blocks) {
    const posedBlock = poseActorSpriteBlock(spec, block, pose);
    graphics.fillStyle(spec.palette[block.color], block.alpha ?? 1);
    graphics.fillRect(posedBlock.x, posedBlock.y, block.width, block.height);
  }
}

function poseActorSpriteBlock(spec: ActorSpriteSpec, block: ActorSpritePixelBlock, pose: ActorSpritePose) {
  const middleX = spec.frame.width / 2;
  const isHead = block.y < spec.frame.height * 0.45;
  const isBody = block.y >= spec.frame.height * 0.36 && block.y < spec.frame.height * 0.8;
  const isFoot = block.y >= spec.frame.height - 8;
  const isRightSide = block.x >= middleX;
  const isWeaponOrHand = (isRightSide && block.y >= spec.frame.height * 0.16 && block.y <= spec.frame.height * 0.8) || block.width <= 3;
  let x = block.x;
  let y = block.y;

  if (pose === 'step-left') {
    if (isHead || isBody) {
      y -= 1;
    }
    if (isFoot) {
      x += isRightSide ? 1 : -1;
    }
  }

  if (pose === 'step-right') {
    if (isHead || isBody) {
      y -= 1;
    }
    if (isFoot) {
      x += isRightSide ? -1 : 1;
    }
  }

  if (pose === 'strike') {
    if (isHead) {
      x += isRightSide ? 1 : -1;
    }
    if (isBody) {
      y -= 1;
    }
    if (isWeaponOrHand) {
      x += isRightSide ? 2 : -2;
      y -= 1;
    }
  }

  return {
    x: Math.max(0, Math.min(spec.frame.width - block.width, x)),
    y: Math.max(0, Math.min(spec.frame.height - block.height, y)),
  };
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
  if (cell.fogged) {
    return;
  }

  drawSeamlessTerrainPatch(graphics, cellMap, cell, x, y, tileSize);
  drawPixelTerrainDetail(graphics, cell, x, y, tileSize);

  if (cell.tile.blocked) {
    graphics.fillStyle(0x050807, 0.18);
    graphics.fillRect(x + tileSize * 0.14, y + tileSize * 0.7, tileSize * 0.72, Math.max(3, tileSize * 0.05));
  }

  if (cell.monster) {
    const glowColor = cell.monsterRole === 'active-threat' ? 0xff7658 : cell.terrain.palette.glow;

    if (glowColor) {
      graphics.lineStyle(cell.monsterRole === 'active-threat' ? 3 : 2, glowColor, cell.monsterRole === 'active-threat' ? 0.58 : 0.24);
      graphics.strokeCircle(x + tileSize * 0.5, y + tileSize * 0.54, tileSize * 0.34);
    }
  }

  if (cell.monsterRole === 'active-threat') {
    const centerX = x + tileSize * 0.5;
    const centerY = y + tileSize * 0.54;
    const alertInset = tileSize * (0.3 + pulse * 0.02);
    graphics.lineStyle(2, 0xffc77b, 0.38 + pulse * 0.16);
    graphics.strokeCircle(centerX, centerY, alertInset);
    graphics.lineStyle(2, 0xff7658, 0.5);
    graphics.beginPath();
    graphics.moveTo(centerX, centerY - tileSize * 0.38);
    graphics.lineTo(centerX, centerY - tileSize * 0.26);
    graphics.moveTo(centerX, centerY + tileSize * 0.38);
    graphics.lineTo(centerX, centerY + tileSize * 0.26);
    graphics.moveTo(centerX - tileSize * 0.38, centerY);
    graphics.lineTo(centerX - tileSize * 0.26, centerY);
    graphics.moveTo(centerX + tileSize * 0.38, centerY);
    graphics.lineTo(centerX + tileSize * 0.26, centerY);
    graphics.strokePath();
  }

  if (cell.isObjectiveTarget) {
    graphics.lineStyle(3, 0xf7d889, 0.92);
    graphics.strokeCircle(x + tileSize * 0.5, y + tileSize * 0.52, tileSize * 0.3);
    graphics.lineStyle(1, 0xf7d889, 0.26);
    graphics.strokeCircle(x + tileSize * 0.5, y + tileSize * 0.52, tileSize * 0.22);
  }

  if (cell.isCurrent && snapshot.encounter?.status === 'active') {
    graphics.lineStyle(3, 0xe77757, 0.54);
    graphics.strokeCircle(x + tileSize * 0.5, y + tileSize * 0.55, tileSize * 0.42);
  } else if (cell.isCurrent) {
    graphics.lineStyle(2, 0xf7d889, 0.74);
    graphics.strokeCircle(x + tileSize * 0.5, y + tileSize * 0.55, tileSize * 0.36);
  }
}

function drawContinuousFogLayer(
  graphics: PhaserType.GameObjects.Graphics,
  cells: WorldRenderCell[],
  bounds: WorldRenderBounds,
  originX: number,
  originY: number,
  tileSize: number,
  gap: number,
  pulse: number
) {
  const foggedCells = cells.filter((cell) => cell.fogged);

  if (foggedCells.length === 0) {
    return;
  }

  for (const cell of foggedCells) {
    drawFogCellMask(graphics, cell, bounds, originX, originY, tileSize, gap, pulse);
  }

  drawFogWisps(graphics, foggedCells, bounds, originX, originY, tileSize, gap, pulse);
}

function drawFogCellMask(
  graphics: PhaserType.GameObjects.Graphics,
  cell: WorldRenderCell,
  bounds: WorldRenderBounds,
  originX: number,
  originY: number,
  tileSize: number,
  gap: number,
  pulse: number
) {
  const left = originX + (cell.x - bounds.minX) * (tileSize + gap);
  const top = originY + (cell.y - bounds.minY) * (tileSize + gap);
  const edgeAlpha = 0.72 + pulse * 0.08;

  graphics.fillGradientStyle(0x020605, 0x06100e, 0x091511, 0x020504, edgeAlpha, 0.84, 0.86, edgeAlpha);
  graphics.fillRect(left - 1, top - 1, tileSize + 2, tileSize + 2);
}

function drawFogWisps(
  graphics: PhaserType.GameObjects.Graphics,
  foggedCells: WorldRenderCell[],
  bounds: WorldRenderBounds,
  originX: number,
  originY: number,
  tileSize: number,
  gap: number,
  pulse: number
) {
  const wispCount = Math.min(18, Math.max(8, Math.ceil(foggedCells.length / 5)));

  for (let index = 0; index < wispCount; index += 1) {
    const cell = foggedCells[(index * 7) % foggedCells.length];
    const left = originX + (cell.x - bounds.minX) * (tileSize + gap);
    const top = originY + (cell.y - bounds.minY) * (tileSize + gap);
    const centerX = left + tileSize * (((index * 37) % 80) / 100 + 0.1);
    const centerY = top + tileSize * (((index * 53) % 80) / 100 + 0.1);
    const width = tileSize * (1.35 + ((index % 3) * 0.22));
    const height = tileSize * (0.58 + ((index % 4) * 0.1));

    graphics.fillStyle(index % 2 === 0 ? 0x13211f : 0x0b1816, 0.24 + pulse * 0.08);
    graphics.fillEllipse(centerX, centerY, width, height);
  }

  graphics.fillStyle(0x758568, 0.08);
  for (let index = 0; index < Math.min(64, foggedCells.length * 2); index += 1) {
    const cell = foggedCells[(index * 11) % foggedCells.length];
    const left = originX + (cell.x - bounds.minX) * (tileSize + gap);
    const top = originY + (cell.y - bounds.minY) * (tileSize + gap);

    graphics.fillRect(
      left + ((index * 17 + 9) % Math.max(1, Math.floor(tileSize - 3))),
      top + ((index * 23 + 13) % Math.max(1, Math.floor(tileSize - 3))),
      2,
      2
    );
  }
}

function drawSeamlessTerrainPatch(
  graphics: PhaserType.GameObjects.Graphics,
  cellMap: CellMap,
  cell: WorldRenderCell,
  x: number,
  y: number,
  tileSize: number
) {
  if (cell.tile.kind === 'mud') {
    drawMudGroundPatch(graphics, cellMap, cell, x, y, tileSize);
  }
}

function drawMudGroundPatch(
  graphics: PhaserType.GameObjects.Graphics,
  cellMap: CellMap,
  cell: WorldRenderCell,
  x: number,
  y: number,
  tileSize: number
) {
  const northMud = cellAt(cellMap, cell.x, cell.y - 1)?.tile.kind === 'mud';
  const southMud = cellAt(cellMap, cell.x, cell.y + 1)?.tile.kind === 'mud';
  const westMud = cellAt(cellMap, cell.x - 1, cell.y)?.tile.kind === 'mud';
  const eastMud = cellAt(cellMap, cell.x + 1, cell.y)?.tile.kind === 'mud';

  graphics.fillStyle(WORLD_MUD_PATCH_FILL, 0.78);
  graphics.fillRect(
    x + (westMud ? 0 : tileSize * 0.08),
    y + (northMud ? 0 : tileSize * 0.1),
    tileSize * (0.84 + (westMud ? 0.08 : 0) + (eastMud ? 0.08 : 0)),
    tileSize * (0.8 + (northMud ? 0.1 : 0) + (southMud ? 0.1 : 0))
  );
  graphics.fillStyle(0x5b3b27, 0.34);
  graphics.fillEllipse(x + tileSize * 0.36, y + tileSize * 0.62, tileSize * 0.48, tileSize * 0.14);
  graphics.fillEllipse(x + tileSize * 0.68, y + tileSize * 0.34, tileSize * 0.34, tileSize * 0.12);
  graphics.fillStyle(0xd1a36f, 0.28);
  graphics.fillRect(x + tileSize * 0.18, y + tileSize * 0.62, tileSize * 0.22, Math.max(2, tileSize * 0.03));
  graphics.fillRect(x + tileSize * 0.56, y + tileSize * 0.34, tileSize * 0.24, Math.max(2, tileSize * 0.03));
}

function drawPixelTerrainDetail(
  graphics: PhaserType.GameObjects.Graphics,
  cell: WorldRenderCell,
  x: number,
  y: number,
  tileSize: number
) {
  const { detail, edge } = cell.terrain.palette;
  const centerX = x + tileSize / 2;
  const centerY = y + tileSize / 2;

  switch (cell.tile.kind) {
    case 'grass': {
      graphics.fillStyle(detail, 0.16);
      graphics.fillRect(x + tileSize * 0.24, y + tileSize * 0.28, 3, 3);
      graphics.fillRect(x + tileSize * 0.62, y + tileSize * 0.34, 2, 2);
      graphics.fillRect(x + tileSize * 0.46, y + tileSize * 0.68, 3, 2);
      graphics.fillStyle(edge, 0.22);
      graphics.fillCircle(centerX - tileSize * 0.22, centerY - tileSize * 0.14, 2);
      graphics.fillCircle(centerX + tileSize * 0.2, centerY + tileSize * 0.18, 2);
      break;
    }
    case 'mud':
      graphics.fillStyle(edge, 0.16);
      graphics.fillEllipse(centerX - tileSize * 0.14, centerY + tileSize * 0.12, tileSize * 0.32, tileSize * 0.15);
      graphics.fillEllipse(centerX + tileSize * 0.2, centerY - tileSize * 0.12, tileSize * 0.24, tileSize * 0.12);
      graphics.lineStyle(3, detail, 0.46);
      graphics.beginPath();
      graphics.moveTo(x + tileSize * 0.18, y + tileSize * 0.72);
      graphics.lineTo(centerX - 4, centerY + 5);
      graphics.lineTo(x + tileSize * 0.76, y + tileSize * 0.28);
      graphics.strokePath();
      break;
    case 'forest':
      graphics.fillStyle(detail, 0.88);
      graphics.fillTriangle(centerX - 24, centerY + 12, centerX - 8, centerY - 24, centerX + 8, centerY + 12);
      graphics.fillTriangle(centerX - 14, centerY + 3, centerX - 1, centerY - 27, centerX + 14, centerY + 3);
      graphics.fillTriangle(centerX - 6, centerY + 16, centerX + 14, centerY - 18, centerX + 32, centerY + 16);
      graphics.fillStyle(edge, 0.86);
      graphics.fillRect(centerX - 5, centerY + 7, 7, 16);
      graphics.fillRect(centerX + 11, centerY + 10, 7, 13);
      graphics.fillStyle(0x0c130f, 0.2);
      graphics.fillEllipse(centerX + 2, centerY + 16, tileSize * 0.32, tileSize * 0.08);
      break;
    case 'stone':
      graphics.fillStyle(detail, 0.88);
      graphics.fillRect(centerX - 20, centerY + 2, 16, 16);
      graphics.fillRect(centerX - 6, centerY - 12, 24, 26);
      graphics.fillRect(centerX + 13, centerY + 1, 12, 15);
      graphics.lineStyle(2, edge, 0.7);
      graphics.strokeRect(centerX - 20, centerY + 2, 16, 16);
      graphics.strokeRect(centerX - 6, centerY - 12, 24, 26);
      graphics.strokeRect(centerX + 13, centerY + 1, 12, 15);
      graphics.fillStyle(edge, 0.26);
      graphics.fillRect(centerX - 13, centerY - 5, 12, 4);
      graphics.fillRect(centerX + 3, centerY + 4, 10, 4);
      break;
    default:
      break;
  }
}

function drawOccupants(
  scene: PhaserType.Scene,
  graphics: PhaserType.GameObjects.Graphics,
  labels: RuntimeGameObject[],
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

    drawCharacterToken(scene, graphics, labels, snapshot, cell, centerX, centerY, tileSize, hero);
    offsetIndex += 1;
  }

  if (cell.monster) {
    const centerX = x + tileSize * positions[offsetIndex];
    const centerY = y + tileSize * 0.62;
    drawMonsterToken(scene, graphics, labels, cell, centerX, centerY, tileSize);
  }
}

function drawCharacterToken(
  scene: PhaserType.Scene,
  graphics: PhaserType.GameObjects.Graphics,
  labels: RuntimeGameObject[],
  snapshot: GameplayShardSnapshot,
  cell: WorldRenderCell,
  centerX: number,
  centerY: number,
  tileSize: number,
  hero: boolean
) {
  const spriteKey = characterSpriteKey(cell.character?.classId ?? snapshot.character.classId, hero);
  const spec = ACTOR_SPRITES[spriteKey];
  const spriteScale = (tileSize * (hero ? HERO_SPRITE_TILE_RATIO : ALLY_SPRITE_TILE_RATIO)) / spec.frame.height;
  const spriteBaseY = centerY + tileSize * 0.26;

  graphics.fillStyle(0x000000, 0.24);
  graphics.fillEllipse(centerX, spriteBaseY + 2, hero ? 24 : 20, hero ? 8 : 6);

  const actorSprite = scene.add.sprite(centerX, spriteBaseY, actorSpriteTextureKey(spriteKey, 'idle'));
  actorSprite.setOrigin(spec.anchor.x, spec.anchor.y);
  actorSprite.setScale(spriteScale);
  actorSprite.setAlpha(hero ? 1 : 0.88);
  actorSprite.setDepth(hero ? 14 : 12);
  actorSprite.play(actorSpriteAnimationKey(spriteKey, hero && snapshot.encounter?.status === 'active' && cell.isCurrent ? 'combat' : 'idle'));
  labels.push(actorSprite);

  if (hero) {
    graphics.lineStyle(2, 0xf7d889, 0.34);
    graphics.strokeCircle(centerX, centerY + 2, 14);
    graphics.fillStyle(0xf7d889, 0.92);
    graphics.fillTriangle(centerX + 7, centerY - 18, centerX + 17, centerY - 15, centerX + 7, centerY - 10);

    const currentHp = snapshot.character.hitPoints.current;
    const maxHp = snapshot.character.hitPoints.max;
    const ratio = maxHp > 0 ? currentHp / maxHp : 0;
    const filledPips = Math.max(1, Math.ceil(ratio * 5));

    for (let index = 0; index < 5; index += 1) {
      const pipX = centerX - 11 + index * 6;
      graphics.fillStyle(index < filledPips ? 0xf7d889 : 0x31443b, index < filledPips ? 0.94 : 0.72);
      graphics.fillRoundedRect(pipX, centerY + 17, 4, 3, 1);
    }
  }
}

function drawMonsterToken(
  scene: PhaserType.Scene,
  graphics: PhaserType.GameObjects.Graphics,
  labels: RuntimeGameObject[],
  cell: WorldRenderCell,
  centerX: number,
  centerY: number,
  tileSize: number
) {
  const monster = cell.monster;

  if (!monster) {
    return;
  }

  const activeThreat = cell.monsterRole === 'active-threat';
  const spriteKey = monsterSpriteKey(monster.label);
  const spec = ACTOR_SPRITES[spriteKey];
  const spriteScale = (tileSize * (activeThreat ? ACTIVE_MONSTER_SPRITE_TILE_RATIO : MONSTER_SPRITE_TILE_RATIO)) / spec.frame.height;
  const spriteBaseY = centerY + tileSize * 0.26;

  graphics.fillStyle(0x000000, 0.26);
  graphics.fillEllipse(centerX, spriteBaseY + 2, activeThreat ? 28 : 23, activeThreat ? 9 : 7);
  graphics.lineStyle(
    activeThreat ? 3 : 2,
    activeThreat ? 0xffc77b : blendHexColor(spec.palette.fill, 0xffd4a2, 0.18),
    activeThreat ? 0.56 : 0.3
  );
  graphics.strokeCircle(centerX, centerY + 2, activeThreat ? 17 : 14);

  if (activeThreat) {
    graphics.lineStyle(2, 0xff7658, 0.62);
    graphics.strokeCircle(centerX, centerY + 2, 22);
  }

  const actorSprite = scene.add.sprite(centerX, spriteBaseY, actorSpriteTextureKey(spriteKey, 'idle'));
  actorSprite.setOrigin(spec.anchor.x, spec.anchor.y);
  actorSprite.setScale(spriteScale);
  actorSprite.setDepth(activeThreat ? 15 : 13);
  actorSprite.play(actorSpriteAnimationKey(spriteKey, activeThreat ? 'combat' : 'idle'));
  labels.push(actorSprite);

  const levelBadge = scene.add.text(centerX + (activeThreat ? 14 : 12), centerY - (activeThreat ? 17 : 14), activeThreat ? `LV ${monster.level}` : `${monster.level}`, {
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
