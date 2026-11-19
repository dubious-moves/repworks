// The check on the practice opponent (PLAN.md §5.205), with the real 23M Maia in its worker and the
// page's dice fixed. Stockfish (fake) scores Maia's likely moves in one search (`searchmoves`).
// After 1.e4 c5: when only Nf3 holds and the dice are high (Maia's odds say "sound"), Nf3 is played,
// though the dice would have drawn Maia's least likely move unchecked; when Nf3, Maia's likeliest,
// is the one move that loses and the dice are low (Maia's odds say "go wrong"), the natural blunder
// is played. With the check off, nothing is searched and the dice's unlikely move is played.
// The database past a line's end (§5.206): a thin sample (36 games) whose minority move throws the
// game away is weighed with Maia and checked, and Nf3 is played; a thin sample's majority that
// throws it away (seven of twelve) stays possible; a position of 500 games is the database's own
// draw, unchecked, as before; a prepared opponent draws the reply that scores best.
import { test, expect, type Page } from '@playwright/test';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeUci } from 'chessops/util';
import { BLEND, GUARD } from '../../src/core/games/practice.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { commands, fakeEngine } from './engine.ts';
import { fakeExplorer, lichessLogin, serveExplorer, type FakeMove } from './explorer.ts';
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

/** The practice game after 1.e4 c5, the opponent's settings `guard` (and `prepared`), the page's dice at `dice`; the database's games after 1.e4 c5 when given; Maia on unless `maia` is false. */
async function setUp(page: Page, guard: boolean, dice: number, o: { games?: FakeMove[]; prepared?: boolean; maia?: boolean } = {}) {
  await page.addInitScript(([g, d, p]) => {
    Math.random = () => d as number;
    localStorage.setItem('repworks-practice', JSON.stringify({ guard: g, prepared: p }));
  }, [guard, dice, o.prepared ?? false] as const);
  await lichessLogin(page);
  await serveGithub(page, world().github);
  const ex = fakeExplorer();
  if (o.games) ex.games.set(AFTER_C5, o.games);
  await serveExplorer(page, ex);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  // Maia downloaded and on, from the explorer's switch.
  if (o.maia !== false) {
    await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
    await page.getByRole('switch', { name: 'Maia' }).check();
    const dialog = page.getByRole('dialog', { name: 'Enable Maia' });
    await dialog.getByRole('button', { name: /^Download/ }).click();
    await expect(dialog).toHaveCount(0, { timeout: 60_000 });
  }
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

test('a thin database (§5.206): a minority’s blunder, which Maia hardly plays, weighed with Maia and refused', async ({ page }) => {
  test.setTimeout(150_000);
  site.requests.length = 0;
  nf3Holds = true;
  // 36 games: Qh5 in six, Nf3 in thirty. The database alone would play Qh5 at these dice.
  const games = [
    { san: 'Qh5', uci: 'd1h5', white: 4, draws: 0, black: 2 },
    { san: 'Nf3', uci: 'g1f3', white: 12, draws: 6, black: 12 },
  ];
  expect(6 + 30).toBeLessThan(BLEND.thin);
  await setUp(page, true, 0.1, { games });
  const asked = checked(site);
  expect(asked).toHaveLength(1);
  expect(asked[0]).toEqual(expect.arrayContaining(['d1h5', 'g1f3']));
  await expect(page.getByTestId('practice-moves')).toContainText('2. Nf3');
  await expect(page.getByText('Opponent: DB (36) + Maia (checked)')).toBeVisible();
});

test('a thin database: its majority, a blunder Maia hardly plays, stays possible (the owner’s seven of twelve)', async ({ page }) => {
  test.setTimeout(150_000);
  site.requests.length = 0;
  nf3Holds = true;
  const games = [
    { san: 'Qh5', uci: 'd1h5', white: 4, draws: 1, black: 2 },
    { san: 'Nf3', uci: 'g1f3', white: 2, draws: 1, black: 2 },
  ];
  // Dice low: the blend's odds say go wrong, and Qh5, natural by the games, is played.
  await setUp(page, true, 0.02, { games });
  expect(checked(site)[0]).toEqual(expect.arrayContaining(['d1h5', 'g1f3']));
  await expect(page.getByTestId('practice-moves')).toContainText('2. Qh5');
  await expect(page.getByText('Opponent: DB (12) + Maia (checked)')).toBeVisible();
});

test('a well-sampled database: its own draw, unchecked, as before', async ({ page }) => {
  test.setTimeout(150_000);
  site.requests.length = 0;
  nf3Holds = true;
  // 500 games: Qh5 in 400 (White scoring 25%), Nf3 in 100 (White scoring 90%).
  const games = [
    { san: 'Qh5', uci: 'd1h5', white: 100, draws: 0, black: 300 },
    { san: 'Nf3', uci: 'g1f3', white: 90, draws: 0, black: 10 },
  ];
  expect(500).toBeGreaterThanOrEqual(BLEND.thin);
  await setUp(page, true, 0.3, { games, maia: false });
  expect(checked(site)).toEqual([]);
  await expect(page.getByTestId('practice-moves')).toContainText('2. Qh5');
  await expect(page.getByText('Opponent: DB (400)')).toBeVisible();
});

test('a prepared opponent: the database’s reply that scores best for it, at the same dice', async ({ page }) => {
  test.setTimeout(150_000);
  site.requests.length = 0;
  nf3Holds = true;
  const games = [
    { san: 'Qh5', uci: 'd1h5', white: 100, draws: 0, black: 300 },
    { san: 'Nf3', uci: 'g1f3', white: 90, draws: 0, black: 10 },
  ];
  await setUp(page, true, 0.3, { games, prepared: true, maia: false });
  expect(checked(site)).toEqual([]);
  await expect(page.getByTestId('practice-moves')).toContainText('2. Nf3');
  await expect(page.getByText('Opponent: DB (100)')).toBeVisible();
  await page.locator('.practice-opponent summary').click();
  await expect(page.getByTestId('practice-prepared')).toBeChecked();
});
