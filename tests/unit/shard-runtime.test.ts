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

  it('turns in the goblin cull at town and activates the shrine-road hunt', async () => {
    const content = await loadContentBundle(process.cwd());
    const runtime = new ShardRuntime({ content });

    const update = runtime.addPlayer({
      cid: 'cid-town-2',
      position: { x: 5, y: 5 },
      ...buildInitialCharacterSnapshot({
        name: 'Cael',
        classId: 'fighter',
        attributes: {
          strength: 15,
          dexterity: 13,
          constitution: 12,
          intelligence: 10,
          wisdom: 10,
          charisma: 8,
        },
        currency: 12,
        activeQuestIds: ['burn-the-first-nest'],
      }),
      quest_progress: {
        'burn-the-first-nest': {
          status: 'ready_to_turn_in',
          goblinsDefeated: 2,
          target: 2,
        },
      },
    });

    expect(update.progressionToPersist).toMatchObject({
      xp: 180,
      gold: 20,
      activeQuestIds: ['secure-the-shrine-road'],
      quest_progress: {
        'burn-the-first-nest': {
          status: 'turned_in',
        },
        'secure-the-shrine-road': {
          status: 'active',
          shrineVisited: false,
          wolfDefeated: false,
          target: 1,
        },
      },
    });
    expect(update.snapshot.character.quests).toEqual([
      expect.objectContaining({
        id: 'secure-the-shrine-road',
        status: 'active',
        progress: 'Revisit the Ember Shrine, then cull the Sap Wolf in the grove.',
      }),
    ]);
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

  it('advances the shrine-road hunt after a shrine revisit and a sap wolf kill', async () => {
    const content = await loadContentBundle(process.cwd());
    let now = Date.parse('2026-04-22T07:00:00.000Z');
    const runtime = new ShardRuntime({
      content,
      now: () => now,
      random: makeRandom([
        0.99,
        0.0,
        0.86,
        0.99,
        0.0,
        0.86,
        0.79,
      ]),
    });

    runtime.addPlayer({
      cid: 'cid-secure-1',
      position: { x: 6, y: 6 },
      ...buildInitialCharacterSnapshot({
        name: 'Ilex',
        classId: 'fighter',
        attributes: {
          strength: 18,
          dexterity: 14,
          constitution: 13,
          intelligence: 10,
          wisdom: 10,
          charisma: 8,
        },
        activeQuestIds: ['secure-the-shrine-road'],
        unlocks: ['location:ember-shrine'],
      }),
      quest_progress: {
        'secure-the-shrine-road': {
          status: 'active',
          shrineVisited: false,
          wolfDefeated: false,
          target: 1,
        },
      },
    });

    const shrineUpdate = runtime.movePlayer('cid-secure-1', 'east');
    expect(shrineUpdate.snapshot.currentTile.kind).toBe('shrine');
    expect(shrineUpdate.snapshot.character.quests).toEqual([
      expect.objectContaining({
        id: 'secure-the-shrine-road',
        progress: '0/1 Sap Wolves defeated on the shrine road.',
      }),
    ]);

    const encounterStart = runtime.movePlayer('cid-secure-1', 'north');
    expect(encounterStart.snapshot.encounter?.monsterName).toBe('Sap Wolf');
    runtime.queueOverride('cid-secure-1', 'encounter power');

    now += 4_100;
    const resolved = runtime.tickPlayer('cid-secure-1');

    expect(resolved.snapshot.encounter?.status).toBe('won');
    expect(resolved.progressionToPersist).toMatchObject({
      quest_progress: {
        'secure-the-shrine-road': {
          status: 'ready_to_turn_in',
          shrineVisited: true,
          wolfDefeated: true,
        },
      },
    });
    expect(resolved.snapshot.character.quests).toEqual([
      expect.objectContaining({
        id: 'secure-the-shrine-road',
        status: 'ready_to_turn_in',
        progress: 'Return to town with word that the shrine road is safe.',
      }),
    ]);
  });

  it('routes a defeat back to town, restores HP, and deducts supply costs', async () => {
    const content = await loadContentBundle(process.cwd());
    let now = Date.parse('2026-04-22T08:00:00.000Z');
    const runtime = new ShardRuntime({
      content,
      now: () => now,
      random: makeRandom([
        0.0,
        0.99,
        0.99,
        0.99,
      ]),
    });

    const snapshot = buildInitialCharacterSnapshot({
      name: 'Brindle',
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
    });

    runtime.addPlayer({
      cid: 'cid-loss-1',
      position: { x: 6, y: 4 },
      ...snapshot,
      hitPoints: {
        ...snapshot.hitPoints,
        current: 4,
      },
    });

    runtime.movePlayer('cid-loss-1', 'south');
    now += 4_100;
    const resolved = runtime.tickPlayer('cid-loss-1');

    expect(resolved.snapshot.encounter?.status).toBe('lost');
    expect(resolved.snapshot.position).toEqual({ x: 5, y: 5 });
    expect(resolved.snapshot.currentTile.kind).toBe('town');
    expect(resolved.snapshot.character.hitPoints.current).toBe(resolved.snapshot.character.hitPoints.max);
    expect(resolved.progressionToPersist).toMatchObject({
      gold: 4,
      hitPoints: {
        current: resolved.snapshot.character.hitPoints.max,
      },
    });
    expect(
      resolved.snapshot.activityLog.some((entry) => entry.text.includes('spent salves and lantern oil'))
    ).toBe(true);
  });
});
