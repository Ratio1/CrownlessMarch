import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3020',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3020',
    reuseExistingServer: true
  }
});
