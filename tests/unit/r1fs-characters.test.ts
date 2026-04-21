import {
  createCharacterCheckpointStore,
  type CharacterCheckpointRecord,
} from '../../src/server/platform/r1fs-characters';

function createFakeR1fs() {
  const records = new Map<string, CharacterCheckpointRecord<Record<string, unknown>>>();
  let writes = 0;

  return {
    seed(cid: string, record: CharacterCheckpointRecord<Record<string, unknown>>) {
      records.set(cid, record);
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
  };
}

describe('r1fs character checkpoints', () => {
  it('loads a character checkpoint by cid', async () => {
    const r1fs = createFakeR1fs();
    const store = createCharacterCheckpointStore({ r1fs });

    r1fs.seed('cid-1', {
      persist_revision: 2,
      snapshot: { name: 'Warden' },
    });

    await expect(store.loadCharacterByCid('cid-1')).resolves.toEqual({
      cid: 'cid-1',
      persist_revision: 2,
      snapshot: { name: 'Warden' },
    });
  });

  it('rejects stale persist_revision values before writing a new checkpoint', async () => {
    const r1fs = createFakeR1fs();
    const store = createCharacterCheckpointStore({ r1fs });

    r1fs.seed('cid-1', {
      persist_revision: 3,
      snapshot: { xp: 40 },
    });

    await expect(
      store.saveCharacterCheckpoint({
        cid: 'cid-1',
        persistRevision: 2,
        snapshot: { xp: 50 },
      }),
    ).rejects.toThrow('Stale persist_revision');
  });

  it('writes a new checkpoint with the next persist_revision', async () => {
    const r1fs = createFakeR1fs();
    const store = createCharacterCheckpointStore({ r1fs });

    r1fs.seed('cid-1', {
      persist_revision: 3,
      snapshot: { xp: 40 },
    });

    await expect(
      store.saveCharacterCheckpoint({
        cid: 'cid-1',
        persistRevision: 3,
        snapshot: { xp: 50 },
      }),
    ).resolves.toEqual({
      cid: 'cid-next-1',
      persist_revision: 4,
      snapshot: { xp: 50 },
    });
  });

  it('creates an initial checkpoint with normalized durable progression', async () => {
    const r1fs = createFakeR1fs();
    const store = createCharacterCheckpointStore({ r1fs });

    await expect(
      store.createInitialCharacterCheckpoint({
        characterName: 'First Warden',
        snapshot: {
          currency: 5,
          position: { x: 8, y: 3 },
        },
      }),
    ).resolves.toEqual({
      cid: 'cid-next-1',
      persist_revision: 0,
      snapshot: {
        name: 'First Warden',
        xp: 0,
        level: 0,
        inventory: [],
        equipment: {},
        currency: 5,
        quest_progress: {},
        skills: [],
        unlocks: [],
      },
    });
  });
});
