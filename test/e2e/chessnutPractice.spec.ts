// Practice on the Chessnut Move (CHESSNUT.md §5.4, §6 part (d)), against the simulated Move
// (test/e2e/chessnut.ts), on a desktop viewport and an emulated phone, with practice.spec.ts's
// world (the test repertoire synced, the fake explorer behind a Lichess login, the fake engine).
// The board is connected through its chip first, then the game started.
// - As White from the start, the board left elsewhere: the start driven; a move by hand read after
//   the window and played; the opponent's answer driven and lit blue, and said (the board's speech
//   on); with Move feedback, 3.d4 lit in its band's colour (a blunder, red) while it is the last
//   move; a hand during the opponent's turn put back after 2 s; Take back: both moves driven back.
// - As Black from 1.e4: the start driven turned (Black nearest the user), a move read turned back;
//   2...e6 refused by the repertoire check, put back within a second and lit red, the study move
//   said; the hint's piece lit blue, then its square too; 2...d6 by hand played.
// - A third queen: a promotion by hand the set can't make; the panel says so and the game goes on
//   on the screen.
// - An endgame: its position driven, a move by hand played.
// The checklist's lead-up passes `mirror` as these do; a move off its prep is put back by the
// link's refused-move rule (test/unit/app/boardLink.test.ts, test/unit/core/board/link.test.ts).
//
// Controls (each run once, 2026-11-14, and each failed the named tests):
// - `mirror` not passed by PracticeBoard: every practice test;
// - `boardPlayed` without the deviation's red: "as Black …";
// - FEEDBACK_BRUSH's blunder as 'bandGood': "as White …".
import { test, expect, type Page } from '@playwright/test';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { installFakeMove, type FakeMoveOptions } from './chessnut.ts';
import { fakeEngine, SLOW } from './engine.ts';
import { fakeExplorer, lichessLogin, serveExplorer, type FakeExplorer } from './explorer.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

type Move = { hand(fen: string): void; position(): string; lights(): number[]; drives(): string[] };

function after(sans: string[], from?: string): { fen: string; key: string; board: string } {
  const pos = from ? Chess.fromSetup(parseFenOrThrow(from)).unwrap() : Chess.default();
  for (const san of sans) pos.play(parseSan(pos, san)!);
  const fen = makeFen(pos.toSetup());
  return { fen, key: fen.split(' ').slice(0, 4).join(' '), board: fen.split(' ')[0]! };
}
const parseFenOrThrow = (fen: string) => parseFen(fen).unwrap();
/** A board FEN with a piece lifted from one square and put down on another (a hand, any piece, legal or not). */
function shifted(board: string, from: string, to: string): string {
  const cells: string[] = [];
  for (const rank of board.split('/')) for (const ch of rank) cells.push(...(/\d/.test(ch) ? Array<string>(Number(ch)).fill('') : [ch]));
  const at = (name: string) => (8 - Number(name[1])) * 8 + (name.charCodeAt(0) - 97);
  cells[at(to)] = cells[at(from)]!;
  cells[at(from)] = '';
  const ranks: string[] = [];
  for (let r = 0; r < 8; r++) ranks.push(cells.slice(r * 8, r * 8 + 8).map((c) => c || '1').join('').replace(/1+/g, (m) => String(m.length)));
  return ranks.join('/');
}
/** A board FEN turned half round (a1 ↔ h8), as the board is set up for a Black player. */
const turn = (board: string) =>
  board
    .split('/')
    .reverse()
    .map((rank) => [...rank].reverse().join(''))
    .join('/');
/** A square's index on the board's lights (a1 = 0), turned for a Black player. */
const sq = (name: string, turned = false) => {
  const s = (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);
  return turned ? 63 - s : s;
};
const LIGHT = { off: 0, red: 1, blue: 3 };

const GAME = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4'];
const BEFORE_D4 = after(GAME.slice(0, 4));
const AFTER_D4 = after(GAME.slice(0, 5));
const QUEENS = '8/1P6/8/7k/8/8/8/QQ2K3 w - - 0 1';
const QUEENED = after(['b8=Q'], QUEENS);
const OPPOSITION = '8/8/8/4k3/8/3K4/4P3/8';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite({
    engine: fakeEngine(SLOW, {
      // practice.spec.ts's: 3.d4? where the engine wants Bb5+, a blunder searched again deeper.
      [BEFORE_D4.key]: [
        [1, 80, 'f1b5 c8d7'],
        [2, 70, 'c2c3 g8f6'],
        [3, 60, 'b1c3 g8f6'],
      ],
      [AFTER_D4.key]: [[1, 150, 'c5d4 f3d4']],
      [`${BEFORE_D4.key}|f1b5 c2c3 b1c3 d2d4`]: [
        [1, 80, 'f1b5 c8d7'],
        [2, 70, 'c2c3 g8f6'],
        [3, 60, 'b1c3 g8f6'],
        [4, -150, 'd2d4 c5d4'],
      ],
      // The third queen: Stockfish answers ...Kg4.
      [QUEENED.key]: [[1, -5000, 'h5g4 b8b4']],
    }),
  });
});
test.afterAll(async () => {
  await site.close();
});

const move = (page: Page) => ({
  hand: (board: string) => page.evaluate((f) => (window as unknown as { __move: Move }).__move.hand(f), board),
  position: () => page.evaluate(() => (window as unknown as { __move: Move }).__move.position()),
  lights: () => page.evaluate(() => (window as unknown as { __move: Move }).__move.lights()),
  drives: () => page.evaluate(() => (window as unknown as { __move: Move }).__move.drives()),
});
const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

/** The world synced, the explorer's moves, the simulated Move, speech recorded, the board connected. */
async function setUp(page: Page, o: { board?: FakeMoveOptions; explorer?: FakeExplorer } = {}): Promise<void> {
  await page.addInitScript(installFakeMove, o.board ?? {});
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w['__spoken'] = [];
    w['SpeechSynthesisUtterance'] = function (this: { text: string }, t: string) {
      this.text = t;
    };
    Object.defineProperty(window, 'speechSynthesis', { value: { speak: (u: { text: string }) => (w['__spoken'] as string[]).push(u.text), cancel() {} } });
    localStorage.setItem('repworks-board', JSON.stringify({ speak: true }));
  });
  const { github } = world();
  await serveGithub(page, github);
  await serveExplorer(page, o.explorer ?? fakeExplorer());
  await lichessLogin(page);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.sync-chip')).toHaveText(/^synced/);
  const chip = page.getByTestId('board-chip');
  await chip.click();
  await expect(chip).toHaveText('♞ 87%');
}

/** One explorer move at each position along `line` from the start, for the side not the user's. */
function explorerAlong(line: string[], first: number): FakeExplorer {
  const ex = fakeExplorer();
  for (let i = first; i < line.length; i += 2) {
    const pos = Chess.default();
    for (const san of line.slice(0, i)) pos.play(parseSan(pos, san)!);
    ex.games.set(after(line.slice(0, i)).key, [{ san: line[i]!, uci: makeUci(parseSan(pos, line[i]!)!), white: 40, draws: 20, black: 40 }]);
  }
  return ex;
}

test('as White on the board: the start driven, moves read by hand, the answers driven, lit and said; a blunder lit red; a hand put back; Take back', async ({ page }) => {
  test.setTimeout(60_000);
  // The board left on another game's position.
  await setUp(page, { board: { start: after(['e4', 'e5']).board }, explorer: explorerAlong(GAME, 1) });
  // The opponent's answer to 3.d4 comes late: a hand during its turn, and 3.d4's verdict, meanwhile.
  await page.route('https://explorer.lichess.org/**', async (route) => {
    const fen = new URL(route.request().url()).searchParams.get('fen') ?? '';
    if (route.request().method() !== 'OPTIONS' && fen.split(' ').slice(0, 4).join(' ') === AFTER_D4.key) await new Promise((r) => setTimeout(r, 7000));
    await route.fallback();
  });
  const b = move(page);
  await page.evaluate(() => (location.hash = '#/practice?fen=' + encodeURIComponent('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')));
  const game = page.locator('.practice-game');
  await expect(game).toHaveAttribute('data-phase', 'user');
  const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
  await expect.poll(b.drives).toEqual([START]);
  await expect.poll(b.position).toBe(START);

  // 1.e4 by hand: read after the window, played; 1...c5 driven, lit blue and said.
  await b.hand(after(['e4']).board);
  await expect(game).toHaveAttribute('data-moves', '2');
  await expect(page.getByTestId('practice-moves')).toContainText('1. e4 c5');
  await expect.poll(async () => (await b.drives()).at(-1)).toBe(after(['e4', 'c5']).board);
  await expect.poll(b.position).toBe(after(['e4', 'c5']).board);
  await expect.poll(async () => (await b.lights()).filter((l, s) => l === LIGHT.blue && (s === sq('c7') || s === sq('c5'))).length).toBe(2);
  await expect.poll(() => spoken(page)).toContain('c, 5');

  await b.hand(after(GAME.slice(0, 3)).board);
  await expect(game).toHaveAttribute('data-moves', '4');
  await expect.poll(b.position).toBe(BEFORE_D4.board);

  // Move feedback on: 3.d4 by hand, judged a blunder, lit red on its squares while it is the last move.
  await page.getByTestId('practice-feedback-toggle').check();
  await b.hand(AFTER_D4.board);
  await expect(game).toHaveAttribute('data-moves', '5');
  await expect(game).toHaveAttribute('data-phase', 'opponent');
  // A hand during the opponent's turn (a2-a3): put back after 2 s.
  await b.hand(shifted(AFTER_D4.board, 'a2', 'a3'));
  await page.waitForTimeout(1500);
  expect(await b.position()).not.toBe(AFTER_D4.board);
  await expect.poll(b.position, { timeout: 3000 }).toBe(AFTER_D4.board);
  await expect(page.getByTestId('practice-moves')).toContainText('3. d4??');
  await expect.poll(async () => (await b.lights()).filter((l, s) => l === LIGHT.red && (s === sq('d2') || s === sq('d4'))).length).toBe(2);
  // 3...cxd4 driven, lit blue.
  await expect(game).toHaveAttribute('data-moves', '6', { timeout: 10_000 });
  await expect.poll(b.position).toBe(after(GAME).board);
  await expect.poll(async () => (await b.lights()).filter((l, s) => l === LIGHT.blue && (s === sq('c5') || s === sq('d4'))).length).toBe(2);

  // Take back: 3.d4 and its answer off, the board driven back.
  await game.getByTestId('practice-takeback').click();
  await expect(game).toHaveAttribute('data-moves', '4');
  await expect.poll(async () => (await b.drives()).at(-1)).toBe(BEFORE_D4.board);
  await expect.poll(b.position).toBe(BEFORE_D4.board);
});

test('as Black on the board: turned to the user; a move off the repertoire put back, lit red and the study move said; the hint lit', async ({ page }) => {
  const line = ['e4', 'c5', 'Nf3', 'd6', 'd4'];
  await setUp(page, { explorer: explorerAlong(line, 2) });
  const b = move(page);
  await page.evaluate((fen) => (location.hash = '#/practice?fen=' + encodeURIComponent(fen)), after(['e4']).fen);
  const game = page.locator('.practice-game');
  await expect(game).toHaveAttribute('data-phase', 'user');
  // Driven turned: Black nearest the user.
  await expect.poll(b.drives).toEqual([turn(after(['e4']).board)]);
  await expect.poll(b.position).toBe(turn(after(['e4']).board));

  // 1...c5 by hand on the turned board, read as c7-c5; 2.Nf3 driven turned.
  await b.hand(turn(after(['e4', 'c5']).board));
  await expect(game).toHaveAttribute('data-moves', '2');
  await expect.poll(b.position).toBe(turn(after(['e4', 'c5', 'Nf3']).board));

  // 2...e6: not the repertoire. Put back within a second, its squares lit red, the study move said.
  await b.hand(turn(after(['e4', 'c5', 'Nf3', 'e6']).board));
  await expect(page.getByTestId('practice-deviation')).toContainText('e6 isn’t your repertoire: the study move is d6');
  await expect.poll(b.position, { timeout: 1000 }).toBe(turn(after(['e4', 'c5', 'Nf3']).board));
  await expect(game).toHaveAttribute('data-moves', '2');
  await expect.poll(async () => (await b.lights()).filter((l, s) => l === LIGHT.red && (s === sq('e7', true) || s === sq('e6', true))).length).toBe(2);
  await expect.poll(() => spoken(page)).toContain('Not your repertoire. The study move is d, 6.');

  // The hint: the piece lit blue, then its square too.
  const hint = page.getByRole('button', { name: 'Hint' });
  await hint.click();
  await expect.poll(async () => (await b.lights())[sq('d7', true)]).toBe(LIGHT.blue);
  expect((await b.lights())[sq('d6', true)]).toBe(LIGHT.off);
  await hint.click();
  await expect.poll(async () => (await b.lights())[sq('d6', true)]).toBe(LIGHT.blue);

  // 2...d6 by hand: played; 3.d4 driven.
  await b.hand(turn(after(['e4', 'c5', 'Nf3', 'd6']).board));
  await expect(page.getByTestId('practice-deviation')).toHaveCount(0);
  await expect(game).toHaveAttribute('data-moves', '4');
  await expect.poll(b.position).toBe(turn(after(line).board));
});

test("a third queen: the set can't make it, the panel says so, and the game goes on on the screen", async ({ page }) => {
  await setUp(page, { board: { start: QUEENS.split(' ')[0]! } });
  const b = move(page);
  await page.evaluate((fen) => (location.hash = '#/practice?fen=' + encodeURIComponent(fen)), QUEENS);
  const game = page.locator('.practice-game');
  await expect(game).toHaveAttribute('data-phase', 'user');
  // The board shows it already: nothing driven.
  await expect(page.getByTestId('board-chip').locator('[data-dot]')).toHaveAttribute('data-dot', 'ok');
  expect(await b.drives()).toEqual([]);
  // b8=Q by hand (the spare queen): read as a promotion, played; a third white queen.
  await b.hand(QUEENED.board);
  await expect(page.getByTestId('practice-moves')).toContainText('b8=Q');
  await expect(page.getByTestId('board-note')).toHaveText('♞ This position needs pieces the set doesn’t have (White queen): it goes on on the screen.');
  await expect(page.getByTestId('board-chip').locator('[data-dot]')).toHaveAttribute('data-dot', 'bad');
  // Stockfish answers on the screen; nothing driven.
  await expect(game).toHaveAttribute('data-moves', '2');
  await expect(game).toHaveAttribute('data-phase', 'user');
  await expect(page.getByTestId('board-note')).toBeVisible();
  expect(await b.drives()).toEqual([]);
});

test('an endgame on the board: its position driven, a move by hand played', async ({ page }) => {
  await setUp(page);
  const b = move(page);
  await page.evaluate(() => (location.hash = '#/endgames/opposition'));
  const game = page.getByTestId('endgame-game');
  await expect(game).toHaveAttribute('data-phase', 'user');
  await expect.poll(b.drives).toEqual([OPPOSITION]);
  await expect.poll(b.position).toBe(OPPOSITION);
  // Ke3 by hand.
  await b.hand('8/8/8/4k3/8/4K3/4P3/8');
  await expect(page.getByTestId('practice-moves')).toContainText('Ke3');
});
