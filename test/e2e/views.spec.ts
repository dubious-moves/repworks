// The Read and Interactive views (PLAN.md §5.10), on a desktop viewport and an emulated phone,
// with the fake GitHub holding the fixture repertoire (Main line: 1. e4 c5 2. Nf3 d6 (2... Nc6
// 3. d4) 3. d4 cxd4, a comment on 2. Nf3). A line read through from the chapter view and back; a
// line played with one wrong move and the other line's move, which the walk follows; nothing
// recorded. Then the transposition badges and copy continuation (§5.11).
import { test, expect, type Page } from '@playwright/test';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare, comment } from './board.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

/** The trainer asks for a move: the feedback line says nothing for it (§5.17), so the phase tells. */
const asked = (page: Page) => expect(page.locator('.train-grid')).toHaveAttribute('data-phase', 'ask');

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
  await page.locator('.move[data-path="e4"]').click({ position: { x: 6, y: 8 } }); // the move, not its +1
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
  await asked(page);
  await play('e7', 'e5');
  await expect(feedback).toHaveText('Not in your repertoire: try again');
  await play('c7', 'c5');
  // 2... d6 is suspended in the training data, and asked here all the same. 2... Nc6 is the
  // other line's move: right, and the walk follows it to 3. d4.
  await asked(page);
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
  await asked(page);
  await page.getByRole('button', { name: 'Hint' }).click();
  await expect(feedback).toHaveText('Play d6');
  await clickSquare(page, 'd7', 'black');
  await clickSquare(page, 'd6', 'black');
  await asked(page);
  await clickSquare(page, 'c5', 'black');
  await clickSquare(page, 'd4', 'black');
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('2 moves, 1 right first time');
  await page.getByRole('button', { name: 'Read the line' }).click();
  await expect(page.locator('.read-move')).toContainText('2. Nf3');
  await page.getByRole('button', { name: 'Play from here' }).click();
  await expect(page).toHaveURL(/#\/play\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3$/);
});

test('transposition badges: a new move order shows ⇄1 both ways and leads to the other; +1 leads to the other chapter', async ({ page, isMobile }) => {
  await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(page.locator('.notation')).toBeVisible();
  // 1. e4 is reached in the Alapin chapter too: a small +1, no ⇄.
  const e4 = page.locator('.move[data-path="e4"]');
  await expect(e4.locator('.xref')).toHaveText('+1');
  await expect(e4.locator('.badge')).toHaveCount(0);

  // A new variation from the start, 1. Nf3 c5 2. e4, reaches 1. e4 c5 2. Nf3's position.
  await page.locator('.move.start').click();
  for (const [from, to] of [['g1', 'f3'], ['c7', 'c5'], ['e2', 'e4']] as const) {
    await clickSquare(page, from, 'black');
    await clickSquare(page, to, 'black');
  }
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'Nf3 c5 e4');
  await expect(page.locator('.move[data-path="Nf3 c5 e4"] .badge')).toHaveText('⇄1');
  await expect(page.locator('.move[data-path="e4 c5 Nf3"] .badge')).toHaveText('⇄1');

  await page.locator('.move[data-path="Nf3 c5 e4"] .badges').click();
  const list = page.getByRole('menu', { name: 'Same position' });
  await expect(list.getByRole('menuitem')).toHaveText(['1. e4 c5 2. Nf3']);
  await list.getByRole('menuitem').click();
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3');
  await expect(list).toHaveCount(0);

  // The +1 on 1... c5 opens the Alapin at its 1... c5.
  await page.locator('.move[data-path="e4 c5"] .badges').click();
  await expect(list.getByRole('menuitem')).toHaveText(['Test repertoire · Alapin: 1. e4 c5']);
  if (!isMobile) {
    // The list takes the focus once it is placed, an effect after its items render.
    await expect(list.getByRole('menuitem')).toBeFocused();
    await page.keyboard.press('Enter');
  } else await list.getByRole('menuitem').click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch2Alapn\?at=e4,c5$/);
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5');
});

test('copy continuation: from the variation’s first move to the end of its line', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only here');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3,Nc6`);
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 Nc6');
  await page.getByRole('button', { name: 'Move menu' }).click();
  await page.getByRole('menuitem', { name: 'Copy continuation' }).click();
  await expect(page.locator('.cv-board .feedback')).toHaveText('Continuation copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('2... Nc6 3. d4');
  // On the main line after the fork: from the main line's move at the fork.
  await page.locator('.move[data-path="e4 c5 Nf3 d6 d4 cxd4"]').click();
  await page.getByRole('button', { name: 'Move menu' }).click();
  await page.getByRole('menuitem', { name: 'Copy continuation' }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('2... d6 3. d4 cxd4');
});

test('clickable lines: preview a comment’s line, step through its lines, and back out', async ({ page, isMobile }) => {
  await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3,d6`);
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6');
  // A line replacing 2... d6, a remark, and a line after it.
  await comment(page, 'Or (2... e6 3. d4) (see below), then (3. d4 cxd4 4. Nxd4)');
  const written = page.locator('.notation .comment', { hasText: 'see below' });
  await expect(written.locator('.line-move')).toHaveText(['e6', 'd4', 'd4', 'cxd4', 'Nxd4']);

  const bar = page.getByRole('group', { name: 'Line from the comment' });
  const next = async () => (isMobile ? bar.getByRole('button', { name: 'Next move in the line' }).click() : page.keyboard.press('ArrowRight'));
  const prev = async () => (isMobile ? bar.getByRole('button', { name: 'Previous move in the line' }).click() : page.keyboard.press('ArrowLeft'));
  await written.locator('.line-move', { hasText: 'e6' }).click();
  await expect(bar).toContainText('From the comment: e6');
  await expect(written.locator('.line-move.current')).toHaveText('e6');
  // The move shown in the notation stays the commented one; the board shows the line.
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6');
  await expect(page.locator('cg-board square.last-move')).toHaveCount(2);
  await next();
  await expect(bar).toContainText('From the comment: e6 d4');
  // On from the line's end into the next line, skipping the remark.
  await next();
  await expect(bar).toContainText('From the comment: d4');
  await expect(written.locator('.line-move.current')).toHaveText('d4');
  await next();
  await next();
  await expect(bar).toContainText('From the comment: d4 cxd4 Nxd4');
  await next();
  await expect(bar).toContainText('From the comment: d4 cxd4 Nxd4');
  await prev();
  await prev();
  await prev();
  await expect(bar).toContainText('From the comment: e6 d4');
  if (isMobile) await bar.getByRole('button', { name: 'Back' }).click();
  else await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6');

  // A click on the board goes back too.
  await written.locator('.line-move', { hasText: 'Nxd4' }).click();
  await expect(bar).toContainText('From the comment: d4 cxd4 Nxd4');
  await clickSquare(page, 'a4', 'black');
  await expect(bar).toHaveCount(0);
});

test('line jumping: → on a line’s last move enters its comment’s line, in the chapter view and the Read view', async ({ page, isMobile }) => {
  test.skip(isMobile, 'arrow keys: the desktop');
  await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3,d6,d4,cxd4`);
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6 d4 cxd4');
  await comment(page, 'Then (4. Nxd4 Nf6 5. Nc3)');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6 d4');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6 d4 cxd4');
  const bar = page.getByRole('group', { name: 'Line from the comment' });
  await expect(bar).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(bar).toContainText('From the comment: Nxd4');
  await page.keyboard.press('ArrowRight');
  await expect(bar).toContainText('From the comment: Nxd4 Nf6');
  // Back before the line's first move leaves it.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(bar).toHaveCount(0);
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6 d4 cxd4');

  // The Read view: the line's end, then into the comment; Escape leaves the line, then the view.
  await page.getByRole('button', { name: 'Read from here' }).click();
  await expect(page.locator('.read-move')).toContainText('3... cxd4');
  await expect(page.locator('.read-comments .line-move')).toHaveText(['Nxd4', 'Nf6', 'Nc3']);
  await page.keyboard.press('ArrowRight');
  await expect(bar).toContainText('From the comment: Nxd4');
  await expect(page.locator('.read-comments .line-move.current')).toHaveText('Nxd4');
  await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  await expect(page).toHaveURL(/#\/read\//);
  await page.locator('.read-comments .line-move', { hasText: 'Nc3' }).click();
  await expect(bar).toContainText('From the comment: Nxd4 Nf6 Nc3');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3,d6,d4,cxd4$/);
});
