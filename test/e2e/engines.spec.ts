// The engines' files (PLAN.md §5.29): out of the shell's precache, downloaded when asked, kept in
// `repworks-engines` and served from it with the site gone, kept across a deploy (an entry no
// version names is deleted), and nothing fetched from anywhere but the site.
import { test, expect, type Page } from '@playwright/test';
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

async function setUp(page: Page): Promise<string[]> {
  const offSite: string[] = [];
  page.on('request', (r) => {
    const host = new URL(r.url()).hostname;
    if (!['localhost', 'api.github.com', 'explorer.lichess.org', 'lichess.org', 'www.chessdb.cn'].includes(host)) offSite.push(r.url());
  });
  await serveGithub(page, world().github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  return offSite;
}

const engineRequests = (s: SiteServer) => s.requests.filter((p) => p.includes('/engines/'));
const storedEngines = (page: Page) => page.evaluate(async () => (await (await caches.open('repworks-engines')).keys()).map((r) => new URL(r.url).pathname.replace(/^.*\/engines\//, '')).sort());

test('Stockfish is downloaded when asked, then served from its cache with the site gone', async ({ page }) => {
  const offSite = await setUp(page);
  // Nothing of the engines comes with the shell.
  expect(engineRequests(site)).toEqual([]);
  expect(await page.evaluate(async () => (await Promise.all((await caches.keys()).filter((k) => k.startsWith('repworks-shell-')).map(async (k) => (await caches.open(k)).keys()))).flat().filter((r) => r.url.includes('/engines/')).length)).toBe(0);

  await page.getByText('Settings and debug').click();
  const stockfish = page.locator('.engine-files', { hasText: 'Stockfish 18' });
  await expect(stockfish).toContainText('7.3 MB · not stored');
  await stockfish.getByRole('button', { name: 'Download' }).click();
  await expect(stockfish).toContainText('stored');
  await expect(stockfish).toHaveAttribute('data-stored', 'yes');
  expect(await storedEngines(page)).toEqual([expect.stringMatching(/^stockfish-18-lite-single\.[0-9a-f]{10}\.js$/), expect.stringMatching(/^stockfish-18-lite-single\.[0-9a-f]{10}\.wasm$/)]);
  expect(engineRequests(site)).toHaveLength(2);

  // With the site gone, the stored files still answer, from the engines' cache.
  await site.close();
  await page.reload();
  await page.getByText('Settings and debug').click();
  await expect(page.locator('.engine-files', { hasText: 'Stockfish 18' })).toHaveAttribute('data-stored', 'yes');
  const sizes = await page.evaluate(async () => {
    const keys = await (await caches.open('repworks-engines')).keys();
    return Promise.all(keys.map(async (k) => (await (await fetch(k.url)).arrayBuffer()).byteLength));
  });
  expect(sizes.sort((a, b) => a - b)).toEqual([20670, 7295411]);
  expect(offSite).toEqual([]);
});

test('Maia is downloaded, and a deploy keeps the engines it still names', async ({ page }) => {
  const offSite = await setUp(page);
  await page.getByText('Settings and debug').click();
  const maia = page.locator('.engine-files', { hasText: 'Maia 3' });
  await expect(maia).toContainText('59.9 MB · not stored');
  await maia.getByRole('button', { name: 'Download' }).click();
  await expect(maia).toHaveAttribute('data-stored', 'yes', { timeout: 20_000 });
  expect(await storedEngines(page)).toHaveLength(3);
  expect(await storedEngines(page)).toEqual(expect.arrayContaining([expect.stringMatching(/^maia3_simplified\.[0-9a-f]{10}\.onnx$/), expect.stringMatching(/^ort-wasm-simd-threaded\.[0-9a-f]{10}\.mjs$/), expect.stringMatching(/^ort-wasm-simd-threaded\.[0-9a-f]{10}\.wasm$/)]));

  // An engine an older version stored, which this one doesn't name.
  await page.evaluate(async () => (await caches.open('repworks-engines')).put(new URL('engines/stockfish-17.0000000000.wasm', location.href).href, new Response('old')));
  site.setWorkerVersion('cccccccccccccccc');
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const changed = new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve));
    await registration.update();
    await changed;
    const worker = navigator.serviceWorker.controller!;
    if (worker.state !== 'activated') await new Promise((resolve) => worker.addEventListener('statechange', () => worker.state === 'activated' && resolve(null)));
  });
  expect(await storedEngines(page)).toHaveLength(3);
  expect(await storedEngines(page)).not.toContain('stockfish-17.0000000000.wasm');

  // Deleted from the debug panel.
  await page.locator('.engine-files', { hasText: 'Maia 3' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('.engine-files', { hasText: 'Maia 3' })).toHaveAttribute('data-stored', 'no');
  expect(await storedEngines(page)).toEqual([]);
  expect(offSite).toEqual([]);
});
