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
import { test, expect, type Page } from '@playwright/test';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import type { FakeGit } from '../support/fakeGit.ts';
import { clickSquare } from './board.ts';
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
