// The games and their cards (PLAN.md §5.51–§5.55), on a desktop viewport and an emulated phone:
// mistake-lab's Gist faked with three analysed games (two mistakes, one with the analyzer's tactic),
// Lichess's export with one more game, and the fake engine scripted for the mistakes' positions.
// The games are read, one is opened, and the day's three cards are answered: a mistake with the
// best move (Easy), one with a blunder then the best move (Again), and the tactic through its two
// lines (Easy); the reviews synced.
import { test, expect, type Page } from '@playwright/test';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { fakeEngine, SLOW } from './engine.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

/** The position after `sans`, as the app writes it, and its first four fields (the fake engine's key). */
function after(sans: string[]): { fen: string; key: string } {
  const pos = Chess.default();
  for (const san of sans) pos.play(parseSan(pos, san)!);
  const fen = makeFen(pos.toSetup());
  return { fen, key: fen.split(' ').slice(0, 4).join(' ') };
}

const G1 = 'e4 e5 Nf3 Nc6 Bc4 Nd4 Nxe5 Qg5'.split(' ');
const G2 = 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O'.split(' ');
const G1_AT = after(G1.slice(0, 6));
const G2_AT = after(G2.slice(0, 6));
const G2_G4 = after([...G2.slice(0, 6), 'g4']);
const TACTIC_FEN = 'r1bqk1nr/pppnppbp/3p2p1/8/2BPP3/5N2/PPP2PPP/RNBQK2R w KQkq - 2 5';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite({
    engine: fakeEngine(SLOW, {
      [G1_AT.key]: [
        [1, 60, 'f3d4 e5d4'],
        [2, 20, 'e1g1 g8f6'],
        [3, 10, 'c2c3 d4f3'],
      ],
      [G2_AT.key]: [
        [1, 40, 'g1f3 f8e7'],
        [2, 35, 'c1g5 f8e7'],
        [3, 30, 'e2e3 f8e7'],
      ],
      [G2_G4.key]: [[1, 350, 'f6g4 e2e3']],
    }),
  });
});
test.afterAll(async () => {
  await site.close();
});

const players = { white: { user: { name: 'Me', id: 'me' }, rating: 1800 }, black: { user: { name: 'Rival', id: 'rival' }, rating: 1850 } };
const cps = (...v: number[]) => v.map((e) => ({ eval: e }));
const tm = (uci: string, san: string, isUser: boolean) => ({ uci, san, fen: '', isUser });
const GAMES = {
  version: 2,
  usernames: ['me'],
  games: [
    { id: 'GameOne1', rated: true, speed: 'blitz', createdAt: 1_790_000_000_000, status: 'resign', winner: 'black', players, opening: { name: 'Blackburne Shilling Gambit' }, moves: G1.join(' '), analysis: cps(20, 30, 20, 30, 25, 40, -600, -650), clocks: [180, 180, 178, 178, 175, 176, 170, 172], _clocksStamped: true },
    { id: 'GameTwo2', rated: true, speed: 'rapid', createdAt: 1_790_000_100_000, status: 'resign', winner: 'black', players, opening: { name: 'Queen’s Gambit Declined' }, moves: G2.join(' '), analysis: cps(20, 30, 20, 30, 25, 30, -250, -240, -250, -240) },
    {
      id: 'GameTri3',
      rated: true,
      speed: 'blitz',
      createdAt: 1_790_000_200_000,
      status: 'resign',
      winner: 'white',
      players,
      moves: 'e4 d6 d4 Nf6 Nc3 g6 Bc4 Bg7 Nf3 Nbd7',
      analysis: cps(20, 20, 20, 20, 20, 20, 20, 20, 20, 20),
      tactics: [
        {
          startPly: 9,
          fenBefore: TACTIC_FEN,
          playerColor: 'white',
          moves: [tm('c4f7', 'Bxf7+', true), tm('e8f8', 'Kf8', false), tm('f3g5', 'Ng5', true)],
          alternativeLines: [[tm('c4f7', 'Bxf7+', true), tm('e8f7', 'Kxf7', false), tm('f3g5', 'Ng5+', true), tm('f7e8', 'Ke8', false), tm('g5e6', 'Ne6', true)]],
          wpSwing: 20,
          found: false,
        },
      ],
    },
  ],
};
const LICHESS_GAME = { id: 'LiGame01', rated: true, variant: 'standard', speed: 'bullet', createdAt: 1_790_000_300_000, status: 'mate', winner: 'white', players, moves: 'e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#' };

interface World {
  git: FakeGit;
  requests: string[];
}

async function setUp(page: Page): Promise<World> {
  const { git, github } = world();
  await serveGithub(page, github);
  const requests: string[] = [];
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  // Registered after the data repo's fake: Playwright tries the newest route first.
  await page.route('https://api.github.com/gists/**', async (route) => {
    requests.push(`gist ${route.request().headers()['authorization'] ?? 'no-token'}`);
    await route.fulfill({ status: 200, headers: { ...cors, etag: '"g1"' }, body: JSON.stringify({ updated_at: '2026-10-07T00:00:00Z', files: { 'mistakelab_games.json': { size: 9, truncated: false, content: JSON.stringify(GAMES) } } }) });
  });
  await page.route('https://lichess.org/api/games/user/**', async (route) => {
    requests.push(`lichess ${new URL(route.request().url()).pathname}`);
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/x-ndjson' }, body: JSON.stringify(LICHESS_GAME) + '\n' });
  });
  await page.route('https://api.chess.com/**', (route) => route.abort('failed'));
  await page.addInitScript(() => localStorage.setItem('repworks-games', JSON.stringify({ gist: 'https://gist.github.com/me/0123456789abcdef0123', lichess: 'me' })));
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return { git, requests };
}

async function play(page: Page, uci: string) {
  await clickSquare(page, uci.slice(0, 2), 'white');
  await clickSquare(page, uci.slice(2, 4), 'white');
}

test('games read from the Gist and Lichess, a game opened, the day’s cards answered and synced', async ({ page }) => {
  const w = await setUp(page);
  await page.getByRole('link', { name: 'Games' }).click();
  await expect(page).toHaveURL(/#\/games$/);
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByTestId('games-status')).toContainText('Gist: 3 games read, 3 new or changed.');
  await expect(page.getByTestId('games-status')).toContainText('Lichess: 1 new games.');
  expect(w.requests).toContain('gist no-token');
  expect(w.requests).toContain('lichess /api/games/user/me');
  await expect(page.getByTestId('games-count')).toHaveText('4 of 4');
  await expect(page.getByTestId('games-queue')).toContainText('0 due · 3 new today');
  await expect(page.getByTestId('game-row').first()).toContainText('Rival');

  // One game: its moves, its mistake, and the board stepped to it.
  await page.getByTestId('game-row').filter({ hasText: 'Blackburne' }).click();
  await expect(page).toHaveURL(/#\/games\/GameOne1$/);
  await expect(page.getByTestId('game-moves')).toContainText('Nxe5');
  await expect(page.getByTestId('game-item')).toHaveText(/Mistake at move 4 \(Nxe5/);
  await page.getByTestId('game-item').getByRole('button', { name: /Mistake at move 4/ }).click();
  await expect(page.locator('.game-view')).toHaveAttribute('data-ply', '6');
  await page.locator('.back').click();
  await expect(page).toHaveURL(/#\/games$/);

  // The day's cards.
  await page.getByRole('link', { name: 'Review' }).click();
  await expect(page).toHaveURL(/#\/games\/review$/);
  const card = page.locator('.game-card');
  await expect(card).toHaveAttribute('data-card', 'm|GameOne1_7');
  await expect(card).toContainText('Find a better move than Nxe5');
  await play(page, 'f3d4');
  await expect(page.getByTestId('game-feedback')).toHaveText(/Best move/);
  await expect(card).toContainText('Recorded: Easy');
  await page.getByRole('button', { name: 'Next' }).click();

  await expect(card).toHaveAttribute('data-card', 'm|GameTwo2_7');
  await play(page, 'g2g4');
  await expect(page.getByTestId('game-feedback')).toHaveText(/Blunder/);
  await expect(card).toContainText('Recorded: Again');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(card).toHaveAttribute('data-phase', 'asking');
  await play(page, 'g1f3');
  await expect(page.getByTestId('game-feedback')).toHaveText(/Best move/);
  await expect(card).toContainText('Recorded: Again');
  await page.getByRole('button', { name: 'Next' }).click();

  // The tactic: the main line through the opponent's reply, then the other line from where it differs.
  await expect(card).toHaveAttribute('data-card', 'm|GameTri3_t9');
  await play(page, 'h2h3');
  await expect(page.getByTestId('game-feedback')).toHaveText('Not this one');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(card).toHaveAttribute('data-phase', 'asking');
  await play(page, 'c4f7');
  // Each wait is on the moves played (the reply included), not on the phase alone, which reads
  // "asking" before a move is taken too.
  await expect(card).toHaveAttribute('data-step', '2');
  await expect(card).toHaveAttribute('data-phase', 'asking');
  await play(page, 'f3g5');
  await expect(page.getByTestId('game-feedback')).toHaveText('Another line: the opponent answers differently.');
  await expect(card).toHaveAttribute('data-step', '2');
  await play(page, 'f3g5');
  await expect(card).toHaveAttribute('data-step', '4');
  await expect(card).toHaveAttribute('data-phase', 'asking');
  await play(page, 'g5e6');
  await expect(page.getByTestId('game-feedback')).toHaveText('Solved');
  await expect(card).toContainText('Recorded: Again');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('games-done')).toContainText('3 cards answered: 1 easy, 0 good, 0 hard, 2 again');

  // Synced: three reviews of game cards.
  await page.locator('.chip').click();
  await expect
    .poll(() => {
      const log = [...w.git.textsOf()].filter(([p]) => p.startsWith('progress/')).map(([, t]) => t).join('');
      return (log.match(/"k":"review","card":"m\|/g) ?? []).length;
    }, { timeout: 15_000 })
    .toBe(3);
  const log = [...w.git.textsOf()].filter(([p]) => p.startsWith('progress/')).map(([, t]) => t).join('');
  expect(log).toContain('"card":"m|GameOne1_7","g":4');
  expect(log).toContain('"card":"m|GameTwo2_7","g":1');
  expect(log).toContain('"card":"m|GameTri3_t9","g":1');
  await page.getByRole('link', { name: 'Back to the games' }).click();
  await expect(page.getByTestId('games-queue')).toContainText('0 due · 0 new today');
  // Nothing wider than the phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
