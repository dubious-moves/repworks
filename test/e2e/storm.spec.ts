// The storm (PLAN.md §5.42–§5.44), on a desktop viewport and an emulated phone, over the fixture
// repertoire (Black: 1. e4 c5 2. Nf3 d6 3. d4 cxd4, 2... Nc6 3. d4, and the Alapin 2. c3 Nf6),
// with a fake explorer naming one game at each line end, a fake game export and a fake ChessDB
// that scores every legal move (the sorted first best, a ladder down from it that never reaches
// the blunder stop), so the walks run without Stockfish. The fake Stockfish scores a position the
// same way (its first 12 moves), and a position one move after one it has scored as that move's
// rung: a move is graded by Stockfish only (§5.84), and its verdict is the ladder's either way.
//
// Controls run on §5.71 (2026-10-08), each failing the storm test at its own assertion: the card's
// board set back to the card's position after a move ("the move stays"), and the board's sketch
// removed (the arrow gone at the clock's next tick).
import { test, expect, type Page } from '@playwright/test';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeUci, parseUci } from 'chessops/util';
import { castlingSide, normalizeMove } from 'chessops/chess';
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
  site = await serveSite({ engine: fakeEngine(undefined, {}, true), engineLines: ladderLines });
});
test.afterAll(async () => {
  await site.close();
});
// Each test's fake engine starts with nothing scored, so no test's lines depend on the tests run
// before it in the same worker.
test.beforeEach(() => scored.clear());

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

const positionOf = (fen: string) => Chess.fromSetup(parseFen(fen.split(' ').length === 4 ? `${fen} 0 1` : fen).unwrap()).unwrap();
const fen4 = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
/** The positions the fake engine has scored by the ladder. */
const scored = new Set<string>();
/**
 * The fake engine's lines: one move after a position it scored, the opponent's best is minus that
 * move's rung (so one search of the position after a move agrees with the list); else the ladder
 * over the first 12 moves, as the fake ChessDB's.
 */
function ladderLines(fen: string): [number, number, string][] {
  const key = fen4(fen);
  const own = ranked(key);
  if (!own.length) return [];
  for (const parent of scored) {
    const i = ranked(parent).findIndex((uci) => {
      const pos = positionOf(parent);
      pos.play(normalizeMove(pos, parseUci(uci)!));
      return fen4(makeFen(pos.toSetup())) === key;
    });
    if (i >= 0) return [[1, -LADDER[Math.min(i, LADDER.length - 1)]!, own[0]!]];
  }
  scored.add(key);
  return own.slice(0, 12).map((uci, i) => [i + 1, LADDER[Math.min(i, LADDER.length - 1)]!, uci]);
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

/** A game only an overnight gather's first older window names (§5.102): a Dragon past the Najdorf line's end. */
const OLDER = ['GameDDDD', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 g6 6. Be3 Bg7 7. f3 O-O 8. Qd2 Nc6 9. Bc4 Bd7 10. O-O-O Rc8'] as const;
const OLDER_PGN = `[Event "Rated blitz game"]\n[GameId "${OLDER[0]}"]\n[Result "*"]\n\n${OLDER[1]} *\n\n\n`;
/** The explorer's `until` for the overnight gather's second pass: four months before now (UTC). */
const firstWindow = () => {
  const d = new Date();
  const m = d.getUTCFullYear() * 12 + d.getUTCMonth() - 4;
  return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`;
};

async function setUp(page: Page, options: { deepen?: boolean; focused?: boolean; world?: ReturnType<typeof world>; name?: string; site?: SiteServer } = {}): Promise<World> {
  const { git, github } = options.world ?? world();
  await lichessLogin(page);
  // Stockfish's re-scoring of the kept positions (§5.45) has a test of its own.
  const deepen = options.deepen ?? false;
  await page.addInitScript(([d, f]) => localStorage.setItem('repworks-storm', JSON.stringify({ deepen: d, focused: f })), [deepen, options.focused ?? false]);
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
    const until = url.searchParams.get('until');
    requests.push(`explorer ${url.searchParams.get('topGames') ?? ''}${until ? ` until=${until}` : ''}`);
    // An older window names the fixture's games again (all walked by then), and the first one a game of its own.
    const games = until ? [...GAMES.map(([id]) => ({ id })), ...(until === firstWindow() ? [{ id: OLDER[0] }] : [])] : GAMES.map(([id]) => ({ id }));
    await route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ white: 10, draws: 2, black: 8, moves: [], topGames: games, recentGames: [] }) });
  });
  await page.route('https://lichess.org/api/games/export/**', async (route) => {
    const r = route.request();
    requests.push(`export ${r.method()} ${r.postData()} ${r.headers()['authorization'] ?? 'no-token'} ${r.headers()['content-type']}`);
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/x-chess-pgn' }, body: PGN + (r.postData()?.includes(OLDER[0]) ? OLDER_PGN : '') });
  });
  await page.route('https://www.chessdb.cn/**', async (route) => {
    const board = new URL(route.request().url()).searchParams.get('board') ?? '';
    requests.push('chessdb');
    const moves = ranked(board).map((uci, i) => ({ uci, san: uci, score: LADDER[Math.min(i, LADDER.length - 1)] }));
    await route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ status: 'ok', moves }) });
  });
  await page.goto(`${(options.site ?? site).url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=${options.name ?? 'desktop'}`);
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

  // The best move: great, +2, said as the best and celebrated; the move stays on the board through the verdict.
  const best = ranked(first)[0]!;
  const mover = await pieceOn(page, best.slice(0, 2));
  await play(page, best);
  await expect(page.getByTestId('storm-verdict')).toContainText('Best move!');
  await expect(page.getByTestId('storm-verdict')).toContainText('the top move');
  await expect(page.getByTestId('board-celebrate')).toHaveCount(1);
  await expect(page.getByTestId('storm-points')).toHaveText('2');
  expect(await pieceOn(page, best.slice(2, 4))).toBe(mover);
  expect(await pieceOn(page, best.slice(0, 2))).toBe('');
  const lines = [await cardLine(page)];

  // The next card comes by itself, from another line end (the spread); the worst move scored:
  // 140 cp behind at +0.20, a mistake. Pause keeps it on the board until Next.
  await expect.poll(() => cardFen(page)).not.toBe(first);
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  // The arrow was the last card's (chessground redraws its shapes a frame after the position).
  await expect.poll(() => shapes(page)).toBe(0);
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
  // Its note (§5.91), written as it is saved.
  await page.getByTestId('note-button').click();
  await page.getByTestId('note-text').fill('A note on the storm position');
  await page.locator('dialog.note-dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('note-button')).toHaveText('✎ Edit the note');

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
  expect(log).toMatch(/"k":"note","card":"m\|_storm_\d+_\d+","text":"A note on the storm position"/);
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

/** The positions in the data repo's storm files (§5.102), by the device folder they are in. */
function sharedIn(git: FakeGit): Map<string, number> {
  const out = new Map<string, number>();
  for (const [path, text] of git.textsOf()) {
    const m = /^storm\/([A-Za-z0-9]{8})\/\d{4}-\d{2}-\d{2}\.\d+\.jsonl$/.exec(path);
    if (m) out.set(m[1]!, (out.get(m[1]!) ?? 0) + text.split('\n').filter(Boolean).length);
  }
  return out;
}
/** The FENs of the positions in this device's storm store. */
const storedFens = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const open = indexedDB.open('repworks-storm');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('positions').objectStore('positions').getAll();
          req.onsuccess = () => resolve((req.result as { fen: string }[]).map((p) => p.fen));
          req.onerror = () => reject(req.error);
        };
      }),
  );
const storedOf = async (page: Page) => Number(/(\d+) stored from/.exec((await page.locator('.storm-gather').textContent()) ?? '')?.[1] ?? NaN);

test('Analyse during a timed card (the owner’s request, 2026-10-16): the card passed, the clock stopped, and back to it; Next goes on', async ({ page }) => {
  const w = await setUp(page);
  await gathered(page, w);
  await page.getByRole('button', { name: 'Start storm' }).click();
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  const first = await cardFen(page);
  await page.getByRole('button', { name: /^Analyse/ }).click();
  await expect(page).toHaveURL(/#\/analysis\?.*back=%23%2Fstorm/);
  await page.getByRole('button', { name: '← Back to the storm' }).click();
  await expect(page).toHaveURL(/#\/storm$/);
  // The same card, passed: no points, the clock stopped, the next card waiting for Next.
  expect(await cardFen(page)).toBe(first);
  await expect(page.getByTestId('storm-verdict')).toContainText('Analysed — no answer given');
  await expect(page.getByTestId('storm-points')).toHaveText('0');
  await expect(page.getByTestId('storm-clock')).toHaveClass(/stopped/);
  const clock = await page.getByTestId('storm-clock').textContent();
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('storm-clock')).toHaveText(clock!);
  expect(await cardFen(page)).toBe(first);
  // By the browser's Back from the verdict too, then Next: a new card, the clock running.
  await page.getByRole('button', { name: /^Analyse/ }).click();
  await expect(page).toHaveURL(/#\/analysis\?/);
  await page.goBack();
  await expect(page.getByTestId('storm-verdict')).toContainText('Analysed — no answer given');
  await page.getByRole('button', { name: /^Next/ }).click();
  await expect.poll(() => cardFen(page)).not.toBe(first);
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  await expect(page.getByTestId('storm-clock')).not.toHaveClass(/stopped/);
});

test('overnight (§5.102): the gather goes on over older games, Stockfish scoring between passes, the screen kept on, and the positions written to the data repo', async ({ page }) => {
  test.setTimeout(120_000);
  // Thirteen passes are some 40 explorer requests: at Lichess's pace (16 a minute, src/core/explorer/
  // limiter.ts, with its own unit tests) over a minute of waiting, so the explorer worker's clock
  // runs ten times faster here. What is asked, and in what order, is the same.
  const fast = await serveSite({ engine: fakeEngine(undefined, {}, true), engineLines: ladderLines, explorerClock: 10 });
  const w = await setUp(page, { site: fast });
  await page.addInitScript(() => {
    // The wake lock asked for, as the browser would grant it.
    (window as unknown as { locks: string[] }).locks = [];
    Object.defineProperty(navigator, 'wakeLock', {
      value: { request: async (t: string) => ((window as unknown as { locks: string[] }).locks.push(t), Object.assign(new EventTarget(), { release: async () => undefined })) },
    });
  });
  await page.reload();
  await page.getByRole('link', { name: 'Storm' }).click();
  await page.getByLabel(/Keep going until stopped/).check();
  await page.getByRole('button', { name: 'Gather positions' }).click();
  await expect(page.getByTestId('storm-overnight-note')).toBeVisible();
  await expect(page.locator('.storm-gather')).toContainText('Pass 1 of 13');
  expect(await page.evaluate(() => (window as unknown as { locks: string[] }).locks)).toContain('screen');
  await expect(page.locator('.storm-gather')).toContainText(/Pass 1[0-3] of 13|Every pass walked/, { timeout: 60_000 });
  await expect(page.locator('.storm-gather')).toContainText('Every pass walked', { timeout: 60_000 });
  await expect(page.getByTestId('storm-overnight-note')).toHaveCount(0);
  // Twelve older windows, four months apart, each asked once at every line end.
  const untils = [...new Set(w.requests.filter((r) => r.includes('until=')).map((r) => r.split('until=')[1]))];
  expect(untils.length).toBe(12);
  expect(untils[0]).toBe(firstWindow());
  expect(w.requests.filter((r) => r.includes(`until=${firstWindow()}`)).length).toBe(3);
  // The older game exported at each line end its window named it at (only the Najdorf's leads
  // anywhere), and nothing else: every other game had been walked already.
  const exports = w.requests.filter((r) => r.startsWith('export'));
  expect(exports.filter((r) => r.includes(OLDER[0])).length).toBe(3);
  expect(exports.length).toBe(9);
  // Positions from it kept: the Dragon's fianchetto.
  expect((await storedFens(page)).some((f) => f.includes('/3p1np1/'))).toBe(true);
  const stored = await storedOf(page);
  // Stockfish scored every kept position (the setting is off: overnight scores anyway).
  await expect(page.getByTestId('storm-deep')).toContainText(new RegExp(`Stockfish: (\\d+) of \\1 scored`));
  // Every position kept is in this device's files, pushed with the sync.
  await page.locator('.chip').click();
  await expect.poll(() => [...sharedIn(w.git).values()].reduce((a, b) => a + b, 0), { timeout: 15_000 }).toBe(stored);
  expect(sharedIn(w.git).size).toBe(1);
  await fast.close();
});

test('overnight: a failure is waited out, not the end; Stop ends it', async ({ page }) => {
  test.setTimeout(120_000);
  // Time runs as usual, but can jump past the minute's wait.
  await page.clock.install();
  await page.clock.resume();
  await setUp(page);
  let fail = true;
  // The older windows' first explorer request fails once.
  await page.route(/until=/, async (route) => {
    if (fail) {
      fail = false;
      return route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, body: 'down' });
    }
    return route.fallback();
  });
  await page.getByRole('link', { name: 'Storm' }).click();
  await page.getByLabel(/Keep going until stopped/).check();
  await page.getByRole('button', { name: 'Gather positions' }).click();
  await expect(page.locator('.storm-gather')).toContainText('Waiting 1 min after a failure', { timeout: 30_000 });
  await page.clock.fastForward(61_000);
  await expect(page.locator('.storm-gather')).toContainText(/Pass [3-9] of 13/, { timeout: 30_000 });
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('.storm-gather')).toContainText('Stopped.');
  await expect(page.getByRole('button', { name: 'Gather positions' })).toBeEnabled();
});

test('shared (§5.102): positions gathered on one device are dealt on another after its sync; cleared there, they stay cleared', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const shared = world();
  const w = await setUp(page, { world: shared });
  const ready = await gathered(page, w);
  await page.locator('.chip').click();
  await expect.poll(() => [...sharedIn(w.git).values()].reduce((a, b) => a + b, 0), { timeout: 15_000 }).toBe(ready);
  const files = [...w.git.textsOf().keys()].filter((p) => p.startsWith('storm/'));

  const context = await browser.newContext();
  const phone = await context.newPage();
  await setUp(phone, { world: shared, name: 'phone' });
  await phone.getByRole('link', { name: 'Storm' }).click();
  await expect(phone.getByTestId('storm-count')).toContainText(`${ready} positions ready`);
  await expect(phone.getByTestId('storm-shared')).toContainText(`${ready} positions here came from your other devices`);
  // Only the device that gathered them writes them.
  await phone.locator('.chip').click();
  await expect(phone.locator('.chip')).toHaveText(/^synced/);
  expect(sharedIn(w.git).size).toBe(1);

  // Cleared on the phone: gone there, after a reload too; the desktop's files are as they were.
  await phone.getByRole('button', { name: 'Clear positions…' }).click();
  await phone.getByRole('button', { name: `Clear ${ready} positions` }).click();
  await expect(phone.getByTestId('storm-count')).toContainText('0 positions ready');
  await phone.reload();
  await expect(phone.getByTestId('storm-count')).toContainText('0 positions ready');
  expect([...w.git.textsOf().keys()].filter((p) => p.startsWith('storm/'))).toEqual(files);
  await context.close();
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

test('the set: a retry found keeps Try again, with less than the top move and with it; the top move said and celebrated', async ({ page }) => {
  const w = await setUp(page);
  await gathered(page, w);
  await page.getByRole('button', { name: /^Set of/ }).click();
  await expect(page.locator('.storm-card')).toBeVisible();
  const moves = ranked(await cardFen(page));
  await play(page, moves[Math.min(moves.length, LADDER.length) - 1]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Mistake');
  await page.getByRole('button', { name: /^Try again/ }).click();
  // The second-ranked move: graded Great, but not the top move, so the tries go on, the best hidden.
  await play(page, moves[1]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Great move');
  await expect(page.getByRole('button', { name: /^Try again/ })).toBeVisible();
  await expect(page.locator('.storm-best')).toHaveCount(0);
  await page.getByRole('button', { name: /^Try again/ }).click();
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  // A worse practice try keeps the card found, and Try again.
  await play(page, moves[Math.min(moves.length, LADDER.length) - 1]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Mistake');
  await expect(page.getByRole('button', { name: /^Next position/ })).toBeVisible();
  await page.keyboard.press('t');
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  // The top move: said so and celebrated, the best shown; Try again stays, to look at other moves.
  await play(page, moves[0]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Best move!');
  await expect(page.getByTestId('board-celebrate')).toHaveCount(1);
  await expect(page.getByTestId('board-badge')).toHaveAttribute('title', 'Best move');
  await expect(page.locator('.storm-best')).toContainText('best');
  await expect(page.getByRole('button', { name: /^Show the move/ })).toHaveCount(0);
  await expect(page.locator('.storm-hint')).toContainText('Try again to look at other moves');
  // The first answer still the one that counts.
  await expect(page.getByTestId('storm-counted')).toContainText('Mistake');
  await page.getByRole('button', { name: /^Try again/ }).click();
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  await expect(page.getByTestId('board-celebrate')).toHaveCount(0);
  await play(page, moves[1]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Great move');
  await expect(page.getByTestId('storm-counted')).toContainText('Mistake');
  await expect(page.getByRole('button', { name: /^Next position/ })).toBeVisible();
});

test('Try again always (the owner’s request, 2026-10-28): after a set’s first answer, top or not, and in the timed storm, as practice', async ({ page }) => {
  const w = await setUp(page);
  await gathered(page, w);
  await page.getByRole('button', { name: /^Set of/ }).click();
  await expect(page.locator('.storm-card')).toBeVisible();
  // The top move first time: Best move!, the best shown, and Try again beside Next.
  const first = await cardFen(page);
  const moves = ranked(first);
  await play(page, moves[0]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Best move!');
  await expect(page.locator('.storm-best')).toContainText('best');
  await expect(page.getByTestId('storm-counted')).toHaveCount(0);
  await page.getByRole('button', { name: /^Try again/ }).click();
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  // A practice try: graded, the first answer still the one that counts, Try again still there.
  await play(page, moves[1]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Great move');
  await expect(page.getByTestId('storm-counted')).toContainText('the first answer');
  await expect(page.getByRole('button', { name: /^Try again/ })).toBeVisible();
  await page.getByRole('button', { name: /^Next position/ }).click();
  // A good move first time, not the top one: resolved, the best shown, and Try again too.
  await expect.poll(() => cardFen(page)).not.toBe(first);
  await play(page, ranked(await cardFen(page))[1]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Great move');
  await expect(page.locator('.storm-best')).toContainText('best');
  await expect(page.getByRole('button', { name: /^Try again/ })).toBeVisible();
  await page.getByRole('button', { name: /^End/ }).click();
  await expect(page.getByTestId('storm-summary')).toContainText('2 of 2 found first time');
  await expect(page.getByTestId('storm-later')).toContainText('not counted');

  // The timed storm: Try again (t) on a verdict stops the next card from coming; the try is
  // practice, nothing scored, the clock stopped; Next goes on with the clock running.
  await page.locator('.storm-result').getByRole('button', { name: 'Storm', exact: true }).click();
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  const timed = await cardFen(page);
  const list = ranked(timed);
  await play(page, list[Math.min(list.length, LADDER.length) - 1]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Mistake');
  await page.keyboard.press('t');
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  const points = await page.getByTestId('storm-points').textContent();
  await expect(page.getByTestId('storm-clock')).toHaveClass(/stopped/);
  const clock = await page.getByTestId('storm-clock').textContent();
  await play(page, list[0]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Best move!');
  await expect(page.getByTestId('storm-counted')).toContainText('Mistake');
  await page.waitForTimeout(STORM_VERDICT_MS + 500);
  expect(await cardFen(page)).toBe(timed);
  await expect(page.getByTestId('storm-points')).toHaveText(points!);
  await expect(page.getByTestId('storm-clock')).toHaveText(clock!);
  await page.getByRole('button', { name: /^Try again/ }).click();
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  await play(page, list[1]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('Great move');
  await page.getByRole('button', { name: /^Next/ }).click();
  await expect.poll(() => cardFen(page)).not.toBe(timed);
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  await expect(page.getByTestId('storm-clock')).not.toHaveClass(/stopped/);
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
    await expect(page.getByTestId('storm-verdict')).toContainText('Best move!');
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

test('Stockfish’s standard: the kept positions searched with MultiPV 12 to depth 24 (22 on a phone) while the home is open, then the storm’s card first', async ({ page, isMobile }) => {
  const depth = isMobile ? 22 : 24;
  // Only this test's requests: the server is the file's.
  const start = site.requests.length;
  const mine = () => commands(site.requests.slice(start));
  const w = await setUp(page, { deepen: true });
  const ready = await gathered(page, w);
  await expect(page.getByTestId('storm-deep')).toContainText(`scored to depth ${depth}`);
  await expect.poll(() => mine().filter((c) => c === `go depth ${depth} movetime 600000`).length, { timeout: 15_000 }).toBeGreaterThan(1);
  expect(mine()).toContain('setoption name MultiPV value 12');
  await expect(page.getByTestId('storm-deep')).toContainText(`${ready} of ${ready} scored`, { timeout: 30_000 });
  // Every position deepened: the session's look-ahead has nothing left to search, so a move is
  // graded at once from the stored list, the top move by rank.
  await page.getByRole('button', { name: 'Start storm' }).click();
  await expect(page.locator('.storm-card')).toBeVisible();
  const before = mine().filter((c) => c.startsWith('go ')).length;
  await play(page, ranked(await cardFen(page))[0]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('the top move');
  expect(mine().filter((c) => c.startsWith('go ')).length).toBe(before);
});

test('a list over two depths (§5.120): each move scored the mean of the depth searched to and the one before', async ({ page }) => {
  // The engine's second line scores 30 more at the depth before: 5 and 35 average to 20, level with
  // the first line's 20, where the last depth alone puts it 15 behind.
  const two = await serveSite({ engine: fakeEngine(undefined, {}, true, { 2: 30 }), engineLines: ladderLines });
  try {
    const w = await setUp(page, { deepen: true, site: two });
    const ready = await gathered(page, w);
    await expect(page.getByTestId('storm-deep')).toContainText(`${ready} of ${ready} scored`, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Start storm' }).click();
    await expect(page.locator('.storm-card')).toBeVisible();
    await play(page, ranked(await cardFen(page))[1]!);
    // One look: a scored move's verdict stays only STORM.verdictFastMs before the next card.
    await expect(page.getByTestId('storm-verdict')).toContainText(/Best move!.*#2 of 12 · level with the best/);
  } finally {
    await two.close();
  }
});

test('focused scoring: an engine a core but one, each searching a position of its own, then one engine for a session (§5.103)', async ({ page, isMobile }) => {
  const depth = isMobile ? 22 : 24;
  const start = site.requests.length;
  const mine = () => commands(site.requests.slice(start));
  await page.addInitScript(() => Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 }));
  const w = await setUp(page, { deepen: true, focused: true });
  const ready = await gathered(page, w);
  await expect(page.getByTestId('storm-focused')).toBeChecked();
  await expect(page.getByTestId('storm-deep')).toContainText(`${ready} of ${ready} scored`, { timeout: 30_000 });
  // Three workers, single-threaded, each with a hash of its own; every position searched once.
  expect(mine().filter((c) => c === 'setoption name Hash value 64').length).toBe(3);
  expect(mine().filter((c) => c.startsWith('setoption name Threads'))).toEqual([]);
  expect(mine().filter((c) => c === `go depth ${depth} movetime 600000`).length).toBe(ready);
  // The progress (§5.104): the run counted, each position named with its depth and result.
  const progress = page.getByTestId('storm-deep-progress');
  await expect(progress.locator('summary')).toContainText(`Last scoring: ${ready} of ${ready} searched`);
  await progress.locator('summary').click();
  await expect(progress).toContainText(`${ready} kept`);
  await expect(progress).toContainText('3 engines at once');
  await expect(page.getByTestId('storm-deep-recent').locator('li').first()).toContainText(`depth ${depth} of ${depth}`);
  await expect(page.getByTestId('storm-deep-recent').locator('li').first()).toContainText('kept');
  // A session goes back to the one engine: the three end, and no focused one starts again.
  const before = mine().length;
  await page.getByRole('button', { name: 'Start storm' }).click();
  await expect(page.locator('.storm-card')).toBeVisible();
  expect(mine().slice(before).filter((c) => c === 'setoption name Hash value 64')).toEqual([]);
});

test('a storm’s look-ahead: the card on the board searched first, MultiPV 12 at the device’s depth', async ({ page, isMobile }) => {
  const depth = isMobile ? 22 : 24;
  const w = await setUp(page);
  await gathered(page, w);
  // The engine's log restarts its numbering with each page, so only this page's requests are read.
  const start = site.requests.length;
  const fresh = () => commands(site.requests.slice(start));
  await page.getByRole('button', { name: 'Start storm' }).click();
  await expect(page.locator('.storm-card')).toBeVisible();
  const fen = fen4(await cardFen(page));
  await expect.poll(() => fresh().find((c) => c.startsWith('position fen ')) ?? '').toContain(fen);
  await expect.poll(() => fresh()).toContain(`go depth ${depth} movetime 600000`);
  // Searched to the depth: the move is graded from that list, with no search of its own.
  await page.waitForTimeout(800);
  const before = site.requests.length;
  await play(page, ranked(await cardFen(page))[0]!);
  await expect(page.getByTestId('storm-verdict')).toContainText('the top move');
  expect(commands(site.requests.slice(before))).not.toContain('go depth 20 movetime 8000');
});

interface Kept {
  card: string;
  fen: string;
  scored: { u: string; s: number }[];
  src: 'cdb' | 'sf';
  depth: number;
  maia?: { elo: number; moves: [string, number][] }[];
}
/** The positions kept on this device, as the store has them. */
const keptPositions = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<Kept[]>((resolve, reject) => {
        const open = indexedDB.open('repworks-storm');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const req = open.result.transaction('positions').objectStore('positions').getAll();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        };
      }),
  );

/** Lichess's winning chances, in percent, from centipawns. */
const winPct = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);

/**
 * Quiet (§5.100), worked out here: a Stockfish list at depth 20 or more whose last line isn't good,
 * every good move (under 6% given up) no capture, check or promotion.
 */
function quietHere(p: Kept): boolean {
  if (p.src !== 'sf' || p.depth < 20 || p.scored.length < 2) return false;
  const best = p.scored[0]!.s;
  const good = (s: number) => winPct(best) - winPct(s) < 6;
  if (good(p.scored[p.scored.length - 1]!.s)) return false;
  const pos = positionOf(p.fen);
  return p.scored
    .filter((m) => good(m.s))
    .every((m) => {
      const move = normalizeMove(pos, parseUci(m.u)!) as { from: number; to: number; promotion?: string };
      const piece = pos.board.get(move.from)!;
      const victim = pos.board.get(move.to);
      const capture = (!!victim && victim.color !== pos.turn) || (piece.role === 'pawn' && move.to === pos.epSquare);
      const after = pos.clone();
      after.play(move as Parameters<typeof after.play>[0]);
      return !capture && !after.isCheck() && !move.promotion;
    });
}

test('the focus: Quiet chosen and kept, only its positions dealt, the card naming it once answered', async ({ page }) => {
  test.setTimeout(120_000);
  const w = await setUp(page, { deepen: true });
  const ready = await gathered(page, w);
  await expect(page.getByTestId('storm-deep')).toContainText(`${ready} of ${ready} scored`, { timeout: 60_000 });
  const quiet = (await keptPositions(page)).filter(quietHere);
  expect(quiet.length).toBeGreaterThan(0);
  const focus = page.getByTestId('storm-focus');
  await focus.locator('summary').click();
  const chip = focus.getByRole('group', { name: 'The move' }).getByRole('button', { name: /^Quiet/ });
  await expect(chip).toHaveText(`Quiet ${quiet.length}`);
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('storm-count')).toContainText(`${quiet.length} position${quiet.length === 1 ? '' : 's'} ready for Quiet`);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('repworks-storm')!).focus)).toEqual(['quiet']);
  await page.getByRole('button', { name: 'Quiet storm' }).click();
  await expect(page.locator('.study-title')).toContainText('Quiet storm');
  await expect(page.locator('.storm-card')).toBeVisible();
  const card = await page.locator('.storm-card').getAttribute('data-card');
  expect(quiet.map((p) => p.card)).toContain(card);
  await play(page, ranked(await cardFen(page))[0]!);
  await expect(page.getByTestId('storm-kinds')).toContainText('Quiet');
});

/** The win% a move gives up against the best, from the fake ChessDB's ladder (Lichess's curve). */
const ladderLoss = (fen: string, uci: string) => {
  const i = ranked(fen).indexOf(uci);
  const wp = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
  return wp(LADDER[0]!) - wp(LADDER[Math.min(i, LADDER.length - 1)]!);
};

test('Maia: got from the storm’s page, the kept positions rated, and an unintuitive storm of those whose likeliest move isn’t good', async ({ page }) => {
  test.setTimeout(360_000);
  // Maia's switch stays off: the storm asks it all the same once its files are here.
  await page.addInitScript(() => localStorage.setItem('repworks-maia', JSON.stringify({ on: false, rating: 1500 })));
  // Only a list Stockfish has deepened may judge a move (§5.84), so the deepening runs too.
  const w = await setUp(page, { deepen: true });
  const ready = await gathered(page, w);
  await expect(page.getByTestId('storm-deep')).toContainText(`${ready} of ${ready} scored`, { timeout: 60_000 });
  const count = page.getByTestId('storm-maia-count');
  await expect(count).toContainText('Maia can rate each position’s difficulty');
  // Without Maia, the focus offers no group of its.
  await page.getByTestId('storm-focus').locator('summary').click();
  await expect(page.getByRole('group', { name: 'Hard for you' })).toHaveCount(0);
  await count.getByRole('button', { name: 'Get Maia…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Enable Maia' });
  await expect(dialog).toContainText('rate each position’s difficulty');
  await dialog.getByRole('button', { name: /^Download/ }).click();
  await expect(dialog).toHaveCount(0, { timeout: 30_000 });
  await expect(count).toContainText(`Maia: ${ready} of ${ready} rated`, { timeout: 180_000 });
  // The explorer's switch is still off.
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('repworks-maia')!).on)).toBe(false);

  // Each kept position has the ladder's ratings and the user's; its unintuitive ones worked out
  // here from Maia's likeliest move at 1500 and the fake ChessDB's ladder (good: under 6%).
  const kept = await keptPositions(page);
  expect(kept.length).toBe(ready);
  for (const p of kept) expect(p.maia!.map((r) => r.elo)).toEqual([1000, 1400, 1500, 1800, 2200, 2600]);
  const odd = kept.filter((p) => ladderLoss(p.fen, p.maia!.find((r) => r.elo === 1500)!.moves[0]![0]) >= 6);
  expect(odd.length).toBeGreaterThan(0);
  await expect(page.getByTestId('storm-spread')).toContainText(`${odd.length} unintuitive`);

  // Level up (§5.118): its weaker rating set to one off the ladder, Maia rates the positions there too.
  const level = page.getByTestId('storm-levelup');
  await expect(page.getByRole('group', { name: 'Hard for you' }).getByRole('button', { name: /^Level up/ })).toHaveAttribute('title', 'Maia at 2200 finds a good move at least 25 points more often than at 1800.');
  await level.getByLabel('Level up’s weaker rating').selectOption('1900');
  await level.getByLabel('Level up’s gap').selectOption('10');
  await expect(page.getByRole('group', { name: 'Hard for you' }).getByRole('button', { name: /^Level up/ })).toHaveAttribute('title', 'Maia at 2200 finds a good move at least 10 points more often than at 1900.');
  await expect(count).toContainText(`Maia: ${ready} of ${ready} rated`, { timeout: 120_000 });
  await expect.poll(async () => (await keptPositions(page)).every((x) => x.maia!.some((r) => r.elo === 1900)), { timeout: 120_000 }).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('repworks-storm')!).levelUp)).toEqual({ from: 1900, to: 2200, rise: 10 });

  // The Unintuitive focus (§5.100) deals those only; Maia's likeliest move played is not a good one.
  const chip = page.getByRole('group', { name: 'Hard for you' }).getByRole('button', { name: /^Unintuitive/ });
  await expect(chip).toHaveText(`Unintuitive ${odd.length}`);
  await chip.click();
  await page.getByRole('button', { name: 'Unintuitive storm' }).click();
  await expect(page.locator('.study-title')).toContainText('Unintuitive storm');
  await expect(page.locator('.storm-card')).toBeVisible();
  const card = (await page.locator('.storm-card').getAttribute('data-card'))!;
  const p = odd.find((x) => x.card === card)!;
  expect(p).toBeTruthy();
  await play(page, p.maia!.find((r) => r.elo === 1500)!.moves[0]![0]);
  await expect(page.getByTestId('storm-verdict')).toContainText(/Inaccuracy|Mistake|Blunder/);
  const note = page.getByTestId('storm-maia');
  await expect(note).toContainText('Difficulty');
  await expect(note).toContainText(/Maia at 1500 finds a good move \d+% of the time; its likeliest, \S+ \(\d+%\), is (an inaccuracy|a mistake|a blunder|not a good move)\./);
  await page.getByRole('button', { name: /^End/ }).click();
  const rows = page.locator('.storm-row');
  await expect(rows.first()).toBeVisible();
  for (const t of await rows.evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? ''))) expect(t).toContain('difficulty');
  // Maia's line comes with the best move in the review, not before.
  await rows.first().click();
  await expect(page.locator('.storm-review [data-testid=storm-maia]')).toHaveCount(0);
  await page.getByRole('button', { name: /^Best move/ }).click();
  await expect(page.locator('.storm-review [data-testid=storm-maia]')).toContainText('Difficulty');
});
