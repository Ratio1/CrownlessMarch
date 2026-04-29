import * as http from 'node:http';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { verifyAttachToken } from '../../src/server/auth/attach-token';
import { createSessionHost } from '../../src/server/runtime/connection-manager';
import { ShardRuntime, type ShardRuntimeLike } from '../../src/server/runtime/shard-runtime';
import type { PresenceLease } from '../../src/shared/domain/types';

jest.setTimeout(10_000);

function jsonRequest(url: string, body: unknown, headers?: Record<string, string>) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function parseMessage(data: WebSocket.RawData) {
  return JSON.parse(data.toString('utf8')) as { type: string; [key: string]: unknown };
}

function waitForMessage(socket: WebSocket, expectedType: string) {
  return new Promise<{ type: string; [key: string]: unknown }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${expectedType}`));
    }, 3_000);

    function onMessage(data: WebSocket.RawData) {
      const message = parseMessage(data);

      if (message.type !== expectedType) {
        return;
      }

      cleanup();
      resolve(message);
    }

    function cleanup() {
      clearTimeout(timeout);
      socket.off('message', onMessage);
    }

    socket.on('message', onMessage);
  });
}

async function openSocket(url: string) {
  const socket = new WebSocket(url);
  await once(socket, 'open');
  return socket;
}

function createSmokeHarness() {
  const leases = new Map<string, PresenceLease>();
  const records = new Map<string, { persist_revision: number; snapshot: Record<string, unknown> }>();
  const runtime = new ShardRuntime();
  const shardRuntime: ShardRuntimeLike = {
    addPlayer(character) {
      return runtime.addPlayer(character);
    },
    removePlayer(characterId) {
      runtime.removePlayer(characterId);
    },
    movePlayer(characterId, direction) {
      return runtime.movePlayer(characterId, direction);
    },
    tickPlayer(characterId) {
      return runtime.tickPlayer(characterId);
    },
    queueOverride(characterId, command) {
      return runtime.queueOverride(characterId, command);
    },
    commandPlayer(characterId, command) {
      return runtime.commandPlayer(characterId, command);
    },
    snapshotFor(characterId) {
      return runtime.snapshotFor(characterId);
    },
    markProgressionPersisted(characterId, nextCharacterId) {
      runtime.markProgressionPersisted(characterId, nextCharacterId);
    },
  };
  const httpServer = http.createServer();
  const wss = new WebSocketServer({ noServer: true });
  const sessionHost = createSessionHost({
    nodeId: 'node-a',
    shardWorldInstanceId: 'shard-a',
    heartbeatGraceMs: 1_000,
    shardRuntime,
    now: () => Date.now(),
    verifyAttachToken,
    readPresenceLease: async (characterId) => leases.get(characterId) ?? null,
    writePresenceLease: async (characterId, lease) => {
      leases.set(characterId, lease);
      return lease;
    },
    clearPresenceLease: async (characterId, connectionId) => {
      const current = leases.get(characterId);

      if (!current || current.connection_id !== connectionId) {
        return false;
      }

      leases.delete(characterId);
      return true;
    },
    loadCharacterByCid: async (cid) => {
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

  sessionHost.bindWebSocketServer(wss);

  httpServer.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');

    if (requestUrl.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  return {
    seedCharacter(cid: string, snapshot: Record<string, unknown>) {
      records.set(cid, {
        persist_revision: 1,
        snapshot,
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
    async close() {
      wss.close();
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    },
  };
}

function extractCookieValue(setCookieHeader: string, name: string) {
  const match = setCookieHeader.match(new RegExp(`${name}=([^;]+)`));

  if (!match) {
    throw new Error(`Missing cookie ${name}`);
  }

  return match[1];
}

describe('first session smoke', () => {
  const baseUrl = 'http://thornwrithe.test';
  let harness: ReturnType<typeof createSmokeHarness> | null = null;

  beforeEach(() => {
    jest.resetModules();
    delete process.env.R1EN_CSTORE_AUTH_HKEY;
    delete process.env.R1EN_CSTORE_AUTH_SECRET;
    delete process.env.R1EN_CSTORE_AUTH_BOOTSTRAP_ADMIN_PWD;
    delete process.env.EE_CSTORE_AUTH_HKEY;
    delete process.env.EE_CSTORE_AUTH_SECRET;
    process.env.SESSION_SECRET = 'test-session-secret-0123456789012345';
    process.env.ATTACH_TOKEN_SECRET = 'test-attach-secret-0123456789012345';
  });

  beforeEach(async () => {
    (await import('../../src/server/auth/account-service')).__resetAccountsForTests();
    (await import('../../src/server/auth/email-verification')).__resetEmailVerificationForTests();
    (await import('../../src/server/platform/r1fs-characters')).__resetCharacterCheckpointStoreForTests();
    (await import('../../src/server/platform/cstore-roster')).__resetRosterStoreForTests();
  });

  afterEach(async () => {
    await harness?.close();
    harness = null;
  });

  it('registers, logs in, mints an attach token, opens /ws, and receives the first shard snapshot', async () => {
    const registerRoute = await import('../../app/api/auth/register/route');
    const loginRoute = await import('../../app/api/auth/login/route');
    const verifyRoute = await import('../../app/api/auth/verify/route');
    const createCharacterRoute = await import('../../app/api/characters/route');
    const attachRoute = await import('../../app/api/auth/attach/route');
    const session = await import('../../src/server/auth/session');

    const registerResponse = await registerRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/register`, {
        email: 'first-session@test.invalid',
        password: 'hunter234',
      })
    );

    expect(registerResponse.status).toBe(201);

    const registeredAccount = (await registerResponse.json()) as {
      verificationToken?: string;
    };

    const loginResponse = await loginRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/login`, {
        email: 'first-session@test.invalid',
        password: 'hunter234',
      })
    );

    expect(loginResponse.status).toBe(403);

    const verifyResponse = await verifyRoute.GET(
      new Request(`${baseUrl}/api/auth/verify?token=${encodeURIComponent(registeredAccount.verificationToken ?? '')}`, {
        method: 'GET',
      })
    );

    expect(verifyResponse.status).toBe(302);

    const verifiedLoginResponse = await loginRoute.POST(
      jsonRequest(`${baseUrl}/api/auth/login`, {
        email: 'first-session@test.invalid',
        password: 'hunter234',
      })
    );

    expect(verifiedLoginResponse.status).toBe(200);

    const setCookie = verifiedLoginResponse.headers.get('set-cookie');
    expect(setCookie).toContain(`${session.SESSION_COOKIE_NAME}=`);

    const sessionToken = extractCookieValue(setCookie ?? '', session.SESSION_COOKIE_NAME);
    const createCharacterResponse = await createCharacterRoute.POST(
      jsonRequest(
        `${baseUrl}/api/characters`,
        {
          name: 'First Warden',
          classId: 'fighter',
          attributes: {
            strength: 15,
            dexterity: 14,
            constitution: 11,
            intelligence: 10,
            wisdom: 9,
            charisma: 8,
          },
        },
        { cookie: `${session.SESSION_COOKIE_NAME}=${sessionToken}` }
      )
    );

    expect(createCharacterResponse.status).toBe(201);

    const characterBody = (await createCharacterResponse.json()) as {
      character?: { cid?: string; name?: string };
    };
    const upgradedCookie = createCharacterResponse.headers.get('set-cookie');
    const upgradedSessionToken = extractCookieValue(upgradedCookie ?? '', session.SESSION_COOKIE_NAME);

    harness = createSmokeHarness();
    harness.seedCharacter(characterBody.character?.cid ?? '', {
      name: 'First Warden',
      classId: 'fighter',
      position: { x: 3, y: 7 },
    });

    const wsBaseUrl = await harness.listen();

    const attachResponse = await attachRoute.POST(
      jsonRequest(
        `${baseUrl}/api/auth/attach`,
        {},
        { cookie: `${session.SESSION_COOKIE_NAME}=${upgradedSessionToken}` }
      )
    );

    expect(attachResponse.status).toBe(200);

    const attachBody = (await attachResponse.json()) as { attachToken: string };
    const attachPayload = await verifyAttachToken(attachBody.attachToken);

    expect(attachPayload).toMatchObject({
      accountId: 'first-session@test.invalid',
      characterId: characterBody.character?.cid,
    });

    const socket = await openSocket(`${wsBaseUrl}/ws`);
    const attached = waitForMessage(socket, 'attached');
    const state = waitForMessage(socket, 'state');

    socket.send(JSON.stringify({ type: 'attach', attachToken: attachBody.attachToken }));

    expect(await attached).toMatchObject({
      type: 'attached',
      shardWorldInstanceId: 'shard-a',
      character: {
        name: 'First Warden',
      },
    });

    expect(await state).toMatchObject({
      type: 'state',
      state: {
        characters: {
          [attachPayload.characterId]: {
            cid: attachPayload.characterId,
            name: 'First Warden',
            position: {
              x: 3,
              y: 7,
            },
          },
        },
      },
    });

    socket.close();
  });
});
