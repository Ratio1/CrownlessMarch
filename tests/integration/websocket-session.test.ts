import * as http from 'node:http';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { issueAttachToken, verifyAttachToken } from '../../src/server/auth/attach-token';
import { loadContentBundle, type ContentBundle } from '../../src/server/content/load-content';
import { createSessionHost } from '../../src/server/runtime/connection-manager';
import { ShardRuntime, type ShardRuntimeLike } from '../../src/server/runtime/shard-runtime';
import { buildInitialCharacterSnapshot } from '../../src/shared/domain/progression';
import type { PresenceLease } from '../../src/shared/domain/types';

jest.setTimeout(10_000);

type LeaseRecord = PresenceLease;

function encode(message: unknown) {
  return JSON.stringify(message);
}

function parseMessage(data: WebSocket.RawData) {
  return JSON.parse(data.toString('utf8')) as { type: string; [key: string]: unknown };
}

async function openSocket(url: string) {
  const socket = new WebSocket(url);
  await once(socket, 'open');
  return socket;
}

function waitForSocketMessage(socket: WebSocket, expectedType: string) {
  return new Promise<{ type: string; [key: string]: unknown }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${expectedType}`));
    }, 3_000);
    let closeTimer: NodeJS.Timeout | null = null;

    const onMessage = (data: WebSocket.RawData) => {
      const message = parseMessage(data);
      if (message.type !== expectedType) {
        return;
      }

      cleanup();
      resolve(message);
    };

    const onClose = () => {
      if (closeTimer) {
        return;
      }

      closeTimer = setTimeout(() => {
        cleanup();
        reject(new Error(`Socket closed before ${expectedType}`));
      }, 500);
    };

    function cleanup() {
      clearTimeout(timeout);
      if (closeTimer) {
        clearTimeout(closeTimer);
      }
      socket.off('message', onMessage);
      socket.off('close', onClose);
    }

    socket.on('message', onMessage);
    socket.on('close', onClose);
  });
}

function expectNoSocketMessage(socket: WebSocket, rejectedType: string, durationMs = 100) {
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off('message', onMessage);
      resolve();
    }, durationMs);

    const onMessage = (data: WebSocket.RawData) => {
      const message = parseMessage(data);
      if (message.type !== rejectedType) {
        return;
      }

      clearTimeout(timeout);
      socket.off('message', onMessage);
      reject(new Error(`Unexpected ${rejectedType} message`));
    };

    socket.on('message', onMessage);
  });
}

async function waitForClose(socket: WebSocket) {
  await once(socket, 'close');
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

async function waitForEventCount(events: string[], eventName: string, expectedCount: number) {
  const deadline = Date.now() + 3_000;

  while (events.filter((event) => event === eventName).length < expectedCount) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${eventName} x${expectedCount}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function createHarness(options: {
  content?: ContentBundle;
  deferLoad?: boolean;
  deferHeartbeatWrite?: boolean;
  deferProgressionPersist?: boolean;
  deferReadAt?: number[];
  deferClear?: boolean;
  failLoad?: boolean;
  leaseRefreshIntervalMs?: number;
  recordSnapshot?: Record<string, unknown>;
  rejectClear?: boolean;
} = {}) {
  const events: string[] = [];
  const runtimeEvents: string[] = [];
  const leases = new Map<string, LeaseRecord>();
  const records = new Map<string, { persist_revision: number; snapshot: Record<string, unknown> }>();
  const sockets = new Set<WebSocket>();
  const loadRequests: Array<ReturnType<typeof createDeferred<void>>> = [];
  const readRequests: Array<ReturnType<typeof createDeferred<void>>> = [];
  const writeRequests: Array<ReturnType<typeof createDeferred<void>>> = [];
  const persistRequests: Array<ReturnType<typeof createDeferred<void>>> = [];
  const clearRequests: Array<ReturnType<typeof createDeferred<void>>> = [];
  let nextConnectionNumber = 0;
  let readCount = 0;
  let writeCount = 0;
  const baseRuntime = new ShardRuntime({ content: options.content });
  const shardRuntime = {
    addPlayer(character: Parameters<ShardRuntime['addPlayer']>[0]) {
      runtimeEvents.push(`add:${character.cid}`);
      return baseRuntime.addPlayer(character);
    },
    removePlayer(characterId: string) {
      runtimeEvents.push(`remove:${characterId}`);
      baseRuntime.removePlayer(characterId);
    },
    movePlayer(characterId: string, direction: Parameters<ShardRuntime['movePlayer']>[1]) {
      runtimeEvents.push(`move:${characterId}:${direction}`);
      return baseRuntime.movePlayer(characterId, direction);
    },
    tickPlayer(characterId: string) {
      runtimeEvents.push(`tick:${characterId}`);
      return baseRuntime.tickPlayer(characterId);
    },
    queueOverride(characterId: string, command: string) {
      runtimeEvents.push(`override:${characterId}:${command}`);
      return baseRuntime.queueOverride(characterId, command);
    },
    commandPlayer(characterId: string, command: string) {
      runtimeEvents.push(`command:${characterId}:${command}`);
      return baseRuntime.commandPlayer(characterId, command);
    },
    snapshotFor(characterId: string) {
      return baseRuntime.snapshotFor(characterId);
    },
    markProgressionPersisted(characterId: string, nextCharacterId?: string) {
      runtimeEvents.push(`persisted:${characterId}:${nextCharacterId ?? characterId}`);
      baseRuntime.markProgressionPersisted(characterId, nextCharacterId);
    },
  } satisfies ShardRuntimeLike;

  const sessionHost = createSessionHost({
    nodeId: 'node-a',
    shardWorldInstanceId: 'shard-a',
    heartbeatGraceMs: 1_000,
    leaseRefreshIntervalMs: options.leaseRefreshIntervalMs,
    shardRuntime,
    now: () => Date.now(),
    createConnectionId: () => {
      nextConnectionNumber += 1;
      const connectionId = `conn-${nextConnectionNumber}`;
      events.push(`connection_id:${connectionId}`);
      return connectionId;
    },
    verifyAttachToken,
    readPresenceLease: async (characterId) => {
      readCount += 1;
      if (options.deferReadAt?.includes(readCount)) {
        events.push(`read_started:${readCount}:${characterId}`);
        const request = createDeferred<void>();
        readRequests.push(request);
        await request.promise;
      }

      events.push(`read:${characterId}`);
      return leases.get(characterId) ?? null;
    },
    writePresenceLease: async (characterId, lease) => {
      writeCount += 1;
      if (options.deferHeartbeatWrite && writeCount === 2) {
        events.push(`write_started:${characterId}:${lease.connection_id}`);
        const request = createDeferred<void>();
        writeRequests.push(request);
        await request.promise;
      }

      events.push(`write:${characterId}:${lease.connection_id}`);
      leases.set(characterId, lease);
      return lease;
    },
    clearPresenceLease: async (characterId, connectionId) => {
      events.push(`clear:${characterId}:${connectionId}`);
      if (options.rejectClear) {
        throw new Error('clear failed');
      }

      if (options.deferClear) {
        const request = createDeferred<void>();
        clearRequests.push(request);
        await request.promise;
      }

      const current = leases.get(characterId);
      if (!current || current.connection_id !== connectionId) {
        return false;
      }

      leases.delete(characterId);
      return true;
    },
    loadCharacterByCid: async (cid) => {
      events.push(`load:${cid}`);
      const request = createDeferred<void>();
      loadRequests.push(request);
      if (!options.deferLoad) {
        request.resolve();
      }

      await request.promise;
      if (options.failLoad) {
        throw new Error('load failed');
      }
      const current = records.get(cid);

      if (!current) {
        throw new Error(`Missing record for ${cid}`);
      }

      return {
        cid,
        persist_revision: current.persist_revision,
        snapshot: current.snapshot,
      };
    },
    persistProgression: async ({ accountId, connectionId, progression }) => {
      events.push(`persist_started:${accountId}:${connectionId}`);
      if (options.deferProgressionPersist) {
        const request = createDeferred<void>();
        persistRequests.push(request);
        await request.promise;
      }

      events.push(`persist:${accountId}:${connectionId}`);
      records.set('cid-1', {
        persist_revision: 2,
        snapshot: progression,
      });
      return {
        cid: 'cid-1',
        persist_revision: 2,
        snapshot: progression,
      };
    },
  });

  records.set('cid-1', {
    persist_revision: 1,
    snapshot: options.recordSnapshot ?? {
      name: 'Warden',
      position: { x: 3, y: 7 },
    },
  });

  const httpServer = http.createServer();
  const wss = new WebSocketServer({ noServer: true });
  sessionHost.bindWebSocketServer(wss);

  httpServer.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  return {
    events,
    runtimeEvents,
    sockets,
    readLease(characterId: string) {
      return leases.get(characterId) ?? null;
    },
    runtimeSnapshot(characterId: string) {
      return baseRuntime.snapshotFor(characterId);
    },
    clearEvents(characterId: string, connectionId: string) {
      return events.filter((event) => event === `clear:${characterId}:${connectionId}`).length;
    },
    releaseLoadAt(index: number) {
      const request = loadRequests[index];
      if (!request) {
        throw new Error(`Missing deferred load at index ${index}`);
      }

      request.resolve();
    },
    releaseRead(index: number = 0) {
      const request = readRequests[index];
      if (!request) {
        throw new Error(`Missing deferred read at index ${index}`);
      }

      request.resolve();
    },
    releaseHeartbeatWrite(index: number = 0) {
      const request = writeRequests[index];
      if (!request) {
        throw new Error(`Missing deferred heartbeat write at index ${index}`);
      }

      request.resolve();
    },
    releaseProgressionPersist(index: number = 0) {
      const request = persistRequests[index];
      if (!request) {
        throw new Error(`Missing deferred persist at index ${index}`);
      }

      request.resolve();
    },
    releaseClear(index: number = 0) {
      const request = clearRequests[index];
      if (!request) {
        throw new Error(`Missing deferred clear at index ${index}`);
      }

      request.resolve();
    },
    httpServer,
    trackSocket(socket: WebSocket) {
      sockets.add(socket);
      socket.once('close', () => {
        sockets.delete(socket);
      });
    },
    async listen() {
      await new Promise<void>((resolve) => {
        httpServer.listen(0, '127.0.0.1', () => resolve());
      });

      const address = httpServer.address();
      if (!address || typeof address === 'string') {
        throw new Error('Server failed to bind');
      }

      return `ws://127.0.0.1:${address.port}`;
    },
    close() {
      for (const socket of sockets) {
        socket.close();
      }

      wss.close();
      return new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    },
  };
}

async function issueToken(characterId: string) {
  const result = await issueAttachToken({
    accountId: 'account-1',
    characterId,
  });

  return result.token;
}

describe('websocket session host', () => {
  let harness: ReturnType<typeof createHarness> | null = null;

  beforeEach(() => {
    jest.useRealTimers();
    process.env.ATTACH_TOKEN_SECRET = 'test-attach-secret-0123456789012345';
  });

  afterEach(async () => {
    await harness?.close();
    harness = null;
    jest.useRealTimers();
  });

  it('claims a new connection_id before loading the PC', async () => {
    harness = createHarness();
    const url = await harness.listen();
    const socket = await openSocket(url);
    harness.trackSocket(socket);
    const token = await issueToken('cid-1');

    const attached = waitForSocketMessage(socket, 'attached');
    const state = waitForSocketMessage(socket, 'state');
    socket.send(encode({ type: 'attach', attachToken: token }));

    expect(await attached).toMatchObject({
      type: 'attached',
      shardWorldInstanceId: 'shard-a',
      character: {
        name: 'Warden',
      },
    });
    expect(await state).toMatchObject({
      type: 'state',
      state: {
        characters: {
          'cid-1': {
            cid: 'cid-1',
            name: 'Warden',
            position: {
              x: 3,
              y: 7,
            },
          },
        },
      },
    });
    expect(harness.runtimeEvents.filter((event) => event === 'add:cid-1')).toHaveLength(1);
    expect(harness.runtimeSnapshot('cid-1')).toMatchObject({
      characters: {
        'cid-1': {
          cid: 'cid-1',
          name: 'Warden',
          position: {
            x: 3,
            y: 7,
          },
        },
      },
    });
    expect(harness.events.indexOf('connection_id:conn-1')).toBeLessThan(harness.events.indexOf('load:cid-1'));
    expect(harness.events.indexOf('write:account-1:conn-1')).toBeLessThan(harness.events.indexOf('load:cid-1'));
    expect(harness.readLease('account-1')).toMatchObject({
      current_character_cid: 'cid-1',
    });

    socket.close();
  });

  it('rejects a second attach while the current session is active', async () => {
    harness = createHarness();
    const url = await harness.listen();
    const socket1 = await openSocket(url);
    const socket2 = await openSocket(url);
    harness.trackSocket(socket1);
    harness.trackSocket(socket2);
    const firstToken = await issueToken('cid-1');
    const secondToken = await issueToken('cid-1');

    socket1.send(encode({ type: 'attach', attachToken: firstToken }));
    await waitForSocketMessage(socket1, 'attached');

    const rejection = waitForSocketMessage(socket2, 'error');
    socket2.send(encode({ type: 'attach', attachToken: secondToken }));

    expect(await rejection).toEqual({ type: 'error', code: 'already_connected' });
    await waitForClose(socket2);
    expect(socket1.readyState).toBe(WebSocket.OPEN);
    expect(harness.runtimeEvents.filter((event) => event === 'add:cid-1')).toHaveLength(1);
    expect(harness.runtimeEvents.filter((event) => event === 'remove:cid-1')).toHaveLength(0);

    socket1.close();
  });

  it('allows a reconnect after explicit logout clears the active lease', async () => {
    harness = createHarness();
    const url = await harness.listen();
    const socket1 = await openSocket(url);
    const socket2 = await openSocket(url);
    harness.trackSocket(socket1);
    harness.trackSocket(socket2);
    const firstToken = await issueToken('cid-1');
    const secondToken = await issueToken('cid-1');

    socket1.send(encode({ type: 'attach', attachToken: firstToken }));
    await waitForSocketMessage(socket1, 'attached');

    socket1.send(encode({ type: 'logout' }));
    await waitForClose(socket1);

    const attached = waitForSocketMessage(socket2, 'attached');
    socket2.send(encode({ type: 'attach', attachToken: secondToken }));
    expect(await attached).toMatchObject({
      type: 'attached',
      shardWorldInstanceId: 'shard-a',
    });

    expect(harness.runtimeEvents.filter((event) => event === 'add:cid-1')).toHaveLength(2);
    expect(harness.runtimeEvents.filter((event) => event === 'remove:cid-1')).toHaveLength(1);

    socket2.close();
  });

  it('does not complete logout until the active lease clear finishes', async () => {
    harness = createHarness({ deferClear: true });
    const url = await harness.listen();
    const socket1 = await openSocket(url);
    const socket2 = await openSocket(url);
    harness.trackSocket(socket1);
    harness.trackSocket(socket2);
    const firstToken = await issueToken('cid-1');
    const secondToken = await issueToken('cid-1');

    socket1.send(encode({ type: 'attach', attachToken: firstToken }));
    await waitForSocketMessage(socket1, 'attached');

    socket1.send(encode({ type: 'logout' }));
    await waitForEventCount(harness.events, 'clear:account-1:conn-1', 1);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(socket1.readyState).toBe(WebSocket.OPEN);

    harness.releaseClear(0);
    await waitForClose(socket1);

    const attached = waitForSocketMessage(socket2, 'attached');
    socket2.send(encode({ type: 'attach', attachToken: secondToken }));
    expect(await attached).toMatchObject({
      type: 'attached',
      shardWorldInstanceId: 'shard-a',
    });

    socket2.close();
  });

  it('expires the session after heartbeat grace elapses', async () => {
    jest.useFakeTimers();

    harness = createHarness();
    const url = await harness.listen();
    const socket = await openSocket(url);
    harness.trackSocket(socket);
    const token = await issueToken('cid-1');

    socket.send(encode({ type: 'attach', attachToken: token }));
    await waitForSocketMessage(socket, 'attached');

    const expired = waitForSocketMessage(socket, 'session_expired');
    await jest.advanceTimersByTimeAsync(1_200);

    expect(await expired).toEqual({ type: 'session_expired' });
    await waitForClose(socket);
    expect(harness.runtimeEvents.filter((event) => event === 'add:cid-1')).toHaveLength(1);
    expect(harness.runtimeEvents.filter((event) => event === 'remove:cid-1')).toHaveLength(1);
    expect(harness.runtimeSnapshot('cid-1').characters).toEqual({});
  });

  it('throttles heartbeat lease writes inside the refresh interval', async () => {
    harness = createHarness();
    const url = await harness.listen();
    const socket = await openSocket(url);
    harness.trackSocket(socket);
    const token = await issueToken('cid-1');

    const attached = waitForSocketMessage(socket, 'attached');
    const initialState = waitForSocketMessage(socket, 'state');
    socket.send(encode({ type: 'attach', attachToken: token }));
    await attached;
    await initialState;

    const writesBeforeHeartbeat = harness.events.filter((event) => event === 'write:account-1:conn-1').length;
    socket.send(encode({ type: 'heartbeat' }));
    await expectNoSocketMessage(socket, 'state');

    expect(harness.events.filter((event) => event === 'write:account-1:conn-1')).toHaveLength(writesBeforeHeartbeat);
    expect(harness.runtimeEvents.filter((event) => event === 'tick:cid-1')).toHaveLength(1);

    socket.close();
  });

  it('sends quest turn-in movement state before slow progression persistence completes', async () => {
    const content = await loadContentBundle(process.cwd());
    harness = createHarness({
      content,
      deferProgressionPersist: true,
      recordSnapshot: {
        ...buildInitialCharacterSnapshot({
          name: 'Warden',
          classId: 'fighter',
          attributes: {
            strength: 15,
            dexterity: 13,
            constitution: 12,
            intelligence: 10,
            wisdom: 10,
            charisma: 8,
          },
          currency: 12,
          activeQuestIds: ['burn-the-first-nest'],
        }),
        position: { x: 6, y: 5 },
        quest_progress: {
          'burn-the-first-nest': {
            status: 'ready_to_turn_in',
            goblinsDefeated: 2,
            target: 2,
          },
        },
      },
    });
    const url = await harness.listen();
    const socket = await openSocket(url);
    harness.trackSocket(socket);
    const token = await issueToken('cid-1');

    const attached = waitForSocketMessage(socket, 'attached');
    const initialState = waitForSocketMessage(socket, 'state');
    socket.send(encode({ type: 'attach', attachToken: token }));
    await attached;
    await initialState;

    const movedState = waitForSocketMessage(socket, 'state');
    socket.send(encode({ type: 'move', direction: 'west' }));
    await waitForEventCount(harness.events, 'persist_started:account-1:conn-1', 1);

    expect((await movedState).state).toMatchObject({
      position: {
        x: 5,
        y: 5,
      },
      currentTile: {
        kind: 'grass',
      },
      character: {
        quests: [
          expect.objectContaining({
            id: 'secure-the-shrine-road',
            status: 'active',
          }),
        ],
      },
    });
    expect(harness.runtimeEvents.filter((event) => event === 'persisted:cid-1:cid-1')).toHaveLength(0);

    harness.releaseProgressionPersist();
    await waitForEventCount(harness.runtimeEvents, 'persisted:cid-1:cid-1', 1);

    socket.close();
  });

  it('refreshes the active lease under the account id after the refresh interval', async () => {
    harness = createHarness({ leaseRefreshIntervalMs: 0 });
    const url = await harness.listen();
    const socket = await openSocket(url);
    harness.trackSocket(socket);
    const token = await issueToken('cid-1');

    const attached = waitForSocketMessage(socket, 'attached');
    socket.send(encode({ type: 'attach', attachToken: token }));
    await attached;

    const beforeHeartbeat = harness.readLease('account-1');
    expect(beforeHeartbeat).not.toBeNull();

    socket.send(encode({ type: 'heartbeat' }));

    await waitForEventCount(harness.events, 'write:account-1:conn-1', 2);

    const afterHeartbeat = harness.readLease('account-1');
    expect(afterHeartbeat).toMatchObject({
      connection_id: 'conn-1',
      current_character_cid: 'cid-1',
    });
    expect(afterHeartbeat?.lease_expires_at).not.toEqual(beforeHeartbeat?.lease_expires_at);
    expect(harness.readLease('cid-1')).toBeNull();

    socket.close();
  });

  it('serializes heartbeat handling so a slow lease read cannot start duplicate refreshes', async () => {
    harness = createHarness({ deferReadAt: [4], leaseRefreshIntervalMs: 0 });
    const url = await harness.listen();
    const socket = await openSocket(url);
    harness.trackSocket(socket);
    const token = await issueToken('cid-1');

    const attached = waitForSocketMessage(socket, 'attached');
    const initialState = waitForSocketMessage(socket, 'state');
    socket.send(encode({ type: 'attach', attachToken: token }));
    await attached;
    await initialState;

    socket.send(encode({ type: 'heartbeat' }));
    await waitForEventCount(harness.events, 'read_started:4:account-1', 1);

    socket.send(encode({ type: 'heartbeat' }));
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(harness.events.filter((event) => event.startsWith('read_started:'))).toEqual([
      'read_started:4:account-1',
    ]);
    expect(harness.runtimeEvents.filter((event) => event === 'tick:cid-1')).toHaveLength(0);

    harness.releaseRead(0);
    await waitForEventCount(harness.runtimeEvents, 'tick:cid-1', 2);

    socket.close();
  });

  it('rejects a reconnect attempt while the first attach is still loading', async () => {
    harness = createHarness({ deferLoad: true });
    const url = await harness.listen();
    const socket1 = await openSocket(url);
    const socket2 = await openSocket(url);
    harness.trackSocket(socket1);
    harness.trackSocket(socket2);
    const firstToken = await issueToken('cid-1');
    const secondToken = await issueToken('cid-1');

    socket1.send(encode({ type: 'attach', attachToken: firstToken }));
    await waitForEventCount(harness.events, 'load:cid-1', 1);

    const secondRejected = waitForSocketMessage(socket2, 'error');
    socket2.send(encode({ type: 'attach', attachToken: secondToken }));
    harness.releaseLoadAt(0);

    expect(await waitForSocketMessage(socket1, 'attached')).toMatchObject({
      type: 'attached',
      shardWorldInstanceId: 'shard-a',
    });
    expect(await secondRejected).toEqual({ type: 'error', code: 'already_connected' });
    await waitForClose(socket2);
    expect(harness.events.filter((event) => event === 'load:cid-1')).toHaveLength(1);

    socket1.close();
  });

  it('removes the PC from the shard runtime on explicit logout', async () => {
    harness = createHarness();
    const url = await harness.listen();
    const socket = await openSocket(url);
    harness.trackSocket(socket);
    const token = await issueToken('cid-1');

    const attached = waitForSocketMessage(socket, 'attached');
    socket.send(encode({ type: 'attach', attachToken: token }));
    await attached;

    socket.send(encode({ type: 'logout' }));
    await waitForClose(socket);

    expect(harness.runtimeEvents.filter((event) => event === 'add:cid-1')).toHaveLength(1);
    expect(harness.runtimeEvents.filter((event) => event === 'remove:cid-1')).toHaveLength(1);
    expect(harness.runtimeSnapshot('cid-1').characters).toEqual({});
  });

  it('clears the ended session lease even if a heartbeat write resolves after logout', async () => {
    harness = createHarness({ deferHeartbeatWrite: true, leaseRefreshIntervalMs: 0, rejectClear: true });
    const url = await harness.listen();
    const socket = await openSocket(url);
    harness.trackSocket(socket);
    const token = await issueToken('cid-1');
    const messages: Array<{ type: string; [key: string]: unknown }> = [];

    socket.on('message', (data) => {
      messages.push(parseMessage(data));
    });

    socket.send(encode({ type: 'attach', attachToken: token }));
    await waitForSocketMessage(socket, 'attached');

    socket.send(encode({ type: 'heartbeat' }));
    await waitForEventCount(harness.events, 'write_started:account-1:conn-1', 1);

    socket.send(encode({ type: 'logout' }));
    await waitForClose(socket);

    harness.releaseHeartbeatWrite(0);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.runtimeEvents.filter((event) => event === 'remove:cid-1')).toHaveLength(1);
    expect(harness.clearEvents('account-1', 'conn-1')).toBeGreaterThanOrEqual(1);
    expect(messages.some((message) => message.type === 'error')).toBe(false);
  });

  it('clears a pending lease when attach fails after the lease write', async () => {
    harness = createHarness({ deferLoad: true, failLoad: true });
    const url = await harness.listen();
    const socket = await openSocket(url);
    harness.trackSocket(socket);
    const token = await issueToken('cid-1');

    socket.send(encode({ type: 'attach', attachToken: token }));
    await waitForEventCount(harness.events, 'load:cid-1', 1);
    harness.releaseLoadAt(0);

    expect(await waitForSocketMessage(socket, 'error')).toEqual({ type: 'error', code: 'attach_failed' });
    await waitForEventCount(harness.events, 'clear:account-1:conn-1', 1);

    expect(harness.readLease('cid-1')).toBeNull();

    socket.close();
  });

  it('clears a pending lease when the socket closes before attach finishes', async () => {
    harness = createHarness({ deferLoad: true });
    const url = await harness.listen();
    const socket = await openSocket(url);
    harness.trackSocket(socket);
    const token = await issueToken('cid-1');

    socket.send(encode({ type: 'attach', attachToken: token }));
    await waitForEventCount(harness.events, 'load:cid-1', 1);

    socket.close();
    await waitForClose(socket);
    harness.releaseLoadAt(0);
    await waitForEventCount(harness.events, 'clear:account-1:conn-1', 1);

    expect(harness.readLease('cid-1')).toBeNull();
  });

  it('swallows pending lease cleanup failures on socket close', async () => {
    harness = createHarness({ deferLoad: true, rejectClear: true });
    const url = await harness.listen();
    const socket = await openSocket(url);
    harness.trackSocket(socket);
    const token = await issueToken('cid-1');
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown) => {
      unhandledRejections.push(reason);
    };

    process.on('unhandledRejection', onUnhandledRejection);

    try {
      socket.send(encode({ type: 'attach', attachToken: token }));
      await waitForEventCount(harness.events, 'load:cid-1', 1);

      socket.close();
      await waitForClose(socket);
      harness.releaseLoadAt(0);
      await waitForEventCount(harness.events, 'clear:account-1:conn-1', 1);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
      socket.close();
    }
  });
});
