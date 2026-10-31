// The variation checklist (PLAN.md §5.62, §5.130), on a desktop viewport and an emulated phone: the
// test repertoire's Black study (1.e4 c5 2.Nf3 d6 3.d4 cxd4, 2...Nc6 3.d4, 2.c3 Nf6) made into a
// checklist from the fake explorer (a Lichess login on the device) on its own page, opened from
// Home: two lines (the study's first move at its own positions, as mistake-lab walks), the most
// played first, each named by its chapter, and 1.d4 and 4.Nxd4 as replies the study doesn't cover.
// A move hovered shows its position. The first line drilled at Easy (Maia's rating set to 1600):
// its lead-up (a move off the prep refused), then a game from its end against the explorer's
// moves, judged by the fake engine at +12 three times running, won by Claim victory: the line
// checked off at Easy, the block's progress 17%. The list and the win synced; a second device
// shows the same list after its sync, with no explorer call. Then a list kept on a device before
// §5.130 carried into the log after the first sync; a line taken out (asked first) and restored;
// the Alapin line paused on another device, hidden here after a sync; a drill's old address.
// Then a drill drawn by repetition (§5.137): a position of the Alapin's lead-up standing the third
// time in the game played from its end.
// §5.142: lines added by hand, from the study's ☰ menu (2...Nc6 3.d4, which the walk never takes:
// the study's first move there is 2...d6) and from the line list's ⋯ (the Alapin): shown before
// any Make, kept by Make and Make again, the Alapin left out of the made list's lines; the Alapin
// paused elsewhere and still shown, marked "paused in training"; ✕ on one asked and taken out; the
// events synced.
import { test, expect, type Page } from '@playwright/test';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import type { FakeGit } from '../support/fakeGit.ts';
import { clickSquare, studyMenu } from './board.ts';
import { fakeEngine, SLOW } from './engine.ts';
import { fakeExplorer, lichessLogin, serveExplorer, type FakeExplorer } from './explorer.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

const fenOf = (sans: string[]) => {
  const pos = Chess.default();
  for (const s of sans) pos.play(parseSan(pos, s)!);
  return makeFen(pos.toSetup());
};
const key = (sans: string[]) => fenOf(sans).split(' ').slice(0, 4).join(' ');
const uci = (sans: string[], san: string) => {
  const pos = Chess.default();
  for (const s of sans) pos.play(parseSan(pos, s)!);
  return makeUci(parseSan(pos, san)!);
};
const ucis = (sans: string[]) => sans.map((s, i) => uci(sans.slice(0, i), s));
const LINE = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4'];
const ALAPIN = ['e4', 'c5', 'c3', 'Nf6'];
const GAME = ['Nxd4', 'Nf6', 'Nc3', 'a6', 'Be2', 'e5', 'Nb3'];

let site: SiteServer;
test.beforeAll(async () => {
  // Each of the user's moves after the line at +12 for Black (the side to move's score), with two
  // other moves behind it (the search waits for its three lines).
  const lines: Record<string, [number, number, string][]> = {};
  for (let i = 1; i < GAME.length; i += 2) {
    const before = [...LINE, ...GAME.slice(0, i)];
    const best = uci(before, GAME[i]!);
    const others = ['h6', 'h5', 'g6'].map((s) => uci(before, s)).filter((u) => u !== best);
    lines[key(before)] = [
      [1, 1200, best],
      [2, 900, others[0]!],
      [3, 800, others[1]!],
    ];
  }
  site = await serveSite({ engine: fakeEngine(SLOW, lines) });
});
test.afterAll(async () => {
  await site.close();
});

function explorer(): FakeExplorer {
  const ex = fakeExplorer();
  const g = (sans: string[], san: string, n: number) => ({ san, uci: uci(sans, san), white: n / 2, draws: 0, black: n / 2 });
  ex.games.set(key([]), [g([], 'e4', 600), g([], 'd4', 400)]);
  ex.games.set(key(['e4', 'c5']), [g(['e4', 'c5'], 'Nf3', 700), g(['e4', 'c5'], 'c3', 300)]);
  ex.games.set(key(['e4', 'c5', 'Nf3', 'd6']), [g(['e4', 'c5', 'Nf3', 'd6'], 'd4', 1000)]);
  ex.games.set(key(['e4', 'c5', 'Nf3', 'Nc6']), [g(['e4', 'c5', 'Nf3', 'Nc6'], 'd4', 500)]);
  for (let i = 0; i < GAME.length; i += 2) ex.games.set(key([...LINE, ...GAME.slice(0, i)]), [g([...LINE, ...GAME.slice(0, i)], GAME[i]!, 100)]);
  return ex;
}

async function setUp(page: Page, github: ReturnType<typeof world>['github'], name: string, ex: FakeExplorer = explorer()): Promise<FakeExplorer> {
  await serveGithub(page, github);
  await serveExplorer(page, ex);
  await lichessLogin(page);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=${name}`);
  await expect(page.locator('button.chip')).toHaveText(/^synced/);
  return ex;
}

const progress = (git: FakeGit) => [...git.textsOf()].filter(([p]) => p.startsWith('progress/')).map(([, t]) => t).join('');

async function sync(page: Page) {
  await page.locator('button.chip').click();
  await expect(page.locator('button.chip')).toHaveText(/^synced/);
}

/** The study's block on the checklist page, unfolded. */
async function block(page: Page) {
  const b = page.locator('[data-testid="checklist-study"][data-study="Rep0Najd"][data-side="black"]');
  const head = b.locator('.checklist-head');
  if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  return b;
}

test('a checklist made on its page, a line drilled at Easy through its lead-up and won; the list on a second device with no explorer call', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const { git, github } = world();
  await setUp(page, github, 'desktop');
  await page.locator('.group-repertoire').getByRole('link', { name: 'Checklist' }).click();
  await expect(page).toHaveURL(/#\/checklist$/);
  await page.getByLabel('Easy').fill('1600');
  await page.getByLabel('Easy').press('Tab');

  const section = await block(page);
  await expect(section.locator('.checklist-head')).toContainText('not made');
  await section.getByLabel('Plies').selectOption('0');
  await section.getByRole('button', { name: 'Make' }).click();
  const lines = section.getByTestId('checklist-line');
  // At the study's own moves the walk takes its first (mistake-lab's forced prep move): 2...Nc6 isn't a line.
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toContainText('Main line');
  await expect(lines.nth(0).locator('.checklist-line')).toHaveText(/^1\. e4 c5 2\. Nf3 d6 3\. d4 cxd4/);
  await expect(lines.nth(1)).toContainText('Alapin');
  await expect(lines.nth(1).locator('.checklist-line')).toHaveText(/^1\. e4 c5 2\. c3 Nf6/);
  // 1.d4, and 4.Nxd4 after the line's end (the study stops there).
  await expect(section).toContainText('Replies the study doesn’t cover (2)');
  await expect(lines.nth(0).getByRole('button', { name: 'Medium' })).toBeDisabled();
  await expect(section.getByTestId('checklist-progress')).toHaveText('0%');

  // A move hovered (or tapped, on a phone): its position on the small board.
  const nf3 = lines.nth(0).locator('.checklist-move').nth(2);
  if (test.info().project.name === 'phone') await nf3.click();
  else await nf3.hover();
  await expect(lines.nth(0).getByTestId('checklist-preview')).toHaveAttribute('data-fen', fenOf(['e4', 'c5', 'Nf3']));

  await lines.nth(0).getByRole('button', { name: 'Easy' }).click();
  await expect(page).toHaveURL(new RegExp(`#/checklist/Rep0Najd\\?side=black&line=${ucis(LINE).join(',')}&preset=easy$`));
  await expect(page.getByTestId('checklist-opponent')).toContainText('then Maia 1600');
  const drill = page.getByTestId('checklist-drill');
  await expect(drill).toHaveAttribute('data-step', '1');
  await clickSquare(page, 'e7', 'black');
  await clickSquare(page, 'e5', 'black');
  await expect(page.getByTestId('checklist-feedback')).toHaveText('e5 isn’t your prep here: try again.');
  for (const [from, to, step] of [['c7', 'c5', '3'], ['d7', 'd6', '5']] as const) {
    await clickSquare(page, from, 'black');
    await clickSquare(page, to, 'black');
    await expect(drill).toHaveAttribute('data-step', step);
  }
  await clickSquare(page, 'c5', 'black');
  await clickSquare(page, 'd4', 'black');

  // The game from the line's end: the explorer's moves, the user's judged at +12.
  const game = page.locator('.practice-game');
  for (let i = 1; i < GAME.length; i += 2) {
    await expect(game).toHaveAttribute('data-moves', String(i));
    await expect(game).toHaveAttribute('data-phase', 'user');
    const before = [...LINE, ...GAME.slice(0, i)];
    const u = uci(before, GAME[i]!);
    await clickSquare(page, u.slice(0, 2), 'black');
    await clickSquare(page, u.slice(2, 4), 'black');
  }
  await page.getByRole('button', { name: 'Claim victory' }).click();
  await expect(page.getByTestId('practice-end')).toContainText('Victory claimed.');

  await page.evaluate(() => (location.hash = '#/checklist'));
  const again = await block(page);
  await expect(again.getByTestId('checklist-line').nth(0).getByRole('button', { name: /Easy/ })).toHaveText('✓ Easy 1/1');
  await expect(again.getByTestId('checklist-line').nth(0).getByRole('button', { name: /Medium/ })).toBeEnabled();
  // One win of two lines × three levels.
  await expect(again.getByTestId('checklist-progress')).toHaveText('17%');
  await sync(page);
  await expect.poll(() => progress(git), { timeout: 15_000 }).toContain(`"k":"practice","card":"x|${key(LINE)}","res":"win","preset":"easy"`);
  expect(progress(git)).toContain(`"k":"checklist","card":"t|Rep0Najd","color":"black","ply":0,"count":10,"lines":[{"m":"${ucis(LINE).join(' ')}","p":0.7},{"m":"${ucis(ALAPIN).join(' ')}","p":0.3}]`);

  // The other device: the same list and its progress after its sync, and the explorer never asked.
  const context = await browser.newContext({ viewport: page.viewportSize()! });
  const phone = await context.newPage();
  const phoneEx = await setUp(phone, github, 'phone');
  await phone.evaluate(() => (location.hash = '#/checklist?sid=Rep0Najd&side=black'));
  const there = phone.locator('[data-testid="checklist-study"][data-study="Rep0Najd"][data-side="black"]');
  await expect(there.locator('.checklist-head')).toHaveAttribute('aria-expanded', 'true');
  await expect(there.getByTestId('checklist-line')).toHaveCount(2);
  await expect(there.getByTestId('checklist-line').nth(0).getByRole('button', { name: /Easy/ })).toHaveText('✓ Easy 1/1');
  await expect(there.getByTestId('checklist-progress')).toHaveText('17%');
  expect(phoneEx.requests.filter((r) => r.url.startsWith('https://explorer.lichess.org/'))).toEqual([]);
  await context.close();
});

test('a list kept on the device before carried into the log; a line taken out and restored; a line paused elsewhere hidden; an old drill address', async ({ page }) => {
  test.setTimeout(90_000);
  const { git, github } = world();
  const ex = await setUp(page, github, 'desktop');
  // A list as §5.62 kept it on the device, found at the next load once the page has synced.
  const v = (sans: string[], p: number) => ({ leafKey: key(sans), leafFen: fenOf(sans), lineUci: ucis(sans), lineSan: sans, cumProb: p });
  const old = { Rep0Najd: { sid: 'Rep0Najd', color: 'black', targetPly: 0, maxVariations: 10, createdAt: 1, variations: [v(LINE, 0.7), v(ALAPIN, 0.3)], reserve: [], gaps: [{ afterFen: fenOf(['d4']), lineUci: ucis(['d4']), lineSan: ['d4'], reachProb: 0.4 }], calls: 4, truncated: false } };
  await page.evaluate((o) => localStorage.setItem('repworks-checklists', JSON.stringify(o)), old);
  await page.reload();
  await expect(page.locator('button.chip')).toHaveText(/^synced|change/);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('repworks-checklists'))).toBeNull();
  await sync(page);
  await expect.poll(() => progress(git), { timeout: 15_000 }).toContain(`"k":"checklist","card":"t|Rep0Najd","color":"black","ply":0,"count":10,"lines":[{"m":"${ucis(LINE).join(' ')}","p":0.7},{"m":"${ucis(ALAPIN).join(' ')}","p":0.3}],"reserve":[],"gaps":[{"m":"d2d4","p":0.4}],"calls":4}`);

  // The old address of a drill (a place in a list kept on the device) opens the study's list.
  await page.evaluate(() => (location.hash = '#/checklist/Rep0Najd/0?preset=easy'));
  const section = page.locator('[data-testid="checklist-study"][data-study="Rep0Najd"][data-side="black"]');
  await expect(section.locator('.checklist-head')).toHaveAttribute('aria-expanded', 'true');
  const lines = section.getByTestId('checklist-line');
  await expect(lines).toHaveCount(2);

  // Taken out, asked first: the line goes (no reserve here to fill it); restored, back in its place.
  let asked = '';
  page.once('dialog', (d) => {
    asked = d.message();
    void d.dismiss();
  });
  await lines.nth(1).getByRole('button', { name: 'Take this line out' }).click();
  expect(asked).toContain('Take this line out?');
  await expect(lines).toHaveCount(2);
  page.once('dialog', (d) => void d.accept());
  await lines.nth(1).getByRole('button', { name: 'Take this line out' }).click();
  await expect(lines).toHaveCount(1);
  await expect(section).toContainText('1 line taken out.');
  await sync(page);
  await expect.poll(() => progress(git)).toContain(`"k":"drop","card":"c|${key(ALAPIN)}","on":true`);
  await section.getByRole('button', { name: 'Restore all' }).click();
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(1)).toContainText('Alapin');

  // The Alapin line paused on another device: hidden here after a sync, and counted.
  const pause = `{"v":1,"n":900,"t":"${new Date().toISOString()}","k":"line","card":"l|Rep0Najd|Ch2Alapn|e4 c5 c3 Nf6","mark":"paused"}\n`;
  git.commitIfHead(git.head, 'phone: 1 event\n\nrepworks-sync: Phone001:900', new Map([['progress/Phone001/2026-10-26.jsonl', pause]]), []);
  await sync(page);
  await expect(lines).toHaveCount(1);
  await expect(section.getByTestId('checklist-paused')).toContainText('1 paused line hidden');
  // A list made again leaves the paused branch out of the walk, and out of the uncovered replies.
  const before = ex.requests.length;
  await section.getByRole('button', { name: 'Make again' }).click();
  await expect(section.getByRole('button', { name: 'Make again' })).toBeEnabled();
  expect(ex.requests.length).toBeGreaterThan(before);
  await expect(lines).toHaveCount(1);
  await expect(section.getByTestId('checklist-paused')).toHaveCount(0);
  await expect(section).toContainText('Replies the study doesn’t cover (2)');
});

test('a drill past its line’s end: a move off the repertoire taken back with the study move, then played on', async ({ page }) => {
  test.setTimeout(60_000);
  const { github } = world();
  await setUp(page, github, 'desktop');
  await page.evaluate(() => (location.hash = '#/checklist?sid=Rep0Najd&side=black'));
  const section = await block(page);
  // Cut at four plies: the line ends at 2...d6, where the study goes on (3.d4 cxd4).
  await section.getByLabel('Plies').selectOption('4');
  await section.getByRole('button', { name: 'Make' }).click();
  const lines = section.getByTestId('checklist-line');
  await expect(lines.nth(0).locator('.checklist-line')).toHaveText(/^1\. e4 c5 2\. Nf3 d6\s*$/);
  await lines.nth(0).getByRole('button', { name: 'Easy' }).click();
  const drill = page.getByTestId('checklist-drill');
  for (const [from, to, step] of [['c7', 'c5', '1'], ['d7', 'd6', '3']] as const) {
    await expect(drill).toHaveAttribute('data-step', step);
    await clickSquare(page, from, 'black');
    await clickSquare(page, to, 'black');
  }
  // The game from the line's end: the explorer's 3.d4, then 3...e5 isn't the study's move.
  const game = page.locator('.practice-game');
  await expect(game).toHaveAttribute('data-moves', '1');
  await expect(game).toHaveAttribute('data-phase', 'user');
  await clickSquare(page, 'e7', 'black');
  await clickSquare(page, 'e5', 'black');
  await expect(page.getByTestId('practice-deviation')).toContainText('e5 isn’t your repertoire: the study move is cxd4');
  await expect(game).toHaveAttribute('data-moves', '1');
  await clickSquare(page, 'c5', 'black');
  await clickSquare(page, 'd4', 'black');
  await expect(page.getByTestId('practice-deviation')).toHaveCount(0);
  await expect(game).toHaveAttribute('data-moves', '3');
  await expect(game).toHaveAttribute('data-phase', 'user');
  // Past the study's end (4.Nxd4): any move is played.
  await clickSquare(page, 'g8', 'black');
  await clickSquare(page, 'f6', 'black');
  await expect(page.getByTestId('practice-deviation')).toHaveCount(0);
  await expect(game).toHaveAttribute('data-moves', '5');
});

test('a drill drawn by repetition, the lead-up’s positions counted: after 2.c3 stands the third time at 6.Nb1', async ({ page }) => {
  test.setTimeout(60_000);
  const { github } = world();
  const ex = explorer();
  // The opponent shuffles its knight: 3.Na3 at the line's end, 4.Nb1 after 3...Ng8, and again.
  const g = (sans: string[], san: string) => [{ san, uci: uci(sans, san), white: 50, draws: 0, black: 50 }];
  ex.games.set(key(ALAPIN), g(ALAPIN, 'Na3'));
  ex.games.set(key([...ALAPIN, 'Na3', 'Ng8']), g([...ALAPIN, 'Na3', 'Ng8'], 'Nb1'));
  await setUp(page, github, 'desktop', ex);
  await page.evaluate(() => (location.hash = '#/checklist?sid=Rep0Najd&side=black'));
  const section = await block(page);
  await section.getByLabel('Plies').selectOption('0');
  await section.getByRole('button', { name: 'Make' }).click();
  const alapin = section.getByTestId('checklist-line').filter({ hasText: 'Alapin' });
  await expect(alapin.locator('.checklist-line')).toHaveText(/^1\. e4 c5 2\. c3 Nf6/);
  await alapin.getByRole('button', { name: 'Easy' }).click();
  const drill = page.getByTestId('checklist-drill');
  for (const [from, to, step] of [['c7', 'c5', '1'], ['g8', 'f6', '3']] as const) {
    await expect(drill).toHaveAttribute('data-step', step);
    await clickSquare(page, from, 'black');
    await clickSquare(page, to, 'black');
  }
  // 3.Na3 Ng8 4.Nb1 (after 2.c3 the second time) Nf6 5.Na3 Ng8 6.Nb1: the game alone has it twice.
  const game = page.locator('.practice-game');
  for (const [n, from, to] of [[1, 'f6', 'g8'], [3, 'g8', 'f6'], [5, 'f6', 'g8']] as const) {
    await expect(game).toHaveAttribute('data-moves', String(n));
    await expect(game).toHaveAttribute('data-phase', 'user');
    await clickSquare(page, from, 'black');
    await clickSquare(page, to, 'black');
  }
  await expect(page.getByTestId('practice-end')).toContainText('Draw by threefold repetition. Counted as a draw.');
});

test('lines added by hand from the study and the line list, kept by Make again, one taken out', async ({ page }) => {
  test.setTimeout(90_000);
  const { git, github } = world();
  await setUp(page, github, 'desktop');
  const NC6 = ['e4', 'c5', 'Nf3', 'Nc6', 'd4'];
  // From the study's ☰ menu: the line to the move shown, ending on the opponent's move.
  await page.evaluate(() => (location.hash = '#/study/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3,Nc6,d4'));
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 Nc6 d4');
  await studyMenu(page, 'Add to the checklist');
  await expect(page.locator('.cv-board .feedback')).toHaveText('Added to the checklist: it stays when the list is made again');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await expect(page.getByRole('menu', { name: 'More' }).getByRole('menuitem', { name: 'In the checklist (take out)' })).toBeVisible();
  await page.keyboard.press('Escape');

  // From a line's ⋯ in the line list: the Alapin.
  await page.evaluate(() => (location.hash = '#/train/Rep0Najd'));
  const list = page.getByRole('complementary', { name: 'Lines to train' });
  const show = list.getByRole('button', { name: /Show lines/ });
  await expect(show).toHaveAttribute('aria-expanded', 'false');
  await show.click();
  await list.getByRole('button', { name: 'Alapin', exact: true }).click();
  const row = list.locator('.line-list-row').filter({ hasText: 'Nf6' });
  await row.getByRole('button', { name: 'Line menu' }).click();
  await row.getByRole('button', { name: 'Add to the checklist' }).click();
  await expect(page.getByTestId('line-list-said')).toHaveText('Added to the checklist: it stays when the list is made again');
  await row.getByRole('button', { name: 'Line menu' }).click();
  await expect(row.getByRole('button', { name: 'Out of the checklist' })).toBeVisible();
  await row.getByRole('button', { name: 'Line menu' }).click();

  // On the checklist before any Make: both, marked added, with no share.
  await page.evaluate(() => (location.hash = '#/checklist?sid=Rep0Najd&side=black'));
  const section = await block(page);
  const lines = section.getByTestId('checklist-line');
  await expect(lines).toHaveCount(2);
  await expect(section).toContainText('2 lines added by you');
  await expect(lines.nth(0).locator('.checklist-line')).toHaveText(/^1\. e4 c5 2\. Nf3 Nc6 3\. d4\s*$/);
  await expect(lines.nth(1).locator('.checklist-line')).toHaveText(/^1\. e4 c5 2\. c3 Nf6\s*$/);
  await expect(lines.getByTestId('checklist-added')).toHaveCount(2);
  await expect(lines.nth(0).locator('.checklist-line-head')).not.toContainText('%');
  await expect(section.getByTestId('checklist-progress')).toHaveText('0%');

  // Made, then made again: the main line from the explorer, the added lines after it, the Alapin's slot not taken twice.
  await section.getByLabel('Plies').selectOption('0');
  for (const name of ['Make', 'Make again']) {
    await section.getByRole('button', { name, exact: true }).click();
    await expect(section.getByRole('button', { name: 'Make again' })).toBeEnabled();
    await expect(lines).toHaveCount(3);
    await expect(lines.nth(0).locator('.checklist-line')).toHaveText(/^1\. e4 c5 2\. Nf3 d6 3\. d4 cxd4/);
    await expect(lines.nth(0).getByTestId('checklist-added')).toHaveCount(0);
    await expect(lines.nth(1).locator('.checklist-line')).toHaveText(/^1\. e4 c5 2\. Nf3 Nc6 3\. d4\s*$/);
    await expect(lines.nth(2).locator('.checklist-line')).toHaveText(/^1\. e4 c5 2\. c3 Nf6\s*$/);
    await expect(section).toContainText('3 lines (2 added by you), made');
  }
  await sync(page);
  await expect.poll(() => progress(git), { timeout: 15_000 }).toContain(`"k":"pick","card":"t|Rep0Najd","color":"black","m":"${ucis(NC6).join(' ')}","on":true`);
  expect(progress(git)).toContain(`"k":"pick","card":"t|Rep0Najd","color":"black","m":"${ucis(ALAPIN).join(' ')}","on":true`);
  expect(progress(git)).toContain(`"k":"checklist","card":"t|Rep0Najd","color":"black","ply":0,"count":10,"lines":[{"m":"${ucis(LINE).join(' ')}","p":0.7}]`);

  // An added line's drill, by its moves.
  await lines.nth(1).getByRole('button', { name: 'Easy' }).click();
  await expect(page).toHaveURL(new RegExp(`#/checklist/Rep0Najd\\?side=black&line=${ucis(NC6).join(',')}&preset=easy$`));
  await expect(page.getByTestId('checklist-drill')).toHaveAttribute('data-step', '1');
  await page.evaluate(() => (location.hash = '#/checklist?sid=Rep0Najd&side=black'));

  // The Alapin paused on another device (with Prioritize, most deep lines are): an added line stays, marked.
  const pause = `{"v":1,"n":900,"t":"${new Date().toISOString()}","k":"line","card":"l|Rep0Najd|Ch2Alapn|e4 c5 c3 Nf6","mark":"paused"}\n`;
  git.commitIfHead(git.head, 'phone: 1 event\n\nrepworks-sync: Phone001:900', new Map([['progress/Phone001/2026-10-26.jsonl', pause]]), []);
  await sync(page);
  await expect(lines.nth(2).getByTestId('checklist-line-paused')).toHaveText('paused in training');
  await expect(lines).toHaveCount(3);
  await expect(section.getByTestId('checklist-paused')).toHaveCount(0);
  await expect(lines.nth(1).getByTestId('checklist-line-paused')).toHaveCount(0);

  // ✕ on an added line: asked, then taken out of the checklist.
  let asked = '';
  page.once('dialog', (d) => {
    asked = d.message();
    void d.accept();
  });
  await lines.nth(2).getByRole('button', { name: 'Take this line out' }).click();
  expect(asked).toContain('Take this line out of the checklist?');
  await expect(lines).toHaveCount(2);
  await expect(section).toContainText('2 lines (1 added by you), made');
  await sync(page);
  await expect.poll(() => progress(git)).toContain(`"k":"pick","card":"t|Rep0Najd","color":"black","m":"${ucis(ALAPIN).join(' ')}","on":false`);
});
