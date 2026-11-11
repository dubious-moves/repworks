// A phone held sideways, and a window as short (PLAN.md §5.164), over the fixture repertoire: on
// the phone project the emulated Pixel 7 turned (915×412, and a narrower phone's 740×360), on the
// desktop project a window of those sizes. On a board page the board is pinned at the left, whole
// and as tall as the window lets it be, with the head, the move buttons, the notation and the
// training panel in a column beside it; the ☰ menu scrolls inside the window; the sync status is
// in the footer; an engine is asked as a phone's while the phone is on its side; and turned
// upright again the page is the one it was.
//
// Controls run on 2026-11-11, each failing at the assertion named:
// - without app.css's last block (the sideways layout): every test fails at "the board is …px or
//   more" (the study's board is 172px wide at 915×412, training's 260px at 740×360, its foot
//   under the window's);
// - without the menu's max-height: the study test fails at "the menu is inside the window" at
//   740×360 (its last items couldn't be reached);
// - with device.ts's query back to `(max-width: 768px)`: the phone project's engine is given
//   32 MB, the desktop project's test still passing.
import { test, expect, type Page } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare, studyMenu } from './board.ts';
import { commands, fakeEngine } from './engine.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';
import { walkOnce } from './prefs.ts';

let site: SiteServer;
test.beforeEach(async () => {
  site = await serveSite({ engine: fakeEngine() });
});
test.afterEach(async () => {
  await site.close();
});

/** A day when the fixture's 1... c5 is due (train.spec.ts). */
const DAY = new Date('2026-12-01T10:00:00Z');

async function setUp(page: Page) {
  await page.clock.install({ time: DAY });
  await serveGithub(page, world().github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  // The first run's notice, gone as on every day after it.
  await page.locator('.banner').getByRole('button').click();
}

const BOARD = ':is(.cv-board, .train-board) > .board .cg-wrap';

/** The page's board is whole on screen, at least `least` wide, and the page doesn't scroll sideways. */
async function boardWhole(page: Page, least: number) {
  const size = page.viewportSize()!;
  await expect
    .poll(async () => {
      const b = await page.locator(BOARD).boundingBox();
      return b ? b.width : 0;
    }, { message: `the board is ${least}px or more` })
    .toBeGreaterThanOrEqual(least);
  const box = (await page.locator(BOARD).boundingBox())!;
  expect(box.width, 'the board is square').toBeCloseTo(box.height, 0);
  expect(box.x >= 0 && box.y >= 0 && box.x + box.width <= size.width && box.y + box.height <= size.height, 'the board is whole on screen').toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'the page doesn’t scroll sideways').toBeLessThanOrEqual(0);
  return box;
}

/** `locator` is on screen, and beside the board, not on it. */
async function beside(page: Page, locator: ReturnType<Page['locator']>, board: { x: number; width: number }) {
  await expect(locator).toBeInViewport({ ratio: 1 });
  const box = (await locator.boundingBox())!;
  expect(box.x, 'beside the board').toBeGreaterThanOrEqual(board.x + board.width);
}

test('a study sideways: the board whole at the left, the move buttons and the notation beside it, the menu and the sync status in reach, and upright again', async ({ page, isMobile }) => {
  await setUp(page);
  await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
  await expect(page.locator('.notation')).toContainText('A made-up comment');
  const upright = (await page.locator(BOARD).boundingBox())!;

  await page.setViewportSize({ width: 915, height: 412 });
  const board = await boardWhole(page, 300);
  await beside(page, page.getByRole('button', { name: 'Next move' }), board);
  await beside(page, page.getByRole('button', { name: 'More', exact: true }), board);
  await beside(page, page.locator('.chapter-head .back'), board);
  // Home is in the head: the top bar, where a phone has it, is gone.
  await expect(page.locator('.topbar')).toBeHidden();
  await beside(page, page.locator('.chapter-head .head-home'), board);
  const notation = (await page.locator('.notation').boundingBox())!;
  expect(notation.x).toBeGreaterThanOrEqual(board.x + board.width);

  // The board takes a tap: 1. e4 is in the chapter, shown in the notation.
  await clickSquare(page, 'e2', 'black');
  await clickSquare(page, 'e4', 'black');
  await expect(page.locator('.notation .move.current')).toContainText('e4');

  // The column beside the board scrolls with the page; the board stays where it is.
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(0);
  expect((await page.locator(BOARD).boundingBox())!.y).toBe(board.y);
  // The sync status ends the column.
  await expect(page.locator('.footer .sync-chip')).toBeInViewport();
  await expect(page.locator('.footer .sync-chip')).toHaveText(/^synced/);
  await page.evaluate(() => scrollTo(0, 0));

  // A narrower phone: the same, and the ☰ menu, taller than the window, scrolls to its last item.
  await page.setViewportSize({ width: 740, height: 360 });
  const small = await boardWhole(page, 280);
  await beside(page, page.getByRole('button', { name: 'Next move' }), small);
  await page.getByRole('button', { name: 'More', exact: true }).click();
  const menu = page.getByRole('menu', { name: 'More' });
  const menuBox = (await menu.boundingBox())!;
  expect(menuBox.y >= 0 && menuBox.y + menuBox.height <= 360, 'the menu is inside the window').toBe(true);
  await page.keyboard.press('Escape');
  await studyMenu(page, 'Study settings');
  await expect(page.getByRole('dialog', { name: 'Study settings' })).toBeVisible();
  await page.keyboard.press('Escape');

  // Upright again: the page as it was.
  await page.setViewportSize(isMobile ? { width: 412, height: 839 } : { width: 1280, height: 720 });
  await expect(page.locator('.topbar')).toBeVisible();
  await expect.poll(async () => (await page.locator(BOARD).boundingBox())!.width).toBe(upright.width);
  expect((await page.locator(BOARD).boundingBox())!.x).toBe(upright.x);
});

test('training sideways: the board whole, the buttons and the wrong move’s line beside it, a move taken', async ({ page }) => {
  await walkOnce(page);
  await setUp(page);
  await page.setViewportSize({ width: 740, height: 360 });
  await page.locator('.train-card').getByRole('link', { name: 'Train' }).click();
  await expect(page.locator('.train-grid')).toHaveAttribute('data-phase', 'ask');
  const board = await boardWhole(page, 280);
  await beside(page, page.getByRole('button', { name: 'Hint' }), board);
  await beside(page, page.locator('.train-counters'), board);

  // A wrong move: the line that says so is beside the board, on screen; then the right one.
  await clickSquare(page, 'e7', 'black');
  await clickSquare(page, 'e5', 'black');
  await expect(page.locator('.train-feedback')).toHaveText('Not in your repertoire: try again');
  await beside(page, page.locator('.train-feedback'), board);
  await clickSquare(page, 'c7', 'black');
  await clickSquare(page, 'c5', 'black');
  await expect(page.locator('.train-feedback')).toHaveText(/^Line done/);
  await beside(page, page.getByRole('button', { name: 'Next line' }), board);

  // The wider phone, and a window too short for anything but the board's column: still whole.
  await page.setViewportSize({ width: 915, height: 412 });
  await boardWhole(page, 300);
  await page.setViewportSize({ width: 640, height: 330 });
  await boardWhole(page, 240);
});

test('the analysis board and an endgame sideways; the engine asked as a phone’s on a phone', async ({ page, isMobile }) => {
  await setUp(page);
  await page.setViewportSize({ width: 915, height: 412 });
  await page.getByRole('link', { name: 'Analysis board' }).click();
  const board = await boardWhole(page, 300);
  await beside(page, page.getByRole('button', { name: 'Set up' }), board);
  await beside(page, page.getByRole('button', { name: 'Next move' }), board);
  // The engine's hash is a phone's (16 MB) on the phone turned, a desktop's in a short window.
  await page.getByRole('region', { name: 'Engine' }).getByRole('switch', { name: 'Engine' }).check();
  await expect.poll(() => commands(site.requests).find((c) => c.startsWith('setoption name Hash'))).toBe(`setoption name Hash value ${isMobile ? 16 : 32}`);

  await page.goto(`${site.url}#/endgames/lucena`);
  await expect(page.getByTestId('endgame-game')).toBeVisible();
  const endgame = await boardWhole(page, 300);
  await beside(page, page.getByRole('button', { name: 'Hint' }), endgame);
});
