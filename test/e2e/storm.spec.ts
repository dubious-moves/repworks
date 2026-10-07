// The storm (PLAN.md §5.42–§5.44), on a desktop viewport and an emulated phone, over the fixture
// repertoire (Black: 1. e4 c5 2. Nf3 d6 3. d4 cxd4, 2... Nc6 3. d4, and the Alapin 2. c3 Nf6),
// with a fake explorer naming one game at each line end, a fake game export and a fake ChessDB
// that scores every legal move (the sorted first best, a ladder down from it that never reaches
// the blunder stop), so the walks run without Stockfish.
import { test, expect, type Page } from '@playwright/test';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeUci } from 'chessops/util';
import { castlingSide } from 'chessops/chess';
import { kingCastlesTo } from 'chessops/util';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { commands, fakeEngine } from './engine.ts';
import { fakeExplorer, lichessLogin, serveExplorer } from './explorer.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite({ engine: fakeEngine() });
});
test.afterAll(async () => {
  await site.close();
});

const LADDER = [20, 5, -25, -40, -60, -80, -100, -120];

/** Every legal move in standard UCI, sorted: the fake ChessDB's order, best first. */
function ranked(fen: string): string[] {
  const pos = Chess.fromSetup(parseFen(fen.split(' ').length === 4 ? `${fen} 0 1` : fen).unwrap()).unwrap();
  const out = new Set<string>();
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      const side = castlingSide(pos, { from, to });
      const piece = pos.board.get(from)!;
      const promo = piece.role === 'pawn' && (to >> 3 === 7 || to >> 3 === 0);
      out.add(side ? makeUci({ from, to: kingCastlesTo(pos.turn, side) }) : makeUci(promo ? { from, to, promotion: 'queen' } : { from, to }));
    }
  }
  return [...out].sort();
}

const GAMES = [
  ['GameAAAA', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2 e5 7. Nb3 Be7 8. O-O O-O'],
  ['GameBBBB', '1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 g6 5. c4 Bg7 6. Be3 Nf6 7. Nc3 O-O'],
  ['GameCCCC', '1. e4 c5 2. c3 Nf6 3. e5 Nd5 4. d4 cxd4 5. Nf3 Nc6 6. cxd4 d6 7. Bc4 Nb6'],
];
const PGN = GAMES.map(([id, moves]) => `[Event "Rated blitz game"]\n[GameId "${id}"]\n[Result "*"]\n\n${moves} *\n\n\n`).join('');

interface World {
  git: FakeGit;
  requests: string[];
}

async function setUp(page: Page, options: { deepen?: boolean } = {}): Promise<World> {
  const { git, github } = world();
  await lichessLogin(page);
  // Stockfish's re-scoring of the kept positions (§5.45) has a test of its own.
  const deepen = options.deepen ?? false;
  await page.addInitScript((d) => localStorage.setItem('repworks-storm', JSON.stringify({ deepen: d })), deepen);
  await serveGithub(page, github);
  await serveExplorer(page, fakeExplorer());
  const requests: string[] = [];
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  // The storm's explorer requests name games; the panel's (none here) would not.
  await page.route('https://explorer.lichess.org/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Authorization', 'access-control-allow-methods': 'GET,OPTIONS' } });
    }
    const url = new URL(route.request().url());
    requests.push(`explorer ${url.searchParams.get('topGames') ?? ''}`);
    await route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ white: 10, draws: 2, black: 8, moves: [], topGames: GAMES.map(([id]) => ({ id })), recentGames: [] }) });
  });
  await page.route('https://lichess.org/api/games/export/**', async (route) => {
    const r = route.request();
    requests.push(`export ${r.method()} ${r.postData()} ${r.headers()['authorization'] ?? 'no-token'} ${r.headers()['content-type']}`);
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/x-chess-pgn' }, body: PGN });
  });
  await page.route('https://www.chessdb.cn/**', async (route) => {
    const board = new URL(route.request().url()).searchParams.get('board') ?? '';
    requests.push('chessdb');
    const moves = ranked(board).map((uci, i) => ({ uci, san: uci, score: LADDER[Math.min(i, LADDER.length - 1)] }));
    await route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ status: 'ok', moves }) });
  });
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return { git, requests };
}

async function play(page: Page, uci: string) {
  const side = (await page.locator('.storm-card').getAttribute('data-side')) as 'white' | 'black';
  await clickSquare(page, uci.slice(0, 2), side);
  await clickSquare(page, uci.slice(2, 4), side);
}
const cardFen = async (page: Page) => (await page.locator('.storm-card').getAttribute('data-fen'))!;

async function gathered(page: Page, w: World) {
  await page.getByRole('link', { name: 'Storm' }).click();
  await expect(page).toHaveURL(/#\/storm$/);
  await expect(page.locator('.storm-home')).toContainText('3 line ends');
  await expect(page.getByTestId('storm-count')).toContainText('0 positions ready');
  await expect(page.getByRole('button', { name: 'Start storm' })).toBeDisabled();
  await page.getByRole('button', { name: 'Gather positions' }).click();
  await expect(page.locator('.storm-gather')).toContainText('Every line end and reply walked', { timeout: 30_000 });
  // One export per line end with games, a simple request: POST, text/plain, no token.
  const exports = w.requests.filter((r) => r.startsWith('export'));
  expect(exports.length).toBe(3);
  expect(exports.every((r) => r.startsWith('export POST ') && r.includes('no-token') && r.endsWith('text/plain'))).toBe(true);
  expect(w.requests.filter((r) => r.startsWith('explorer')).every((r) => r === 'explorer 4')).toBe(true);
  const ready = Number((await page.getByTestId('storm-count').locator('strong').textContent()) ?? '0');
  expect(ready).toBeGreaterThan(3);
  return ready;
}

test('the storm: positions gathered, a great move and a mistake scored, the review, the answers synced and the done position not dealt again', async ({ page }) => {
  const w = await setUp(page);
  const ready = await gathered(page, w);

  await page.getByRole('button', { name: 'Start storm' }).click();
  await expect(page.locator('.storm-card')).toBeVisible();
  await expect(page.getByTestId('storm-clock')).toHaveText(/^[23]:\d\d$/);
  await expect(page.getByTestId('storm-verdict')).toHaveText('Your move');
  // Neither the engine panel nor the explorer is on the screen.
  await expect(page.locator('.engine, .explorer')).toHaveCount(0);

  // The best move: great, +2.
  const first = await cardFen(page);
  await play(page, ranked(first)[0]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Great');
  await expect(page.getByTestId('storm-verdict')).toContainText('the top move');
  await expect(page.getByTestId('storm-points')).toHaveText('2');

  // The next card comes by itself; the worst move scored: 140 cp behind at +0.20, a mistake.
  await expect.poll(() => cardFen(page)).not.toBe(first);
  await expect(page.getByTestId('storm-verdict')).toHaveText('Your move');
  const second = await cardFen(page);
  const moves = ranked(second);
  await play(page, moves[Math.min(moves.length, LADDER.length) - 1]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Mistake');
  await expect(page.getByTestId('storm-points')).toHaveText('1');

  // The third card, left unanswered: the review keeps it (§14.10c).
  await expect.poll(() => cardFen(page)).not.toBe(second);
  await expect(page.getByTestId('storm-verdict')).toHaveText('Your move');
  await page.getByRole('button', { name: 'End' }).click();
  await expect(page.getByTestId('storm-summary')).toContainText('1 point from 2 answered');
  const rows = page.locator('.storm-row');
  await expect(rows).toHaveCount(3);
  // The best move hidden until asked for.
  await expect(rows.nth(0).locator('span').nth(4)).toHaveText('…');
  await page.getByRole('button', { name: /^Best move/ }).click();
  await expect(rows.nth(0).locator('span').nth(4)).not.toHaveText('…');
  await expect(page.locator('.storm-best')).toContainText('best');
  await expect(rows.nth(2)).toContainText('Not answered');

  // Two answers in the log, synced.
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('storm-count')).toContainText(`${ready - 1} positions ready`);
  await expect(page.getByTestId('storm-count')).toContainText('1 done for now');
  await page.locator('.chip').click();
  await expect
    .poll(() => {
      const texts = [...w.git.textsOf()].filter(([p]) => p.startsWith('progress/')).map(([, t]) => t).join('');
      return (texts.match(/"k":"storm"/g) ?? []).length;
    }, { timeout: 15_000 })
    .toBe(2);
  const log = [...w.git.textsOf()].filter(([p]) => p.startsWith('progress/')).map(([, t]) => t).join('');
  expect(log).toContain('"b":"great"');
  expect(log).toContain('"b":"bad"');
  // The record on the home.
  await expect(page.locator('.storm-record').first()).toContainText('2 answered · 50% found');
  // …and by chapter: the answers' chapters, from the positions' lines.
  await expect(page.locator('.storm-chapters tbody tr').first()).toContainText('Test repertoire ·');

  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(wide).toBeLessThanOrEqual(0);
});

test('the set: a mistake held, tried again, shown, and the second pass', async ({ page }) => {
  const w = await setUp(page);
  await gathered(page, w);
  await page.getByRole('button', { name: /^Set of/ }).click();
  await expect(page.locator('.storm-card')).toBeVisible();
  await expect(page.locator('.train-counters')).toContainText('Set · 1 of 6');
  // No clock in a set.
  await expect(page.getByTestId('storm-clock')).toHaveCount(0);
  const fen = await cardFen(page);
  const moves = ranked(fen);
  await play(page, moves[Math.min(moves.length, LADDER.length) - 1]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Mistake');
  // Held: the best move not shown; Try again sets the board back.
  await expect(page.locator('.storm-best')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('storm-verdict')).toHaveText('Your move');
  await play(page, moves[Math.min(moves.length, LADDER.length) - 1]!);
  await page.getByRole('button', { name: 'Show the move' }).click();
  await expect(page.locator('.storm-best')).toContainText('best');
  await page.getByRole('button', { name: 'Next position' }).click();
  // The rest found at once.
  for (let i = 0; i < 12; i++) {
    if (await page.getByTestId('storm-summary').isVisible()) break;
    const f = await cardFen(page);
    await play(page, ranked(f)[0]!);
    await expect(page.getByTestId('storm-verdict')).toContainText('Great');
    await page.getByRole('button', { name: 'Next position' }).click();
  }
  await expect(page.getByTestId('storm-summary')).toContainText('5 of 6 found first time · 1 of 1 in the second pass');
  // Only each position's first answer was written (the set's own), marked.
  await page.locator('.chip').click();
  await expect
    .poll(() => {
      const texts = [...w.git.textsOf()].filter(([p]) => p.startsWith('progress/')).map(([, t]) => t).join('');
      return (texts.match(/"m":"set"/g) ?? []).length;
    }, { timeout: 15_000 })
    .toBe(6);
});

test('Stockfish’s standard: the kept positions searched with MultiPV 12 to depth 20 while the home is open, stopped by a storm', async ({ page }) => {
  const w = await setUp(page, { deepen: true });
  await gathered(page, w);
  await expect(page.getByTestId('storm-deep')).toContainText('scored to depth 20');
  await expect.poll(() => commands(site.requests).filter((c) => c === 'go depth 20 movetime 60000').length, { timeout: 15_000 }).toBeGreaterThan(1);
  expect(commands(site.requests)).toContain('setoption name MultiPV value 12');
  await page.getByRole('button', { name: 'Start storm' }).click();
  await expect(page.locator('.storm-card')).toBeVisible();
  const before = commands(site.requests).filter((c) => c.startsWith('go ')).length;
  // The fake engine finds no line for these positions, so nothing is stored as deepened; what is
  // checked is that the pass yields to the session: no search starts while a card is up.
  await page.waitForTimeout(1500);
  expect(commands(site.requests).filter((c) => c.startsWith('go ')).length).toBe(before);
});
