/**
 * @jest-environment node
 */
import { __resetCStoreForTests, getCStore } from '@/server/platform/cstore';
import { getWorldSnapshot, moveCharacter } from '@/server/world/world-service';
import type { CharacterRecord } from '@/shared/domain/types';
import { keys } from '@/shared/persistence/keys';

describe('world service', () => {
  beforeEach(() => {
    __resetCStoreForTests();
  });

  it('returns a level-1 snapshot with a 3x3 visible tile window', async () => {
    const character = await seedCharacter();

    const snapshot = await getWorldSnapshot(character.id);

    expect(snapshot.regionId).toBe('briar-march');
    expect(snapshot.position).toEqual({ x: 5, y: 5 });
    expect(snapshot.visibleTiles).toHaveLength(9);
  });

  it('moves east from starter spawn and triggers an encounter on hostile starter tiles', async () => {
    const character = await seedCharacter();

    const result = await moveCharacter(character.id, 'east');

    expect(result.snapshot.position).toEqual({ x: 6, y: 5 });
    expect(result.encounter).toMatchObject({
      status: 'active',
      round: 1
    });
    const savedCharacter = await getCStore().getJson<CharacterRecord>(keys.character(character.id));
    expect(savedCharacter?.activeEncounterId).toBeTruthy();
  });

  it('does not include out-of-bounds coordinates in edge snapshots', async () => {
    const character = await seedCharacter({
      id: 'char-edge-test',
      position: { x: 0, y: 0 }
    });

    const snapshot = await getWorldSnapshot(character.id);

    expect(snapshot.visibleTiles).toHaveLength(4);
    expect(snapshot.visibleTiles.every((tile) => tile.x >= 0 && tile.y >= 0)).toBe(true);
    expect(snapshot.visibleTiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ x: 0, y: 0 }),
        expect.objectContaining({ x: 1, y: 0 }),
        expect.objectContaining({ x: 0, y: 1 }),
        expect.objectContaining({ x: 1, y: 1 })
      ])
    );
  });

  it('blocks movement while the character has an active encounter', async () => {
    const character = await seedCharacter({
      id: 'char-encounter-lock',
      activeEncounterId: 'enc-lock-1'
    });

    await getCStore().setJson(keys.encounter('enc-lock-1'), {
      id: 'enc-lock-1',
      status: 'active',
      round: 2,
      nextRoundAt: new Date().toISOString(),
      logs: [{ round: 1, text: 'Encounter started.' }]
    });

    await expect(moveCharacter(character.id, 'east')).rejects.toMatchObject({
      code: 'ENCOUNTER_ACTIVE'
    });

    const savedCharacter = await getCStore().getJson<CharacterRecord>(keys.character(character.id));
    expect(savedCharacter?.position).toEqual({ x: 5, y: 5 });
  });
});

async function seedCharacter(overrides?: Partial<CharacterRecord>) {
  const character: CharacterRecord = {
    id: overrides?.id ?? 'char-world-test',
    accountId: 'acct-world-test',
    name: 'Mossblade',
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
    position: overrides?.position ?? { x: 5, y: 5 },
    hitPoints: {
      current: 12,
      max: 12
    },
    inventory: ['rusted-sword'],
    equipped: { weapon: 'rusted-sword' },
    activeQuestIds: [],
    activeEncounterId: overrides?.activeEncounterId
  };

  await getCStore().setJson(keys.character(character.id), character);
  return character;
}
