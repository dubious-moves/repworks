// The Chessnut Move's chip and dialog (CHESSNUT.md §5.1, §6 part (c)) against the simulated Move
// (test/e2e/chessnut.ts): connecting from the chip, the battery and the dot, the dialog's small
// board following the board, Check the pieces, the settings kept on the device, a drop and the
// reconnect by itself, Disconnect; no chip without Web Bluetooth, and in Brave the flag explained.
// The chip is in the head on the phone and in the footer on the desktop, beside the sync status.
// No screen mirrors a board yet in this part (test/unit/app/boardLink.test.ts tests the mirror).
import { test, expect, type Page } from '@playwright/test';
import { serveSite, type SiteServer } from './server.ts';
import { installFakeMove } from './chessnut.ts';

type Move = { hand(fen: string): void; lights(): number[]; writes(): string[]; drop(): void };
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR';

let site: SiteServer;
test.beforeEach(async () => {
  site = await serveSite();
});
test.afterEach(async () => {
  await site.close();
});

const chip = (page: Page) => page.getByTestId('board-chip');
const dialog = (page: Page) => page.getByTestId('board-dialog');
const hand = (page: Page, fen: string) => page.evaluate((f) => (window as unknown as { __move: Move }).__move.hand(f), fen);
const writes = (page: Page) => page.evaluate(() => (window as unknown as { __move: Move }).__move.writes());

async function connect(page: Page): Promise<void> {
  await expect(chip(page)).toHaveText('♞ Board');
  await chip(page).click();
  await expect(chip(page)).toHaveText('♞ 87%');
}

test('the chip connects: the battery and a green dot; it sits beside the sync status', async ({ page }, info) => {
  await page.addInitScript(installFakeMove, {});
  await page.goto(site.url);
  // On the phone in the head, on the desktop in the footer, as the sync status is.
  await expect(page.locator(info.project.name === 'phone' ? '.topbar [data-testid=board-chip]' : '.footer [data-testid=board-chip]')).toBeVisible();
  await connect(page);
  await expect(chip(page).locator('[data-dot]')).toHaveAttribute('data-dot', 'ok');
  await expect(chip(page)).toHaveAttribute('title', 'Connected. No screen is using the board now.');
  // The start of the reports, the battery asked, the lights cleared (no screen mirrors one yet).
  const w = await writes(page);
  expect(w[0]).toBe('21 01 00');
  expect(w).toContain('41 01 0c');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __move: Move }).__move.lights())).toEqual(new Array(64).fill(0));
});

test('the dialog: the board as it reports, Check the pieces, the settings kept on the device, Disconnect', async ({ page }) => {
  await page.addInitScript(installFakeMove, {});
  await page.goto(site.url);
  await connect(page);
  await chip(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole('heading', { name: 'Chessnut Move' })).toBeVisible();
  await expect(dialog(page).getByTestId('board-battery')).toHaveText('Battery 87%.');
  await expect(dialog(page).getByTestId('board-state')).toHaveText('Connected. No screen is using the board now.');
  // The small board follows the board: a hand moves a pawn.
  const seen = dialog(page).getByTestId('board-seen');
  await expect(seen).toHaveAttribute('data-fen', START);
  await expect(seen.locator('piece')).toHaveCount(32);
  await hand(page, E4);
  await expect(seen).toHaveAttribute('data-fen', E4);

  // The pieces: the one at 12% named.
  await dialog(page).getByRole('button', { name: 'Check the pieces' }).click();
  await expect(dialog(page).getByTestId('board-pieces')).toContainText('34 pieces; the lowest battery 12%.');
  await expect(dialog(page).getByTestId('board-pieces')).toContainText('Under 20%: White pawn 12%.');

  // Settings, on this device: kept after a reload.
  await dialog(page).getByLabel('Lights on the squares').uncheck();
  await dialog(page).getByLabel('A move is read after the board holds it').selectOption('900');
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('repworks-board')))!)).toMatchObject({ lights: false, settleMs: 900 });

  // Disconnect: the lights off, no drive left, the chip back to Connect.
  await dialog(page).getByRole('button', { name: 'Disconnect' }).click();
  await expect(chip(page)).toHaveText('♞ Board');
  await expect(dialog(page).getByTestId('board-state')).toHaveText('Not connected.');
  // Written through the board's queue, 100 ms apart, before the link is closed.
  await expect.poll(async () => (await writes(page)).slice(-2).map((x) => x.slice(0, 5))).toEqual(['43 20', '42 21']);
  const w = await writes(page);
  expect(w.at(-2)).toMatch(/^43 20( 00){32}$/);
  expect(w.at(-1)).toMatch(/^42 21( 00){33}$/);
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await expect(dialog(page)).toBeHidden();

  await page.reload();
  await connect(page);
  await chip(page).click();
  await expect(dialog(page).getByLabel('Lights on the squares')).not.toBeChecked();
  await expect(dialog(page).getByLabel('A move is read after the board holds it')).toHaveValue('900');
  await expect(dialog(page).getByLabel('Playing Black, Black nearest you (the board turned)')).toBeChecked();
});

test('a drop: "Reconnecting", then back by itself', async ({ page }) => {
  await page.addInitScript(installFakeMove, {});
  await page.goto(site.url);
  await connect(page);
  await page.evaluate(() => (window as unknown as { __move: Move }).__move.drop());
  await expect(chip(page)).toHaveText('♞ Reconnecting');
  await expect(chip(page)).toHaveClass(/chip-warn/);
  // The first try is a second after the drop.
  await expect(chip(page)).toHaveText('♞ 87%', { timeout: 5000 });
  await expect(chip(page).locator('[data-dot]')).toHaveAttribute('data-dot', 'ok');
  // Reports again after it: a hand seen in the dialog.
  await chip(page).click();
  await hand(page, E4);
  await expect(dialog(page).getByTestId('board-seen')).toHaveAttribute('data-fen', E4);
});

test('nothing picked in the chooser: the chip as it was, nothing said', async ({ page }) => {
  await page.addInitScript(installFakeMove, { none: true });
  await page.goto(site.url);
  await chip(page).click();
  await expect(chip(page)).toHaveText('♞ Board');
  await expect(chip(page)).not.toHaveClass(/chip-warn/);
  await expect(dialog(page)).toHaveCount(0);
});

test('no chip without Web Bluetooth; in Brave without the flag, the chip explains it', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'bluetooth', { value: undefined, configurable: true }));
  await page.goto(site.url);
  await expect(page.locator('.topbar h1')).toBeVisible();
  await expect(chip(page)).toHaveCount(0);

  await page.addInitScript(() => Object.defineProperty(navigator, 'brave', { value: { isBrave: async () => true }, configurable: true }));
  await page.reload();
  await expect(chip(page)).toHaveText('♞ Board');
  await chip(page).click();
  await expect(dialog(page).getByRole('alert')).toHaveText('Turn on Web Bluetooth: open brave://flags/#brave-web-bluetooth-api, set it to Enabled and relaunch Brave (or use Chrome).');
  await expect(chip(page)).toHaveClass(/chip-warn/);
});
