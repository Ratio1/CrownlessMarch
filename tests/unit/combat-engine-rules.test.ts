/**
 * @jest-environment node
 */
import type { ContentBundle } from '../../src/server/content/load-content';
import { loadContentBundle } from '../../src/server/content/load-content';
import { DEFAULT_GAME_RULES } from '../../src/shared/content/game-rules';
import {
  advanceEncounterSnapshot,
  createEncounterSnapshot,
} from '../../src/server/runtime/combat-engine';
import { buildInitialCharacterSnapshot } from '../../src/shared/domain/progression';

function makeRandom(sequence: number[]) {
  let index = 0;
  return () => {
    const value = sequence[index];
    index += 1;
    return value ?? 0;
  };
}

function makeContent(): ContentBundle {
  return {
    rules: DEFAULT_GAME_RULES,
    classes: [
      {
        id: 'fighter',
        label: 'Fighter',
        primaryAttributes: ['strength', 'constitution'],
        passive: 'Steelbound Presence',
        encounterAbility: 'Shield Rush',
        utilityAbility: 'Second Wind',
      },
      {
        id: 'rogue',
        label: 'Rogue',
        primaryAttributes: ['dexterity', 'charisma'],
        passive: 'Shadowstep',
        encounterAbility: 'Sly Flourish',
        utilityAbility: 'Tumble',
      },
      {
        id: 'wizard',
        label: 'Wizard',
        primaryAttributes: ['intelligence', 'wisdom'],
        passive: 'Arcane Sight',
        encounterAbility: 'Magic Missile',
        utilityAbility: 'Cantrip',
      },
      {
        id: 'cleric',
        label: 'Cleric',
        primaryAttributes: ['wisdom', 'charisma'],
        passive: 'Ember Ward',
        encounterAbility: 'Lance of Faith',
        utilityAbility: 'Prayer',
      },
    ],
    items: [
      {
        id: 'holy-avenger',
        slot: 'weapon',
        label: 'The Holy Avenger',
        bonus: 5,
        effect: '+5 attack, +5 damage, Holy',
        weaponType: 'greatsword',
        damage: '2d6',
        criticalRangeMin: 19,
        criticalMultiplier: 2,
        modifiers: ['holy'],
      },
      {
        id: 'plus-two-katana',
        slot: 'weapon',
        label: '+2 Katana',
        bonus: 2,
        effect: '+2 attack, +2 damage',
        weaponType: 'katana',
        damage: '1d10',
        criticalRangeMin: 19,
        criticalMultiplier: 2,
        modifiers: [],
      },
    ],
    monsters: [
      {
        id: 'vampire-lord',
        label: 'Vampire Lord',
        level: 9,
        defenses: { ac: 25, fortitude: 20, reflex: 23, will: 24 },
        hitPoints: 100,
        attackBonus: 20,
        damage: { dice: '3d6', bonus: 0 },
        behavior: 'boss',
        alignment: 'LE',
        minimumEnhancementToHit: 3,
        vulnerabilities: ['holy'],
      },
    ],
    quests: [],
    region: {
      id: 'briar-march',
      width: 3,
      height: 3,
      spawn: { x: 1, y: 1 },
      tiles: [{ x: 1, y: 1, kind: 'town', blocked: false }],
    },
  };
}

function makeHero(weaponId: string) {
  return buildInitialCharacterSnapshot({
    name: 'Ser Caldor',
    classId: 'fighter',
    attributes: {
      strength: 18,
      dexterity: 10,
      constitution: 12,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
    },
    inventory: [weaponId],
    equipment: { weapon: weaponId },
  });
}

describe('combat engine D20 weapon rules', () => {
  it('uses rounded class attack progression through the level cap', () => {
    const content = makeContent();
    const expected = {
      fighter: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
      rogue: [1, 1, 2, 3, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 11],
      wizard: [0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5],
      cleric: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8],
    } as const;

    for (const [classId, bonuses] of Object.entries(expected)) {
      for (let index = 0; index < bonuses.length; index += 1) {
        const level = index + 1;
        const hero = buildInitialCharacterSnapshot({
          name: `${classId}-${level}`,
          classId: classId as 'fighter' | 'rogue' | 'wizard' | 'cleric',
          attributes: {
            strength: 10,
            dexterity: 10,
            constitution: 10,
            intelligence: 10,
            wisdom: 10,
            charisma: 10,
          },
        }) as unknown as Record<string, unknown>;
        hero.level = level;

        const encounter = createEncounterSnapshot({
          characterId: `cid-${classId}-${level}`,
          characterSnapshot: hero,
          monster: content.monsters[0],
          tileKind: 'ruin',
          content,
          now: new Date('2026-04-30T10:00:00.000Z'),
          random: makeRandom([0, 0]),
        });
        const combatant = encounter.combatants.find((entry) => entry.kind === 'hero');

        expect(combatant?.attackBonus).toBe(bonuses[index]);
      }
    }
  });

  it('uses current level, not real level, for class attack progression', () => {
    const content = makeContent();
    const hero = buildInitialCharacterSnapshot({
      name: 'Drained Fighter',
      classId: 'fighter',
      attributes: {
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
      },
    }) as unknown as Record<string, unknown>;
    hero.xp = 20500;
    hero.realLevel = 10;
    hero.currentLevel = 8;
    hero.level = 8;
    hero.levelEffects = [
      {
        id: 'vampire-level-drain',
        label: 'Vampire level drain',
        levelDelta: -2,
      },
    ];

    const encounter = createEncounterSnapshot({
      characterId: 'cid-drained-fighter',
      characterSnapshot: hero,
      monster: content.monsters[0],
      tileKind: 'ruin',
      content,
      now: new Date('2026-04-30T10:00:00.000Z'),
      random: makeRandom([0, 0]),
    });
    const combatant = encounter.combatants.find((entry) => entry.kind === 'hero');

    expect(combatant?.attackBonus).toBe(8);
  });

  it('uses weapon dice, direct critical ranges, and Holy damage against Evil targets', () => {
    const content = makeContent();
    const now = new Date('2026-04-30T10:00:00.000Z');
    const hero = makeHero('holy-avenger') as unknown as Record<string, unknown>;
    const encounter = createEncounterSnapshot({
      characterId: 'cid-holy-1',
      characterSnapshot: hero,
      monster: content.monsters[0],
      tileKind: 'ruin',
      content,
      now,
      random: makeRandom([0.99, 0]),
    });

    const advanced = advanceEncounterSnapshot({
      encounter,
      characterSnapshot: hero,
      content,
      now: new Date(now.getTime() + 3_000),
      random: makeRandom([0.9, 0.5, 0.5]),
    });
    const vampire = advanced.encounter.combatants.find((entry) => entry.kind === 'monster');
    const logText = advanced.encounter.logs.map((entry) => entry.text).join('\n');

    expect(vampire?.currentHp).toBe(32);
    expect(logText).toContain('critical');
    expect(logText).toContain('Holy vs Evil');
  });

  it('blocks damage when a boss requires a higher weapon enhancement', () => {
    const content = makeContent();
    const now = new Date('2026-04-30T10:10:00.000Z');
    const hero = makeHero('plus-two-katana') as unknown as Record<string, unknown>;
    const encounter = createEncounterSnapshot({
      characterId: 'cid-gate-1',
      characterSnapshot: hero,
      monster: content.monsters[0],
      tileKind: 'crypt',
      content,
      now,
      random: makeRandom([0.99, 0]),
    });

    const advanced = advanceEncounterSnapshot({
      encounter,
      characterSnapshot: hero,
      content,
      now: new Date(now.getTime() + 3_000),
      random: makeRandom([0.99]),
    });
    const vampire = advanced.encounter.combatants.find((entry) => entry.kind === 'monster');
    const logText = advanced.encounter.logs.map((entry) => entry.text).join('\n');

    expect(vampire?.currentHp).toBe(100);
    expect(logText).toContain('requires a +3 weapon');
  });

  it('keeps starter Sap Wolf fights readable on an average fighter attack', async () => {
    const content = await loadContentBundle(process.cwd());
    const sapWolf = content.monsters.find((entry) => entry.id === 'sap-wolf');
    expect(sapWolf).toBeDefined();

    const now = new Date('2026-04-30T11:00:00.000Z');
    const hero = buildInitialCharacterSnapshot({
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
      inventory: ['rusted-sword'],
      equipment: { weapon: 'rusted-sword' },
    }) as unknown as Record<string, unknown>;
    const encounter = createEncounterSnapshot({
      characterId: 'cid-sap-wolf-readability',
      characterSnapshot: hero,
      monster: sapWolf!,
      tileKind: 'forest',
      content,
      now,
      random: makeRandom([0.9, 0]),
    });

    const advanced = advanceEncounterSnapshot({
      encounter,
      characterSnapshot: hero,
      content,
      now: new Date(now.getTime() + 3_000),
      random: makeRandom([0.45, 0.5, 0]),
    });
    const wolf = advanced.encounter.combatants.find((entry) => entry.kind === 'monster');
    const logText = advanced.encounter.logs.map((entry) => entry.text).join('\n');

    expect(wolf?.currentHp).toBe(7);
    expect(logText).toContain('Sap Wolf has 7/14 HP remaining');
    expect(logText).toContain('Sap Wolf is bloodied.');
  });
});
