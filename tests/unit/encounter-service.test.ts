/**
 * @jest-environment node
 */
import { __resetCStoreForTests, getCStore } from '@/server/platform/cstore';
import { pollEncounter, queueEncounterOverride } from '@/server/combat/encounter-service';
import type { EncounterSnapshot } from '@/shared/domain/combat';
import { keys } from '@/shared/persistence/keys';

describe('encounter service authorization', () => {
  beforeEach(() => {
    __resetCStoreForTests();
  });

  it('does not persist hydrated state when polling an encounter owned by another character', async () => {
    const seeded: EncounterSnapshot = {
      id: 'enc-owned',
      characterId: 'char-owner',
      status: 'active',
      round: 1,
      nextRoundAt: '2099-01-01T00:00:00.000Z',
      logs: [{ round: 1, text: 'A Briar Goblin lunges from the roots.' }]
    };
    await getCStore().setJson(keys.encounter(seeded.id), seeded);

    await expect(pollEncounter(seeded.id, 'char-intruder')).rejects.toMatchObject({
      code: 'ENCOUNTER_NOT_FOUND'
    });

    const stored = await getCStore().getJson<EncounterSnapshot>(keys.encounter(seeded.id));
    expect(stored).toEqual(seeded);
  });

  it('does not persist hydrated state when queueing override for another character encounter', async () => {
    const seeded: EncounterSnapshot = {
      id: 'enc-owned-override',
      characterId: 'char-owner',
      status: 'active',
      round: 1,
      nextRoundAt: '2099-01-01T00:00:00.000Z',
      logs: [{ round: 1, text: 'A Briar Goblin lunges from the roots.' }]
    };
    await getCStore().setJson(keys.encounter(seeded.id), seeded);

    await expect(
      queueEncounterOverride(seeded.id, {
        characterId: 'char-intruder',
        command: 'escape'
      })
    ).rejects.toMatchObject({
      code: 'ENCOUNTER_NOT_FOUND'
    });

    const stored = await getCStore().getJson<EncounterSnapshot>(keys.encounter(seeded.id));
    expect(stored).toEqual(seeded);
  });
});
