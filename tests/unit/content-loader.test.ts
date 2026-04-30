/**
 * @jest-environment node
 */
import { loadContentBundle } from '../../src/server/content/load-content';

describe('content loader', () => {
  it('loads the Thornwrithe starter bundle from repo-owned content packs', async () => {
    const bundle = await loadContentBundle(process.cwd());

    expect(bundle.region.id).toBe('briar-march');
    expect(bundle.classes.map((entry) => entry.id)).toEqual(['fighter', 'rogue', 'wizard', 'cleric']);
    expect(bundle.monsters.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(['briar-goblin', 'sap-wolf', 'root-troll'])
    );
    expect(bundle.quests.map((entry) => entry.id)).toContain('survey-the-briar-edge');
    expect(bundle.rules.progression.maxLevel).toBe(15);
    expect(bundle.rules.progression.xpLevelTable).toEqual([
      0,
      1000,
      2250,
      3750,
      5500,
      7500,
      10000,
      13000,
      16500,
      20500,
      26000,
      32000,
      39000,
      47000,
      57000,
    ]);
    expect(bundle.rules.classes.find((entry) => entry.id === 'fighter')?.attackProgression).toEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
    ]);
    expect(bundle.rules.classes.find((entry) => entry.id === 'rogue')?.attackProgression).toEqual([
      1,
      1,
      2,
      3,
      4,
      4,
      5,
      6,
      6,
      7,
      8,
      8,
      9,
      10,
      11,
    ]);
    expect(bundle.rules.weapons.find((entry) => entry.weaponType === 'scimitar')).toMatchObject({
      damage: '1d6',
      criticalRangeMin: 18,
      criticalMultiplier: 2,
    });
    expect(bundle.rules.combat).toMatchObject({
      maxWeaponEnhancement: 5,
      maxBossMinimumEnhancementToHit: 3,
      holyDamageMultiplier: 2,
      criticalConfirmation: false,
    });
    expect(bundle.items.map((entry) => entry.id)).toContain('health-potion');
    expect(bundle.items.map((entry) => entry.weaponType)).toEqual(
      expect.arrayContaining(['bastard-sword', 'katana', 'greatsword', 'warhammer', 'scimitar'])
    );
    expect(bundle.items.every((entry) => entry.bonus <= 5)).toBe(true);
    expect(bundle.items.find((entry) => entry.id === 'holy-avenger')).toMatchObject({
      bonus: 5,
      weaponType: 'greatsword',
      damage: '2d6',
      criticalRangeMin: 19,
      criticalMultiplier: 2,
      modifiers: ['holy'],
    });
    expect(bundle.monsters.find((entry) => entry.id === 'vampire-lord')).toMatchObject({
      behavior: 'boss',
      alignment: 'LE',
      minimumEnhancementToHit: 3,
      hitPoints: 100,
      attackBonus: 20,
      damage: { dice: '3d6' },
    });
  });
});
