import { defineConfig, devices } from '@playwright/test';

// In a container whose Chromium doesn't match this Playwright version, point
// REPWORKS_CHROMIUM at the browser binary (CLAUDE.md). CI installs the matching one.
const executablePath = process.env.REPWORKS_CHROMIUM;

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 30_000,
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
