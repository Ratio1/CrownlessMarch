import type { PresenceLease } from '../../src/shared/domain/types';

class InMemoryCStore {
  private readonly hsets = new Map<string, Map<string, string | null>>();

  seed(hkey: string, rows: Record<string, string | null>) {
    this.hsets.set(hkey, new Map(Object.entries(rows)));
  }

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
    return { hkey: request.hkey, merged_fields: 0 };
  }
}

class InMemoryR1fs {
  private readonly rows = new Map<string, { file_data: Record<string, unknown> }>();

  seed(cid: string, payload: Record<string, unknown>) {
    this.rows.set(cid, { file_data: payload });
  }

  async addJson(): Promise<{ cid: string }> {
    throw new Error('not implemented');
  }

  async addYaml(): Promise<{ cid: string }> {
    throw new Error('not implemented');
  }

  async getYaml(request: { cid: string }) {
    const row = this.rows.get(request.cid);

    if (!row) {
      throw new Error(`Missing R1FS row for ${request.cid}`);
    }

    return row;
  }
}

function createPresenceLease(overrides: Partial<PresenceLease> = {}): PresenceLease {
  return {
    current_character_cid: 'cid-b',
    shard_world_instance_id: 'shard-b',
    session_host_node_id: 'node-b',
    connection_id: 'conn-b',
    position: { x: 0, y: 0 },
    buffs_debuffs: [],
    lease_expires_at: '2026-04-21T18:43:01.000Z',
    last_persisted_at: '2026-04-21T18:42:11.000Z',
    persist_revision: 7,
    ...overrides,
  };
}

describe('admin dashboard loader', () => {
  it('joins roster rows, presence rows, and R1FS snapshots sorted by character name', async () => {
    const { getPresenceHkey } = await import('../../src/server/platform/cstore-presence');
    const { getRosterHkey } = await import('../../src/server/platform/cstore-roster');
    const { loadAdminDashboardData } = await import('../../src/server/admin/dashboard');

    const cstore = new InMemoryCStore();
    const r1fs = new InMemoryR1fs();

    cstore.seed(getRosterHkey('thornwrithe-v1'), {
      'bramble@test.invalid': JSON.stringify({
        version: 1,
        account_id: 'bramble@test.invalid',
        email: 'bramble@test.invalid',
        character_name: 'Bramble',
        latest_character_cid: 'cid-b',
        persist_revision: 7,
        registered_at: '2026-04-21T18:00:00.000Z',
        last_persisted_at: '2026-04-21T18:42:11.000Z',
      }),
      'alder@test.invalid': JSON.stringify({
        version: 1,
        account_id: 'alder@test.invalid',
        email: 'alder@test.invalid',
        character_name: 'Alder',
        latest_character_cid: 'cid-a',
        persist_revision: 3,
        registered_at: '2026-04-21T17:00:00.000Z',
        last_persisted_at: '2026-04-21T17:30:00.000Z',
      }),
    });
    cstore.seed(getPresenceHkey('thornwrithe-v1'), {
      'bramble@test.invalid': JSON.stringify(createPresenceLease()),
    });
    r1fs.seed('cid-a', {
      persist_revision: 3,
      snapshot: {
        name: 'Alder',
        level: 2,
      },
    });
    r1fs.seed('cid-b', {
      persist_revision: 7,
      snapshot: {
        name: 'Bramble',
        level: 4,
      },
    });

    const data = await loadAdminDashboardData({
      gameId: 'thornwrithe-v1',
      cstore,
      r1fs,
    });

    expect(data.characters.map((row) => row.characterName)).toEqual(['Alder', 'Bramble']);
    expect(data.characters[0]).toMatchObject({
      accountId: 'alder@test.invalid',
      online: false,
      latestCharacterCid: 'cid-a',
      snapshot: {
        name: 'Alder',
        level: 2,
      },
    });
    expect(data.characters[1]).toMatchObject({
      accountId: 'bramble@test.invalid',
      online: true,
      latestCharacterCid: 'cid-b',
      presence: {
        session_host_node_id: 'node-b',
      },
      snapshot: {
        name: 'Bramble',
        level: 4,
      },
    });
  });

  it('keeps rendering when one roster row is malformed or its snapshot cannot be loaded', async () => {
    const { getPresenceHkey } = await import('../../src/server/platform/cstore-presence');
    const { getRosterHkey } = await import('../../src/server/platform/cstore-roster');
    const { loadAdminDashboardData } = await import('../../src/server/admin/dashboard');

    const cstore = new InMemoryCStore();
    const r1fs = new InMemoryR1fs();

    cstore.seed(getRosterHkey('thornwrithe-v1'), {
      bad: '{"email":"bad@test.invalid"}',
      'good@test.invalid': JSON.stringify({
        version: 1,
        account_id: 'good@test.invalid',
        email: 'good@test.invalid',
        character_name: 'Good Warden',
        latest_character_cid: 'cid-missing',
        persist_revision: 1,
        registered_at: '2026-04-21T18:00:00.000Z',
        last_persisted_at: '2026-04-21T18:00:00.000Z',
      }),
    });
    cstore.seed(getPresenceHkey('thornwrithe-v1'), {});

    const data = await loadAdminDashboardData({
      gameId: 'thornwrithe-v1',
      cstore,
      r1fs,
    });

    expect(data.rosterRows).toHaveLength(2);
    expect(data.rosterRows.find((row) => row.key === 'bad')).toMatchObject({
      key: 'bad',
      status: 'error',
    });
    expect(data.characters).toHaveLength(1);
    expect(data.characters[0]).toMatchObject({
      accountId: 'good@test.invalid',
      snapshotError: expect.stringContaining('Missing R1FS row'),
    });
  });
});
