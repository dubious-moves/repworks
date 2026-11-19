// The check on the practice opponent (PLAN.md §5.205), with the real 23M Maia in its worker and the
// page's dice fixed. Stockfish (fake) scores Maia's likely moves in one search (`searchmoves`).
// After 1.e4 c5: when only Nf3 holds and the dice are high (Maia's odds say "sound"), Nf3 is played,
// though the dice would have drawn Maia's least likely move unchecked; when Nf3, Maia's likeliest,
// is the one move that loses and the dice are low (Maia's odds say "go wrong"), the natural blunder
// is played. With the check off, nothing is searched and the dice's unlikely move is played.
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
/** Whether Nf3 is the one move that holds after 1.e4 c5 (else the one that loses): set by each test. */
let nf3Holds = true;

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite({
    engine: fakeEngine(100, {}, true),
    // Every White move after 1.e4 c5 scored, Nf3 alone holding or alone losing; elsewhere a level line.
    engineLines: (fen) => {
      const key = fen.split(' ').slice(0, 4).join(' ');
      if (key !== AFTER_C5) return [[1, 0, 'a7a6']];
      const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
      const ucis = [...pos.allDests()].flatMap(([from, tos]) => [...tos].map((to) => makeUci({ from, to })));
      const cp = (u: string) => ((u === 'g1f3') === nf3Holds ? 20 : -900);
      return [...ucis].sort((a, b) => cp(b) - cp(a)).map((u, i) => [i + 1, cp(u), u]);
    },
  });
});
test.afterAll(async () => {
  await site.close();
});

async function setUp(page: Page, guard: boolean, dice: number) {
  await page.addInitScript(([g, d]) => {
    Math.random = () => d as number;
    localStorage.setItem('repworks-practice', JSON.stringify({ guard: g }));
  }, [guard, dice] as const);
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
    .map((c) => / searchmoves (.+)$/.exec(c)?.[1]?.split(' '))
    .filter((u): u is string[] => !!u);

test('the check: Maia’s likely moves scored together; the sound move played when Maia’s odds say so', async ({ page }) => {
  test.setTimeout(150_000);
  site.requests.length = 0;
  nf3Holds = true;
  await setUp(page, true, 0.9999);
  const asked = checked(site);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toContain('g1f3');
  expect(asked[0]!.length).toBeGreaterThan(1);
  expect(asked[0]!.length).toBeLessThanOrEqual(GUARD.maxMoves);
  await expect(page.getByTestId('practice-moves')).toContainText('2. Nf3');
  await expect(page.getByText('Opponent: Maia (checked)')).toBeVisible();
});

test('the check: a natural blunder played when Maia’s odds say go wrong', async ({ page }) => {
  test.setTimeout(150_000);
  site.requests.length = 0;
  nf3Holds = false;
  await setUp(page, true, 0);
  expect(checked(site)).toHaveLength(1);
  await expect(page.getByTestId('practice-moves')).toContainText('2. Nf3');
});

test('the check off: the unlikely pick played, nothing asked', async ({ page }) => {
  test.setTimeout(150_000);
  site.requests.length = 0;
  nf3Holds = true;
  await setUp(page, false, 0.9999);
  expect(checked(site)).toEqual([]);
  await expect(page.getByTestId('practice-moves')).not.toContainText('Nf3');
  await expect(page.getByText(/^Opponent: Maia$/)).toBeVisible();
  // The settings show it off.
  await page.locator('.practice-opponent summary').click();
  await expect(page.getByLabel('No nonsense blunders')).not.toBeChecked();
});
