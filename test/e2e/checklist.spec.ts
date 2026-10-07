// The variation checklist (PLAN.md §5.62), on a desktop viewport and an emulated phone: the test
// repertoire's Black study (1.e4 c5 2.Nf3 d6 3.d4 cxd4, 2...Nc6 3.d4, 2.c3 Nf6) made into a
// checklist from the fake explorer (a Lichess login on the device): two lines (the study's first
// move at its own positions, as mistake-lab walks), the most played first, and 1.d4 and 4.Nxd4 as
// replies the study doesn't cover. The first line drilled at Easy: its lead-up
// (a move off the prep refused), then a game from its end against the explorer's moves, judged
// by the fake engine at +12 three times running, won by Claim victory: the line checked off at Easy.
import { test, expect } from '@playwright/test';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { fakeEngine, SLOW } from './engine.ts';
import { fakeExplorer, lichessLogin, serveExplorer } from './explorer.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

const key = (sans: string[]) => {
  const pos = Chess.default();
  for (const s of sans) pos.play(parseSan(pos, s)!);
  return makeFen(pos.toSetup()).split(' ').slice(0, 4).join(' ');
};
const uci = (sans: string[], san: string) => {
  const pos = Chess.default();
  for (const s of sans) pos.play(parseSan(pos, s)!);
  return makeUci(parseSan(pos, san)!);
};
const LINE = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4'];
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

test('a checklist made from the explorer, a line drilled at Easy through its lead-up and won', async ({ page }) => {
  const { git, github } = world();
  await serveGithub(page, github);
  const ex = fakeExplorer();
  const g = (sans: string[], san: string, n: number) => ({ san, uci: uci(sans, san), white: n / 2, draws: 0, black: n / 2 });
  ex.games.set(key([]), [g([], 'e4', 600), g([], 'd4', 400)]);
  ex.games.set(key(['e4', 'c5']), [g(['e4', 'c5'], 'Nf3', 700), g(['e4', 'c5'], 'c3', 300)]);
  ex.games.set(key(['e4', 'c5', 'Nf3', 'd6']), [g(['e4', 'c5', 'Nf3', 'd6'], 'd4', 1000)]);
  ex.games.set(key(['e4', 'c5', 'Nf3', 'Nc6']), [g(['e4', 'c5', 'Nf3', 'Nc6'], 'd4', 500)]);
  for (let i = 0; i < GAME.length; i += 2) ex.games.set(key([...LINE, ...GAME.slice(0, i)]), [g([...LINE, ...GAME.slice(0, i)], GAME[i]!, 100)]);
  await serveExplorer(page, ex);
  await lichessLogin(page);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('button.chip')).toHaveText(/^synced/);
  await page.evaluate(() => (location.hash = '#/repertoire-check'));

  const section = page.getByTestId('checklist');
  await section.getByLabel('Plies').selectOption('0');
  await section.getByRole('button', { name: 'Make' }).click();
  const lines = section.getByTestId('checklist-line');
  // At the study's own moves the walk takes its first (mistake-lab's forced prep move): 2...Nc6 isn't a line.
  await expect(lines).toHaveCount(2);
  await expect(lines.nth(0)).toContainText('1. e4 c5 2. Nf3 d6 3. d4 cxd4');
  await expect(lines.nth(1)).toContainText('1. e4 c5 2. c3 Nf6');
  // 1.d4, and 4.Nxd4 after the line's end (the study stops there).
  await expect(section).toContainText('Replies the study doesn’t cover (2)');
  await expect(lines.nth(0).getByRole('button', { name: 'Medium' })).toBeDisabled();

  await lines.nth(0).getByRole('button', { name: 'Easy' }).click();
  await expect(page).toHaveURL(/#\/checklist\/Rep0Najd\/0\?preset=easy$/);
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

  await page.evaluate(() => (location.hash = '#/repertoire-check'));
  await expect(page.getByTestId('checklist-line').nth(0).getByRole('button', { name: /Easy/ })).toHaveText('✓ Easy 1/1');
  await expect(page.getByTestId('checklist-line').nth(0).getByRole('button', { name: /Medium/ })).toBeEnabled();
  await page.locator('button.chip').click();
  await expect
    .poll(() => [...git.textsOf()].filter(([p]) => p.startsWith('progress/')).map(([, t]) => t).join(''), { timeout: 15_000 })
    .toContain(`"k":"practice","card":"x|${key(LINE)}","res":"win","preset":"easy"`);
});
