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
}

export type ActorSpriteFrameSize = 32 | 48;

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

const BASE_FRAME = { width: 32, height: 32 } as const;
const BOTTOM_CENTER_ANCHOR = { x: 0.5, y: 1 } as const;
const PIXEL_STYLE = 'old-school-fantasy-rpg' as const;

const px = (
  color: ActorSpritePaletteSlot,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha?: number,
): ActorSpritePixelBlock => (alpha === undefined ? { color, x, y, width, height } : { color, x, y, width, height, alpha });

export const ACTOR_SPRITES: Record<ActorSpriteKey, ActorSpriteSpec> = {
  'pc-fighter': {
    key: 'pc-fighter',
    kind: 'fighter',
    label: 'Fighter',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x1c1714, fill: 0xb9b5a7, detail: 0x8a2f24, accent: 0xd9b45f, shade: 0x5a5f61, skin: 0xd79a62 },
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['mail shirt', 'heater shield', 'short sword'],
      blocks: [
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
      ],
    },
  },
  'pc-rogue': {
    key: 'pc-rogue',
    kind: 'rogue',
    label: 'Rogue',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x111817, fill: 0x314c3b, detail: 0x6b4a2f, accent: 0xbfc7b8, shade: 0x1f2c28, skin: 0xc8875e },
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['deep hood', 'leather vest', 'twin knives'],
      blocks: [
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
      ],
    },
  },
  'pc-wizard': {
    key: 'pc-wizard',
    kind: 'wizard',
    label: 'Wizard',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x11192d, fill: 0x3f66b2, detail: 0x6f4ca0, accent: 0xe1c35b, shade: 0x243a75, skin: 0xd99f73 },
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['pointed hat', 'star staff', 'stepped robe'],
      blocks: [
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
      ],
    },
  },
  'pc-cleric': {
    key: 'pc-cleric',
    kind: 'cleric',
    label: 'Cleric',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x27251f, fill: 0xc8c0a6, detail: 0x7e2c2a, accent: 0xd6b35c, shade: 0x756f64, skin: 0xd69a69 },
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['square coif', 'sun badge', 'pilgrim mace'],
      blocks: [
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
      ],
    },
  },
  'pc-ally': {
    key: 'pc-ally',
    kind: 'ally',
    label: 'Ally',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x132018, fill: 0x557d42, detail: 0x8b6a3c, accent: 0xd3b35e, shade: 0x31482e, skin: 0xca8b62 },
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['travel cloak', 'round cap', 'small lantern'],
      blocks: [
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
      ],
    },
  },
  'mob-briar-goblin': {
    key: 'mob-briar-goblin',
    kind: 'goblin',
    label: 'Briar Goblin',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x20150e, fill: 0x7c8b3d, detail: 0x9a512e, accent: 0xd6aa55, shade: 0x405329, skin: 0x93a85a },
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['pointed ears', 'briar spear', 'crouched stance'],
      blocks: [
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
      ],
    },
  },
  'mob-sap-wolf': {
    key: 'mob-sap-wolf',
    kind: 'wolf',
    label: 'Sap Wolf',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x1f130f, fill: 0x7a5543, detail: 0xa05f34, accent: 0xe5c16a, shade: 0x4b3129, skin: 0x8c6755 },
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['low wolf body', 'sap-streak muzzle', 'raised tail'],
      blocks: [
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
      ],
    },
  },
  'mob-root-troll': {
    key: 'mob-root-troll',
    kind: 'troll',
    label: 'Root Troll',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x1d2114, fill: 0x6f7d46, detail: 0x80522e, accent: 0xb8b766, shade: 0x43502e, skin: 0x8a9562 },
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['broad root body', 'branch horns', 'heavy fists'],
      blocks: [
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
      ],
    },
  },
  'mob-vampire-lord': {
    key: 'mob-vampire-lord',
    kind: 'vampire',
    label: 'Vampire Lord',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x120d14, fill: 0x7e2430, detail: 0x2d203b, accent: 0xccb67d, shade: 0x251626, skin: 0xd8d0bd },
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['high collar', 'dark cape', 'pale noble face'],
      blocks: [
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
      ],
    },
  },
  'mob-generic': {
    key: 'mob-generic',
    kind: 'generic',
    label: 'Monster',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { edge: 0x1d140f, fill: 0x795b3c, detail: 0x45623c, accent: 0xc7a55b, shade: 0x47311f, skin: 0x9b744d },
    pixelArt: {
      style: PIXEL_STYLE,
      hints: ['lumpy brute', 'single eye glint', 'claw hands'],
      blocks: [
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
      ],
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
