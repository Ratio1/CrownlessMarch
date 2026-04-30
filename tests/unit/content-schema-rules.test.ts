/**
 * @jest-environment node
 */
import { itemSchema, monsterSchema } from '../../src/shared/content/schema';

describe('content schema D20 rules', () => {
  it('caps item enhancement at +5', () => {
    expect(() =>
      itemSchema.parse({
        id: 'too-bright-sword',
        slot: 'weapon',
        label: 'Too Bright Sword',
        bonus: 6,
        effect: '+6 attack, +6 damage',
      })
    ).toThrow();
  });

  it('allows enhancement gates only on boss monsters and caps them at +3', () => {
    expect(() =>
      monsterSchema.parse({
        id: 'warded-goblin',
        label: 'Warded Goblin',
        level: 1,
        defenses: { ac: 14, fortitude: 12, reflex: 13, will: 11 },
        hitPoints: 12,
        attackBonus: 2,
        damage: { dice: '1d4', bonus: 0 },
        behavior: 'skirmisher',
        alignment: 'CE',
        minimumEnhancementToHit: 1,
      })
    ).toThrow();

    expect(() =>
      monsterSchema.parse({
        id: 'over-warded-lich',
        label: 'Over-Warded Lich',
        level: 12,
        defenses: { ac: 28, fortitude: 22, reflex: 24, will: 30 },
        hitPoints: 140,
        attackBonus: 22,
        damage: { dice: '3d6', bonus: 8 },
        behavior: 'boss',
        alignment: 'LE',
        minimumEnhancementToHit: 4,
      })
    ).toThrow();
  });
});
