import * as http from 'node:http';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { issueAttachToken, verifyAttachToken } from '../../src/server/auth/attach-token';
import { createSessionHost } from '../../src/server/runtime/connection-manager';
import { ShardRuntime, type ShardRuntimeLike } from '../../src/server/runtime/shard-runtime';
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
  deferLoad?: boolean;
  deferHeartbeatWrite?: boolean;
  failLoad?: boolean;
  rejectClear?: boolean;
} = {}) {
  const events: string[] = [];
  const runtimeEvents: string[] = [];
  const leases = new Map<string, LeaseRecord>();
  const records = new Map<string, { persist_revision: number; snapshot: Record<string, unknown> }>();
  const sockets = new Set<WebSocket>();
  const loadRequests: Array<ReturnType<typeof createDeferred<void>>> = [];
  const writeRequests: Array<ReturnType<typeof createDeferred<void>>> = [];
  let nextConnectionNumber = 0;
  let writeCount = 0;
  const baseRuntime = new ShardRuntime();
  const shardRuntime = {
    addPlayer(character: Parameters<ShardRuntime['addPlayer']>[0]) {
      runtimeEvents.push(`add:${character.cid}`);
      baseRuntime.addPlayer(character);
    },
    removePlayer(characterId: string) {
      runtimeEvents.push(`remove:${characterId}`);
      baseRuntime.removePlayer(characterId);
    },
    movePlayer(characterId: string, direction: Parameters<ShardRuntime['movePlayer']>[1]) {
      runtimeEvents.push(`move:${characterId}:${direction}`);
      baseRuntime.movePlayer(characterId, direction);
    },
    snapshotFor(characterId: string) {
      return baseRuntime.snapshotFor(characterId);
    },
  } satisfies ShardRuntimeLike;

  const sessionHost = createSessionHost({
    nodeId: 'node-a',
    shardWorldInstanceId: 'shard-a',
    heartbeatGraceMs: 1_000,
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
  });

  records.set('cid-1', {
    persist_revision: 1,
    snapshot: {
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
    releaseHeartbeatWrite(index: number = 0) {
      const request = writeRequests[index];
      if (!request) {
        throw new Error(`Missing deferred heartbeat write at index ${index}`);
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
    expect(harness.events.indexOf('write:cid-1:conn-1')).toBeLessThan(harness.events.indexOf('load:cid-1'));

    socket.close();
  });

  it('treats the newest connection as authoritative', async () => {
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

    const takenOver = waitForSocketMessage(socket1, 'taken_over');
    const attached = waitForSocketMessage(socket2, 'attached');
    socket2.send(encode({ type: 'attach', attachToken: secondToken }));

    expect(await takenOver).toEqual({ type: 'taken_over' });
    expect(await attached).toMatchObject({
      type: 'attached',
      shardWorldInstanceId: 'shard-a',
    });
    expect(harness.runtimeEvents.filter((event) => event === 'add:cid-1')).toHaveLength(2);
    expect(harness.runtimeEvents.filter((event) => event === 'remove:cid-1')).toHaveLength(1);

    socket1.close();
    socket2.close();
  });

  it('closes the old socket after connection_id takeover', async () => {
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

    const takenOver = waitForSocketMessage(socket1, 'taken_over');
    const attached = waitForSocketMessage(socket2, 'attached');
    socket2.send(encode({ type: 'attach', attachToken: secondToken }));
    await attached;
    await takenOver;
    await waitForClose(socket1);

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

  it('does not let an older attach steal authority after a takeover during load', async () => {
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

    socket2.send(encode({ type: 'attach', attachToken: secondToken }));
    await waitForEventCount(harness.events, 'load:cid-1', 2);

    const secondAttached = waitForSocketMessage(socket2, 'attached');
    harness.releaseLoadAt(1);

    expect(await secondAttached).toMatchObject({
      type: 'attached',
      shardWorldInstanceId: 'shard-a',
    });

    const firstTakenOver = waitForSocketMessage(socket1, 'taken_over');
    harness.releaseLoadAt(0);

    expect(await firstTakenOver).toEqual({ type: 'taken_over' });

    socket1.close();
    socket2.close();
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
    harness = createHarness({ deferHeartbeatWrite: true, rejectClear: true });
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
    await waitForEventCount(harness.events, 'write_started:cid-1:conn-1', 1);

    socket.send(encode({ type: 'logout' }));
    await waitForClose(socket);

    harness.releaseHeartbeatWrite(0);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.runtimeEvents.filter((event) => event === 'remove:cid-1')).toHaveLength(1);
    expect(harness.clearEvents('cid-1', 'conn-1')).toBe(2);
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
    await waitForEventCount(harness.events, 'clear:cid-1:conn-1', 1);

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
    await waitForEventCount(harness.events, 'clear:cid-1:conn-1', 1);

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
      await waitForEventCount(harness.events, 'clear:cid-1:conn-1', 1);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(unhandledRejections).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandledRejection);
      socket.close();
    }
  });
});
