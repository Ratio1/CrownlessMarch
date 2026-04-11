import { spawnSync } from 'node:child_process';
import type { FullConfig } from '@playwright/test';

export default function globalSetup(config: FullConfig) {
  const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = spawnSync(pnpmCommand, ['run', 'seed:dev'], {
    cwd: config.rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      THORNWRITHE_USE_FILE_CSTORE: process.env.THORNWRITHE_USE_FILE_CSTORE ?? '1'
    }
  });

  if (result.status !== 0) {
    throw new Error(`Playwright global setup failed: seed:dev exited with code ${String(result.status)}`);
  }
}
