import { loadContentBundle } from '@/server/content/load-content';

describe('content loader', () => {
  it('loads the starter content bundle', async () => {
    const bundle = await loadContentBundle(process.cwd());
    expect(bundle.classes).toHaveLength(4);
    expect(bundle.monsters.find((monster) => monster.id === 'briar-goblin')).toBeTruthy();
    expect(bundle.region.id).toBe('briar-march');
  });
});
