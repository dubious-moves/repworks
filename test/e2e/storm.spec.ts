// The storm (PLAN.md §5.42–§5.44), on a desktop viewport and an emulated phone, over the fixture
// repertoire (Black: 1. e4 c5 2. Nf3 d6 3. d4 cxd4, 2... Nc6 3. d4, and the Alapin 2. c3 Nf6),
// with a fake explorer naming one game at each line end, a fake game export and a fake ChessDB
// that scores every legal move (the sorted first best, a ladder down from it that never reaches
// the blunder stop), so the walks run without Stockfish.
//
// Controls run on §5.71 (2026-10-08), each failing the storm test at its own assertion: the card's
// board set back to the card's position after a move ("the move stays"), and the board's sketch
// removed (the arrow gone at the clock's next tick).
import { test, expect, type Page } from '@playwright/test';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeUci } from 'chessops/util';
import { castlingSide } from 'chessops/chess';
import { kingCastlesTo } from 'chessops/util';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare, square } from './board.ts';
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
/** The verdict's pause after a mistake (STORM.verdictMs). */
const STORM_VERDICT_MS = 2600;

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
/** An arrow drawn on the card: a right-drag with a mouse, the ✎ draw mode on a touch screen. */
async function drawArrow(page: Page, from: string, to: string, side: 'white' | 'black') {
  const toggle = page.getByRole('button', { name: 'Draw mode' });
  const touch = await toggle.isVisible();
  if (touch) await toggle.click();
  const a = await square(page, from, side);
  const b = await square(page, to, side);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down({ button: touch ? 'left' : 'right' });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up({ button: touch ? 'left' : 'right' });
  if (touch) await toggle.click();
}
const cardLine = async (page: Page) => (await page.locator('.storm-card').getAttribute('data-line'))!;
/** The piece chessground shows on a square ('' for none), e.g. "white knight". */
const pieceOn = (page: Page, key: string) =>
  page.evaluate((k) => {
    const el = [...document.querySelectorAll('cg-board piece')].find((p) => (p as unknown as { cgKey?: string }).cgKey === k && !p.classList.contains('ghost'));
    return el ? [...el.classList].filter((c) => c !== 'anim' && c !== 'fading' && c !== 'dragging').join(' ') : '';
  }, key);
/** The arrows and circles on the board (chessground draws each as a `g` with a hash). */
const shapes = (page: Page) => page.evaluate(() => document.querySelectorAll('cg-container svg.cg-shapes g, cg-container svg.cg-shapes-below g').length && [...document.querySelectorAll('cg-container svg.cg-shapes g, cg-container svg.cg-shapes-below g')].filter((g) => g.hasAttribute('cgHash')).length);

async function gathered(page: Page, w: World) {
  await page.getByRole('link', { name: 'Storm' }).click();
  await expect(page).toHaveURL(/#\/storm$/);
  await expect(page.locator('.storm-home')).toContainText('3 line ends');
  await expect(page.getByTestId('storm-count')).toContainText('0 positions ready');
  await expect(page.getByRole('button', { name: 'Start storm' })).toBeDisabled();
  await page.getByRole('button', { name: 'Gather positions' }).click();
  await expect(page.locator('.storm-gather')).toContainText('Every line end and reply walked', { timeout: 30_000 });
  // Two exports per line end with games (one game at each first, then the rest), each a simple
  // request: POST, text/plain, no token.
  const exports = w.requests.filter((r) => r.startsWith('export'));
  expect(exports.length).toBe(6);
  // The first pass named one game per line end, the second the other two.
  expect(exports.slice(0, 3).every((r) => r.split(' ')[2]!.split(',').length === 1)).toBe(true);
  expect(exports.slice(3).every((r) => r.split(' ')[2]!.split(',').length === 2)).toBe(true);
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
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  // Neither the engine panel nor the explorer is on the screen.
  await expect(page.locator('.engine, .explorer')).toHaveCount(0);
  // Where the card is: its chapter, and its line's last moves.
  await expect(page.locator('.storm-card .storm-where')).toContainText(/\d\. \S+/);

  // An arrow drawn to think with stays while the clock ticks (it re-renders the card).
  const first = await cardFen(page);
  const side = (await page.locator('.storm-card').getAttribute('data-side')) as 'white' | 'black';
  await drawArrow(page, 'a2', 'a4', side);
  await page.waitForTimeout(700);
  expect(await shapes(page)).toBeGreaterThan(0);
  // A left click on an empty square clears it, as on Lichess; drawn again, it stays to the next card.
  const empty = ['a3', 'b3', 'g3', 'h3', 'a6', 'h6', 'd5', 'e5', 'd4', 'e4'];
  let blank = '';
  for (const k of empty) if (!blank && !(await pieceOn(page, k))) blank = k;
  await clickSquare(page, blank, side);
  await expect.poll(() => shapes(page)).toBe(0);
  await drawArrow(page, 'a2', 'a4', side);
  expect(await shapes(page)).toBeGreaterThan(0);

  // The best move: great, +2; the move stays on the board through the verdict.
  const best = ranked(first)[0]!;
  const mover = await pieceOn(page, best.slice(0, 2));
  await play(page, best);
  await expect(page.getByTestId('storm-verdict')).toContainText('Great');
  await expect(page.getByTestId('storm-verdict')).toContainText('the top move');
  await expect(page.getByTestId('storm-points')).toHaveText('2');
  expect(await pieceOn(page, best.slice(2, 4))).toBe(mover);
  expect(await pieceOn(page, best.slice(0, 2))).toBe('');
  const lines = [await cardLine(page)];

  // The next card comes by itself, from another line end (the spread); the worst move scored:
  // 140 cp behind at +0.20, a mistake. Pause keeps it on the board until Next.
  await expect.poll(() => cardFen(page)).not.toBe(first);
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  // The arrow was the last card's.
  expect(await shapes(page)).toBe(0);
  lines.push(await cardLine(page));
  const second = await cardFen(page);
  const moves = ranked(second);
  await play(page, moves[Math.min(moves.length, LADDER.length) - 1]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Mistake');
  await expect(page.getByTestId('storm-points')).toHaveText('1');
  await page.getByRole('button', { name: /^Pause/ }).click();
  await page.waitForTimeout(STORM_VERDICT_MS + 500);
  expect(await cardFen(page)).toBe(second);
  await page.getByRole('button', { name: /^Next/ }).click();

  // The third card, left unanswered: the review keeps it (§14.10c).
  await expect.poll(() => cardFen(page)).not.toBe(second);
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  lines.push(await cardLine(page));
  // Three cards, three line ends: the fixture has three, and the spread deals each once first.
  expect(new Set(lines).size).toBe(3);
  await page.getByRole('button', { name: /^End/ }).click();
  await expect(page.getByTestId('storm-summary')).toContainText('1 point from 2 answered');
  const rows = page.locator('.storm-row');
  await expect(rows).toHaveCount(3);
  // The best move hidden until asked for.
  await expect(rows.nth(0).locator(':scope > span').nth(4)).toHaveText('…');
  await page.getByRole('button', { name: /^Best move/ }).click();
  await expect(rows.nth(0).locator(':scope > span').nth(4)).not.toHaveText('…');
  await expect(page.locator('.storm-best')).toContainText('best');
  await expect(rows.nth(2)).toContainText('Not answered');

  // Analyse: the analysis board, the session kept, and back to the review where it was.
  await rows.nth(1).click();
  await page.getByRole('button', { name: /^Analyse/ }).click();
  await expect(page).toHaveURL(/#\/analysis\?.*back=/);
  await page.getByRole('button', { name: '← Back to the storm' }).click();
  await expect(page).toHaveURL(/#\/storm$/);
  await expect(page.getByTestId('storm-summary')).toContainText('1 point from 2 answered');
  await expect(page.locator('.storm-row.current')).toContainText('Mistake');
  await expect(page.locator('.storm-nav-count')).toHaveText('Position 2 of 3');
  // …and the browser's own back and forward do the same.
  await page.getByRole('button', { name: /^Analyse/ }).click();
  await expect(page).toHaveURL(/#\/analysis\?/);
  await page.goBack();
  await expect(page.getByTestId('storm-summary')).toContainText('1 point from 2 answered');
  // On from the analysis board to another page, then ← twice: the session is still there (the
  // owner's request, 2026-10-08; it went before, once the page left the board).
  await page.getByRole('button', { name: /^Analyse/ }).click();
  await expect(page).toHaveURL(/#\/analysis\?/);
  await page.getByRole('button', { name: 'Practise' }).click();
  await expect(page).toHaveURL(/#\/practice\?/);
  await page.locator('.chapter-head .back').click();
  await expect(page).toHaveURL(/#\/analysis\?/);
  await page.locator('.chapter-head .back').click();
  await expect(page).toHaveURL(/#\/storm$/);
  await expect(page.getByTestId('storm-summary')).toContainText('1 point from 2 answered');
  await expect(page.locator('.storm-nav-count')).toHaveText('Position 2 of 3');

  // The analysis board saves a sequence from the user's move, past the move that led there (§5.74).
  const mine = (await rows.nth(1).locator(':scope > span').nth(1).textContent())!;
  await page.getByRole('button', { name: /^Analyse/ }).click();
  await page.getByRole('button', { name: 'Save as a sequence…' }).click();
  await expect(page.getByTestId('sequence-main')).toHaveText(mine);
  await page.getByTestId('sequence-dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: '← Back to the storm' }).click();

  // Save as a mistake (§5.74): the mistake with its move, the great answer with none.
  await expect(page.locator('.storm-row.current')).toContainText('Mistake');
  await page.getByTestId('storm-save-mistake').click();
  await expect(page.getByTestId('storm-save-mistake')).toHaveText('Saved as a mistake');
  await rows.nth(0).click();
  await expect(page.getByTestId('storm-save-mistake')).toHaveText('Save as a mistake');
  await page.getByTestId('storm-save-mistake').click();
  await expect(page.getByTestId('storm-save-mistake')).toBeDisabled();

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
  expect(log).toContain(`"san":"${mine}"`);
  expect((log.match(/"k":"saved","card":"m\|_storm_\d+_\d+","item":\{"kind":"mistake"/g) ?? []).length).toBe(2);
  expect(log).toContain('"san":"","uci":""');
  // The record on the home.
  await expect(page.locator('.storm-record').first()).toContainText('2 answered · 50% found');
  // …and by study: the answers' chapters, from the positions' lines.
  await expect(page.locator('.storm-record h2').first()).toHaveText('Positions · whole repertoire');
  await expect(page.locator('.storm-chapters tbody tr')).toHaveCount(1);
  await expect(page.locator('.storm-chapters tbody tr td').nth(0)).toHaveText('Test repertoire');
  await expect(page.locator('.storm-chapters tbody tr td').nth(1)).toHaveText('2');
  // The study picked, from its row: its record, its chapters, and the scope the storm deals from.
  await page.locator('.storm-chapters').getByRole('button', { name: 'Test repertoire' }).click();
  await expect(page.locator('.study-title')).toHaveText('Storm · Test repertoire');
  await expect(page).toHaveURL(/#\/storm\/Rep0Najd$/);
  await expect(page.getByLabel('Study')).toHaveValue('Rep0Najd');
  await expect(page.locator('.storm-record').first()).toContainText('2 answered · 50% found');
  await expect(page.locator('.storm-record h2').nth(1)).toHaveText('By chapter');
  await expect(page.locator('.storm-chapters tbody tr td:first-child')).toHaveText(['Main line', 'Alapin']);
  // A chapter picked from the picker; then back to the whole repertoire.
  await page.getByLabel('Chapter').selectOption({ label: 'Alapin' });
  await expect(page.locator('.study-title')).toHaveText('Storm · Alapin');
  await expect(page.locator('.storm-chapters')).toHaveCount(0);
  await page.getByLabel('Study').selectOption({ label: 'Whole repertoire' });
  await expect(page.locator('.study-title')).toHaveText('Storm · Whole repertoire');
  await expect(page.getByLabel('Chapter')).toHaveCount(0);

  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(wide).toBeLessThanOrEqual(0);
});

test('the gather: its requests counted as they go out, and Stop at once while one is under way', async ({ page }) => {
  await setUp(page);
  // The game export never answers.
  await page.route('https://lichess.org/api/games/export/**', () => new Promise<void>(() => undefined));
  await page.getByRole('link', { name: 'Storm' }).click();
  await page.getByRole('button', { name: 'Gather positions' }).click();
  const status = page.locator('.storm-gather');
  await expect(status).toContainText('Gathering: 0 of');
  await expect(status).toContainText('1 explorer, 1 game exports');
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(status).toContainText('Stopped.', { timeout: 2_000 });
  await expect(page.getByRole('button', { name: 'Gather positions' })).toBeEnabled();
});

test('Clear positions: asked once, then the gathered positions gone from this device', async ({ page }) => {
  const w = await setUp(page);
  const ready = await gathered(page, w);
  await page.getByRole('button', { name: 'Clear positions…' }).click();
  await expect(page.locator('.storm-clear')).toContainText(`Removes all ${ready} gathered positions from this device`);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('storm-count')).toContainText(`${ready} positions ready`);
  await page.getByRole('button', { name: 'Clear positions…' }).click();
  await page.getByRole('button', { name: `Clear ${ready} positions` }).click();
  await expect(page.locator('.storm-clear')).toContainText(`${ready} positions cleared.`);
  await expect(page.getByTestId('storm-count')).toContainText('0 positions ready');
  await expect(page.getByRole('button', { name: 'Start storm' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Clear positions…' })).toHaveCount(0);
  // Kept cleared across a reload.
  await page.reload();
  await expect(page.getByTestId('storm-count')).toContainText('0 positions ready');
});

test('the set: a mistake held, tried again, shown, and the second pass', async ({ page, isMobile }) => {
  const w = await setUp(page);
  await gathered(page, w);
  await page.getByRole('button', { name: /^Set of/ }).click();
  await expect(page.locator('.storm-card')).toBeVisible();
  await expect(page.getByTestId('storm-set')).toContainText('1 of 6');
  // No clock in a set.
  await expect(page.getByTestId('storm-clock')).toHaveCount(0);
  const fen = await cardFen(page);
  const moves = ranked(fen);
  await play(page, moves[Math.min(moves.length, LADDER.length) - 1]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Mistake');
  // Held: the best move not shown, the move played still on the board; Try again sets it back.
  await expect(page.locator('.storm-best')).toHaveCount(0);
  const worst = moves[Math.min(moves.length, LADDER.length) - 1]!;
  // Polled: chessground draws the board on a later frame than the verdict's text.
  await expect.poll(() => pieceOn(page, worst.slice(0, 2))).toBe('');
  await page.getByRole('button', { name: /^Try again/ }).click();
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  // The first answer stays in view: it is the one that counts.
  await expect(page.getByTestId('storm-counted')).toContainText('Mistake');
  await expect.poll(() => pieceOn(page, worst.slice(0, 2))).not.toBe('');
  await play(page, worst);
  // Analyse from a held card shows the move (it counts as shown); back, the set goes on.
  await page.getByRole('button', { name: /^Analyse/ }).click();
  await expect(page).toHaveURL(/#\/analysis\?.*back=/);
  await page.getByRole('button', { name: '← Back to the storm' }).click();
  await expect(page.locator('.storm-best')).toContainText('best');
  await page.getByRole('button', { name: /^Next position/ }).click();
  // The rest found at once.
  for (let i = 0; i < 12; i++) {
    if (await page.getByTestId('storm-summary').isVisible()) break;
    const f = await cardFen(page);
    await play(page, ranked(f)[0]!);
    await expect(page.getByTestId('storm-verdict')).toContainText('Great');
    await page.getByRole('button', { name: /^Next position/ }).click();
  }
  await expect(page.getByTestId('storm-summary')).toContainText('5 of 6 found first time · 1 of 1 in the second pass');
  // The review keeps the first answer; the second pass's Great is beside it, not counted.
  const rows = page.locator('.storm-row');
  await expect(rows.nth(0)).toContainText('Mistake');
  await expect(page.getByTestId('storm-later')).toContainText('Great');
  await expect(page.getByTestId('storm-later')).toContainText('not counted');
  await expect(page.locator('.storm-result')).toContainText('5 of 6 found');
  // The list sits beside the board, the lines behind a toggle.
  await expect(rows.nth(0).locator('.storm-row-where')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show lines' }).click();
  await expect(rows.nth(0).locator('.storm-row-where')).toHaveCount(1);
  // On a wide screen the list sits beside the board, not under it.
  if (!isMobile) {
    const board = (await page.locator('.storm-review-grid .board').first().boundingBox())!;
    const list = (await page.locator('.storm-list').boundingBox())!;
    expect(list.x).toBeGreaterThan(board.x + board.width - 1);
    expect(list.y + list.height).toBeLessThanOrEqual(board.y + board.height + 1);
  }
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
