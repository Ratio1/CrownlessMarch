import { applyExperienceGain, changeCurrency, normalizeDurableProgression } from '../../src/shared/domain/progression';

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
});
