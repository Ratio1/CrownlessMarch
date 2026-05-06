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
    width: 64;
    height: 64;
  };
  anchor: {
    x: 0.5;
    y: 1;
  };
  palette: {
    fill: number;
    edge: number;
    detail: number;
    accent: number;
  };
}

const BASE_FRAME = { width: 64, height: 64 } as const;
const BOTTOM_CENTER_ANCHOR = { x: 0.5, y: 1 } as const;

export const ACTOR_SPRITES: Record<ActorSpriteKey, ActorSpriteSpec> = {
  'pc-fighter': {
    key: 'pc-fighter',
    kind: 'fighter',
    label: 'Fighter',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { fill: 0xf7d889, edge: 0x31210f, detail: 0xc99943, accent: 0xf2efe2 },
  },
  'pc-rogue': {
    key: 'pc-rogue',
    kind: 'rogue',
    label: 'Rogue',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { fill: 0xa6b7a7, edge: 0x14211c, detail: 0x5f7c69, accent: 0xe5d7a5 },
  },
  'pc-wizard': {
    key: 'pc-wizard',
    kind: 'wizard',
    label: 'Wizard',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { fill: 0xa8c7ff, edge: 0x16263f, detail: 0x6d8ed8, accent: 0xf7d889 },
  },
  'pc-cleric': {
    key: 'pc-cleric',
    kind: 'cleric',
    label: 'Cleric',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { fill: 0xd7c2ff, edge: 0x2a1d3f, detail: 0x9f86d8, accent: 0xffe1a0 },
  },
  'pc-ally': {
    key: 'pc-ally',
    kind: 'ally',
    label: 'Ally',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { fill: 0x8dbb88, edge: 0x102215, detail: 0x4e7e52, accent: 0xf3ead5 },
  },
  'mob-briar-goblin': {
    key: 'mob-briar-goblin',
    kind: 'goblin',
    label: 'Briar Goblin',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { fill: 0xc96d46, edge: 0x32150d, detail: 0x7b2c19, accent: 0xf5c58f },
  },
  'mob-sap-wolf': {
    key: 'mob-sap-wolf',
    kind: 'wolf',
    label: 'Sap Wolf',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { fill: 0x8a584e, edge: 0x24110d, detail: 0x5d302a, accent: 0xf0d2b0 },
  },
  'mob-root-troll': {
    key: 'mob-root-troll',
    kind: 'troll',
    label: 'Root Troll',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { fill: 0x6e7b4b, edge: 0x1f2615, detail: 0x9a5d31, accent: 0xd8c98a },
  },
  'mob-vampire-lord': {
    key: 'mob-vampire-lord',
    kind: 'vampire',
    label: 'Vampire Lord',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { fill: 0x51334f, edge: 0x160d19, detail: 0xa43e4a, accent: 0xf0e5da },
  },
  'mob-generic': {
    key: 'mob-generic',
    kind: 'generic',
    label: 'Monster',
    frame: BASE_FRAME,
    anchor: BOTTOM_CENTER_ANCHOR,
    palette: { fill: 0x9a6a48, edge: 0x24140e, detail: 0x5d3524, accent: 0xf0d2b0 },
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
