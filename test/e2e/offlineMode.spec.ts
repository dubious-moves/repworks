// Offline mode (PLAN.md §5.203): a switch in Settings under which nothing leaves the site, not the
// sync, not the explorer's worker, not a reload; what is done meanwhile waits and is pushed once it
// is turned off, from the sync chip's question here.
import { test, expect } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

test('offline mode sends nothing, keeps a review through a reload, and syncs it once turned off', async ({ page, context }) => {
  const { git, github } = world();
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.studies')).toContainText('Test repertoire');
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  const origin = new URL(site.url).origin;

  await page.locator('details.settings > summary').click();
  await page.getByLabel('Offline mode: send nothing over the network').check();
  await expect(page.locator('.sync-chip')).toHaveText('offline mode');
  // From here on, nothing may leave the site: the page's, its workers' and the reload's requests.
  const left: string[] = [];
  context.on('request', (r) => {
    if (new URL(r.url()).origin !== origin) left.push(r.url());
  });
  const asked = github.log.length;

  await page.locator('details.debug > summary').click();
  await page.getByRole('button', { name: 'Record a test review' }).click();
  await expect(page.locator('.sync-chip')).toHaveText('offline mode · 1 change waiting');
  await page.getByRole('button', { name: 'Sync now' }).click();
  await page.reload();
  await expect(page.locator('.studies')).toContainText('Test repertoire');
  await expect(page.locator('.sync-chip')).toHaveText('offline mode · 1 change waiting');
  await page.locator('details.settings > summary').click();
  await expect(page.getByLabel('Offline mode: send nothing over the network')).toBeChecked();
  // A study's page, whose explorer panel asks Lichess as soon as it shows.
  await page.locator('.study-card', { hasText: 'Test repertoire' }).first().click();
  await expect(page.locator('.cv-board')).toBeVisible();
  // The page's own fetch refuses at once, as with no network.
  expect(await page.evaluate(() => fetch('https://tablebase.lichess.ovh/standard?fen=8/8/8/8/8/8/8/K1k5_w_-_-_0_1').then(() => 'sent', (e: Error) => `${e.name}: ${e.message}`))).toBe('OfflineModeError: Offline mode is on: nothing is sent over the network');
  // The service worker answers the site's files from its caches only: one it lacks fails.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  expect(await page.evaluate(() => fetch('engines/not-downloaded.wasm').then((r) => `HTTP ${r.status}`, (e: Error) => e.name))).toBe('TypeError');
  await page.waitForTimeout(1500);
  expect(left).toEqual([]);
  expect(github.log.length).toBe(asked);

  // The chip asks before it goes online; turned off, the waiting review is pushed.
  page.once('dialog', (d) => void d.accept());
  await page.locator('.sync-chip').click();
  const id = [...git.textsOf().keys()].find((p) => p.startsWith('devices/') && !/Desktop1|Phone001/.test(p))!.slice('devices/'.length, -'.json'.length);
  const day = new Date().toISOString().slice(0, 10);
  await expect.poll(() => git.textsOf().get(`progress/${id}/${day}.jsonl`) ?? '').toContain('"card":"r|test|e2e4"');
  await expect(page.locator('.sync-chip')).toHaveText(/^synced/);
});
