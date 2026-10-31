// Lc0 on the study page (PLAN.md §5.143), with the real network and worker beside a scripted
// Stockfish (engine.ts): its dialog and one-time download, its row (eval, W/D/L, its three
// likeliest moves, as onnxruntime-web gives them under Node: test/fixtures/lc0/reference.json),
// its share beside each line's first move and its pick among the close lines marked, a new
// position read with its history, and the switch remembered without a second download.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';
import { fakeEngine, START } from './engine.ts';

interface Ref {
  name: string;
  top5: { san: string; prob: number }[];
  wdl: number[];
}
const refs = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fixtures', 'lc0', 'reference.json'), 'utf8')) as Ref[];
const fmt = (p: number) => (p * 100 < 9.95 ? `${(p * 100).toFixed(1)}%` : `${Math.round(p * 100)}%`);

let site: SiteServer;
test.beforeEach(async () => {
  // Stockfish's d4 first, e4 close behind (Lc0 likes e4 more), g4 far behind.
  site = await serveSite({
    engine: fakeEngine(undefined, {
      [START]: [
        [1, 30, 'd2d4 d7d5 c2c4'],
        [2, 22, 'e2e4 e7e5 g1f3'],
        [3, -300, 'g2g4 d7d5'],
      ],
    }),
  });
});
test.afterEach(async () => {
  await site.close();
});

async function openChapter(page: Page) {
  await serveGithub(page, world().github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
  await expect(page.locator('.notation')).toContainText('A made-up comment');
}

const lc0Files = (s: SiteServer) => s.requests.filter((r) => /\/engines\/(791556|ort-wasm)/.test(r));

test('Lc0’s dialog and download, its row, its share and pick beside Stockfish’s lines; remembered', async ({ page }) => {
  test.setTimeout(90_000);
  await openChapter(page);
  const panel = page.getByRole('region', { name: 'Engine' });
  const lc0 = panel.getByRole('switch', { name: 'Lc0' });
  await expect(lc0).not.toBeChecked();

  // Cancel: Lc0 stays off, nothing downloaded.
  await lc0.check();
  const dialog = page.getByRole('dialog', { name: 'Enable Lc0' });
  await expect(dialog).toContainText('one-time 35.9 MB download');
  await expect(dialog).toContainText('LCZero');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(lc0).not.toBeChecked();
  expect(lc0Files(site)).toEqual([]);

  await lc0.check();
  await dialog.getByRole('button', { name: /^Download/ }).click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  expect(lc0Files(site)).toHaveLength(3);

  // Its row at the start: +0.13, 31% / 47% / 22%, e4 d4 Nf3 with their shares.
  const start = refs.find((r) => r.name === 'start')!;
  const row = panel.getByLabel('Lc0', { exact: true }).and(page.locator('.lc0-row'));
  await expect(row.locator('.lc0-move')).toHaveText(start.top5.slice(0, 3).map((m) => `${m.san} ${fmt(m.prob)}`), { timeout: 30_000 });
  await expect(row.locator('.engine-eval')).toHaveText('+0.13');
  await expect(row.locator('.lc0-wdl')).toHaveText(start.wdl.map((x) => `${Math.round(x * 100)}%`).join(' / '));

  // Stockfish on: Lc0's share of each line's first move; e4 its pick, d4 within 0.30 of it, g4 not close.
  await panel.getByRole('switch', { name: 'Engine' }).check();
  const lines = panel.locator('.engine-line');
  await expect(lines).toHaveCount(3);
  const share = (san: string) => fmt(start.top5.find((m) => m.san === san)!.prob);
  await expect(lines.locator('.lc0-share')).toHaveText([share('d4'), share('e4'), /%$/]);
  await expect(lines.nth(1)).toHaveClass(/lc0-pick/);
  await expect(page.locator('.engine-line.lc0-pick')).toHaveCount(1);

  // The next position (1. e4), read with the move that led to it.
  await page.getByRole('button', { name: 'Next move' }).click();
  const e4 = refs.find((r) => r.name === '1. e4')!;
  await expect(row.locator('.lc0-move')).toHaveText(e4.top5.slice(0, 3).map((m) => `${m.san} ${fmt(m.prob)}`), { timeout: 30_000 });
  // White's side: Black stands a little better after 1. e4 for Lc0.
  await expect(row.locator('.lc0-wdl')).toHaveText([e4.wdl[2]!, e4.wdl[1]!, e4.wdl[0]!].map((x) => `${Math.round(x * 100)}%`).join(' / '));

  // Remembered: on again after a reload, no dialog, nothing downloaded again.
  await page.reload();
  await expect(panel.getByRole('switch', { name: 'Lc0' })).toBeChecked();
  await expect(row.locator('.lc0-move')).toHaveCount(3, { timeout: 30_000 });
  await expect(dialog).toHaveCount(0);
  expect(lc0Files(site)).toHaveLength(3);

  // Off: its row and marks go.
  await panel.getByRole('switch', { name: 'Lc0' }).uncheck();
  await expect(page.locator('.lc0-row')).toHaveCount(0);
  await expect(page.locator('.lc0-share')).toHaveCount(0);
});
