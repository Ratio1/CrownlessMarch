import { createPresenceLeaseStore, getPresenceHkey } from '../../src/server/platform/cstore-presence';
import type { PresenceLease } from '../../src/shared/domain/types';

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

function createLease(overrides: Partial<PresenceLease> = {}): PresenceLease {
  return {
    current_character_cid: 'cid-001',
    shard_world_instance_id: 'shard-a',
    session_host_node_id: 'node-a',
    connection_id: 'conn-a',
    position: { x: 10, y: 20 },
    buffs_debuffs: ['blessed'],
    lease_expires_at: '2026-04-20T12:00:15.000Z',
    last_persisted_at: null,
    persist_revision: 1,
    ...overrides,
  };
}

describe('presence lease store', () => {
  it('writes one CStore field per character', async () => {
    const cstore = new InMemoryCStore();
    const store = createPresenceLeaseStore({ cstore, gameId: 'thornwrithe-v1' });

    await store.writePresenceLease('char-1', createLease());
    await store.writePresenceLease(
      'char-2',
      createLease({
        current_character_cid: 'cid-002',
        connection_id: 'conn-b',
      })
    );

    expect(await cstore.hgetall({ hkey: getPresenceHkey('thornwrithe-v1') })).toEqual({
      'char-1': JSON.stringify(createLease()),
      'char-2': JSON.stringify(
        createLease({
          current_character_cid: 'cid-002',
          connection_id: 'conn-b',
        })
      ),
    });
  });

  it('overwrites the lease row when the same character reconnects', async () => {
    const cstore = new InMemoryCStore();
    const store = createPresenceLeaseStore({ cstore, gameId: 'thornwrithe-v1' });

    await store.writePresenceLease('char-1', createLease());

    const reconnectLease = createLease({
      current_character_cid: 'cid-009',
      shard_world_instance_id: 'shard-b',
      session_host_node_id: 'node-b',
      connection_id: 'conn-reconnect',
      persist_revision: 2,
    });

    await store.writePresenceLease('char-1', reconnectLease);

    expect(await store.readPresenceLease('char-1')).toEqual(reconnectLease);
    expect(await cstore.hgetall({ hkey: getPresenceHkey('thornwrithe-v1') })).toEqual({
      'char-1': JSON.stringify(reconnectLease),
    });
  });

  it('refreshes lease_expires_at on heartbeat', async () => {
    const cstore = new InMemoryCStore();
    const store = createPresenceLeaseStore({ cstore, gameId: 'thornwrithe-v1' });

    const initialLease = createLease({
      lease_expires_at: '2026-04-20T12:00:15.000Z',
    });

    await store.writePresenceLease('char-1', initialLease);

    const refreshedLease = createLease({
      lease_expires_at: '2026-04-20T12:00:30.000Z',
    });

    await store.writePresenceLease('char-1', refreshedLease);

    expect(await store.readPresenceLease('char-1')).toEqual(refreshedLease);
  });
});
