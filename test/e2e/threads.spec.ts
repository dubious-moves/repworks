// Threads (PLAN.md §5.36), with the real threaded Stockfish: more than one thread chosen sets the
// service worker's isolation flag; from the next load the page is cross-origin isolated (COOP and
// COEP from the worker), the threaded build runs with that many threads, and the site works as
// before (the chapter, the sync); back to one thread, and the next load isn't isolated.
import { test, expect } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeEach(async () => {
  site = await serveSite();
});
test.afterEach(async () => {
  await site.close();
});

test('two threads: the page isolated from its next load, the threaded engine running, the site as before', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the desktop’s choice; the phone keeps one thread');
  test.setTimeout(60_000);
  const w = world();
  await serveGithub(page, w.github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
  await page.reload();
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  const panel = page.getByRole('region', { name: 'Engine' });
  await panel.getByRole('button', { name: 'Engine settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Engine settings' });
  await dialog.getByRole('group', { name: 'Threads' }).getByRole('button', { name: '2' }).click();
  await expect(dialog.getByRole('note')).toContainText('needs the page isolated');
  const loaded = page.waitForEvent('load');
  await dialog.getByRole('button', { name: 'reload' }).click();
  await loaded;
  await expect(page.locator('.notation')).toContainText('A made-up comment');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  // The threaded build, with two threads, finds its depth.
  await panel.getByRole('switch', { name: 'Engine' }).check();
  await expect(panel.locator('.engine-name')).toHaveText('SF18 ×2');
  await expect(panel.locator('.engine-depth')).toHaveText(/^Depth (1[6-9]|2\d)/, { timeout: 30_000 });
  expect(site.requests.some((r) => /\/engines\/stockfish-18-lite\.[0-9a-f]{10}\.wasm$/.test(r))).toBe(true);
  // Stockfish 19 chosen (§5.75): its threaded build, with the same two threads.
  await panel.getByRole('button', { name: 'Engine settings' }).click();
  await dialog.getByRole('group', { name: 'Version' }).getByRole('button', { name: 'Stockfish 19' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(panel.locator('.engine-name')).toHaveText('SF19 ×2');
  await expect(panel.locator('.engine-depth')).toHaveText(/^Depth (1[6-9]|2\d)/, { timeout: 30_000 });
  expect(site.requests.some((r) => /\/engines\/stockfish-19-lite\.[0-9a-f]{10}\.wasm$/.test(r))).toBe(true);
  // The site as before: an edit synced.
  await page.locator('.move[data-path="e4 c5 Nf3"]').click();
  await page.locator('.chip').click();
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  // Back to one thread: not isolated from the next load.
  await panel.getByRole('button', { name: 'Engine settings' }).click();
  await dialog.getByRole('group', { name: 'Threads' }).getByRole('button', { name: '1' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await page.reload();
  await expect(page.locator('.notation')).toContainText('A made-up comment');
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
  await expect(panel.locator('.engine-name')).toHaveText('SF19');
});
