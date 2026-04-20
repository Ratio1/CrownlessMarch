import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import crypto from 'node:crypto';
import next from 'next';
import { WebSocketServer } from 'ws';
import { verifyAttachToken } from './src/server/auth/attach-token';
import { createSessionHost } from './src/server/runtime/connection-manager';
import { createPresenceLeaseStore } from './src/server/platform/cstore-presence';
import { createCharacterCheckpointStore } from './src/server/platform/r1fs-characters';
import { getRatio1ServerClient } from './src/server/platform/ratio1';

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
  return Number(process.env.THORNWRITHE_LEASE_GRACE_MS ?? '15000');
}

function getShardWorldInstanceId() {
  return process.env.THORNWRITHE_SHARD_WORLD_INSTANCE_ID ?? process.env.THORNWRITHE_NODE_ID ?? 'thornwrithe-shard';
}

export async function createServer() {
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
  const ratio1 = getRatio1ServerClient();
  const presenceStore = createPresenceLeaseStore({ cstore: ratio1.cstore });
  const characterStore = createCharacterCheckpointStore({ r1fs: ratio1.r1fs });
  const sessionHost = createSessionHost({
    nodeId: process.env.THORNWRITHE_NODE_ID ?? 'node-a',
    shardWorldInstanceId: getShardWorldInstanceId(),
    heartbeatGraceMs: getHeartbeatGraceMs(),
    verifyAttachToken,
    readPresenceLease: presenceStore.readPresenceLease,
    writePresenceLease: presenceStore.writePresenceLease,
    loadCharacterByCid: characterStore.loadCharacterByCid,
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
