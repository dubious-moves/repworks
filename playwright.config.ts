import { defineConfig, devices } from '@playwright/test';

// In a container whose Chromium doesn't match this Playwright version, point
// REPWORKS_CHROMIUM at the browser binary (CLAUDE.md). CI installs the matching one.
const executablePath = process.env.REPWORKS_CHROMIUM;

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30_000,
  // Tests, not files, are spread over the workers and CI's shards: storm.spec.ts alone is a
  // quarter of the run. Each test has its own browser context and data repo, and no test reads
  // state another left (a file's site server is per worker; requests are read from the test's own).
  fullyParallel: true,
  // A test that fails is run once more, in a fresh worker. One that passes then is reported as
  // flaky, not passed: a race to find and fix (in the test or the app), never to leave.
  retries: 1,
  // A worker per core locally: the tests mostly wait on the browser, and a 4-core container ran
  // them all at 4 with none flaky (5.5 minutes, against 8.5 at the default half). CI keeps the
  // default: its four shards already run side by side.
  workers: process.env.CI ? undefined : '100%',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    launchOptions: executablePath ? { executablePath } : {},
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
});
