import { createPersistenceService } from '../../src/server/runtime/persistence-service';
import { createCharacterCheckpointStore, type CharacterCheckpointRecord } from '../../src/server/platform/r1fs-characters';
import type { PresenceLease } from '../../src/shared/domain/types';

function createFakeR1fs() {
  const records = new Map<string, CharacterCheckpointRecord<Record<string, unknown>>>();
  let writes = 0;

  return {
    seed(cid: string, record: CharacterCheckpointRecord<Record<string, unknown>>) {
      records.set(cid, record);
    },

    async addYaml({ data }: { data: Record<string, unknown> }) {
      writes += 1;
      const cid = `cid-next-${writes}`;
      records.set(cid, data as unknown as CharacterCheckpointRecord<Record<string, unknown>>);
      return { cid };
    },

    async addJson({ data }: { data: Record<string, unknown> }) {
      writes += 1;
      const cid = `cid-next-${writes}`;
      records.set(cid, data as unknown as CharacterCheckpointRecord<Record<string, unknown>>);
      return { cid };
    },

    async getYaml({ cid }: { cid: string }) {
      const file_data = records.get(cid);

      if (!file_data) {
        throw new Error(`Unknown checkpoint ${cid}`);
      }

      return { file_data };
    },

    recordFor(cid: string) {
      return records.get(cid) ?? null;
    },
  };
}

function createLease(overrides: Partial<PresenceLease> = {}): PresenceLease {
  return {
    current_character_cid: 'cid-1',
    shard_world_instance_id: 'shard-a',
    session_host_node_id: 'node-a',
    connection_id: 'conn-1',
    position: { x: 3, y: 7 },
    buffs_debuffs: [],
    lease_expires_at: '2026-04-20T12:00:30.000Z',
    last_persisted_at: null,
    persist_revision: 3,
    ...overrides,
  };
}

describe('R1FS checkpoint persistence', () => {
  it('strips shard-local movement state before saving a reconnect checkpoint', async () => {
    const r1fs = createFakeR1fs();
    const checkpointStore = createCharacterCheckpointStore({ r1fs });
    const leases = new Map<string, PresenceLease>([['char-1', createLease()]]);

    r1fs.seed('cid-1', {
      persist_revision: 3,
      snapshot: {
        name: 'Warden',
        stats: { vigor: 8, insight: 3 },
        xp: 120,
        level: 4,
        inventory: ['iron-key'],
        equipment: { weapon: 'iron-sword' },
        currency: 9,
        quest_progress: { 'quest-1': 'started' },
        skills: ['dash'],
        unlocks: ['fast-travel'],
        position: { x: 99, y: 42 },
        last_position: { x: 3, y: 7 },
        active_encounter: { kind: 'boss' },
        shard_world_progress: { clearedRooms: 2 },
      },
    });

    const service = createPersistenceService({
      nodeId: 'node-a',
      now: () => Date.parse('2026-04-20T12:00:20.000Z'),
      readPresenceLease: async (characterId) => leases.get(characterId) ?? null,
      writePresenceLease: async (characterId, lease) => {
        leases.set(characterId, lease);
      },
      saveCharacterCheckpoint: async (input) => checkpointStore.saveCharacterCheckpoint(input),
    });

    const saved = await service.persistProgression({
      characterId: 'char-1',
      connectionId: 'conn-1',
      progression: {
        name: 'Warden',
        stats: { vigor: 8, insight: 3 },
        xp: 145,
        level: 4,
        inventory: ['iron-key', 'ember-gem'],
        equipment: { weapon: 'iron-sword' },
        currency: 12,
        quest_progress: { 'quest-1': 'complete' },
        skills: ['dash'],
        unlocks: ['fast-travel'],
        position: { x: 101, y: 44 },
        last_position: { x: 3, y: 7 },
        active_encounter: { kind: 'boss' },
        shard_world_progress: { clearedRooms: 3 },
      },
    });

    expect(saved.snapshot).toEqual({
      name: 'Warden',
      stats: { vigor: 8, insight: 3 },
      xp: 145,
      level: 4,
      realLevel: 4,
      currentLevel: 4,
      levelEffects: [],
      inventory: ['iron-key', 'ember-gem'],
      equipment: { weapon: 'iron-sword' },
      currency: 12,
      quest_progress: { 'quest-1': 'complete' },
      skills: ['dash'],
      unlocks: ['fast-travel'],
    });

    expect(r1fs.recordFor('cid-next-1')).toEqual({
      persist_revision: 4,
      snapshot: {
        name: 'Warden',
        stats: { vigor: 8, insight: 3 },
        xp: 145,
        level: 4,
        realLevel: 4,
        currentLevel: 4,
        levelEffects: [],
        inventory: ['iron-key', 'ember-gem'],
        equipment: { weapon: 'iron-sword' },
        currency: 12,
        quest_progress: { 'quest-1': 'complete' },
        skills: ['dash'],
        unlocks: ['fast-travel'],
      },
    });

    expect(leases.get('char-1')).toEqual({
      current_character_cid: 'cid-next-1',
      shard_world_instance_id: 'shard-a',
      session_host_node_id: 'node-a',
      connection_id: 'conn-1',
      position: { x: 3, y: 7 },
      buffs_debuffs: [],
      lease_expires_at: '2026-04-20T12:00:30.000Z',
      last_persisted_at: '2026-04-20T12:00:20.000Z',
      persist_revision: 4,
    });
  });

  it('rejects stale persist_revision writes from the checkpoint store', async () => {
    const r1fs = createFakeR1fs();
    const checkpointStore = createCharacterCheckpointStore({ r1fs });
    const leases = new Map<string, PresenceLease>([['char-1', createLease()]]);

    r1fs.seed('cid-1', {
      persist_revision: 5,
      snapshot: {
        xp: 120,
        inventory: [],
      },
    });

    const service = createPersistenceService({
      nodeId: 'node-a',
      now: () => Date.parse('2026-04-20T12:00:20.000Z'),
      readPresenceLease: async (characterId) => leases.get(characterId) ?? null,
      writePresenceLease: async () => {
        throw new Error('should not write lease');
      },
      saveCharacterCheckpoint: async (input) => checkpointStore.saveCharacterCheckpoint(input),
    });

    await expect(
      service.persistProgression({
        characterId: 'char-1',
        connectionId: 'conn-1',
        progression: { xp: 130, inventory: ['ember-gem'] },
      }),
    ).rejects.toThrow('Stale persist_revision');
  });
});
