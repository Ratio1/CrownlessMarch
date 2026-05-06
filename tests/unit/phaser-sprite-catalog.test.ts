import {
  ACTOR_SPRITES,
  characterSpriteKey,
  monsterSpriteKey,
} from '../../src/client/phaser/sprite-catalog';

describe('Phaser actor sprite catalog', () => {
  it('defines bottom-anchored sprite assets for player classes and starter mobs', () => {
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
      ])
    );

    for (const spec of Object.values(ACTOR_SPRITES)) {
      expect(spec.frame).toEqual({ width: 64, height: 64 });
      expect(spec.anchor).toEqual({ x: 0.5, y: 1 });
    }
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
});
