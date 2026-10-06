// Maia in the browser (PLAN.md §5.32, §5.33), with the real model and worker: Qchess's dialog
// and its one-time download, the explorer's Ml and Ms columns and Maia's own rows beside the
// fake explorer's games, the Ml sort, Maia remembered without a second download, and the
// worker's numbers equal to onnxruntime-web's under Node (the same wasm) to 1e-6.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { fakeExplorer, lichessLogin, serveExplorer } from './explorer.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeEach(async () => {
  site = await serveSite();
});
test.afterEach(async () => {
  await site.close();
});

interface Ref {
  fen: string;
  elo: number;
  web: { san: string; prob: number }[];
}
const refs = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fixtures', 'maia', 'reference.json'), 'utf8')) as Ref[];
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
const fmt = (p: number) => (p * 100 < 9.95 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`);

async function setUp(page: Page) {
  // Maia at 1100, the rating the fixture has for the start position.
  await page.addInitScript(() => localStorage.getItem('repworks-maia') ?? localStorage.setItem('repworks-maia', JSON.stringify({ on: false, rating: 1100 })));
  await lichessLogin(page);
  await serveGithub(page, world().github);
  const fake = fakeExplorer();
  // Games for e4 and d4 only: Maia's Nf3 and c4 come as its own rows.
  fake.games.set(START, [
    { san: 'e4', white: 300, draws: 200, black: 100 },
    { san: 'd4', white: 120, draws: 120, black: 60 },
  ]);
  await serveExplorer(page, fake);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
  await expect(page.locator('.explorer .ex-row')).toHaveCount(3);
}

const rows = (page: Page) => page.locator('.explorer-rows .ex-row:not(.ex-total)');

test('Maia’s dialog, its download, the Ml and Ms columns and its own rows; remembered', async ({ page }) => {
  test.setTimeout(90_000);
  await setUp(page);
  const maia = page.getByRole('switch', { name: 'Maia' });
  // Cancel: Maia stays off, nothing downloaded.
  await maia.check();
  const dialog = page.getByRole('dialog', { name: 'Enable Maia' });
  await expect(dialog).toContainText('one-time 59.9 MB download');
  await expect(dialog).toContainText('CSSLab');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(maia).not.toBeChecked();
  expect(site.requests.filter((r) => r.includes('/engines/'))).toEqual([]);

  await maia.check();
  await dialog.getByRole('button', { name: /^Download/ }).click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  const head = page.locator('.explorer-head');
  await expect(head.getByRole('button', { name: 'Ml' })).toBeVisible({ timeout: 30_000 });
  await expect(head.locator('.ex-ms')).toHaveText('Ms');
  // The games' rows, then Maia's two others, its likelihoods from the fixture (onnxruntime-web).
  const ref = refs.find((r) => r.fen.startsWith(START) && r.elo === 1100)!;
  const p = new Map(ref.web.map((m) => [m.san, m.prob]));
  await expect(rows(page).locator('.ex-san')).toHaveText(['e4', 'd4', 'Nf3', 'c4'], { timeout: 30_000 });
  await expect(rows(page).locator('.ex-ml')).toHaveText(['e4', 'd4', 'Nf3', 'c4'].map((s) => fmt(p.get(s)!)));
  await expect(rows(page).nth(2)).toHaveClass(/maia-only/);
  await expect(rows(page).nth(2).locator('.ex-bar')).toHaveText('Maia');
  // Ms for the four rows: the mover's expected score after each, as a percentage.
  await expect(rows(page).locator('.ex-ms')).toHaveText([/^\d+%$/, /^\d+%$/, /^\d+%$/, /^\d+%$/], { timeout: 30_000 });
  // Sorted by Ml (its title), then back to popularity.
  await head.getByRole('button', { name: 'Ml' }).click();
  await expect(page.getByLabel('Sort')).toHaveValue('maia');
  await expect(rows(page).locator('.ex-san')).toHaveText(['e4', 'd4', 'Nf3', 'c4']);
  // Nothing wider than the screen.
  const right = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.explorer *')].map((e) => e.getBoundingClientRect().right)));
  expect(right).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);

  // Remembered: on after a reload, from the stored files, with no dialog.
  const before = site.requests.filter((r) => r.includes('/engines/maia')).length;
  await page.reload();
  await expect(page.locator('.explorer-head').getByRole('button', { name: 'Ml' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('dialog', { name: 'Enable Maia' })).toHaveCount(0);
  expect(site.requests.filter((r) => r.includes('/engines/maia')).length).toBe(before);
  // Off: the columns go, Maia's order falls back to popularity.
  await page.getByRole('switch', { name: 'Maia' }).uncheck();
  await expect(page.locator('.explorer-head .ex-ml')).toHaveCount(0);
  await expect(rows(page).locator('.ex-san')).toHaveText(['e4', 'd4']);
});

test('the worker in the browser gives onnxruntime-web’s numbers under Node, to 1e-6', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the same Chromium as the desktop project');
  test.setTimeout(90_000);
  await setUp(page);
  await page.getByRole('switch', { name: 'Maia' }).check();
  await page.getByRole('dialog', { name: 'Enable Maia' }).getByRole('button', { name: /^Download/ }).click();
  await expect(page.locator('.explorer-head').getByRole('button', { name: 'Ml' })).toBeVisible({ timeout: 30_000 });
  const asked = [refs[1]!, refs[6]!, refs[30]!];
  const got = await page.evaluate(async (asked) => {
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/assets\/maiaWorker-[^/]+\.js$/.test(n))!;
    const w = new Worker(url, { type: 'module' });
    const next = () => new Promise<any>((resolve) => w.addEventListener('message', (e) => resolve(e.data), { once: true }));
    w.postMessage({ type: 'init' });
    const status = await next();
    const out: any[] = [status];
    for (const [i, r] of asked.entries()) {
      w.postMessage({ type: 'ask', id: i + 1, fen: r.fen, elo: r.elo });
      out.push(await next());
    }
    w.terminate();
    return out;
  }, asked);
  expect(got[0]).toEqual({ type: 'status', status: 'ready' });
  asked.forEach((r, i) => {
    const a = got[i + 1] as { type: string; policy: { san: string; prob: number }[] };
    expect(a.type).toBe('answer');
    expect(a.policy.slice(0, 5).map((m) => m.san)).toEqual(r.web.map((m) => m.san));
    a.policy.slice(0, 5).forEach((m, j) => expect(Math.abs(m.prob - r.web[j]!.prob)).toBeLessThan(1e-6));
  });
});
