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
  });
});
