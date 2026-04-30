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
