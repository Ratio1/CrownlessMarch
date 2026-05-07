import {
  ACTOR_SPRITES,
  ACTOR_SPRITE_POSES,
  actorSpriteAnimationKey,
  actorSpriteTextureKey,
  characterSpriteKey,
  monsterSpriteKey,
} from '../../src/client/phaser/sprite-catalog';

describe('Phaser actor sprite catalog', () => {
  it('defines small bottom-anchored pixel-art sprite assets for player classes and starter mobs', () => {
    expect(Object.keys(ACTOR_SPRITES)).toEqual(
      expect.arrayContaining([
        'pc-fighter',
        'pc-rogue',
        'pc-wizard',
        'pc-cleric',
        'pc-ally',
        'mob-briar-goblin',
        'mob-sap-wolf',
        'mob-root-troll',
        'mob-vampire-lord',
        'mob-generic',
      ])
    );

    for (const spec of Object.values(ACTOR_SPRITES)) {
      expect(spec.frame.width).toBe(48);
      expect(spec.frame.height).toBe(spec.frame.width);
      expect(spec.anchor).toEqual({ x: 0.5, y: 1 });
      expect(Object.keys(spec.palette).length).toBeLessThanOrEqual(6);
      expect(spec.pixelArt.style).toBe('old-school-fantasy-rpg');
      expect(spec.pixelArt.hints.length).toBeGreaterThanOrEqual(2);
      expect(spec.pixelArt.blocks.length).toBeGreaterThanOrEqual(spec.key.startsWith('pc-') ? 28 : 24);
      expect(spec.animation.poses).toEqual(ACTOR_SPRITE_POSES);
      expect(spec.animation.fps).toBeGreaterThanOrEqual(3);
      expect(spec.animation.fps).toBeLessThanOrEqual(8);

      const usedPaletteSlots = new Set(spec.pixelArt.blocks.map((block) => block.color));
      expect(usedPaletteSlots.size).toBeGreaterThanOrEqual(5);

      for (const block of spec.pixelArt.blocks) {
        expect(Object.prototype.hasOwnProperty.call(spec.palette, block.color)).toBe(true);
        expect(Number.isInteger(block.x)).toBe(true);
        expect(Number.isInteger(block.y)).toBe(true);
        expect(Number.isInteger(block.width)).toBe(true);
        expect(Number.isInteger(block.height)).toBe(true);
        expect(block.width).toBeGreaterThan(0);
        expect(block.height).toBeGreaterThan(0);
        expect(block.x).toBeGreaterThanOrEqual(0);
        expect(block.y).toBeGreaterThanOrEqual(0);
        expect(block.x + block.width).toBeLessThanOrEqual(spec.frame.width);
        expect(block.y + block.height).toBeLessThanOrEqual(spec.frame.height);
        expect(block.width * block.height).toBeLessThanOrEqual(96);
      }
    }
  });

  it('keeps each player class visually distinguishable through old-school equipment silhouettes', () => {
    expect(ACTOR_SPRITES['pc-fighter'].pixelArt.hints.join(' ')).toMatch(/shield/i);
    expect(ACTOR_SPRITES['pc-fighter'].pixelArt.hints.join(' ')).toMatch(/sword/i);
    expect(ACTOR_SPRITES['pc-rogue'].pixelArt.hints.join(' ')).toMatch(/hood/i);
    expect(ACTOR_SPRITES['pc-rogue'].pixelArt.hints.join(' ')).toMatch(/knife|dagger/i);
    expect(ACTOR_SPRITES['pc-wizard'].pixelArt.hints.join(' ')).toMatch(/hat/i);
    expect(ACTOR_SPRITES['pc-wizard'].pixelArt.hints.join(' ')).toMatch(/staff/i);
    expect(ACTOR_SPRITES['pc-cleric'].pixelArt.hints.join(' ')).toMatch(/badge|symbol/i);
    expect(ACTOR_SPRITES['pc-cleric'].pixelArt.hints.join(' ')).toMatch(/mace/i);
  });

  it('resolves class and monster labels to stable sprite keys', () => {
    expect(characterSpriteKey('fighter', true)).toBe('pc-fighter');
    expect(characterSpriteKey('wizard', true)).toBe('pc-wizard');
    expect(characterSpriteKey('fighter', false)).toBe('pc-ally');
    expect(characterSpriteKey('unknown-class', true)).toBe('pc-fighter');
    expect(monsterSpriteKey('Briar Goblin')).toBe('mob-briar-goblin');
    expect(monsterSpriteKey('Sap Wolf')).toBe('mob-sap-wolf');
    expect(monsterSpriteKey('Root Troll')).toBe('mob-root-troll');
    expect(monsterSpriteKey('Vampire Lord')).toBe('mob-vampire-lord');
    expect(monsterSpriteKey('Unlisted Horror')).toBe('mob-generic');
  });

  it('names generated pose textures and looping animation keys without reusing the static texture', () => {
    expect(ACTOR_SPRITE_POSES).toEqual(['idle', 'step-left', 'step-right', 'strike']);
    expect(actorSpriteTextureKey('pc-fighter', 'idle')).toBe('pc-fighter:idle');
    expect(actorSpriteTextureKey('pc-fighter', 'strike')).toBe('pc-fighter:strike');
    expect(actorSpriteAnimationKey('pc-fighter', 'idle')).toBe('pc-fighter:anim:idle');
    expect(actorSpriteAnimationKey('mob-briar-goblin', 'combat')).toBe('mob-briar-goblin:anim:combat');
  });
});
