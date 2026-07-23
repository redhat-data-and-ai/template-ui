import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:18080',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Bypasses --env-file=.env (not needed in CI) by invoking the compiled server directly.
    command: 'node dist/server/index.js',
    url: 'http://localhost:18080',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      PORT: '18080',
      AUTH_ENABLED: 'false',
      ENVIRONMENT: 'test',
      AGENT_HOST: 'http://localhost:19999',
    },
  },
});
