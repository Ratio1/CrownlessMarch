/**
 * @jest-environment node
 */
import { loadContentBundle } from '../../src/server/content/load-content';
import { buildInitialCharacterSnapshot } from '../../src/shared/domain/progression';
import { ShardRuntime } from '../../src/server/runtime/shard-runtime';

function makeRandom(sequence: number[]) {
  let index = 0;
  return () => {
    const value = sequence[index];
    index += 1;
    return value ?? 0;
  };
}

describe('shard runtime', () => {
  it('builds a visible world snapshot with hostile markers around the spawn point', async () => {
    const content = await loadContentBundle(process.cwd());
    const runtime = new ShardRuntime({ content });

    const update = runtime.addPlayer({
      cid: 'cid-world-1',
      ...buildInitialCharacterSnapshot({
        name: 'Aelis',
        classId: 'fighter',
        attributes: {
          strength: 15,
          dexterity: 13,
          constitution: 12,
          intelligence: 10,
          wisdom: 10,
          charisma: 8,
        },
      }),
    });

    expect(update.snapshot.regionId).toBe('briar-march');
    expect(update.snapshot.position).toEqual({ x: 5, y: 5 });
    expect(update.snapshot.visibleTiles.some((tile) => tile.kind === 'roots')).toBe(true);
    expect(Object.values(update.snapshot.monsters).some((monster) => monster.label === 'Briar Goblin')).toBe(true);
  });

  it('turns in a ready survey quest at town and activates the goblin cull', async () => {
    const content = await loadContentBundle(process.cwd());
    const runtime = new ShardRuntime({ content });

    const update = runtime.addPlayer({
      cid: 'cid-town-1',
      position: { x: 5, y: 5 },
      ...buildInitialCharacterSnapshot({
        name: 'Aelis',
        classId: 'fighter',
        attributes: {
          strength: 15,
          dexterity: 13,
          constitution: 12,
          intelligence: 10,
          wisdom: 10,
          charisma: 8,
        },
        currency: 7,
        activeQuestIds: ['survey-the-briar-edge'],
      }),
      quest_progress: {
        'survey-the-briar-edge': {
          status: 'ready_to_turn_in',
        },
      },
    });

    expect(update.progressionToPersist).toMatchObject({
      xp: 120,
      gold: 12,
      activeQuestIds: ['burn-the-first-nest'],
      quest_progress: {
        'survey-the-briar-edge': {
          status: 'turned_in',
        },
        'burn-the-first-nest': {
          status: 'active',
          target: 2,
        },
      },
    });
    expect(update.snapshot.character.quests).toEqual([
      expect.objectContaining({
        id: 'burn-the-first-nest',
        status: 'active',
        progress: '0/2 Briar Goblins defeated.',
      }),
    ]);
    expect(update.snapshot.activityLog.some((entry) => entry.text.includes('Survey the Briar Edge is turned in.'))).toBe(
      true
    );
  });

  it('grants the ruined watchpost cache before the ruin encounter resolves', async () => {
    const content = await loadContentBundle(process.cwd());
    const runtime = new ShardRuntime({ content });

    runtime.addPlayer({
      cid: 'cid-ruin-1',
      position: { x: 4, y: 6 },
      ...buildInitialCharacterSnapshot({
        name: 'Ashfall',
        classId: 'fighter',
        attributes: {
          strength: 15,
          dexterity: 13,
          constitution: 12,
          intelligence: 10,
          wisdom: 10,
          charisma: 8,
        },
        currency: 7,
      }),
    });

    const update = runtime.movePlayer('cid-ruin-1', 'west');

    expect(update.snapshot.position).toEqual({ x: 3, y: 6 });
    expect(update.snapshot.currentTile.kind).toBe('ruin');
    expect(update.snapshot.encounter?.status).toBe('active');
    expect(update.snapshot.character.gold).toBe(11);
    expect(update.snapshot.character.inventory.map((entry) => entry.id)).toContain('field-rations');
    expect(update.progressionToPersist).toMatchObject({
      gold: 11,
      unlocks: expect.arrayContaining(['location:watchpost-cache']),
    });
    expect(
      update.snapshot.activityLog.some((entry) => entry.text.includes('The ruined watchpost yields stale rations and 4 gold'))
    ).toBe(true);
  });

  it('starts combat on hostile movement and produces a durable progression write once the fight resolves', async () => {
    const content = await loadContentBundle(process.cwd());
    let now = Date.parse('2026-04-22T06:00:00.000Z');
    const runtime = new ShardRuntime({
      content,
      now: () => now,
      random: makeRandom([
        0.9,
        0.1,
        0.95,
        0.9,
        0.0,
        0.95,
        0.8,
      ]),
    });

    runtime.addPlayer({
      cid: 'cid-combat-1',
      ...buildInitialCharacterSnapshot({
        name: 'Mossblade',
        classId: 'fighter',
        attributes: {
          strength: 15,
          dexterity: 13,
          constitution: 12,
          intelligence: 10,
          wisdom: 10,
          charisma: 8,
        },
        activeQuestIds: ['burn-the-first-nest'],
      }),
      quest_progress: {
        'burn-the-first-nest': {
          status: 'active',
          goblinsDefeated: 0,
          target: 2,
        },
      },
    });

    const encounterStart = runtime.movePlayer('cid-combat-1', 'east');
    expect(encounterStart.snapshot.encounter?.status).toBe('active');
    expect(encounterStart.snapshot.movementLocked).toBe(true);

    now += 4_100;
    const resolved = runtime.tickPlayer('cid-combat-1');

    expect(resolved.snapshot.encounter?.status).toBe('won');
    expect(resolved.progressionToPersist).toMatchObject({
      xp: expect.any(Number),
      gold: expect.any(Number),
      quest_progress: {
        'burn-the-first-nest': {
          goblinsDefeated: 1,
          status: 'active',
        },
      },
    });
    expect(resolved.snapshot.encounter?.logs.some((entry) => entry.text.includes('vs AC'))).toBe(true);
    expect(resolved.snapshot.character.quests).toEqual([
      expect.objectContaining({
        id: 'burn-the-first-nest',
        progress: '1/2 Briar Goblins defeated.',
      }),
    ]);
  });
});
