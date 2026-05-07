export type ActorSpriteKey =
  | 'pc-fighter'
  | 'pc-rogue'
  | 'pc-wizard'
  | 'pc-cleric'
  | 'pc-ally'
  | 'mob-briar-goblin'
  | 'mob-sap-wolf'
  | 'mob-root-troll'
  | 'mob-vampire-lord'
  | 'mob-generic';

export type ActorSpriteKind =
  | 'fighter'
  | 'rogue'
  | 'wizard'
  | 'cleric'
  | 'ally'
  | 'goblin'
  | 'wolf'
  | 'troll'
  | 'vampire'
  | 'generic';

export interface ActorSpriteSpec {
  key: ActorSpriteKey;
  kind: ActorSpriteKind;
  label: string;
  frame: {
    width: ActorSpriteFrameSize;
    height: ActorSpriteFrameSize;
  };
  anchor: {
    x: 0.5;
    y: 1;
  };
  palette: ActorSpritePalette;
  pixelArt: ActorSpritePixelArt;
  animation: ActorSpriteAnimationSpec;
}

export type ActorSpriteFrameSize = 32 | 48;
export type ActorSpritePose = 'idle' | 'step-left' | 'step-right' | 'strike';
export type ActorSpriteAnimationMode = 'idle' | 'combat';

export interface ActorSpriteAnimationSpec {
  poses: readonly ActorSpritePose[];
  fps: number;
}

export interface ActorSpritePalette {
  fill: number;
  edge: number;
  detail: number;
  accent: number;
  shade: number;
  skin: number;
}

export type ActorSpritePaletteSlot = keyof ActorSpritePalette;

export interface ActorSpritePixelBlock {
  color: ActorSpritePaletteSlot;
  x: number;
  y: number;
  width: number;
  height: number;
  alpha?: number;
}

export interface ActorSpritePixelArt {
  style: 'old-school-fantasy-rpg';
  hints: readonly string[];
  blocks: readonly ActorSpritePixelBlock[];
}

const BASE_FRAME = { width: 48, height: 48 } as const;
const BOTTOM_CENTER_ANCHOR = { x: 0.5, y: 1 } as const;
const PIXEL_STYLE = 'old-school-fantasy-rpg' as const;
export const ACTOR_SPRITE_POSES = ['idle', 'step-left', 'step-right', 'strike'] as const;
const DEFAULT_ACTOR_ANIMATION = { poses: ACTOR_SPRITE_POSES, fps: 5 } as const;
const SPRITE_SCALE_32_TO_48 = 1.5;

const px = (
  color: ActorSpritePaletteSlot,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha?: number,
): ActorSpritePixelBlock => (alpha === undefined ? { color, x, y, width, height } : { color, x, y, width, height, alpha });

function splitPixelBlock(block: ActorSpritePixelBlock): ActorSpritePixelBlock[] {
  const chunks: ActorSpritePixelBlock[] = [];
  const maxChunk = 8;

  for (let y = block.y; y < block.y + block.height; y += maxChunk) {
    for (let x = block.x; x < block.x + block.width; x += maxChunk) {
      chunks.push(
        px(
          block.color,
          x,
          y,
          Math.min(maxChunk, block.x + block.width - x),
          Math.min(maxChunk, block.y + block.height - y),
          block.alpha,
        )
      );
    }
  }

  return chunks;
}

function upscalePixelBlock(block: ActorSpritePixelBlock): ActorSpritePixelBlock[] {
  const x = Math.min(BASE_FRAME.width - 1, Math.round(block.x * SPRITE_SCALE_32_TO_48));
  const y = Math.min(BASE_FRAME.height - 1, Math.round(block.y * SPRITE_SCALE_32_TO_48));
  const right = Math.min(BASE_FRAME.width, Math.round((block.x + block.width) * SPRITE_SCALE_32_TO_48));
  const bottom = Math.min(BASE_FRAME.height, Math.round((block.y + block.height) * SPRITE_SCALE_32_TO_48));

  return splitPixelBlock(px(block.color, x, y, Math.max(1, right - x), Math.max(1, bottom - y), block.alpha));
}

function spriteBlocks(baseBlocks: ActorSpritePixelBlock[], detailBlocks: ActorSpritePixelBlock[] = []): ActorSpritePixelBlock[] {
  return [...baseBlocks.flatMap(upscalePixelBlock), ...detailBlocks.flatMap(splitPixelBlock)];
}

export function actorSpriteTextureKey(spriteKey: ActorSpriteKey, pose: ActorSpritePose) {
  return `${spriteKey}:${pose}`;
}

export function actorSpriteAnimationKey(spriteKey: ActorSpriteKey, mode: ActorSpriteAnimationMode) {
  return `${spriteKey}:anim:${mode}`;
}

export const ACTOR_SPRITES: Record<ActorSpriteKey, ActorSpriteSpec> = {
  'pc-fighter': {
    key: 'pc-fighter',
    kind: 'fighter',
    label: 'Fighter',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x1c1714, fill: 0xb9b5a7, detail: 0x8a2f24, accent: 0xd9b45f, shade: 0x5a5f61, skin: 0xd79a62 },
    animation: DEFAULT_ACTOR_ANIMATION,
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['mail shirt', 'heater shield', 'short sword'],
      blocks: spriteBlocks([
        px('edge', 13, 5, 8, 3),
        px('shade', 12, 8, 10, 3),
        px('skin', 13, 9, 8, 5),
        px('edge', 12, 12, 10, 2),
        px('edge', 10, 13, 13, 11),
        px('fill', 12, 14, 9, 9),
        px('shade', 12, 19, 9, 3),
        px('detail', 14, 18, 5, 7),
        px('accent', 12, 16, 9, 1),
        px('edge', 5, 15, 7, 9),
        px('detail', 6, 16, 5, 7),
        px('accent', 7, 18, 3, 3),
        px('edge', 24, 8, 2, 15),
        px('accent', 25, 7, 1, 13),
        px('edge', 22, 20, 6, 2),
        px('shade', 12, 24, 4, 5),
        px('shade', 18, 24, 4, 5),
        px('edge', 10, 29, 6, 2),
        px('edge', 18, 29, 6, 2),
      ], [
        px('accent', 17, 20, 2, 2),
        px('accent', 25, 20, 2, 2),
        px('edge', 12, 25, 4, 3),
        px('fill', 14, 26, 5, 3),
        px('accent', 30, 12, 2, 18),
        px('edge', 27, 11, 7, 2),
      ]),
    },
  },
  'pc-rogue': {
    key: 'pc-rogue',
    kind: 'rogue',
    label: 'Rogue',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x111817, fill: 0x314c3b, detail: 0x6b4a2f, accent: 0xbfc7b8, shade: 0x1f2c28, skin: 0xc8875e },
    animation: DEFAULT_ACTOR_ANIMATION,
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['deep hood', 'leather vest', 'twin dagger knives'],
      blocks: spriteBlocks([
        px('edge', 12, 5, 8, 3),
        px('edge', 10, 8, 12, 4),
        px('fill', 12, 8, 8, 4),
        px('edge', 9, 12, 14, 5),
        px('fill', 11, 12, 10, 5),
        px('shade', 13, 12, 6, 3),
        px('skin', 14, 13, 4, 3),
        px('edge', 9, 17, 14, 8),
        px('fill', 11, 17, 10, 8),
        px('detail', 13, 18, 6, 7),
        px('accent', 5, 17, 6, 2),
        px('accent', 21, 17, 6, 2),
        px('edge', 4, 18, 4, 2),
        px('edge', 24, 18, 4, 2),
        px('shade', 12, 25, 4, 4),
        px('shade', 18, 25, 4, 4),
        px('edge', 10, 29, 6, 2),
        px('edge', 18, 29, 6, 2),
      ], [
        px('shade', 18, 17, 8, 3),
        px('skin', 20, 18, 5, 3),
        px('accent', 7, 25, 9, 2),
        px('accent', 32, 25, 9, 2),
        px('edge', 6, 24, 4, 4),
        px('edge', 38, 24, 4, 4),
      ]),
    },
  },
  'pc-wizard': {
    key: 'pc-wizard',
    kind: 'wizard',
    label: 'Wizard',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x11192d, fill: 0x3f66b2, detail: 0x6f4ca0, accent: 0xe1c35b, shade: 0x243a75, skin: 0xd99f73 },
    animation: DEFAULT_ACTOR_ANIMATION,
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['pointed hat', 'star staff', 'stepped robe'],
      blocks: spriteBlocks([
        px('edge', 15, 2, 4, 2),
        px('fill', 14, 4, 6, 3),
        px('edge', 13, 7, 8, 3),
        px('fill', 14, 7, 6, 3),
        px('accent', 16, 4, 2, 2),
        px('edge', 12, 10, 10, 3),
        px('skin', 14, 11, 6, 4),
        px('shade', 14, 13, 6, 2),
        px('edge', 10, 15, 14, 12),
        px('fill', 12, 15, 10, 12),
        px('detail', 13, 18, 8, 9),
        px('accent', 16, 17, 2, 9),
        px('shade', 10, 24, 14, 4),
        px('edge', 8, 28, 18, 2),
        px('edge', 25, 9, 2, 19),
        px('accent', 24, 6, 4, 4),
        px('accent', 23, 7, 6, 2),
        px('edge', 24, 5, 4, 1),
      ], [
        px('accent', 24, 7, 3, 3),
        px('skin', 20, 18, 8, 3),
        px('shade', 19, 21, 10, 2),
        px('accent', 24, 25, 3, 14),
        px('accent', 36, 8, 8, 2),
        px('edge', 39, 5, 3, 27),
      ]),
    },
  },
  'pc-cleric': {
    key: 'pc-cleric',
    kind: 'cleric',
    label: 'Cleric',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x27251f, fill: 0xc8c0a6, detail: 0x7e2c2a, accent: 0xd6b35c, shade: 0x756f64, skin: 0xd69a69 },
    animation: DEFAULT_ACTOR_ANIMATION,
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['square coif', 'sun symbol badge', 'pilgrim mace'],
      blocks: spriteBlocks([
        px('edge', 12, 5, 10, 4),
        px('fill', 13, 6, 8, 4),
        px('edge', 11, 9, 12, 5),
        px('skin', 14, 10, 6, 4),
        px('edge', 10, 14, 14, 12),
        px('fill', 12, 14, 10, 12),
        px('shade', 12, 21, 10, 5),
        px('detail', 14, 15, 5, 11),
        px('accent', 16, 16, 2, 6),
        px('accent', 14, 19, 6, 2),
        px('edge', 24, 14, 2, 13),
        px('accent', 23, 13, 4, 4),
        px('edge', 6, 18, 5, 7),
        px('fill', 7, 19, 4, 5),
        px('shade', 12, 26, 4, 3),
        px('shade', 18, 26, 4, 3),
        px('edge', 10, 29, 6, 2),
        px('edge', 18, 29, 6, 2),
      ], [
        px('accent', 23, 23, 3, 9),
        px('accent', 20, 26, 9, 3),
        px('skin', 20, 16, 8, 3),
        px('fill', 10, 29, 6, 8),
        px('accent', 35, 20, 6, 6),
        px('edge', 38, 15, 3, 23),
      ]),
    },
  },
  'pc-ally': {
    key: 'pc-ally',
    kind: 'ally',
    label: 'Ally',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x132018, fill: 0x557d42, detail: 0x8b6a3c, accent: 0xd3b35e, shade: 0x31482e, skin: 0xca8b62 },
    animation: DEFAULT_ACTOR_ANIMATION,
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['travel cloak', 'round cap', 'small lantern'],
      blocks: spriteBlocks([
        px('edge', 12, 6, 9, 3),
        px('fill', 13, 7, 7, 3),
        px('edge', 11, 9, 11, 5),
        px('skin', 14, 10, 5, 4),
        px('edge', 10, 14, 13, 12),
        px('fill', 12, 14, 9, 12),
        px('shade', 11, 20, 11, 6),
        px('detail', 14, 17, 5, 9),
        px('edge', 5, 18, 5, 8),
        px('accent', 6, 21, 3, 4),
        px('skin', 23, 17, 3, 5),
        px('edge', 25, 18, 3, 7),
        px('shade', 12, 26, 4, 3),
        px('shade', 18, 26, 4, 3),
        px('edge', 10, 29, 6, 2),
        px('edge', 18, 29, 6, 2),
      ], [
        px('accent', 11, 30, 5, 8),
        px('accent', 12, 28, 3, 3),
        px('skin', 20, 16, 7, 3),
        px('detail', 22, 25, 5, 12),
        px('fill', 16, 22, 4, 16),
        px('edge', 32, 25, 3, 13),
      ]),
    },
  },
  'mob-briar-goblin': {
    key: 'mob-briar-goblin',
    kind: 'goblin',
    label: 'Briar Goblin',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x20150e, fill: 0x7c8b3d, detail: 0x9a512e, accent: 0xd6aa55, shade: 0x405329, skin: 0x93a85a },
    animation: DEFAULT_ACTOR_ANIMATION,
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['pointed ears', 'briar spear', 'crouched stance'],
      blocks: spriteBlocks([
        px('edge', 8, 10, 6, 4),
        px('edge', 20, 10, 6, 4),
        px('skin', 9, 11, 5, 3),
        px('skin', 20, 11, 5, 3),
        px('edge', 12, 8, 10, 6),
        px('skin', 13, 9, 8, 5),
        px('shade', 14, 12, 2, 2),
        px('shade', 19, 12, 2, 2),
        px('edge', 10, 15, 14, 9),
        px('fill', 12, 15, 10, 9),
        px('detail', 13, 18, 8, 6),
        px('edge', 25, 7, 2, 18),
        px('detail', 24, 6, 4, 3),
        px('accent', 24, 5, 4, 1),
        px('edge', 7, 20, 5, 4),
        px('shade', 12, 24, 4, 4),
        px('shade', 19, 24, 4, 4),
        px('edge', 10, 28, 6, 2),
        px('edge', 18, 28, 6, 2),
      ], [
        px('shade', 21, 18, 2, 2),
        px('shade', 28, 18, 2, 2),
        px('skin', 10, 19, 7, 3),
        px('skin', 31, 19, 7, 3),
        px('accent', 37, 8, 2, 28),
        px('detail', 35, 7, 6, 5),
      ]),
    },
  },
  'mob-sap-wolf': {
    key: 'mob-sap-wolf',
    kind: 'wolf',
    label: 'Sap Wolf',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x1f130f, fill: 0x7a5543, detail: 0xa05f34, accent: 0xe5c16a, shade: 0x4b3129, skin: 0x8c6755 },
    animation: DEFAULT_ACTOR_ANIMATION,
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['low wolf body', 'sap-streak muzzle', 'raised tail'],
      blocks: spriteBlocks([
        px('edge', 5, 16, 6, 4),
        px('shade', 6, 17, 5, 3),
        px('edge', 9, 17, 14, 7),
        px('fill', 10, 18, 13, 6),
        px('detail', 13, 19, 9, 3),
        px('edge', 22, 14, 7, 7),
        px('fill', 23, 15, 5, 6),
        px('edge', 23, 11, 3, 5),
        px('edge', 27, 12, 3, 5),
        px('skin', 25, 19, 4, 2),
        px('accent', 26, 16, 1, 1),
        px('edge', 11, 23, 3, 7),
        px('edge', 19, 23, 3, 7),
        px('shade', 12, 24, 2, 5),
        px('shade', 20, 24, 2, 5),
        px('edge', 9, 29, 5, 2),
        px('edge', 18, 29, 5, 2),
      ], [
        px('accent', 40, 24, 2, 2),
        px('shade', 14, 28, 14, 3),
        px('detail', 18, 29, 14, 2),
        px('edge', 35, 17, 7, 7),
        px('fill', 36, 19, 5, 5),
        px('skin', 38, 29, 5, 2),
      ]),
    },
  },
  'mob-root-troll': {
    key: 'mob-root-troll',
    kind: 'troll',
    label: 'Root Troll',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x1d2114, fill: 0x6f7d46, detail: 0x80522e, accent: 0xb8b766, shade: 0x43502e, skin: 0x8a9562 },
    animation: DEFAULT_ACTOR_ANIMATION,
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['broad root body', 'branch horns', 'heavy fists'],
      blocks: spriteBlocks([
        px('detail', 10, 3, 3, 5),
        px('detail', 20, 3, 3, 5),
        px('edge', 11, 7, 12, 6),
        px('skin', 12, 8, 10, 5),
        px('shade', 13, 11, 3, 2),
        px('shade', 19, 11, 3, 2),
        px('edge', 8, 13, 18, 13),
        px('fill', 10, 13, 14, 13),
        px('shade', 10, 20, 14, 6),
        px('detail', 15, 14, 4, 12),
        px('accent', 12, 17, 3, 2),
        px('edge', 4, 15, 6, 10),
        px('fill', 5, 17, 5, 7),
        px('edge', 24, 15, 6, 10),
        px('fill', 24, 17, 5, 7),
        px('detail', 7, 25, 5, 4),
        px('detail', 21, 25, 5, 4),
        px('edge', 7, 29, 7, 2),
        px('edge', 20, 29, 7, 2),
      ], [
        px('detail', 15, 4, 4, 9),
        px('detail', 30, 4, 4, 9),
        px('shade', 20, 19, 4, 3),
        px('shade', 28, 19, 4, 3),
        px('accent', 17, 26, 5, 4),
        px('accent', 27, 26, 5, 4),
      ]),
    },
  },
  'mob-vampire-lord': {
    key: 'mob-vampire-lord',
    kind: 'vampire',
    label: 'Vampire Lord',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x120d14, fill: 0x7e2430, detail: 0x2d203b, accent: 0xccb67d, shade: 0x251626, skin: 0xd8d0bd },
    animation: DEFAULT_ACTOR_ANIMATION,
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['high collar', 'dark cape', 'pale noble face'],
      blocks: spriteBlocks([
        px('edge', 11, 6, 12, 4),
        px('fill', 12, 7, 10, 5),
        px('skin', 14, 8, 6, 6),
        px('shade', 14, 12, 6, 2),
        px('edge', 7, 13, 20, 14),
        px('fill', 8, 14, 18, 13),
        px('shade', 10, 15, 14, 12),
        px('detail', 13, 15, 8, 12),
        px('accent', 15, 15, 4, 2),
        px('fill', 6, 18, 4, 9),
        px('fill', 24, 18, 4, 9),
        px('edge', 5, 25, 23, 3),
        px('detail', 12, 27, 4, 2),
        px('detail', 18, 27, 4, 2),
        px('edge', 10, 29, 6, 2),
        px('edge', 18, 29, 6, 2),
        px('accent', 15, 10, 1, 1),
        px('accent', 19, 10, 1, 1),
      ], [
        px('edge', 15, 8, 18, 3),
        px('detail', 11, 22, 6, 18),
        px('detail', 31, 22, 6, 18),
        px('accent', 22, 17, 2, 2),
        px('accent', 29, 17, 2, 2),
        px('shade', 18, 25, 14, 10),
      ]),
    },
  },
  'mob-generic': {
    key: 'mob-generic',
    kind: 'generic',
    label: 'Monster',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x1d140f, fill: 0x795b3c, detail: 0x45623c, accent: 0xc7a55b, shade: 0x47311f, skin: 0x9b744d },
    animation: DEFAULT_ACTOR_ANIMATION,
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['lumpy brute', 'single eye glint', 'claw hands'],
      blocks: spriteBlocks([
        px('edge', 12, 7, 9, 5),
        px('fill', 13, 8, 7, 5),
        px('accent', 16, 10, 2, 2),
        px('edge', 9, 12, 15, 14),
        px('fill', 11, 13, 11, 13),
        px('shade', 12, 20, 10, 6),
        px('detail', 14, 15, 6, 11),
        px('edge', 5, 15, 5, 10),
        px('skin', 5, 22, 4, 3),
        px('edge', 24, 15, 5, 10),
        px('skin', 25, 22, 4, 3),
        px('detail', 10, 26, 5, 3),
        px('detail', 19, 26, 5, 3),
        px('edge', 9, 29, 7, 2),
        px('edge', 18, 29, 7, 2),
        px('accent', 12, 6, 2, 2),
        px('accent', 20, 6, 2, 2),
      ], [
        px('accent', 18, 10, 3, 3),
        px('accent', 30, 10, 3, 3),
        px('skin', 19, 14, 10, 3),
        px('shade', 19, 28, 12, 6),
        px('skin', 7, 31, 6, 4),
        px('skin', 36, 31, 6, 4),
      ]),
    },
  },
};

export function characterSpriteKey(classId: string | null | undefined, hero: boolean): ActorSpriteKey {
  if (!hero) {
    return 'pc-ally';
  }

  switch (classId) {
    case 'rogue':
      return 'pc-rogue';
    case 'wizard':
      return 'pc-wizard';
    case 'cleric':
      return 'pc-cleric';
    case 'fighter':
    default:
      return 'pc-fighter';
  }
}

export function monsterSpriteKey(label: string | null | undefined): ActorSpriteKey {
  const normalized = label?.toLowerCase() ?? '';

  if (normalized.includes('goblin')) {
    return 'mob-briar-goblin';
  }

  if (normalized.includes('wolf')) {
    return 'mob-sap-wolf';
  }

  if (normalized.includes('troll')) {
    return 'mob-root-troll';
  }

  if (normalized.includes('vampire')) {
    return 'mob-vampire-lord';
  }

  return 'mob-generic';
}
