import { createPersistenceService } from '../../src/server/runtime/persistence-service';
import type { PresenceLease } from '../../src/shared/domain/types';

function createLease(overrides: Partial<PresenceLease> = {}): PresenceLease {
  return {
    current_character_cid: 'cid-1',
    shard_world_instance_id: 'shard-a',
    session_host_node_id: 'node-a',
    connection_id: 'conn-1',
    position: { x: 3, y: 7 },
    buffs_debuffs: ['shielded'],
    lease_expires_at: '2026-04-20T12:00:30.000Z',
    last_persisted_at: null,
    persist_revision: 7,
    ...overrides,
  };
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

describe('persistence service', () => {
  it('persists XP and inventory changes to R1FS while keeping the lease in sync', async () => {
    const leases = new Map<string, PresenceLease>([['char-1', createLease()]]);
    const writes: Array<{ characterId: string; lease: PresenceLease }> = [];
    const saves: Array<{ cid: string; persistRevision: number; snapshot: Record<string, unknown> }> = [];

    const service = createPersistenceService({
      nodeId: 'node-a',
      now: () => Date.parse('2026-04-20T12:00:20.000Z'),
      readPresenceLease: async (characterId) => leases.get(characterId) ?? null,
      writePresenceLease: async (characterId, lease) => {
        writes.push({ characterId, lease });
        leases.set(characterId, lease);
      },
      saveCharacterCheckpoint: async (input) => {
        saves.push(input);
        return {
          cid: 'cid-next-1',
          persist_revision: input.persistRevision + 1,
          snapshot: input.snapshot,
        };
      },
    });

    const result = await service.persistProgression({
      characterId: 'char-1',
      connectionId: 'conn-1',
      progression: {
        name: 'Warden',
        stats: { vigor: 9, insight: 4 },
        xp: 240,
        level: 5,
        realLevel: 5,
        currentLevel: 5,
        levelEffects: [],
        inventory: ['rusted-sword', 'healing-potion'],
        equipment: { weapon: 'rusted-sword' },
        currency: 44,
        quest_progress: { 'quest-1': 'complete' },
        skills: ['dash'],
        unlocks: ['fast-travel'],
        position: { x: 99, y: 42 },
        active_encounter: { kind: 'boss' },
      },
    });

    expect(saves).toEqual([
      {
        cid: 'cid-1',
        persistRevision: 7,
        snapshot: {
          name: 'Warden',
          stats: { vigor: 9, insight: 4 },
          xp: 240,
          level: 5,
          realLevel: 5,
          currentLevel: 5,
          levelEffects: [],
          inventory: ['rusted-sword', 'healing-potion'],
          equipment: { weapon: 'rusted-sword' },
          currency: 44,
          quest_progress: { 'quest-1': 'complete' },
          skills: ['dash'],
          unlocks: ['fast-travel'],
        },
      },
    ]);

    expect(writes).toEqual([
      {
        characterId: 'char-1',
        lease: {
          current_character_cid: 'cid-next-1',
          shard_world_instance_id: 'shard-a',
          session_host_node_id: 'node-a',
          connection_id: 'conn-1',
          position: { x: 3, y: 7 },
          buffs_debuffs: ['shielded'],
          lease_expires_at: '2026-04-20T12:00:30.000Z',
          last_persisted_at: '2026-04-20T12:00:20.000Z',
          persist_revision: 8,
        },
      },
    ]);

    expect(result).toEqual({
      cid: 'cid-next-1',
      persist_revision: 8,
      snapshot: {
        name: 'Warden',
        stats: { vigor: 9, insight: 4 },
        xp: 240,
        level: 5,
        realLevel: 5,
        currentLevel: 5,
        levelEffects: [],
        inventory: ['rusted-sword', 'healing-potion'],
        equipment: { weapon: 'rusted-sword' },
        currency: 44,
        quest_progress: { 'quest-1': 'complete' },
        skills: ['dash'],
        unlocks: ['fast-travel'],
      },
    });
  });

  it('rejects a save when lease ownership has already moved on', async () => {
    const service = createPersistenceService({
      nodeId: 'node-a',
      now: () => Date.parse('2026-04-20T12:00:20.000Z'),
      readPresenceLease: async () =>
        createLease({
          connection_id: 'conn-2',
          lease_expires_at: '2026-04-20T12:00:30.000Z',
        }),
      writePresenceLease: async () => {
        throw new Error('should not write lease');
      },
      saveCharacterCheckpoint: async () => {
        throw new Error('should not save checkpoint');
      },
    });

    await expect(
      service.persistProgression({
        characterId: 'char-1',
        connectionId: 'conn-1',
        progression: { xp: 12, inventory: [] },
      }),
    ).rejects.toThrow('Stale ownership');
  });

  it('rejects the lease metadata update if ownership disappears after the checkpoint write', async () => {
    const reads = [
      createLease({
        lease_expires_at: '2026-04-20T12:00:30.000Z',
      }),
      null,
    ];
    const writePresenceLease = jest.fn(async () => undefined);
    const service = createPersistenceService({
      nodeId: 'node-a',
      now: () => Date.parse('2026-04-20T12:00:20.000Z'),
      readPresenceLease: async () => reads.shift() ?? null,
      writePresenceLease,
      saveCharacterCheckpoint: async (input) => ({
        cid: 'cid-next-1',
        persist_revision: input.persistRevision + 1,
        snapshot: input.snapshot,
      }),
    });

    await expect(
      service.persistProgression({
        characterId: 'char-1',
        connectionId: 'conn-1',
        progression: { xp: 12, inventory: [] },
      }),
    ).rejects.toThrow('Stale ownership');

    expect(writePresenceLease).not.toHaveBeenCalled();
  });

  it('serializes overlapping saves for the same character so persist_revision stays monotonic', async () => {
    const leases = new Map<string, PresenceLease>([['char-1', createLease()]]);
    const firstSave = createDeferred<void>();
    const saveInputs: Array<{ cid: string; persistRevision: number; snapshot: Record<string, unknown> }> = [];
    let saveCount = 0;
    const service = createPersistenceService({
      nodeId: 'node-a',
      now: () => Date.parse('2026-04-20T12:00:20.000Z'),
      readPresenceLease: async (characterId) => leases.get(characterId) ?? null,
      writePresenceLease: async (characterId, lease) => {
        leases.set(characterId, lease);
      },
      saveCharacterCheckpoint: async (input) => {
        saveCount += 1;
        saveInputs.push(input);

        if (saveCount === 1) {
          await firstSave.promise;
          return {
            cid: 'cid-next-1',
            persist_revision: input.persistRevision + 1,
            snapshot: input.snapshot,
          };
        }

        return {
          cid: 'cid-next-2',
          persist_revision: input.persistRevision + 1,
          snapshot: input.snapshot,
        };
      },
    });

    const firstPersist = service.persistProgression({
      characterId: 'char-1',
      connectionId: 'conn-1',
      progression: { xp: 240, inventory: ['rusted-sword'] },
    });

    const secondPersist = service.persistProgression({
      characterId: 'char-1',
      connectionId: 'conn-1',
      progression: { xp: 280, inventory: ['rusted-sword', 'healing-potion'] },
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(saveInputs).toEqual([
      {
        cid: 'cid-1',
        persistRevision: 7,
        snapshot: {
          xp: 240,
          level: 1,
          realLevel: 1,
          currentLevel: 1,
          levelEffects: [],
          inventory: ['rusted-sword'],
          equipment: {},
          currency: 0,
          quest_progress: {},
          skills: [],
          unlocks: [],
        },
      },
    ]);

    firstSave.resolve();

    await expect(firstPersist).resolves.toMatchObject({
      cid: 'cid-next-1',
      persist_revision: 8,
    });
    await expect(secondPersist).resolves.toMatchObject({
      cid: 'cid-next-2',
      persist_revision: 9,
    });

    expect(saveInputs).toEqual([
      {
        cid: 'cid-1',
        persistRevision: 7,
        snapshot: {
          xp: 240,
          level: 1,
          realLevel: 1,
          currentLevel: 1,
          levelEffects: [],
          inventory: ['rusted-sword'],
          equipment: {},
          currency: 0,
          quest_progress: {},
          skills: [],
          unlocks: [],
        },
      },
      {
        cid: 'cid-next-1',
        persistRevision: 8,
        snapshot: {
          xp: 280,
          level: 1,
          realLevel: 1,
          currentLevel: 1,
          levelEffects: [],
          inventory: ['rusted-sword', 'healing-potion'],
          equipment: {},
          currency: 0,
          quest_progress: {},
          skills: [],
          unlocks: [],
        },
      },
    ]);
  });

  it('normalizes malformed durable progression fields before saving', async () => {
    const saves: Array<{ cid: string; persistRevision: number; snapshot: Record<string, unknown> }> = [];
    const service = createPersistenceService({
      nodeId: 'node-a',
      now: () => Date.parse('2026-04-20T12:00:20.000Z'),
      readPresenceLease: async () =>
        createLease({
          lease_expires_at: '2026-04-20T12:00:30.000Z',
        }),
      writePresenceLease: async () => undefined,
      saveCharacterCheckpoint: async (input) => {
        saves.push(input);
        return {
          cid: 'cid-next-1',
          persist_revision: input.persistRevision + 1,
          snapshot: input.snapshot,
        };
      },
    });

    await service.persistProgression({
      characterId: 'char-1',
      connectionId: 'conn-1',
      progression: {
        name: 'Warden',
        xp: Number.NaN,
        level: Number.POSITIVE_INFINITY,
        inventory: 'rusted-sword',
        equipment: null,
        currency: Number.NEGATIVE_INFINITY,
        quest_progress: [],
        skills: 'dash',
        unlocks: null,
      },
    });

    expect(saves).toEqual([
      {
        cid: 'cid-1',
        persistRevision: 7,
        snapshot: {
          name: 'Warden',
          xp: 0,
          level: 1,
          realLevel: 1,
          currentLevel: 1,
          levelEffects: [],
          inventory: [],
          equipment: {},
          currency: 0,
          quest_progress: {},
          skills: [],
          unlocks: [],
        },
      },
    ]);
  });

  it('rejects malformed lease expiry timestamps as stale ownership', async () => {
    const service = createPersistenceService({
      nodeId: 'node-a',
      now: () => Date.parse('2026-04-20T12:00:20.000Z'),
      readPresenceLease: async () =>
        createLease({
          lease_expires_at: 'not-a-timestamp',
        }),
      writePresenceLease: async () => {
        throw new Error('should not write lease');
      },
      saveCharacterCheckpoint: async () => {
        throw new Error('should not save checkpoint');
      },
    });

    await expect(
      service.persistProgression({
        characterId: 'char-1',
        connectionId: 'conn-1',
        progression: { xp: 12, inventory: [] },
      }),
    ).rejects.toThrow('Stale ownership');
  });

  it('rejects malformed persist_revision values in the live lease', async () => {
    const service = createPersistenceService({
      nodeId: 'node-a',
      now: () => Date.parse('2026-04-20T12:00:20.000Z'),
      readPresenceLease: async () =>
        createLease({
          persist_revision: Number.NaN,
        }),
      writePresenceLease: async () => {
        throw new Error('should not write lease');
      },
      saveCharacterCheckpoint: async () => {
        throw new Error('should not save checkpoint');
      },
    });

    await expect(
      service.persistProgression({
        characterId: 'char-1',
        connectionId: 'conn-1',
        progression: { xp: 12, inventory: [] },
      }),
    ).rejects.toThrow('Stale ownership');
  });
});
