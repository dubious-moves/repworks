// Maia in the browser (PLAN.md §5.32, §5.33), with the real model and worker: Qchess's dialog
// and its one-time download, the explorer's Ml and Ms columns and Maia's own rows beside the
// fake explorer's games, the Ml sort, Maia remembered without a second download, and the
// worker's numbers equal to onnxruntime-web's under Node (the same wasm) to 1e-6. And the 23M
// model (§5.188) chosen in the engine's settings: its own download, its likelihoods at the start
// the official code's, kept over a reload, and the first model chosen again.
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
const refs23 = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'fixtures', 'maia', 'reference-23m.json'), 'utf8')) as { fens: string[]; elo: number; top5: { uci: string; prob: number }[] }[];
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
const panel = (page: Page) => page.getByRole('region', { name: 'Explorer' });

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

test('the 23M model chosen in the engine settings: its own download, its likelihoods the official code’s, the choice kept; back to the first model', async ({ page }) => {
  test.setTimeout(150_000);
  test.skip(test.info().project.name === 'phone', 'the model is the same on a phone; once is enough for 46 MB');
  await setUp(page);
  // The engine's settings: Maia's model, with what the 23M one is.
  await page.getByRole('region', { name: 'Engine' }).getByRole('button', { name: 'Engine settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Engine settings' });
  await expect(settings.getByTestId('maia-model-note')).toHaveText('The Maia platform’s model: the position alone.');
  await settings.getByRole('button', { name: 'Maia 3, 23M', exact: true }).click();
  await expect(settings.getByTestId('maia-model-note')).toContainText('A download of 45.8 MB, once');
  await expect(settings.locator('.engine-files', { hasText: 'Maia 3, 23M ·' })).toHaveAttribute('data-stored', 'no');
  await settings.getByRole('button', { name: 'Save' }).click();
  expect(site.requests.filter((r) => r.includes('/engines/'))).toEqual([]);

  // Switched on: the dialog names the 23M model's download and licence; only its file is fetched.
  await page.getByRole('switch', { name: 'Maia' }).check();
  const dialog = page.getByRole('dialog', { name: 'Enable Maia' });
  await expect(dialog).toContainText('one-time 60.1 MB download');
  await expect(dialog).toContainText('AGPL-3.0');
  await dialog.getByRole('button', { name: /^Download/ }).click();
  await expect(dialog).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator('.explorer-head').getByRole('button', { name: 'Ml' })).toBeVisible({ timeout: 60_000 });
  expect(site.requests.some((r) => /\/engines\/maia3-23m\.[0-9a-f]{10}\.onnx$/.test(r))).toBe(true);
  expect(site.requests.some((r) => r.includes('/engines/maia3_simplified'))).toBe(false);
  // The starting position at 1100, alone: the official code's likelihoods on the official checkpoint, to half a point.
  const ref = refs23.at(-1)!;
  const want = new Map(ref.top5.map((m) => [m.uci, m.prob]));
  await expect(rows(page).locator('.ex-san').first()).toHaveText('e4', { timeout: 60_000 });
  await expect(rows(page).locator('.ex-ml').first()).toHaveText(/%$/, { timeout: 60_000 });
  const ml = async (i: number) => Number((await rows(page).nth(i).locator('.ex-ml').textContent())!.replace('%', '')) / 100;
  expect(Math.abs((await ml(0)) - want.get('e2e4')!)).toBeLessThan(0.006);
  expect(Math.abs((await ml(1)) - want.get('d2d4')!)).toBeLessThan(0.006);

  // Kept over a reload, from the stored file.
  const before = site.requests.filter((r) => r.includes('/engines/maia')).length;
  await page.reload();
  await expect(page.locator('.explorer-head').getByRole('button', { name: 'Ml' })).toBeVisible({ timeout: 60_000 });
  await expect(rows(page).locator('.ex-ml').first()).toHaveText(/%$/, { timeout: 60_000 });
  expect(Math.abs((await ml(0)) - want.get('e2e4')!)).toBeLessThan(0.006);
  expect(site.requests.filter((r) => r.includes('/engines/maia')).length).toBe(before);

  // Back to the first model: not on this device, so its download is asked for; its numbers are its own.
  await page.getByRole('region', { name: 'Engine' }).getByRole('button', { name: 'Engine settings' }).click();
  await settings.getByRole('button', { name: 'Maia 3', exact: true }).click();
  await settings.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toContainText('one-time 59.9 MB download');
  await expect(dialog).toContainText('under the GPL-3.0');
  await dialog.getByRole('button', { name: /^Download/ }).click();
  await expect(dialog).toHaveCount(0, { timeout: 60_000 });
  const first = refs.find((r) => r.fen.startsWith(START) && r.elo === 1100)!;
  await expect(rows(page).locator('.ex-ml').first()).toHaveText(fmt(first.web.find((m) => m.san === 'e4')!.prob), { timeout: 60_000 });
});

test('Maia’s columns stay when its worker is ended for being unused, and it starts again by itself; with no games, Maia’s moves are the rows', async ({ page }) => {
  test.setTimeout(120_000);
  await setUp(page);
  // Timers the test can run: Maia's worker ends 90 s after its last use.
  await page.clock.install();
  await page.getByRole('switch', { name: 'Maia' }).check();
  await page.getByRole('dialog', { name: 'Enable Maia' }).getByRole('button', { name: /^Download/ }).click();
  const head = page.locator('.explorer-head');
  const ml = head.getByRole('button', { name: 'Ml' });
  await expect(ml).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await page.clock.runFor(500), rows(page).count()), { timeout: 30_000 }).toBe(4);
  // Nothing left to ask: the Ms values are in.
  await expect.poll(async () => (await page.clock.runFor(500), rows(page).locator('.ex-ms').allTextContents()), { timeout: 30_000 }).toEqual([expect.stringMatching(/%$/), expect.stringMatching(/%$/), expect.stringMatching(/%$/), expect.stringMatching(/%$/)]);
  // 90 s unused: the worker ends, `idle`, and the columns stay (they went before, and nothing asked
  // Maia again until it was switched off and on).
  const state = page.locator('.maia-switch');
  await expect.poll(async () => (await page.clock.runFor(30_000), state.getAttribute('data-state')), { timeout: 30_000 }).toBe('idle');
  await expect(ml).toBeVisible();
  await expect(rows(page).locator('.ex-ml').first()).not.toHaveText('');
  // A new position, with no games: Maia starts again and its moves are the rows.
  // (A key rather than a click: the click's checks wait on animation frames, which the clock holds.)
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4');
  await expect.poll(async () => (await page.clock.runFor(500), panel(page).locator('.ex-row.maia-only').count()), { timeout: 30_000 }).toBe(4);
  await expect(state).toHaveAttribute('data-state', 'ready');
  await expect(panel(page).locator('.explorer-note')).toHaveText(/^No games here: (ChessDB’s and )?Maia’s moves/);
  await expect(ml).toBeVisible();
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

test('Maia in the Practical column: thin positions filled in (purple), and its preview behind the Prac title', async ({ page }) => {
  test.setTimeout(90_000);
  await setUp(page);
  // After 1. e4 (Black's move: the chapter is Black's), few games: c5 and e5 alone, and nothing
  // deeper. ChessDB knows every position (its first three moves), so the leaves have evals.
  const { Chess } = await import('chessops/chess');
  const { parseFen } = await import('chessops/fen');
  const { makeSan } = await import('chessops/san');
  const fake = fakeExplorer();
  fake.games.set(START, [{ san: 'e4', white: 300, draws: 200, black: 100 }]);
  fake.games.set('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -', [
    { san: 'c5', white: 15, draws: 10, black: 15 },
    { san: 'e5', white: 12, draws: 8, black: 10 },
  ]);
  await serveExplorer(page, fake);
  await page.route('https://www.chessdb.cn/**', async (route) => {
    const board = new URL(route.request().url()).searchParams.get('board') ?? '';
    const pos = Chess.fromSetup(parseFen(board.split(' ').length === 4 ? `${board} 0 1` : board).unwrap()).unwrap();
    const moves: { uci: string; san: string; score: number }[] = [];
    for (const [from, tos] of pos.allDests()) for (const to of tos) if (moves.length < 3) moves.push({ uci: '', san: makeSan(pos, { from, to }), score: 20 - 15 * moves.length });
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ status: 'ok', moves }) });
  });
  await page.reload();
  await page.getByRole('switch', { name: 'Maia' }).check();
  await page.getByRole('dialog', { name: 'Enable Maia' }).getByRole('button', { name: /^Download/ }).click();
  await expect(page.locator('.explorer-head').getByRole('button', { name: 'Ml' })).toBeVisible({ timeout: 30_000 });
  await page.locator('.move[data-path="e4"]').click({ position: { x: 6, y: 8 } });
  const cell = (san: string) => page.locator('.explorer-rows .ex-row', { has: page.locator('.ex-san', { hasText: new RegExp(`^${san}$`) }) }).locator('.ex-prac');
  await expect(cell('c5')).toHaveText(/^\d+%$/, { timeout: 30_000 });
  await expect(cell('e5')).toHaveText(/^\d+%$/, { timeout: 30_000 });
  // Mostly Maia's predictions: purple, and the details say how much.
  await expect(cell('c5')).toHaveClass(/\bmaia\b/);
  await expect(cell('c5')).toHaveAttribute('title', /Maia: \d+% of this value \(rating 1100\)/);
  // The first click on Prac sorts by it; the second shows Maia's preview values.
  const prac = page.locator('.explorer-head .ex-prac');
  await prac.click();
  await expect(page.getByLabel('Sort')).toHaveValue('prac');
  await expect(prac).toHaveText(/^Prac/);
  await prac.click();
  await expect(prac).toHaveText(/^Maia/);
  await expect(cell('c5')).toHaveClass(/maia-view/);
  await expect(cell('c5')).toHaveText(/^\d+%$/, { timeout: 30_000 });
  await expect(cell('c5')).toHaveAttribute('title', /^Maia \d+%[^]*Replies weighted by Maia’s predictions \(rating 1100\)/);
  await prac.click();
  await expect(prac).toHaveText(/^Prac/);
  const right = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.explorer *')].map((e) => e.getBoundingClientRect().right)));
  expect(right).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
});
