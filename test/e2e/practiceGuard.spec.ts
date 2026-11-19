// The check on the practice opponent (PLAN.md §5.205), with the real 23M Maia in its worker: the
// page's dice fixed high, so Maia's draw is its least likely move each time; the fake Stockfish
// scores every move but Nf3 a blunder. With the check (the settings' default) each unlikely pick is
// searched alone (`searchmoves`), refused, and drawn again, and after `GUARD.redraws` the likeliest
// move, Nf3, is played; with the check off the unlikely pick is played unasked.
import { test, expect, type Page } from '@playwright/test';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeUci } from 'chessops/util';
import { GUARD } from '../../src/core/games/practice.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { commands, fakeEngine } from './engine.ts';
import { fakeExplorer, lichessLogin, serveExplorer } from './explorer.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const AFTER_C5 = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite({
    engine: fakeEngine(100, {}, true),
    // After 1.e4 c5 every White move is scored, Nf3 best and the rest lost; elsewhere a level line.
    engineLines: (fen) => {
      const key = fen.split(' ').slice(0, 4).join(' ');
      if (key !== AFTER_C5) return [[1, 0, 'a7a6']];
      const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
      const ucis = [...pos.allDests()].flatMap(([from, tos]) => [...tos].map((to) => makeUci({ from, to })));
      return ['g1f3', ...ucis.filter((u) => u !== 'g1f3')].map((u, i) => [i + 1, u === 'g1f3' ? 20 : -900, u]);
    },
  });
});
test.afterAll(async () => {
  await site.close();
});

async function setUp(page: Page, guard: boolean) {
  await page.addInitScript((g) => {
    Math.random = () => 0.9999;
    localStorage.setItem('repworks-practice', JSON.stringify({ guard: g }));
  }, guard);
  await lichessLogin(page);
  await serveGithub(page, world().github);
  await serveExplorer(page, fakeExplorer());
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  // Maia downloaded and on, from the explorer's switch.
  await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
  await page.getByRole('switch', { name: 'Maia' }).check();
  const dialog = page.getByRole('dialog', { name: 'Enable Maia' });
  await dialog.getByRole('button', { name: /^Download/ }).click();
  await expect(dialog).toHaveCount(0, { timeout: 60_000 });
  await page.evaluate((fen) => (location.hash = '#/practice?fen=' + encodeURIComponent(fen)), AFTER_E4);
  const game = page.locator('.practice-game');
  await expect(game).toHaveAttribute('data-phase', 'user');
  await clickSquare(page, 'c7', 'black');
  await clickSquare(page, 'c5', 'black');
  await expect(game).toHaveAttribute('data-moves', '2', { timeout: 60_000 });
  return game;
}

const checked = (s: SiteServer) =>
  commands(s.requests)
    .map((c) => / searchmoves (\S+)$/.exec(c)?.[1])
    .filter((u): u is string => !!u);

test('the check: unlikely blunders drawn again, the likeliest move played', async ({ page }) => {
  test.setTimeout(150_000);
  site.requests.length = 0;
  await setUp(page, true);
  const asked = checked(site);
  expect(new Set(asked).size).toBe(GUARD.redraws + 1);
  expect(asked).not.toContain('g1f3');
  await expect(page.getByTestId('practice-moves')).toContainText('2. Nf3');
  await expect(page.getByText('Opponent: Maia (a blunder drawn again)')).toBeVisible();
});

test('the check off: the unlikely pick played, nothing asked', async ({ page }) => {
  test.setTimeout(150_000);
  site.requests.length = 0;
  await setUp(page, false);
  expect(checked(site)).toEqual([]);
  await expect(page.getByTestId('practice-moves')).not.toContainText('Nf3');
  await expect(page.getByText(/^Opponent: Maia$/)).toBeVisible();
  // The settings show it off.
  await page.locator('.practice-opponent summary').click();
  const box = page.getByLabel('No nonsense blunders');
  await expect(box).not.toBeChecked();
});
