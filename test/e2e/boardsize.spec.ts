// The board's size (src/app/boardSize.ts): dragged from the study board's corner, the same on the
// training and practice boards, kept over a reload, and a double click gives back the default.
import { test, expect, type Page } from '@playwright/test';
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

const side = async (page: Page) => {
  const board = page.locator('.board').first();
  await expect(board).toBeVisible();
  return Math.round((await board.boundingBox())!.width);
};

test('the board resized on a study is the same size in training and practice', async ({ page }) => {
  const { github } = world();
  await page.clock.install({ time: new Date('2026-12-01T10:00:00Z') });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);

  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  const before = await side(page);
  const handle = page.getByTestId('board-resize');
  const at = (await handle.boundingBox())!;
  await page.mouse.move(at.x + 5, at.y + 5);
  await page.mouse.down();
  await page.mouse.move(at.x - 80, at.y - 80, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => side(page)).toBeLessThan(before - 60);
  const size = await side(page);
  expect(Number(await page.evaluate(() => localStorage.getItem('repworks-board-size')))).toBe(size);

  await page.goto(`${site.url}#/`);
  await page.locator('.train-card').getByRole('link', { name: 'Train' }).click();
  await expect.poll(() => side(page)).toBe(size);
  await page.evaluate(() => (location.hash = '#/practice?fen=' + encodeURIComponent('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')));
  await expect(page.locator('.practice-game')).toBeVisible();
  await expect.poll(() => side(page)).toBe(size);

  await page.reload();
  await expect(page.locator('.practice-game')).toBeVisible();
  await expect.poll(() => side(page)).toBe(size);
  await page.getByTestId('board-resize').dblclick();
  await expect.poll(() => side(page)).toBeGreaterThan(size);
  expect(await page.evaluate(() => localStorage.getItem('repworks-board-size'))).toBeNull();
});

test('on a wide screen the board keeps its place and size between the study and training', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the shared stage is the wide screen’s');
  await page.setViewportSize({ width: 1600, height: 900 });
  const { github } = world();
  await page.clock.install({ time: new Date('2026-12-01T10:00:00Z') });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  // The sync status sits in the footer on a desktop.
  await expect(page.locator('.footer .chip')).toBeVisible();

  const box = async () => {
    const b = (await page.locator('.board').first().boundingBox())!;
    return [b.x, b.y, b.width].map(Math.round);
  };
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3`);
  await expect(page.locator('.move.current')).toBeVisible();
  const study = await box();
  // In the page's middle.
  expect(Math.abs(study[0]! + study[2]! / 2 - 800)).toBeLessThanOrEqual(1);
  const sw = page.getByRole('group', { name: 'Study or train' });
  await sw.getByRole('button', { name: 'Train' }).click();
  await expect(page.locator('.train-grid')).toHaveAttribute('data-phase', 'pick');
  expect(await box()).toEqual(study);
  await page.getByRole('button', { name: 'Train this line' }).click();
  await expect(page.locator('.train-grid')).toHaveAttribute('data-phase', 'ask');
  expect(await box()).toEqual(study);
  await sw.getByRole('button', { name: 'Study' }).click();
  await expect(page.locator('.move.current')).toBeVisible();
  expect(await box()).toEqual(study);
});
