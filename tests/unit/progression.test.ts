import {
  MAX_CHARACTER_LEVEL,
  XP_LEVEL_TABLE,
  applyExperienceGain,
  buildInitialCharacterSnapshot,
  changeCurrency,
  levelForExperience,
  markPointBuyAllocationComplete,
  normalizeDurableProgression,
  requiresPointBuyAllocation,
  setLevel,
} from '../../src/shared/domain/progression';

describe('progression helpers', () => {
  it('clamps non-finite numeric changes to safe durable values', () => {
    expect(
      applyExperienceGain(
        {
          xp: Number.POSITIVE_INFINITY,
          level: 1,
          inventory: [],
          equipment: {},
          currency: 0,
          quest_progress: {},
          skills: [],
          unlocks: [],
        },
        Number.NaN,
      ),
    ).toMatchObject({
      xp: 0,
    });

    expect(
      changeCurrency(
        {
          xp: 0,
          level: 1,
          currency: Number.NaN,
          inventory: [],
          equipment: {},
          quest_progress: {},
          skills: [],
          unlocks: [],
        },
        Number.POSITIVE_INFINITY,
      ),
    ).toMatchObject({
      currency: 0,
    });
  });

  it('does not resurrect turned-in quests when activeQuestIds is empty', () => {
    expect(
      normalizeDurableProgression({
        xp: 0,
        level: 1,
        inventory: [],
        equipment: {},
        currency: 0,
        gold: 0,
        activeQuestIds: [],
        quest_progress: {
          'secure-the-shrine-road': {
            status: 'turned_in',
          },
        },
        skills: [],
        unlocks: [],
      }),
    ).toMatchObject({
      activeQuestIds: [],
      quest_progress: {
        'secure-the-shrine-road': {
          status: 'turned_in',
        },
      },
    });
  });

  it('maps experience to the canonical level table and caps at level 15', () => {
    expect(MAX_CHARACTER_LEVEL).toBe(15);
    expect(XP_LEVEL_TABLE).toEqual([
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
    expect(levelForExperience(0)).toBe(1);
    expect(levelForExperience(999)).toBe(1);
    expect(levelForExperience(1000)).toBe(2);
    expect(levelForExperience(56999)).toBe(14);
    expect(levelForExperience(57000)).toBe(15);
    expect(levelForExperience(999999)).toBe(15);
  });

  it('advances level from earned experience without exceeding the level cap', () => {
    const baseSnapshot = {
      xp: 900,
      level: 1,
      inventory: [],
      equipment: {},
      currency: 0,
      quest_progress: {},
      skills: [],
      unlocks: [],
    };

    expect(applyExperienceGain(baseSnapshot, 100)).toMatchObject({
      xp: 1000,
      level: 2,
    });

    expect(applyExperienceGain({ ...baseSnapshot, xp: 56000, level: 14 }, 10000)).toMatchObject({
      xp: 66000,
      level: 15,
    });
  });

  it('normalizes loaded and explicit levels to the current level cap', () => {
    expect(
      normalizeDurableProgression({
        xp: 1000,
        level: 1,
        inventory: [],
        equipment: {},
        currency: 0,
        quest_progress: {},
        skills: [],
        unlocks: [],
      }),
    ).toMatchObject({
      level: 2,
    });

    expect(
      normalizeDurableProgression({
        xp: 999999,
        level: 99,
        inventory: [],
        equipment: {},
        currency: 0,
        quest_progress: {},
        skills: [],
        unlocks: [],
      }),
    ).toMatchObject({
      level: 15,
    });

    expect(setLevel({ xp: 0 }, 99)).toMatchObject({
      level: 15,
    });
  });

  it('normalizes missing loaded ability scores to the new 8-based point-buy baseline', () => {
    expect(
      normalizeDurableProgression({
        name: 'Legacy',
        classId: 'wizard',
        xp: 0,
        level: 1,
        inventory: [],
        equipment: {},
        currency: 0,
        quest_progress: {},
        skills: [],
        unlocks: [],
      })
    ).toMatchObject({
      attributes: {
        strength: 8,
        dexterity: 8,
        constitution: 8,
        intelligence: 8,
        wisdom: 8,
        charisma: 8,
      },
    });

    expect(
      buildInitialCharacterSnapshot({
        name: 'Fresh',
        classId: 'fighter',
        attributes: {
          strength: 8,
          dexterity: 8,
          constitution: 8,
          intelligence: 8,
          wisdom: 8,
          charisma: 8,
        },
      }).attributes
    ).toEqual({
      strength: 8,
      dexterity: 8,
      constitution: 8,
      intelligence: 8,
      wisdom: 8,
      charisma: 8,
    });
  });

  it('marks fresh point-buy allocations and forces legacy snapshots without the marker back through allocation', () => {
    const fresh = buildInitialCharacterSnapshot({
      name: 'Fresh',
      classId: 'fighter',
      attributes: {
        strength: 15,
        dexterity: 14,
        constitution: 11,
        intelligence: 10,
        wisdom: 9,
        charisma: 8,
      },
    });

    expect(fresh).toMatchObject({
      pointBuyComplete: true,
      pointBuyVersion: 2,
      pointBuyBudget: 30,
      pointBuySpent: 20,
    });
    expect(requiresPointBuyAllocation(fresh)).toBe(false);
    expect(
      requiresPointBuyAllocation({
        ...fresh,
        pointBuyComplete: undefined,
        pointBuyVersion: undefined,
      })
    ).toBe(true);

    const allocated = markPointBuyAllocationComplete({
      ...fresh,
      pointBuyComplete: undefined,
      pointBuyVersion: undefined,
    });

    expect(allocated).toMatchObject({
      pointBuyComplete: true,
      pointBuyVersion: 2,
      pointBuySpent: 20,
    });
    expect(requiresPointBuyAllocation(allocated)).toBe(false);
  });

  it('separates XP-derived real level from current level effects', () => {
    expect(
      normalizeDurableProgression({
        xp: 20500,
        level: 10,
        levelEffects: [
          {
            id: 'vampire-level-drain',
            label: 'Vampire level drain',
            levelDelta: -2,
          },
        ],
        inventory: [],
        equipment: {},
        currency: 0,
        quest_progress: {},
        skills: [],
        unlocks: [],
      }),
    ).toMatchObject({
      realLevel: 10,
      currentLevel: 8,
      level: 8,
      levelEffects: [
        {
          id: 'vampire-level-drain',
          label: 'Vampire level drain',
          levelDelta: -2,
        },
      ],
    });

    expect(
      applyExperienceGain(
        {
          xp: 20500,
          realLevel: 10,
          currentLevel: 8,
          level: 8,
          levelEffects: [
            {
              id: 'vampire-level-drain',
              label: 'Vampire level drain',
              levelDelta: -2,
            },
          ],
        },
        5500,
      ),
    ).toMatchObject({
      xp: 26000,
      realLevel: 11,
      currentLevel: 9,
      level: 9,
    });
  });
});
