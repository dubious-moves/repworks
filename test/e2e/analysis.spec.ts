// The analysis board (PLAN.md §5.35), on desktop and the emulated phone: opened from the home
// screen, moves played and kept on the device (never synced), a FEN set up, the engine there; then
// opened from a chapter's move, a line played and added back to that chapter, synced.
import { test, expect, type Page } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import type { FakeGit } from '../support/fakeGit.ts';
import { clickSquare, openMoveMenu } from './board.ts';
import { commands, fakeEngine } from './engine.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeEach(async () => {
  site = await serveSite({ engine: fakeEngine() });
});
test.afterEach(async () => {
  await site.close();
});

async function setUp(page: Page): Promise<FakeGit> {
  const w = world();
  await serveGithub(page, w.github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return w.git;
}

test('from the home screen: moves kept on this device, never synced; a FEN set up; the engine', async ({ page }) => {
  const git = await setUp(page);
  const head = git.head;
  await page.getByRole('link', { name: 'Analysis board' }).click();
  await expect(page).toHaveURL(/#\/analysis$/);
  await expect(page.locator('.study-title')).toHaveText('Analysis board');
  await clickSquare(page, 'e2', 'white');
  await clickSquare(page, 'e4', 'white');
  await clickSquare(page, 'e7', 'white');
  await clickSquare(page, 'e5', 'white');
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 e5');
  // Kept after a reload, on this device only: a sync sends nothing.
  await page.reload();
  await expect(page.locator('.notation')).toContainText('e4');
  await expect(page.locator('.notation')).toContainText('e5');
  await page.locator('.chip').click();
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  expect(git.head).toBe(head);
  // No chapters, no training, no card here.
  await expect(page.getByRole('navigation', { name: 'Chapters' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Train', exact: true })).toHaveCount(0);
  // A FEN set up: a new board from it, with Black to move (turned).
  await page.getByLabel('FEN').fill('4k3/8/8/8/8/8/4P3/4K3 b - - 0 1');
  await page.getByRole('button', { name: 'Set up' }).click();
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/);
  await expect(page.locator('.notation')).not.toContainText('e5');
  await expect(page.getByLabel('FEN')).toHaveAttribute('placeholder', '4k3/8/8/8/8/8/4P3/4K3 b - - 0 1');
  // A bad one says so and leaves the board.
  await page.getByLabel('FEN').fill('not a fen');
  await page.getByRole('button', { name: 'Set up' }).click();
  await expect(page.locator('.feedback')).not.toHaveText('');
  await expect(page.getByLabel('FEN')).toHaveAttribute('placeholder', '4k3/8/8/8/8/8/4P3/4K3 b - - 0 1');
  // The engine works here too.
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByRole('region', { name: 'Engine' }).getByRole('switch', { name: 'Engine' }).check();
  await expect(page.getByRole('region', { name: 'Engine' }).locator('.engine-line')).toHaveCount(3);
  expect(commands(site.requests)).toContain('position fen rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
});

test('from a chapter’s move: a line played there and added back to the chapter, synced', async ({ page }) => {
  const git = await setUp(page);
  await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
  await expect(page.locator('.notation')).toContainText('A made-up comment');
  await openMoveMenu(page, 'e4 c5 Nf3');
  await page.getByRole('menuitem', { name: 'Analyse from here' }).click();
  await expect(page).toHaveURL(/#\/analysis\?fen=.*&from=Rep0Najd\/Ch1Najdf&at=e4,c5,Nf3$/);
  // Black to move after 2. Nf3: the board from Black's side; 2... e6 3. d4 played.
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/);
  await clickSquare(page, 'e7', 'black');
  await clickSquare(page, 'e6', 'black');
  await clickSquare(page, 'd2', 'black');
  await clickSquare(page, 'd4', 'black');
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e6 d4');
  await page.getByRole('button', { name: 'Add to a chapter…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to a chapter' });
  await expect(dialog).toContainText('e6 d4');
  await expect(dialog.getByRole('radio').first()).toBeChecked();
  await expect(dialog.locator('label').first()).toContainText('Test repertoire / Main line');
  await dialog.getByRole('button', { name: 'Add' }).click();
  // The chapter opens at the line's end, the variation in it.
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3,e6,d4$/);
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 e6 d4');
  await page.locator('.chip').click();
  await expect.poll(() => git.textsOf().get('studies/Rep0Najd/Ch1Najdf.pgn') ?? '').toContain('(2... e6 3. d4)');
});
