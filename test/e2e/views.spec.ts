// The Read and Interactive views (PLAN.md §5.10), on a desktop viewport and an emulated phone,
// with the fake GitHub holding the fixture repertoire (Main line: 1. e4 c5 2. Nf3 d6 (2... Nc6
// 3. d4) 3. d4 cxd4, a comment on 2. Nf3). A line read through from the chapter view and back; a
// line played with one wrong move and the other line's move, which the walk follows; nothing
// recorded.
import { test, expect, type Page } from '@playwright/test';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

async function setUp(page: Page): Promise<FakeGit> {
  const { git, github } = world();
  await page.clock.install({ time: new Date('2026-12-01T10:00:00Z') });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return git;
}

/** Progress files this device wrote (the fixture's devices excluded). */
const ownProgress = (git: FakeGit) => [...git.textsOf().keys()].filter((p) => p.startsWith('progress/') && !p.startsWith('progress/Desktop1/') && !p.startsWith('progress/Phone001/'));

test('read: a line stepped through with its comments, then back to the chapter at the move', async ({ page, isMobile }) => {
  await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await page.locator('.move[data-path="e4"]').click();
  await page.getByRole('button', { name: 'Read from here' }).click();
  await expect(page).toHaveURL(/#\/read\/Rep0Najd\/Ch1Najdf\?at=e4$/);
  await expect(page.locator('.study-title')).toHaveText('Read · Main line');
  const move = page.locator('.read-move');
  await expect(move).toContainText('1. e4');
  await expect(move).toContainText('1 / 6');

  const next = async () => (isMobile ? page.getByRole('button', { name: 'Next move' }).click() : page.keyboard.press('ArrowRight'));
  await next();
  await next();
  await expect(move).toContainText('2. Nf3');
  await expect(page.locator('.read-comments')).toHaveText('A made-up comment');
  await next();
  await expect(move).toContainText('2... d6');
  await expect(page.locator('.read-comments')).toHaveText('No comment.');
  await page.getByRole('button', { name: 'End of the line' }).click();
  await expect(move).toContainText('3... cxd4');
  await expect(page.getByRole('button', { name: 'Next move' })).toBeDisabled();
  // A move of the line picked from the list.
  await page.locator('.read-step', { hasText: 'Nf3' }).click();
  await expect(move).toContainText('2. Nf3');

  if (isMobile) await page.getByRole('button', { name: 'Edit' }).click();
  else await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3$/);
  await expect(page.locator('.move.current')).toHaveText('Nf3');

  // From a variation's move, the line goes through it.
  await page.locator('.move[data-path="e4 c5 Nf3 Nc6"]').click();
  await page.getByRole('button', { name: 'Read from here' }).click();
  await expect(move).toContainText('2... Nc6');
  await expect(move).toContainText('4 / 5');
});

test('play: every own move asked, a wrong move taken back, the other line followed, nothing recorded', async ({ page }) => {
  const git = await setUp(page);
  const before = ownProgress(git).map((p) => git.textsOf().get(p));
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await page.getByRole('button', { name: 'Play from here' }).click();
  await expect(page).toHaveURL(/#\/play\/Rep0Najd\/Ch1Najdf$/);
  await expect(page.locator('.study-title')).toHaveText('Play · Main line');
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/);
  const feedback = page.locator('.train-feedback');
  const play = async (from: string, to: string) => {
    await clickSquare(page, from, 'black');
    await clickSquare(page, to, 'black');
  };

  // 1. e4 by the opponent; 1... c5 asked even though it isn't due. A wrong move goes back.
  await expect(feedback).toHaveText('Your move');
  await play('e7', 'e5');
  await expect(feedback).toHaveText('Not in your repertoire: try again');
  await play('c7', 'c5');
  // 2... d6 is suspended in the training data, and asked here all the same. 2... Nc6 is the
  // other line's move: right, and the walk follows it to 3. d4.
  await expect(feedback).toHaveText('Your move');
  await expect(page.locator('.train-line')).toContainText('1. e4 c5 2. Nf3');
  await play('b8', 'c6');
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('2 moves, 1 right first time');
  await expect(page.getByRole('button', { name: 'Skip line' })).toHaveCount(0);

  // Nothing reaches the data repo.
  await page.locator('.chip').click();
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  expect(ownProgress(git).map((p) => git.textsOf().get(p))).toEqual(before);

  // Back to the chapter at the line's last move.
  await page.getByRole('button', { name: 'Back to the chapter' }).click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3,Nc6,d4$/);
});

test('play from the move menu, from the move shown; read the line from the end', async ({ page, isMobile }) => {
  await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3`);
  await expect(page.locator('.move.current')).toHaveText('Nf3');
  const nf3 = page.locator('.move[data-path="e4 c5 Nf3"]');
  if (isMobile) await page.getByRole('button', { name: 'Move menu' }).click();
  else await nf3.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Play from here' }).click();
  await expect(page).toHaveURL(/#\/play\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3$/);
  const feedback = page.locator('.train-feedback');
  await expect(feedback).toHaveText('Your move');
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(feedback).toHaveText('Play d6');
  await clickSquare(page, 'd7', 'black');
  await clickSquare(page, 'd6', 'black');
  await expect(feedback).toHaveText('Your move');
  await clickSquare(page, 'c5', 'black');
  await clickSquare(page, 'd4', 'black');
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('2 moves, 1 right first time');
  await page.getByRole('button', { name: 'Read the line' }).click();
  await expect(page.locator('.read-move')).toContainText('2. Nf3');
  await page.getByRole('button', { name: 'Play from here' }).click();
  await expect(page).toHaveURL(/#\/play\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3$/);
});
