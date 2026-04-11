import { loadContentBundle } from '@/server/content/load-content';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

async function createTempBundle(overrides?: {
  classes?: unknown;
  region?: unknown;
}) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'thornwrithe-content-'));
  await mkdir(path.join(rootDir, 'content/regions'), { recursive: true });

  const classes = overrides?.classes ?? [
    {
      id: 'fighter',
      label: 'Fighter',
      primaryAttributes: ['strength', 'constitution'],
      passive: 'Passive',
      encounterAbility: 'Encounter',
      utilityAbility: 'Utility'
    }
  ];

  const items = [{ id: 'rusted-sword', slot: 'weapon', label: 'Rusted Sword', bonus: 0, effect: '+0 attack, 1d8 damage' }];

  const monsters = [
    {
      id: 'briar-goblin',
      label: 'Briar Goblin',
      level: 1,
      defenses: { ac: 14, fortitude: 12, reflex: 13, will: 11 },
      hitPoints: 18,
      attackBonus: 4,
      damage: { dice: '1d6', bonus: 2 },
      behavior: 'skirmisher'
    }
  ];

  const quests = [{ id: 'survey-the-briar-edge', label: 'Survey', type: 'scout', objective: 'Scout', rewardXp: 120 }];

  const region = overrides?.region ?? {
    id: 'briar-march',
    width: 11,
    height: 11,
    spawn: { x: 5, y: 5 },
    tiles: [{ x: 5, y: 5, kind: 'town', blocked: false }]
  };

  await writeFile(path.join(rootDir, 'content/classes.json'), JSON.stringify(classes), 'utf8');
  await writeFile(path.join(rootDir, 'content/items.json'), JSON.stringify(items), 'utf8');
  await writeFile(path.join(rootDir, 'content/monsters.json'), JSON.stringify(monsters), 'utf8');
  await writeFile(path.join(rootDir, 'content/quests.json'), JSON.stringify(quests), 'utf8');
  await writeFile(path.join(rootDir, 'content/regions/briar-march.json'), JSON.stringify(region), 'utf8');

  return rootDir;
}

describe('content loader', () => {
  it('loads the starter content bundle', async () => {
    const bundle = await loadContentBundle(process.cwd());
    expect(bundle.classes).toHaveLength(4);
    expect(bundle.monsters.find((monster) => monster.id === 'briar-goblin')).toBeTruthy();
    expect(bundle.region.id).toBe('briar-march');
  });

  it('rejects class content with malformed primary attributes', async () => {
    const rootDir = await createTempBundle({
      classes: [
        {
          id: 'fighter',
          label: 'Fighter',
          primaryAttributes: ['luck'],
          passive: 'Passive',
          encounterAbility: 'Encounter',
          utilityAbility: 'Utility'
        }
      ]
    });

    await expect(loadContentBundle(rootDir)).rejects.toThrow();
    await rm(rootDir, { recursive: true, force: true });
  });

  it('rejects region content with non-integer coordinates', async () => {
    const rootDir = await createTempBundle({
      region: {
        id: 'briar-march',
        width: 11.5,
        height: 11,
        spawn: { x: 5.25, y: 5 },
        tiles: [{ x: 5, y: 5.75, kind: 'town', blocked: false }]
      }
    });

    await expect(loadContentBundle(rootDir)).rejects.toThrow();
    await rm(rootDir, { recursive: true, force: true });
  });
});
