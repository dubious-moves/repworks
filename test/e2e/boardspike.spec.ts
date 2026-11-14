// The board spike (board.html, CHESSNUT.md part (a)) against the simulated Move (test/e2e/chessnut.ts):
// it proves the page's own logic (the connect, the log, a drive timed, the setups, the lights'
// pattern, the battery and the pieces) before the owner runs it on the real board; and the words a
// browser without Web Bluetooth gets, Brave's flag among them.
import { test, expect, type Page } from '@playwright/test';
import { serveSite, type SiteServer } from './server.ts';
import { installFakeMove } from './chessnut.ts';

/** Asks the simulated Move (`window.__move`) one of its own questions, or drops its link. */
const move = (page: Page, what: 'lights' | 'drives' | 'drop') => page.evaluate((w) => (window as unknown as { __move: Record<string, () => unknown> }).__move[w]!(), what);

let site: SiteServer;
test.beforeEach(async () => {
  site = await serveSite();
});
test.afterEach(async () => {
  await site.close();
});

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const E4E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR';

test('the board spike against the simulated Move: connect, a drive timed, the setups, the lights, the pieces', async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(installFakeMove, { driveMs: 300 });
  await page.goto(site.url);
  await page.getByRole('link', { name: 'board spike' }).click();
  await expect(page).toHaveURL(`${site.url}board.html`);
  await expect(page.locator('#can')).toHaveText(/^Yes/);
  const log = page.locator('#log');

  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(log).toContainText('connect: ✓ Chessnut Move');
  // The start of the reports written with response, and the board's report shown.
  await expect(log).toContainText('write 3 bytes ✓ with response: 21 01 00');
  await expect(page.locator('#fen-now')).toHaveText(START);
  await expect(page.locator('#grid')).toContainText('8  r n b q k b n r');
  await expect(page.locator('#battery-now')).toHaveText('Battery 87%.');

  // A drive: written without response, reports on the way logged, the time to the position.
  await page.locator('#fen').fill(`${E4E5} w KQkq - 0 2`);
  await page.getByRole('button', { name: 'Drive (force)' }).click();
  await expect(log).toContainText(/write 35 bytes ✓ without response: 42 21 .* 00$/m);
  await expect(log).toContainText(/drive: report on the way #1 at \d+ ms/);
  await expect(log).toContainText(/drive: ✓ reached in \d+ ms \(1 reports on the way\)/);
  await expect(page.locator('#fen-now')).toHaveText(E4E5);
  expect(await move(page, 'drives')).toEqual([E4E5]);
  // A hand stops it: the flag 1.
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Drive (a hand stops it)' }).click();
  await expect(log).toContainText(/write 35 bytes ✓ without response: 42 21 .* 01$/m);
  await expect(page.locator('#fen-now')).toHaveText(START);

  // The five setups, each timed, and the mean.
  await page.getByRole('button', { name: 'Run the five setups' }).click();
  await expect(log).toContainText('setup 0/5 (the start): the board shows it already');
  await expect(log).toContainText(/setups: (\d\.\d, ){4}\d\.\d s; mean \d\.\d s/, { timeout: 15_000 });
  await expect(log).not.toContainText('not reached');

  // The lights: rank 1 off, rank 2 code 1 … rank 8 code 7.
  await page.getByRole('button', { name: 'Each code' }).click();
  await expect.poll(() => move(page, 'lights')).toEqual(Array.from({ length: 64 }, (_, s) => s >> 3));
  await expect(log).toContainText(/write 34 bytes ✓ without response: 43 20 77 77 77 77/);
  await page.getByRole('button', { name: 'Off', exact: true }).click();
  await expect.poll(() => move(page, 'lights')).toEqual(new Array(64).fill(0));

  // The pieces: 34, the one at 12% named.
  await page.getByRole('button', { name: 'Pieces' }).click();
  await expect(page.locator('#pieces-table tr')).toHaveCount(35);
  await expect(log).toContainText('under 20%: P 12%');

  // A drop, then back with no chooser.
  await move(page, 'drop');
  await expect(log).toContainText('link: ✗ dropped');
  await expect(page.getByRole('button', { name: 'Drive (force)' })).toBeDisabled();
  await page.getByRole('button', { name: 'Reconnect' }).click();
  await expect(log).toContainText('reconnect: ✓');
  await expect(page.getByRole('button', { name: 'Drive (force)' })).toBeEnabled();

  // The log copied, with the owner's note on the lights.
  await page.locator('#lights-note').fill('ranks 2-8 lit');
  await page.getByRole('button', { name: 'Copy log' }).click();
  await expect(log).toContainText('✓ Log copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Repworks board spike, build \S+\nThe lights \(the owner's note\): ranks 2-8 lit\n/);
  expect(copied).toContain('reached in');
});

test('the board spike with nothing picked in the chooser', async ({ page }) => {
  await page.addInitScript(installFakeMove, { none: true });
  await page.goto(`${site.url}board.html`);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.locator('#link')).toHaveText('Nothing picked.');
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeEnabled();
});

test('the board spike without Web Bluetooth: Chrome or Edge, or in Brave the flag', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true }));
  await page.goto(`${site.url}board.html`);
  await expect(page.locator('#can')).toHaveText(/^No: this browser has no Web Bluetooth\. Use Chrome .* or Edge/);
  await expect(page.getByRole('button', { name: 'Connect', exact: true })).toBeDisabled();

  await page.addInitScript(() => Object.defineProperty(navigator, 'brave', { value: { isBrave: async () => true }, configurable: true }));
  await page.reload();
  await expect(page.locator('#can')).toContainText('brave://flags/#brave-web-bluetooth-api');
});
