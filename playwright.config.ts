import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'DATABASE_PATH=${DATABASE_PATH:-test-e2e.db} PORT=3002 npm start',
    url: 'http://localhost:3002',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
