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
      }),
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
    });
    expect(resolved.snapshot.encounter?.logs.some((entry) => entry.text.includes('vs AC'))).toBe(true);
  });
});
