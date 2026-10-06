import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the production build, served by Playwright for the length of the
 * run only. They use the system Chrome rather than downloading a browser.
 *
 *   pnpm --filter @accident/web e2e
 */
const chrome = process.env.CHROME_PATH ?? '/usr/local/bin/chrome';
const launchOptions = { executablePath: chrome, args: ['--no-sandbox'] };

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    launchOptions,
  },
  projects: [{ name: 'phone', use: { ...devices['Pixel 7'], launchOptions } }],
  webServer: {
    command: 'pnpm exec vite preview --port 4173 --host 127.0.0.1 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
