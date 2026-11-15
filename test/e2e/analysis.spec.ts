// The analysis board (PLAN.md §5.35), on desktop and the emulated phone: opened from the home
// screen, moves played and kept on the device (never synced), a FEN set up, the engine there; then
// opened from a chapter's move, a line played and added back to that chapter, synced.
import { test, expect, type Page } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import type { FakeGit } from '../support/fakeGit.ts';
import { clickSquare, studyMenu } from './board.ts';
import { commands, fakeEngine } from './engine.ts';
import { serveTablebase, type FakeTablebase } from './explorer.ts';
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
  // Lichess's tablebase answers "unknown" unless a spec routes its own (§5.189): an ending set up here never reaches the network.
  await serveTablebase(page);
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
  // The opening's name under the board (§5.181), from the bundled list; a move back, the name there.
  await expect(page.getByTestId('opening-name')).toHaveText('C20 · King\'s Pawn Game');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('opening-name')).toHaveText('B00 · King\'s Pawn Game');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('opening-name')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 e5');
  // Kept after a reload, on this device only: a sync sends nothing.
  await page.reload();
  await expect(page.locator('.notation')).toContainText('e4');
  await expect(page.locator('.notation')).toContainText('e5');
  // The material above and below the board: level, nothing shown.
  const top = page.getByTestId('board-material-top');
  const bottom = page.getByTestId('board-material-bottom');
  await expect(top).toHaveAttribute('aria-label', 'Black material');
  await expect(bottom).toHaveAttribute('aria-label', 'White material');
  await expect(page.locator('.board-material piece')).toHaveCount(0);
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
  // An ending has no opening's name.
  await expect(page.getByTestId('opening-name')).toHaveCount(0);
  // White a pawn up, at the top of the turned board: the board's own pawn above it, and +1.
  await expect(top).toHaveAttribute('aria-label', 'White material +1');
  await expect(top.locator('piece.pawn.white')).toHaveCount(1);
  await expect(top.locator('.material-score')).toHaveText('+1');
  expect(await top.locator('piece').evaluate((e) => getComputedStyle(e).backgroundImage)).toMatch(/^url\("data:image\/svg/);
  await expect(bottom).toHaveAttribute('aria-label', 'Black material');
  await expect(bottom.locator('piece, .material-score')).toHaveCount(0);
  const [b, t] = [(await page.locator('.board .cg-host').boundingBox())!, (await top.boundingBox())!];
  expect(t.y + t.height).toBeLessThanOrEqual(b.y + 1);
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

test('the tablebase shown where the position is in it: the verdict, each move with its outcome, a move played from the list (§5.189)', async ({ page }) => {
  const OPPOSITION = '8/8/8/4k3/8/3K4/4P3/8 w - -';
  const table: FakeTablebase = {
    positions: new Map([[OPPOSITION, { category: 'win', dtm: 21, dtz: 3, moves: [['d3d2', 'loss', 20], ['d3e3', 'draw'], ['d3c3', 'draw']] }]]),
    requests: [],
  };
  await setUp(page);
  await serveTablebase(page, table);
  await page.getByRole('link', { name: 'Analysis board' }).click();
  const row = page.getByRole('region', { name: 'Engine' }).getByTestId('tablebase');
  // The start position has too many pieces: no row, and nothing asked.
  await expect(row).toHaveCount(0);
  expect(table.requests).toEqual([]);
  // A FEN with three pieces, the engine off: the tablebase answers all the same.
  await page.getByLabel('FEN').fill(`${OPPOSITION} 0 1`);
  await page.getByRole('button', { name: 'Set up' }).click();
  await expect(row.getByTestId('tablebase-verdict')).toHaveText('White wins, mate in 11');
  expect(table.requests).toEqual([`${OPPOSITION.replace(/ /g, '_')}_0_1`]);
  const moves = row.getByRole('button');
  await expect(moves).toHaveText(['Kd2 win · M11', 'Ke3 draw', 'Kc3 draw']);
  // A move in the list is played on the board, into the line; its position isn't the fake's: no answer.
  await row.getByRole('button', { name: /^Kd2/ }).click();
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'Kd2');
  await expect(row).toHaveAttribute('data-state', 'none');
  // Back, the answer is kept: shown again with no new request.
  await page.keyboard.press('ArrowLeft');
  await expect(row.getByTestId('tablebase-verdict')).toHaveText('White wins, mate in 11');
  expect(table.requests.filter((f) => f.startsWith(OPPOSITION.replace(/ /g, '_')))).toHaveLength(1);
  // A new board: the full set of pieces again, the row gone.
  await page.getByRole('button', { name: 'New' }).click();
  await expect(row).toHaveCount(0);
});

test('from a chapter’s move: a line played there and added back to the chapter, synced', async ({ page }) => {
  const git = await setUp(page);
  await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
  await expect(page.locator('.notation')).toContainText('A made-up comment');
  // The board keeps the chapter's side (Black) even with White to move (the owner's request, 2026-10-08).
  await page.locator('.move[data-path="e4 c5"]').click({ position: { x: 6, y: 8 } }); // the move, not its +1
  await studyMenu(page, 'Analyse from here');
  await expect(page).toHaveURL(/#\/analysis\?fen=.*&from=Rep0Najd\/Ch1Najdf&at=e4,c5&side=black$/);
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/);
  // …and so does practising from it: Black is played, White moves first.
  await page.getByRole('button', { name: 'Practise' }).click();
  await expect(page).toHaveURL(/#\/practice\?fen=.*&side=black$/);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await page.locator('.move[data-path="e4 c5 Nf3"]').click();
  await studyMenu(page, 'Analyse from here');
  await expect(page).toHaveURL(/#\/analysis\?fen=.*&from=Rep0Najd\/Ch1Najdf&at=e4,c5,Nf3&side=black$/);
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

test('the board flipped from the ☰ menu or with F, kept with the board, never undone (§5.134)', async ({ page }) => {
  await setUp(page);
  await page.getByRole('link', { name: 'Analysis board' }).click();
  await page.getByRole('button', { name: 'New' }).click();
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-white/);
  await clickSquare(page, 'e2', 'white');
  await clickSquare(page, 'e4', 'white');
  await studyMenu(page, 'Flip board');
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/);
  await expect(page.getByTestId('board-material-bottom')).toHaveAttribute('aria-label', /^Black material/);
  // Not an edit: undo takes the move back and leaves the board turned.
  await page.keyboard.press('Control+z');
  await expect(page.locator('.notation')).not.toContainText('e4');
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/);
  await page.keyboard.press('Control+y');
  await expect(page.locator('.notation')).toContainText('e4');
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/);
  // Kept after a reload; F turns it back.
  await page.reload();
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/);
  await page.keyboard.press('f');
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-white/);
  await page.keyboard.press('f');
  // Practise takes the side the board is seen from.
  await page.getByRole('button', { name: 'Practise' }).click();
  await expect(page).toHaveURL(/#\/practice\?fen=.*&side=black$/);
  // A study's menu has no Flip board: its side is the chapter's (Chapter settings).
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(page.locator('.notation')).toContainText('A made-up comment');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Chapter settings…' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Flip board/ })).toHaveCount(0);
});

test('any analysis saved as a sequence: the lines from the board’s start, the side to move asked (§5.74)', async ({ page }) => {
  await setUp(page);
  await page.getByRole('link', { name: 'Analysis board' }).click();
  await page.getByRole('button', { name: 'New' }).click();
  // Nothing on the board, nothing to save.
  await expect(page.getByRole('button', { name: 'Save as a sequence…' })).toBeDisabled();
  for (const [from, to] of [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3']] as const) {
    await clickSquare(page, from, 'white');
    await clickSquare(page, to, 'white');
  }
  await page.getByRole('button', { name: 'Save as a sequence…' }).click();
  const dialog = page.getByTestId('sequence-dialog');
  await expect(dialog.getByTestId('sequence-main')).toHaveText('e4 e5 Nf3');
  await expect(dialog).toContainText('2 moves to find');
  await dialog.getByRole('button', { name: /^Save/ }).click();
  await expect(dialog.getByTestId('sequence-saved')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
  // Saved once: asked again, it says so.
  await page.getByRole('button', { name: 'Save as a sequence…' }).click();
  await expect(dialog).toContainText('already saved');
});
