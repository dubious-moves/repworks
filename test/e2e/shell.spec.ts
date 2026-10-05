// The PWA shell (PLAN.md §4.1): the manifest is valid and installable, and after one online
// visit the app starts with the server gone.
import { test, expect, chromium } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeEach(async () => {
  site = await serveSite();
});
test.afterEach(async () => {
  await site.close();
});

test('the manifest parses and Chrome reports no installability errors', async ({ browserName }, testInfo) => {
  test.skip(browserName !== 'chromium');
  // Chrome refuses to install from an incognito profile, which is what Playwright's contexts
  // are, so this test opens a real profile.
  const profile = mkdtempSync(join(tmpdir(), 'repworks-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    ...testInfo.project.use,
    executablePath: process.env.REPWORKS_CHROMIUM || undefined,
  });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(site.url);
    await expect(page.getByRole('heading', { name: 'Repworks' })).toBeVisible();
    await page.evaluate(() => navigator.serviceWorker.ready);
    const cdp = await context.newCDPSession(page);
    const manifest = await cdp.send('Page.getAppManifest');
    expect(manifest.errors).toEqual([]);
    const parsed = JSON.parse(manifest.data ?? '{}') as Record<string, unknown>;
    expect(parsed.orientation).toBeUndefined();
    expect(parsed.display).toBe('standalone');
    const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
    expect(installabilityErrors).toEqual([]);
  } finally {
    await context.close();
    rmSync(profile, { recursive: true, force: true });
  }
});

test('after one online visit the app starts with the server gone', async ({ page }) => {
  await page.goto(site.url);
  await expect(page.getByRole('heading', { name: 'Repworks' })).toBeVisible();
  // The first visit installs the worker, which claims the page once the shell is cached.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await site.close();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Repworks' })).toBeVisible();
  await expect(page.getByText(/shell [0-9a-f]{8}/)).toBeVisible();
  // A deep link with a route and a query (the OAuth callback's shape) starts offline too.
  await page.goto(`${site.url}?code=x&state=y#/study/abcdefgh/ijklmnop`);
  await expect(page.getByRole('heading', { name: 'Repworks' })).toBeVisible();
});

test('an update keeps foreign caches and one older shell, and offers a reload', async ({ page }) => {
  await page.goto(site.url);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.evaluate(async () => {
    await caches.open('someone-elses-cache');
    await caches.open('repworks-shell-0000000000000000');
    await caches.open('repworks-shell-1111111111111111');
  });
  // A new deploy: same files, new version. The page that is running asks for the update.
  site.setWorkerVersion('bbbbbbbbbbbbbbbb');
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const changed = new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve));
    await registration.update();
    await changed;
    // Clients move to a worker that skipped waiting before its activate handler has finished;
    // the cleanup is done once the worker reports `activated`.
    const worker = navigator.serviceWorker.controller!;
    if (worker.state !== 'activated') {
      await new Promise((resolve) => worker.addEventListener('statechange', () => worker.state === 'activated' && resolve(null)));
    }
  });
  await expect(page.getByRole('status')).toContainText('A new version is ready.');
  const names = await page.evaluate(() => caches.keys());
  expect(names).toContain('someone-elses-cache');
  expect(names).toContain('repworks-shell-bbbbbbbbbbbbbbbb');
  // The older shells: only the most recently created one stays.
  expect(names.filter((n) => n.startsWith('repworks-shell-')).sort()).toEqual([
    'repworks-shell-1111111111111111',
    'repworks-shell-bbbbbbbbbbbbbbbb',
  ]);
});
