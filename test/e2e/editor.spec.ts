// The study editor in a real browser (PLAN.md §4.11), on a desktop viewport and an emulated
// phone: open a chapter, move through it, add a variation on the board, comment, add a glyph,
// draw an arrow in draw mode, undo and redo, and check the PGN that reaches the (fake) data repo.
// Then the conflicts view and resolving a conflict.
import { test, expect, type Page } from '@playwright/test';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare, openDrawer, square } from './board.ts';
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

async function setUp(page: Page, git?: FakeGit): Promise<FakeGit> {
  const w = world();
  const g = git ?? w.git;
  const { FakeGithub } = await import('../support/fakeGithub.ts');
  await serveGithub(page, git ? new FakeGithub(g, { repo: REPO, branch: 'main', token: TOKEN }) : w.github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return g;
}

async function sync(page: Page, git: FakeGit, until: (text: string) => boolean) {
  await page.locator('.chip').click();
  await expect.poll(() => until(git.textsOf().get(CHAPTER) ?? '')).toBe(true);
}

test('open a chapter, move through it, and edit it: variation, comment, glyph, arrow, undo and redo', async ({ page, isMobile }) => {
  const git = await setUp(page);
  await page.getByRole('link', { name: 'Test repertoire' }).click();
  // The study opens at its first chapter, from Black's side.
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch1Najdf$/);
  await expect(page.getByLabel('Chapter', { exact: true })).toHaveValue('Ch1Najdf');
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/);
  await expect(page.locator('.notation')).toContainText('A made-up comment');

  // Moving through the moves: a click, and the controls (and keys on the desktop).
  await page.locator('.move[data-path="e4 c5 Nf3"]').click();
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3');
  await expect(page).toHaveURL(/\?at=e4,c5,Nf3$/);
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6');
  if (!isMobile) {
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 Nc6');
    await page.keyboard.press('Home');
    await expect(page.locator('.move.current')).toHaveAttribute('data-path', '');
    await page.keyboard.press('End');
    await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6 d4 cxd4');
  }

  // A new variation: 2... e6 instead of 2... d6, played on the board.
  await page.locator('.move[data-path="e4 c5 Nf3"]').click();
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3');
  await clickSquare(page, 'e7', 'black');
  await clickSquare(page, 'e6', 'black');
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 e6');
  await expect(page.locator('.notation .variation')).toHaveText(['2... Nc6 3. d4', '2... e6']);

  // A comment and a glyph on it.
  await page.getByLabel('Comment on this move').fill('The {Taimanov} way');
  await page.getByRole('button', { name: 'Save comment' }).click();
  await page.getByRole('button', { name: 'Good move' }).click();
  await expect(page.getByRole('button', { name: 'Good move' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.move.current')).toContainText('e6!');

  // An arrow in draw mode, and a circle by a tap.
  await page.getByRole('button', { name: 'Draw mode' }).click();
  await page.getByRole('radio', { name: 'red' }).click();
  const from = await square(page, 'd7', 'black');
  const to = await square(page, 'd5', 'black');
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await page.getByRole('radio', { name: 'green' }).click();
  await clickSquare(page, 'd4', 'black');
  await page.getByRole('button', { name: 'Draw mode' }).click();
  // Drawing didn't move a piece.
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 e6');

  await sync(page, git, (t) => t.includes('e6!'));
  expect(git.textsOf().get(CHAPTER)).toBe(
    '[Event "Test repertoire: Main line"]\n[Result "*"]\n[StudyName "Test repertoire"]\n[ChapterName "Main line"]\n[Orientation "black"]\n\n' +
      '1. e4 c5 2. Nf3 { A made-up comment } { [%csl Gd4][%cal Gd2d4] } 2... d6 (2... Nc6 3. d4) (2... e6! { The Taimanov way } { [%csl Gd4][%cal Rd7d5] }) 3. d4 cxd4 *\n',
  );

  // Undo takes the circle back, then the arrow; redo brings the arrow again.
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.getByRole('button', { name: 'Redo' }).click();
  await sync(page, git, (t) => t.includes('{ [%cal Rd7d5] }'));
  expect(git.textsOf().get(CHAPTER)).toContain('(2... e6! { The Taimanov way } { [%cal Rd7d5] })');
  expect(git.commits.get(git.head)!.message).toMatch(/^desktop: 1 study file/);
});

test('line actions: promote, make main line, delete from here', async ({ page }) => {
  const git = await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3,Nc6`);
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 Nc6');
  await page.getByRole('button', { name: 'Make main line' }).click();
  await expect(page.locator('.notation .pair .move[data-path="e4 c5 Nf3 Nc6"]')).toBeVisible();
  await expect(page.locator('.notation .variation')).toHaveText(['2... d6 3. d4 cxd4']);
  await expect(page.locator('.notation .pair .move[data-path="e4 c5 Nf3 Nc6 d4"]')).toBeVisible();
  await page.getByRole('button', { name: 'Delete from here' }).click();
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3');
  await expect(page.locator('.notation')).not.toContainText('Nc6');
  await sync(page, git, (t) => !t.includes('Nc6'));
  expect(git.textsOf().get(CHAPTER)).toContain('2. Nf3 { A made-up comment } { [%csl Gd4][%cal Gd2d4] } 2... d6 3. d4 cxd4 *');
});

test('chapters: add one, rename it, change its side, and delete it', async ({ page }) => {
  const git = await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch2Alapn`);
  await openDrawer(page);
  await page.getByLabel('Name', { exact: true }).fill('Smith-Morra');
  await page.locator('input[name="new-side"]').first().check();
  await page.getByRole('button', { name: 'Add chapter' }).click();
  // A new ID, not the chapter it was added from.
  await expect(page.getByLabel('Chapter', { exact: true })).not.toHaveValue('Ch2Alapn');
  await expect(page.getByLabel('Chapter', { exact: true }).locator('option:checked')).toHaveText('Smith-Morra');
  const cid = await page.getByLabel('Chapter', { exact: true }).inputValue();
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-white/);
  // Its first move, then a sync.
  await clickSquare(page, 'e2', 'white');
  await clickSquare(page, 'e4', 'white');
  await expect(page.locator('.notation')).toContainText('1. e4');
  await page.locator('.chip').click();
  await expect.poll(() => git.textsOf().get(`studies/Rep0Najd/${cid}.pgn`) ?? '').toContain('1. e4');
  expect(git.textsOf().get(`studies/Rep0Najd/${cid}.pgn`)).toBe('[Event "Test repertoire: Smith-Morra"]\n[Result "*"]\n[StudyName "Test repertoire"]\n[ChapterName "Smith-Morra"]\n[Orientation "white"]\n\n1. e4 *\n');
  expect(JSON.parse(git.textsOf().get('studies/Rep0Najd/study.json')!).chapters).toEqual(['Ch1Najdf', 'Ch2Alapn', cid]);
  // Rename and side.
  await openDrawer(page);
  await page.getByLabel('Chapter name').fill('Morra');
  await page.getByRole('button', { name: 'Rename chapter' }).click();
  await page.locator('input[name="side"]').nth(1).check();
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/);
  await expect(page.getByLabel('Chapter', { exact: true }).locator('option:checked')).toHaveText('Morra');
  // Delete: back to the study's first chapter.
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'Delete chapter' }).click();
  await expect(page.getByLabel('Chapter', { exact: true })).toHaveValue('Ch1Najdf');
  await page.locator('.chip').click();
  await expect.poll(() => git.textsOf().has(`studies/Rep0Najd/${cid}.pgn`)).toBe(false);
  expect(JSON.parse(git.textsOf().get('studies/Rep0Najd/study.json')!).chapters).toEqual(['Ch1Najdf', 'Ch2Alapn']);
});

test('the conflicts view lists every marker; resolving one is an edit that syncs', async ({ page }) => {
  const { git } = world();
  const conflicted =
    '[Event "Test repertoire: Main line"]\n[Result "*"]\n[StudyName "Test repertoire"]\n[ChapterName "Main line"]\n[Orientation "black"]\n\n' +
    '1. e4 c5 2. Nf3 { <<<<<<< phone 2026-10-06\nphone text\n=======\ndesktop text\n>>>>>>> desktop 2026-10-06 } 2... d6 (2... Nc6 { <<<<<<< kept: deleted on desktop 2026-10-06 } 3. d4 a6) 3. d4 cxd4 *\n';
  git.commitIfHead(git.head, 'phone: 1 study file\n\nrepworks-sync: Phone001:9', new Map([[CHAPTER, conflicted]]), []);
  await setUp(page, git);
  await expect(page.getByRole('link', { name: '2 open conflicts' })).toBeVisible();
  await page.getByRole('link', { name: '2 open conflicts' }).click();
  await expect(page.locator('.conflicts li')).toHaveCount(2);
  await expect(page.locator('.conflicts')).toContainText('Test repertoire · Main line · e4 c5 Nf3');
  await expect(page.locator('.conflicts')).toContainText('a line kept after a delete');

  await page.getByRole('button', { name: 'Test repertoire · Main line · e4 c5 Nf3', exact: false }).first().click();
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3');
  await expect(page.locator('.conflict-box')).toContainText('phone 2026-10-06: phone text');
  await page.getByRole('button', { name: 'Keep both' }).click();
  await expect(page.locator('.notation')).toContainText('phone text desktop text'.replace(' desktop', '\ndesktop').split('\n')[0]!);

  await page.locator('.move[data-path="e4 c5 Nf3 Nc6"]').click();
  await page.getByRole('button', { name: 'Keep the line' }).click();
  await expect(page.locator('.conflict-box')).toHaveCount(0);
  await sync(page, git, (t) => !t.includes('<<<<<<<'));
  expect(git.textsOf().get(CHAPTER)).toContain('2. Nf3 { phone text\ndesktop text } 2... d6 (2... Nc6 3. d4 a6) 3. d4 cxd4 *');
  await page.goto(`${site.url}#/conflicts`);
  await expect(page.locator('.card')).toContainText('No open conflicts.');
});

test('an unreadable chapter is shown without editing, and never rewritten', async ({ page }) => {
  const { git } = world();
  git.commitIfHead(git.head, 'claude: 1 study file', new Map([['studies/Rep0Najd/Ch2Alapn.pgn', '[Event "x"]\n[FEN "not a fen"]\n\n1. e4 *\n']]), []);
  await setUp(page, git);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch2Alapn`);
  await expect(page.getByRole('alert')).toContainText("This chapter can't be read, so the app never rewrites it");
  await expect(page.locator('cg-board')).toHaveCount(0);
});

test('a move lands on the squares pressed after the board has moved down the page', async ({ page }) => {
  await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3,Nc6,d4`);
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 Nc6 d4');
  // A press on an empty square makes chessground note where the board is.
  await clickSquare(page, 'h4', 'black');
  // Something opens above the board (a banner, say): no scroll, no resize of the board.
  await page.evaluate(() => {
    const block = document.createElement('div');
    block.style.height = '60px';
    document.querySelector('main.content')!.prepend(block);
  });
  await clickSquare(page, 'c5', 'black');
  await clickSquare(page, 'd4', 'black');
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 Nc6 d4 cxd4');
});

test('a wide screen shows the chapters on the left, and the board and panel fit the window', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the phone keeps one column');
  await page.setViewportSize({ width: 1400, height: 800 });
  await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  const chapters = page.getByRole('navigation', { name: 'Chapters' });
  await expect(chapters.locator('[aria-current="page"]')).toHaveCount(1);
  for (const sel of ['.cv-board .board', '.cv-panel', '.cv-chapters']) {
    const box = (await page.locator(sel).boundingBox())!;
    expect(box.y + box.height, sel).toBeLessThanOrEqual(800);
    expect(box.x + box.width, sel).toBeLessThanOrEqual(1400);
  }
  await chapters.getByRole('link').nth(1).click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch2Alapn/);
  await expect(chapters.getByRole('link').nth(1)).toHaveAttribute('aria-current', 'page');
});
