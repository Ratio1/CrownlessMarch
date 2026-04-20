import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import next from 'next';
import { WebSocketServer } from 'ws';

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

  return {
    httpServer,
    nextApp,
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
