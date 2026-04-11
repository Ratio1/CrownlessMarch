/**
 * @jest-environment node
 */
import { __resetCStoreForTests, getCStore } from '@/server/platform/cstore';
import { pollEncounter, queueEncounterOverride } from '@/server/combat/encounter-service';
import type { EncounterSnapshot } from '@/shared/domain/combat';
import type { CharacterRecord } from '@/shared/domain/types';
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

  it('does not allow claim-by-poll for ownerless encounters without authoritative linkage', async () => {
    const seeded: EncounterSnapshot = {
      id: 'enc-ownerless-poll',
      status: 'active',
      round: 1,
      nextRoundAt: '2099-01-01T00:00:00.000Z',
      logs: [{ round: 1, text: 'A Briar Goblin lunges from the roots.' }]
    };
    await getCStore().setJson(keys.encounter(seeded.id), seeded);

    await expect(pollEncounter(seeded.id, 'char-claimant')).rejects.toMatchObject({
      code: 'ENCOUNTER_NOT_FOUND'
    });

    const stored = await getCStore().getJson<EncounterSnapshot>(keys.encounter(seeded.id));
    expect(stored).toEqual(seeded);
  });

  it('does not allow claim-by-override for ownerless encounters without authoritative linkage', async () => {
    const seeded: EncounterSnapshot = {
      id: 'enc-ownerless-override',
      status: 'active',
      round: 1,
      nextRoundAt: '2099-01-01T00:00:00.000Z',
      logs: [{ round: 1, text: 'A Briar Goblin lunges from the roots.' }]
    };
    await getCStore().setJson(keys.encounter(seeded.id), seeded);

    await expect(
      queueEncounterOverride(seeded.id, {
        characterId: 'char-claimant',
        command: 'escape'
      })
    ).rejects.toMatchObject({
      code: 'ENCOUNTER_NOT_FOUND'
    });

    const stored = await getCStore().getJson<EncounterSnapshot>(keys.encounter(seeded.id));
    expect(stored).toEqual(seeded);
  });

  it('allows ownerless encounter migration when character has authoritative activeEncounterId linkage', async () => {
    const seeded: EncounterSnapshot = {
      id: 'enc-ownerless-migrated',
      status: 'active',
      round: 1,
      nextRoundAt: '2099-01-01T00:00:00.000Z',
      logs: [{ round: 1, text: 'A Briar Goblin lunges from the roots.' }]
    };
    const character: CharacterRecord = {
      id: 'char-linked',
      accountId: 'acct-linked',
      name: 'Linkblade',
      classId: 'fighter',
      level: 1,
      xp: 0,
      attributes: {
        strength: 15,
        dexterity: 14,
        constitution: 11,
        intelligence: 10,
        wisdom: 9,
        charisma: 8
      },
      position: { x: 5, y: 5 },
      hitPoints: { current: 12, max: 12 },
      inventory: ['rusted-sword'],
      equipped: { weapon: 'rusted-sword' },
      activeQuestIds: [],
      activeEncounterId: seeded.id
    };
    await getCStore().setJson(keys.encounter(seeded.id), seeded);
    await getCStore().setJson(keys.character(character.id), character);

    const polled = await pollEncounter(seeded.id, character.id);
    expect(polled.characterId).toBe(character.id);

    const afterOverride = await queueEncounterOverride(seeded.id, {
      characterId: character.id,
      command: 'escape'
    });
    expect(afterOverride.characterId).toBe(character.id);
    expect(afterOverride.queuedOverrides?.length).toBe(1);
  });
});
