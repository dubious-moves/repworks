// A comment's lines written from the board (PLAN.md §5.217), on a desktop viewport and an
// emulated phone: a line started from a move's menu with nothing typed, a move at its end, a
// branch in its middle, the line's own move stepped to, Delete from here, undo, and the file that
// reaches the (fake) data repo.
import { test, expect, type Page } from '@playwright/test';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare, comment, openMoveMenu, studyMenu } from './board.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

const CHAPTER = 'studies/Rep0Najd/Ch1Najdf.pgn';
const D6 = 'e4 c5 Nf3 d6';

async function setUp(page: Page): Promise<FakeGit> {
  const w = world();
  await serveGithub(page, w.github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3,d6`);
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', D6);
  return w.git;
}

/** A move on the board, by its two squares (the chapter is seen from Black's side). */
async function play(page: Page, from: string, to: string) {
  await clickSquare(page, from, 'black');
  await clickSquare(page, to, 'black');
}

test('a line started from the move’s menu and played on the board: its end, a branch, a step, delete, undo', async ({ page, isMobile }) => {
  const git = await setUp(page);
  const bar = page.getByRole('group', { name: 'Line from the comment' });
  const lines = page.locator('.notation .comment-line');
  const prev = async () => (isMobile ? bar.getByRole('button', { name: 'Previous move in the line' }).click() : page.keyboard.press('ArrowLeft'));

  // Nothing is written until the line's first move is played.
  await openMoveMenu(page, D6);
  await page.getByRole('menuitem', { name: 'Start a clickable line' }).click();
  const starting = page.getByRole('group', { name: 'New line in the comment' });
  await expect(starting).toContainText('New line after d6');
  await expect(lines).toHaveCount(0);
  await play(page, 'f1', 'b5');
  await expect(starting).toHaveCount(0);
  await expect(bar).toContainText('From the comment: Bb5+');
  await expect(lines).toHaveText(['(3. Bb5+)']);
  // The notation stays on the commented move; the board shows the line's.
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', D6);

  // On its last move, a move goes on the line's end.
  await play(page, 'c8', 'd7');
  await expect(bar).toContainText('From the comment: Bb5+ Bd7');
  await play(page, 'b5', 'd7');
  await expect(bar).toContainText('From the comment: Bb5+ Bd7 Bxd7+');
  await expect(lines).toHaveText(['(3. Bb5+ Bd7 4. Bxd7+)']);

  // In its middle, another move is a branch, written after the move it replaces.
  await prev();
  await prev();
  await expect(bar).toContainText('From the comment: Bb5+');
  await play(page, 'b8', 'c6');
  await expect(bar).toContainText('From the comment: Bb5+ Nc6');
  await expect(lines).toHaveText(['(3. Bb5+ Bd7 ', '(3... Nc6)', ' 4. Bxd7+)']);
  await expect(page.locator('.notation .line-move.current')).toHaveText('Nc6');
  // Back from the branch's first move is the move it left; the line's own next move is stepped to, not written again.
  await prev();
  await expect(bar).toContainText('From the comment: Bb5+');
  await play(page, 'c8', 'd7');
  await expect(bar).toContainText('From the comment: Bb5+ Bd7');
  await expect(page.locator('.notation .comment', { hasText: 'Bb5+' })).toHaveText('(3. Bb5+ Bd7 (3... Nc6) 4. Bxd7+)');

  // A press on the board doesn't leave the line here: its pieces are there to be moved.
  await clickSquare(page, 'a4', 'black');
  await expect(bar).toBeVisible();

  // The chapter's own moves are as they were, and the comment reaches the data repo.
  await expect(page.locator(`.notation .move[data-path="${D6} d4"]`)).toBeVisible();
  await page.locator('.chip').click();
  await expect.poll(() => git.textsOf().get(CHAPTER) ?? '').toContain('2... d6 { (3. Bb5+ Bd7 (3... Nc6) 4. Bxd7+) }');

  // Delete from here: the move shown and the rest of its line; the other choice to it stays.
  await bar.getByRole('button', { name: 'Delete from here' }).click();
  await expect(bar).toContainText('From the comment: Bb5+');
  await expect(page.locator('.notation .comment', { hasText: 'Bb5+' })).toHaveText('(3. Bb5+ (3... Nc6))');
  // Undo brings it back, and leaves the line.
  await studyMenu(page, 'Undo');
  await expect(bar).toHaveCount(0);
  await expect(page.locator('.notation .comment', { hasText: 'Bb5+' })).toHaveText('(3. Bb5+ Bd7 (3... Nc6) 4. Bxd7+)');
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', D6);
});

test('a line started and given up writes nothing; a new line comes after the comment’s text, and one already there is entered', async ({ page, isMobile }) => {
  await setUp(page);
  const starting = page.getByRole('group', { name: 'New line in the comment' });
  const bar = page.getByRole('group', { name: 'Line from the comment' });
  const start = async () => {
    if (!isMobile) return page.keyboard.press('l');
    await openMoveMenu(page, D6);
    await page.getByRole('menuitem', { name: 'Start a clickable line' }).click();
  };
  await start();
  await expect(starting).toBeVisible();
  if (isMobile) await starting.getByRole('button', { name: 'Back' }).click();
  else await page.keyboard.press('Escape');
  await expect(starting).toHaveCount(0);
  await expect(page.locator('.notation .comment-line')).toHaveCount(0);
  // A move now is the chapter's, as ever: 3. d4 is there already, and is stepped to.
  await play(page, 'd2', 'd4');
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', `${D6} d4`);
  await page.locator(`.move[data-path="${D6}"]`).click();
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', D6);

  await comment(page, 'The Moscow: (3. Bb5+ Bd7) is solid.');
  const written = page.locator('.notation .comment', { hasText: 'Moscow' });
  await start();
  await play(page, 'c2', 'c3');
  await expect(bar).toContainText('From the comment: c3');
  await expect(written).toHaveText('The Moscow: (3. Bb5+) is solid. (3. c3)');
  if (isMobile) await bar.getByRole('button', { name: 'Back' }).click();
  else await page.keyboard.press('Escape');
  // The first move of a line already there: the line is entered, nothing written.
  await start();
  await play(page, 'f1', 'b5');
  await expect(bar).toContainText('From the comment: Bb5+');
  await expect(written).toHaveText('The Moscow: (3. Bb5+ Bd7) is solid. (3. c3)');
});
