/**
 * @jest-environment node
 */
import { loadContentBundle } from '../../src/server/content/load-content';
import { buildInitialCharacterSnapshot } from '../../src/shared/domain/progression';
import type { GameplayDirection, GameplayOverrideCommand, GameplayShardSnapshot } from '../../src/shared/gameplay';
import { ShardRuntime } from '../../src/server/runtime/shard-runtime';

function makeRandom(sequence: number[]) {
  let index = 0;
  return () => {
    const value = sequence[index];
    index += 1;
    return value ?? 0;
  };
}

function makeSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function nextStepDirection(
  current: { x: number; y: number },
  target: { x: number; y: number }
): GameplayDirection | null {
  if (current.x < target.x) {
    return 'east';
  }

  if (current.x > target.x) {
    return 'west';
  }

  if (current.y < target.y) {
    return 'south';
  }

  if (current.y > target.y) {
    return 'north';
  }

  return null;
}

function secureQuestCompleted(snapshot: GameplayShardSnapshot) {
  return (
    snapshot.character.completedQuests.some((quest) => quest.id === 'secure-the-shrine-road') &&
    snapshot.character.unlocks.includes('route:shrine-road-secured')
  );
}

function liveRunnerCommand(snapshot: GameplayShardSnapshot): GameplayOverrideCommand {
  const hero = snapshot.encounter?.combatants.find((entry) => entry.kind === 'hero') ?? null;
  const hasPotion = snapshot.character.inventory.some((entry) => entry.id === 'health-potion');

  if (hero && hasPotion) {
    const bloodiedThreshold = Math.max(1, Math.floor(hero.maxHp / 2));
    if (hero.currentHp <= bloodiedThreshold) {
      return 'potion';
    }
  }

  return 'encounter power';
}

function runLiveQuestRoute(input: {
  runtime: ShardRuntime;
  characterId: string;
  initial: GameplayShardSnapshot;
  advanceTime: (ms: number) => void;
}) {
  let update = { snapshot: input.initial };
  let defeats = 0;
  let wins = 0;

  for (let guard = 0; guard < 240 && !secureQuestCompleted(update.snapshot); guard += 1) {
    const snapshot = update.snapshot;

    if (snapshot.encounter?.status === 'active') {
      if (snapshot.encounter.queuedOverrides.length === 0) {
        input.runtime.queueOverride(input.characterId, liveRunnerCommand(snapshot));
      }

      input.advanceTime(4_100);
      update = input.runtime.tickPlayer(input.characterId);

      if (update.snapshot.encounter?.status === 'lost') {
        defeats += 1;
      }

      if (update.snapshot.encounter?.status === 'won') {
        wins += 1;
      }

      continue;
    }

    const focus = snapshot.objectiveFocus;
    if (!focus) {
      break;
    }

    const direction = nextStepDirection(snapshot.position, focus.target);
    if (!direction) {
      const activeQuest = snapshot.character.quests[0]?.label ?? null;

      if (activeQuest === 'Burn the First Nest' && snapshot.currentTile.kind === 'roots') {
        update = input.runtime.movePlayer(input.characterId, 'west');
        continue;
      }

      if (
        activeQuest === 'Secure the Shrine Road' &&
        snapshot.currentTile.kind === 'forest' &&
        focus.stateLabel === 'Break the grove wolf'
      ) {
        update = input.runtime.movePlayer(input.characterId, 'south');
        continue;
      }

      input.advanceTime(1_000);
      update = input.runtime.tickPlayer(input.characterId);
      continue;
    }

    update = input.runtime.movePlayer(input.characterId, direction);
  }

  return {
    snapshot: update.snapshot,
    defeats,
    wins,
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

  it('logs successful movement with terrain and coordinates in the march feed', async () => {
    const content = await loadContentBundle(process.cwd());
    const runtime = new ShardRuntime({
      content,
      now: () => Date.parse('2026-05-04T07:00:00.000Z'),
    });

    runtime.addPlayer({
      cid: 'cid-move-log',
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
      }),
    });

    const update = runtime.movePlayer('cid-move-log', 'east');

    expect(update.snapshot.activityLog.at(-1)).toMatchObject({
      kind: 'move',
      text: 'Aelis moves east into Briar Roots (6,5).',
    });
  });

  it('logs blocked movement without changing position', async () => {
    const content = await loadContentBundle(process.cwd());
    const runtime = new ShardRuntime({
      content,
      now: () => Date.parse('2026-05-04T07:05:00.000Z'),
    });

    runtime.addPlayer({
      cid: 'cid-move-blocked',
      position: { x: 0, y: 0 },
      ...buildInitialCharacterSnapshot({
        name: 'Mire',
        classId: 'cleric',
        attributes: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 12,
          wisdom: 15,
          charisma: 13,
        },
      }),
    });

    const update = runtime.movePlayer('cid-move-blocked', 'west');

    expect(update.snapshot.position).toEqual({ x: 0, y: 0 });
    expect(update.snapshot.activityLog.at(-1)).toMatchObject({
      kind: 'move',
      text: 'Mire cannot move west; the mapped shard ends there.',
    });
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

  it('turns in the shrine-road hunt, records completion, and clears the grove threat', async () => {
    const content = await loadContentBundle(process.cwd());
    const runtime = new ShardRuntime({ content });

    const update = runtime.addPlayer({
      cid: 'cid-secure-2',
      position: { x: 5, y: 5 },
      ...buildInitialCharacterSnapshot({
        name: 'Vey',
        classId: 'fighter',
        attributes: {
          strength: 16,
          dexterity: 14,
          constitution: 12,
          intelligence: 10,
          wisdom: 10,
          charisma: 8,
        },
        currency: 14,
        activeQuestIds: ['secure-the-shrine-road'],
        unlocks: ['location:ember-shrine'],
      }),
      quest_progress: {
        'secure-the-shrine-road': {
          status: 'ready_to_turn_in',
          shrineVisited: true,
          wolfDefeated: true,
          wolvesDefeated: 1,
          target: 1,
        },
      },
    });

    expect(update.progressionToPersist).toMatchObject({
      xp: 220,
      gold: 24,
      activeQuestIds: [],
      unlocks: expect.arrayContaining(['route:shrine-road-secured']),
      quest_progress: {
        'secure-the-shrine-road': {
          status: 'turned_in',
        },
      },
    });
    expect(update.snapshot.character.quests).toEqual([]);
    expect(update.snapshot.character.completedQuests).toEqual([
      expect.objectContaining({
        id: 'secure-the-shrine-road',
        status: 'turned_in',
      }),
    ]);
    expect(update.snapshot.objectiveFocus).toBeNull();
    expect(Object.values(update.snapshot.monsters).some((monster) => monster.label === 'Sap Wolf')).toBe(false);
    expect(
      update.snapshot.activityLog.some((entry) => entry.text.includes('shrine road now reads as secured on the field map'))
    ).toBe(true);
  });

  it('keeps the starter live quest route from relying on repeated defeat loops', async () => {
    const content = await loadContentBundle(process.cwd());
    let now = Date.parse('2026-04-22T07:30:00.000Z');
    const runtime = new ShardRuntime({
      content,
      now: () => now,
      random: makeSeededRandom(42),
    });
    const characterId = 'cid-live-balance-1';

    const initial = runtime.addPlayer({
      cid: characterId,
      ...buildInitialCharacterSnapshot({
        name: 'Warden',
        classId: 'fighter',
        attributes: {
          strength: 15,
          dexterity: 14,
          constitution: 11,
          intelligence: 10,
          wisdom: 9,
          charisma: 8,
        },
        inventory: ['field-rations', 'field-rations'],
        equipment: { weapon: 'rusted-sword', armor: 'patchwork-leather' },
        currency: 7,
        activeQuestIds: ['survey-the-briar-edge'],
      }),
    });

    const result = runLiveQuestRoute({
      runtime,
      characterId,
      initial: initial.snapshot,
      advanceTime: (ms) => {
        now += ms;
      },
    });

    expect(secureQuestCompleted(result.snapshot)).toBe(true);
    expect(result.defeats).toBeLessThanOrEqual(1);
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

  it('turns in a ready survey quest when defeat returns the player to town', async () => {
    const content = await loadContentBundle(process.cwd());
    let now = Date.parse('2026-04-22T08:30:00.000Z');
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
      name: 'Tamar',
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
    });

    runtime.addPlayer({
      cid: 'cid-loss-2',
      position: { x: 6, y: 4 },
      ...snapshot,
      hitPoints: {
        ...snapshot.hitPoints,
        current: 4,
      },
      quest_progress: {
        'survey-the-briar-edge': {
          status: 'ready_to_turn_in',
        },
      },
    });

    runtime.movePlayer('cid-loss-2', 'south');
    now += 4_100;
    const resolved = runtime.tickPlayer('cid-loss-2');

    expect(resolved.snapshot.encounter?.status).toBe('lost');
    expect(resolved.progressionToPersist).toMatchObject({
      xp: 120,
      gold: 9,
      activeQuestIds: ['burn-the-first-nest'],
      quest_progress: {
        'survey-the-briar-edge': {
          status: 'turned_in',
        },
        'burn-the-first-nest': {
          status: 'active',
        },
      },
    });
    expect(resolved.snapshot.character.quests).toEqual([
      expect.objectContaining({
        id: 'burn-the-first-nest',
        progress: '0/2 Briar Goblins defeated.',
      }),
    ]);
  });

  it('answers look commands with a room-style MUD description and exits', async () => {
    const content = await loadContentBundle(process.cwd());
    const runtime = new ShardRuntime({ content });

    runtime.addPlayer({
      cid: 'cid-command-look',
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
      }),
    });

    const update = runtime.commandPlayer('cid-command-look', 'look');

    expect(update.snapshot.activityLog.at(-1)).toMatchObject({
      kind: 'system',
      text: expect.stringContaining('Town Hearth'),
    });
    expect(update.snapshot.activityLog.at(-1)?.text).toContain('Exits: north, south, west, east.');
  });

  it('resolves search commands as D20 field checks against terrain DCs', async () => {
    const content = await loadContentBundle(process.cwd());
    const runtime = new ShardRuntime({
      content,
      random: makeRandom([0.7]),
      now: () => Date.parse('2026-04-30T09:00:00.000Z'),
    });

    runtime.addPlayer({
      cid: 'cid-command-search',
      position: { x: 3, y: 6 },
      ...buildInitialCharacterSnapshot({
        name: 'Mire',
        classId: 'cleric',
        attributes: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 12,
          wisdom: 15,
          charisma: 13,
        },
      }),
    });

    const update = runtime.commandPlayer('cid-command-search', 'search ruin');

    expect(update.snapshot.activityLog.at(-1)).toMatchObject({
      kind: 'check',
      text: 'Mire rolls 15 + 2 = 17 vs DC 14 to search Watchpost Ruin: success. You find old claw tracks, loose stones, and the safest line through the ruin.',
    });
  });

  it('answers consider commands with monster alignment, threat, and weapon gate hints', async () => {
    const content = await loadContentBundle(process.cwd());
    const runtime = new ShardRuntime({
      content,
      random: makeRandom([0.99, 0.0]),
      now: () => Date.parse('2026-04-30T09:30:00.000Z'),
    });

    runtime.addPlayer({
      cid: 'cid-command-consider',
      position: { x: 5, y: 5 },
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
        inventory: ['rusted-sword'],
        equipment: { weapon: 'rusted-sword' },
      }),
    });

    runtime.movePlayer('cid-command-consider', 'east');
    const update = runtime.commandPlayer('cid-command-consider', 'consider goblin');

    expect(update.snapshot.activityLog.at(-1)).toMatchObject({
      kind: 'check',
      text: expect.stringContaining('Briar Goblin'),
    });
    expect(update.snapshot.activityLog.at(-1)?.text).toContain('Chaotic Evil');
    expect(update.snapshot.activityLog.at(-1)?.text).toContain('12 HP');
    expect(update.snapshot.activityLog.at(-1)?.text).toContain('+2 Attack');
    expect(update.snapshot.activityLog.at(-1)?.text).toContain('1d4 damage');
    expect(update.snapshot.activityLog.at(-1)?.text).toContain('Rusted Sword');
  });
});
