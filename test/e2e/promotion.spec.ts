// A promotion's piece chosen as on Lichess (Board.tsx), on a desktop viewport and an emulated
// phone: the four pieces in a column from the promotion square over a dimmed board, the pawn
// waiting on its square; Escape or a click elsewhere takes no piece, a click on one plays it.
import { test, expect } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare, studyMenu } from './board.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

test('a promotion: the pieces on the board, Escape and a click elsewhere take none, a click plays one', async ({ page }) => {
  const { github } = world();
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
  await expect(page.locator('.notation')).toContainText('1. e4');
  await studyMenu(page, 'New chapter');
  const dialog = page.getByRole('dialog', { name: 'New chapter' });
  await dialog.getByLabel('From FEN').check();
  await dialog.getByLabel('FEN', { exact: true }).fill('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
  await dialog.getByLabel('Chapter name').fill('Promotion');
  await dialog.getByLabel('White').check();
  await dialog.getByRole('button', { name: 'Create chapter' }).click();
  await dialog.waitFor({ state: 'detached' });

  const choice = page.getByRole('dialog', { name: 'Promote to' });
  const box = async (name: string) => (await choice.getByRole('button', { name, exact: true }).boundingBox())!;
  const square = async () => (await page.locator('.cg-wrap cg-board').boundingBox())!.width / 8;

  await clickSquare(page, 'b7', 'white');
  await clickSquare(page, 'b8', 'white');
  await expect(choice).toBeVisible();
  // Queen on b8, then knight, rook and bishop down the b-file.
  const s = await square();
  const board = (await page.locator('.cg-wrap cg-board').boundingBox())!;
  const q = await box('queen');
  expect(Math.abs(q.x - (board.x + s))).toBeLessThan(2);
  expect(Math.abs(q.y - board.y)).toBeLessThan(2);
  for (const [i, role] of (['knight', 'rook', 'bishop'] as const).entries()) expect(Math.abs((await box(role)).y - (board.y + (i + 1) * s))).toBeLessThan(2);
  // The pawn waits on b8.
  await expect(page.locator('.cg-host piece.pawn.white:not(.ghost)')).toHaveCount(1);

  await page.keyboard.press('Escape');
  await expect(choice).toHaveCount(0);
  await expect(page.locator('.notation')).not.toContainText('b8');

  await clickSquare(page, 'b7', 'white');
  await clickSquare(page, 'b8', 'white');
  await clickSquare(page, 'g3', 'white');
  await expect(choice).toHaveCount(0);
  await expect(page.locator('.notation')).not.toContainText('b8');

  await clickSquare(page, 'b7', 'white');
  await clickSquare(page, 'b8', 'white');
  await choice.getByRole('button', { name: 'knight', exact: true }).click();
  await expect(choice).toHaveCount(0);
  await expect(page.locator('.notation')).toContainText('1. b8=N');
  await expect(page.locator('.cg-host piece.knight.white:not(.ghost)')).toHaveCount(1);
});
