import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import crypto from 'node:crypto';
import next from 'next';
import { WebSocketServer } from 'ws';
import { verifyAttachToken } from './src/server/auth/attach-token';
import { createSessionHost } from './src/server/runtime/connection-manager';
import { createPresenceLeaseStore } from './src/server/platform/cstore-presence';
import { readRosterEntry, writeRosterEntry } from './src/server/platform/cstore-roster';
import { createCharacterCheckpointStore } from './src/server/platform/r1fs-characters';
import { getRatio1ServerClient } from './src/server/platform/ratio1';
import { resolveThornwritheNodeId } from './src/server/platform/runtime-env';
import { createPersistenceService } from './src/server/runtime/persistence-service';
import { ShardRuntime } from './src/server/runtime/shard-runtime';
import { loadContentBundle } from './src/server/content/load-content';

const REQUIRED_RUNTIME_ENV = ['THORNWRITHE_GAME_ID', 'SESSION_SECRET', 'ATTACH_TOKEN_SECRET'] as const;

function preloadStandaloneConfig() {
  if (process.env.NODE_ENV !== 'production' || process.env.__NEXT_PRIVATE_STANDALONE_CONFIG) {
    return;
  }

  const manifestPath = path.join(process.cwd(), '.next', 'required-server-files.json');

  if (!fs.existsSync(manifestPath)) {
    return;
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    config?: unknown;
  };

  if (manifest.config) {
    process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(manifest.config);
  }
}

function resolveGameplayPath() {
  return process.env.THORNWRITHE_WEBSOCKET_PATH ?? '/ws';
}

function getHeartbeatGraceMs() {
  return Number(process.env.THORNWRITHE_LEASE_GRACE_MS ?? '60000');
}

function getShardWorldInstanceId() {
  return process.env.THORNWRITHE_SHARD_WORLD_INSTANCE_ID ?? resolveThornwritheNodeId() ?? 'thornwrithe-shard';
}

async function syncPresenceHsetForStartup(presenceStore: ReturnType<typeof createPresenceLeaseStore>) {
  try {
    await presenceStore.syncPresenceHset();
  } catch (error) {
    console.warn('[thornwrithe] startup presence sync failed; continuing with lazy CStore writes', error);
  }
}

function hasGameId(env: NodeJS.ProcessEnv) {
  return Boolean(env.THORNWRITHE_GAME_ID?.trim() || env.R1EN_CSTORE_AUTH_HKEY?.trim());
}

function hasSessionSecret(env: NodeJS.ProcessEnv) {
  return Boolean(env.SESSION_SECRET?.trim() || env.R1EN_CSTORE_AUTH_SECRET?.trim());
}

function hasAttachTokenSecret(env: NodeJS.ProcessEnv) {
  return Boolean(env.ATTACH_TOKEN_SECRET?.trim() || env.R1EN_CSTORE_AUTH_SECRET?.trim() || env.SESSION_SECRET?.trim());
}

export function assertRequiredRuntimeEnv(env: NodeJS.ProcessEnv = process.env) {
  const missing = REQUIRED_RUNTIME_ENV.filter((key) => {
    if (key === 'THORNWRITHE_GAME_ID') {
      return !hasGameId(env);
    }

    if (key === 'SESSION_SECRET') {
      return !hasSessionSecret(env);
    }

    if (key === 'ATTACH_TOKEN_SECRET') {
      return !hasAttachTokenSecret(env);
    }

    return !env[key];
  });

  if (missing.length > 0) {
    throw new Error(`Missing required Thornwrithe runtime env: ${missing.join(', ')}`);
  }
}

export async function createServer() {
  assertRequiredRuntimeEnv();
  preloadStandaloneConfig();

  const nextApp = next({
    dev: process.env.NODE_ENV !== 'production',
  });

  await nextApp.prepare();

  const requestHandler = nextApp.getRequestHandler();
  const httpServer = http.createServer((req, res) => {
    void requestHandler(req, res);
  });
  const wss = new WebSocketServer({ noServer: true });
  const content = await loadContentBundle(process.cwd());
  const ratio1 = getRatio1ServerClient();
  const presenceStore = createPresenceLeaseStore({ cstore: ratio1.cstore });
  await syncPresenceHsetForStartup(presenceStore);
  const characterStore = createCharacterCheckpointStore({ r1fs: ratio1.r1fs });
  const shardRuntime = new ShardRuntime({ content });
  const persistenceService = createPersistenceService({
    nodeId: resolveThornwritheNodeId(),
    readPresenceLease: presenceStore.readPresenceLease,
    writePresenceLease: presenceStore.writePresenceLease,
    saveCharacterCheckpoint: characterStore.saveCharacterCheckpoint,
  });
  const sessionHost = createSessionHost({
    nodeId: resolveThornwritheNodeId(),
    shardWorldInstanceId: getShardWorldInstanceId(),
    heartbeatGraceMs: getHeartbeatGraceMs(),
    shardRuntime,
    verifyAttachToken,
    readPresenceLease: presenceStore.readPresenceLease,
    writePresenceLease: presenceStore.writePresenceLease,
    clearPresenceLease: presenceStore.clearPresenceLease,
    loadCharacterByCid: characterStore.loadCharacterByCid,
    persistProgression: async ({ accountId, connectionId, progression }) => {
      const saved = await persistenceService.persistProgression({
        characterId: accountId,
        connectionId,
        progression,
      });
      const rosterEntry = await readRosterEntry(accountId);

      if (rosterEntry) {
        await writeRosterEntry(accountId, {
          ...rosterEntry,
          latestCharacterCid: saved.cid,
          persistRevision: saved.persist_revision,
          lastPersistedAt: new Date().toISOString(),
        });
      }

      return saved;
    },
    createConnectionId: () => crypto.randomUUID(),
  });

  sessionHost.bindWebSocketServer(wss);

  httpServer.on('upgrade', (request, socket, head) => {
    const requestUrl = new URL(request.url ?? '/', 'http://localhost');

    if (requestUrl.pathname !== resolveGameplayPath()) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  return {
    httpServer,
    nextApp,
    sessionHost,
    wss,
  };
}

if (require.main === module) {
  void createServer().then(({ httpServer }) => {
    const port = Number(process.env.PORT ?? 3000);

    httpServer.listen(port, () => {
      console.log(`Thornwrithe listening on ${port}`);
    });
  });
}
