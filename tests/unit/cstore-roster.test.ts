import {
  createRosterStore,
  getRosterHkey,
  parseRosterEntry,
  type ThornwritheRosterEntry,
} from '../../src/server/platform/cstore-roster';

class InMemoryCStore {
  private readonly hsets = new Map<string, Map<string, string | null>>();

  async hset(request: { hkey: string; key: string; value: string | null }) {
    let row = this.hsets.get(request.hkey);
    if (!row) {
      row = new Map<string, string | null>();
      this.hsets.set(request.hkey, row);
    }

    row.set(request.key, request.value);
    return true;
  }

  async hget(request: { hkey: string; key: string }) {
    return this.hsets.get(request.hkey)?.get(request.key) ?? null;
  }

  async hgetall(request: { hkey: string }) {
    return Object.fromEntries(this.hsets.get(request.hkey)?.entries() ?? []);
  }

  async hsync(request: { hkey: string }) {
    return {
      hkey: request.hkey,
      merged_fields: 0,
    };
  }
}

function createEntry(overrides: Partial<ThornwritheRosterEntry> = {}): ThornwritheRosterEntry {
  return {
    version: 1,
    accountId: 'warden@test.invalid',
    email: 'warden@test.invalid',
    characterName: 'First Warden',
    latestCharacterCid: 'cid-latest',
    persistRevision: 4,
    registeredAt: '2026-04-21T18:00:00.000Z',
    lastPersistedAt: '2026-04-21T18:10:00.000Z',
    ...overrides,
  };
}

describe('durable roster store', () => {
  it('uses an explicit pcs hset suffix', () => {
    expect(getRosterHkey('thornwrithe-d_ef7d156')).toBe('thornwrithe-thornwrithe-d_ef7d156:pcs');
  });

  it('writes and reads durable roster rows keyed by account id', async () => {
    const cstore = new InMemoryCStore();
    const store = createRosterStore({ cstore, gameId: 'thornwrithe-v1' });
    const entry = createEntry();

    await store.writeRosterEntry(entry.accountId, entry);

    await expect(store.readRosterEntry(entry.accountId)).resolves.toEqual(entry);
    await expect(cstore.hgetall({ hkey: getRosterHkey('thornwrithe-v1') })).resolves.toEqual({
      'warden@test.invalid': JSON.stringify({
        version: 1,
        account_id: 'warden@test.invalid',
        email: 'warden@test.invalid',
        character_name: 'First Warden',
        latest_character_cid: 'cid-latest',
        persist_revision: 4,
        registered_at: '2026-04-21T18:00:00.000Z',
        last_persisted_at: '2026-04-21T18:10:00.000Z',
      }),
    });
  });

  it('rejects malformed roster payloads', () => {
    expect(() => parseRosterEntry('{"email":"broken@test.invalid"}')).toThrow('Invalid Thornwrithe roster entry');
  });
});
