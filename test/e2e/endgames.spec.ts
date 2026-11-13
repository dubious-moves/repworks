// Endgames (PLAN.md §5.145), on a desktop viewport and an emulated phone, with the fake engine's
// lines scripted per position: the list from the home screen; "Take the opposition" with Kd2
// throwing the win away: Stockfish answers at once while the move is judged in the background
// (§5.146), the user plays on, and the judge (searched again deeper) stops the game back on Kd2
// ("lets the win slip"), the moves after it dimmed; taken back with them, the move that keeps it
// shown as an arrow, Ke3 played and Stockfish's answer; the try counted once as missed (one
// `practice` event, synced, at Kd2), the list saying so. Then the breakthrough solved first time
// along Stockfish's own line (b6 cxb6 a6 bxa6 c6 b5 c7 b4 c8=Q), the list saying when it comes back.
// And the opponent (§5.147): Stockfish alone without Maia, then, Maia downloaded from the list, Maia
// 2600's move (the real network) once Stockfish, searching it alone, finds it sound. And a draw's
// attacker (§5.148) not going back to a position seen, and pushing its pawn once a third is held.
// And the repertoire's endgames (§5.149): gathered from two games the fake explorer names at every
// line end (each walked to its first quiet endgame position past 3...cxd4, scored by the fake
// Stockfish: a draw and a win), listed by category, one played and its hint counted, kept over a
// reload, filtered, and one removed. And the endgames added in §5.150: the list's new groups; the
// bishop and knight's own goal line (+0.50: Stockfish scores the whole mate about +1.6), a hung
// bishop stopped as a slip where +2's line would stop nothing; the rook against a pawn played to its
// end, the king first, the pawn won. And premoves (the owner's request, 2026-11-13): set while the
// defence thinks, taken off, dropped when its answer makes one illegal, a pawn premoved to the last
// rank queening.
import { test, expect, type Page } from '@playwright/test';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { commands, fakeEngine } from './engine.ts';
import { lichessLogin } from './explorer.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

const OPPOSITION = '8/8/8/4k3/8/3K4/4P3/8 w - -';
const AFTER_KE3 = '8/8/8/4k3/8/4K3/4P3/8 b - -';
/** Kd2, Kd5 and Ke3: played on while Kd2 is judged. */
const AFTER_KD2 = '8/8/8/4k3/8/8/3KP3/8 b - -';
const AFTER_KD5 = '8/8/8/3k4/8/8/3KP3/8 w - -';
const AFTER_KD2_KE3 = '8/8/8/3k4/8/4K3/4P3/8 b - -';
/**
 * The fake engine's search, ms: long enough that a move is played in the time a judge's second,
 * deeper search takes (the board's two clicks well inside it).
 */
const ENGINE_MS = 1000;
/**
 * The breakthrough along Stockfish 18's line at depth 18: each position, the move played there,
 * and at the user's the two lines after it (a judge asks for three, as Stockfish always gives).
 */
const BREAKTHROUGH: [string, string, string[]?][] = [
  ['8/ppp4k/8/PPP5/8/8/8/7K w - -', 'b5b6', ['h1g2', 'h1h2']],
  ['8/ppp4k/1P6/P1P5/8/8/8/7K b - -', 'c7b6'],
  ['8/pp5k/1p6/P1P5/8/8/8/7K w - -', 'a5a6', ['h1g2', 'h1h2']],
  ['8/pp5k/Pp6/2P5/8/8/8/7K b - -', 'b7a6'],
  ['8/p6k/pp6/2P5/8/8/8/7K w - -', 'c5c6', ['h1g2', 'h1h2']],
  ['8/p6k/ppP5/8/8/8/8/7K b - -', 'b6b5'],
  ['8/p6k/p1P5/1p6/8/8/8/7K w - -', 'c6c7', ['h1g2', 'h1h2']],
  ['8/p1P4k/p7/1p6/8/8/8/7K b - -', 'b5b4'],
  ['8/p1P4k/p7/8/1p6/8/8/7K w - -', 'c7c8q', ['c7c8r', 'h1g2']],
];

/** The breakthrough's defence's search, ms (its premoves' test). */
const DEFENCE_MS = 2500;

/** King in front of the pawn, and after Kd5: Stockfish's first line Kf7, Maia 2600's likeliest move Ke7. */
const KING_IN_FRONT = '5k2/8/8/8/3KP3/8/8/8 w - -';
const AFTER_KD5_KIF = '5k2/8/8/3K4/4P3/8/8/8 b - -';

/** Hold with the opposition: the user's positions (Black to move) and the attacker's (White). */
const HOLD = {
  u0: '4k3/8/8/4K3/4P3/8/8/8 b - -',
  a1: '8/4k3/8/4K3/4P3/8/8/8 w - -',
  u1: '8/4k3/8/3K4/4P3/8/8/8 b - -',
  a2: '8/3k4/8/3K4/4P3/8/8/8 w - -',
  u2: '8/3k4/8/4K3/4P3/8/8/8 b - -',
  u3: '8/4k3/8/5K2/4P3/8/8/8 b - -',
  a3: '8/5k2/8/5K2/4P3/8/8/8 w - -',
};

/**
 * Two legal games past the fixture's 3...cxd4 (made for the tests by a random walk that prefers
 * captures, not real ones), and Black's first quiet endgame position in each: R+N against R+N
 * after 23.Ra5 (scored −0.40: a draw to hold), two rooks each after 18.Ke3 (+4.50: a win).
 */
const REP_GAMES = [
  ['RepGameA', 'e4 c5 Nf3 d6 d4 cxd4 Qxd4 Na6 Bxa6 bxa6 O-O Qb6 Qxd6 exd6 Ne5 Qxb2 Nxf7 Bd7 Bxb2 Kxf7 Bxg7 Kxg7 Rd1 Bh3 Rxd6 Bxg2 Rxa6 Bxe4 Rxa7+ Rxa7 h4 Bxc2 Nc3 Rxa2 Rxa2 Bf5 Kg2 Ba3 Rxa3 Ne7 Kf3 Be4+ Kxe4 Ra8 Ra5 Nf5 Ne2'],
  ['RepGameB', 'e4 c5 Nf3 d6 d4 cxd4 Ba6 Nxa6 O-O f6 Qxd4 Nh6 Bxh6 gxh6 Qxd6 Qxd6 Nd4 Qa3 Nxa3 Nc5 Rad1 Nxe4 Rb1 Nxf2 Kxf2 Bf5 Nxf5 O-O-O Nxe7+ Bxe7 Nc4 Bd6 Nxd6+ Rxd6 Ke3 Rd3+ Kf2 Rd4'],
] as const;
/** Bishop and knight: 1.Kd2 Kd4, then 2.Bc4?? hanging the bishop (Kxc4: a knight can't mate). */
const BN = {
  u0: '8/8/8/4k3/8/8/8/1N2KB2 w - -',
  a1: '8/8/8/4k3/8/8/3K4/1N3B2 b - -',
  u1: '8/8/8/8/3k4/8/3K4/1N3B2 w - -',
  bc4: '8/8/8/8/2Bk4/8/3K4/1N6 b - -',
};
/**
 * Rook against a pawn along Stockfish's line (1.Ke4 Kc4 2.Rc8+ Kb4 3.Kd3 Ka3 4.Kc3 Ka2 5.Ra8+ Kb1
 * 6.Kxb3): each position, the lines there (the user's three, the defence's one), the move played.
 */
const ROOK_PAWN: [string, [number, number, string][], string?][] = [
  ['3R4/8/8/1k3K2/8/1p6/8/8 w - -', [[1, 5169, 'f5e4 b5c4'], [2, 3, 'd8h8 b5c4'], [3, 0, 'd8b8 b5c4']], 'f5e4'],
  ['3R4/8/8/1k6/4K3/1p6/8/8 b - -', [[1, -5169, 'b5c4 d8c8']]],
  ['3R4/8/8/8/2k1K3/1p6/8/8 w - -', [[1, 2000, 'd8c8 c4b4'], [2, 1800, 'e4e3 b3b2'], [3, 0, 'd8b8 c4c3']], 'd8c8'],
  ['2R5/8/8/8/2k1K3/1p6/8/8 b - -', [[1, -2000, 'c4b4 e4d3']]],
  ['2R5/8/8/8/1k2K3/1p6/8/8 w - -', [[1, 2500, 'e4d3 b4a3'], [2, 2400, 'e4d4 b3b2'], [3, 0, 'c8b8 b4c3']], 'e4d3'],
  ['2R5/8/8/8/1k6/1p1K4/8/8 b - -', [[1, -2500, 'b4a3 d3c3']]],
  ['2R5/8/8/8/8/kp1K4/8/8 w - -', [[1, 5000, 'd3c3 a3a2'], [2, 4000, 'c8a8 a3b2'], [3, 0, 'd3d2 b3b2']], 'd3c3'],
  ['2R5/8/8/8/8/kpK5/8/8 b - -', [[1, -5000, 'a3a2 c8a8']]],
  ['2R5/8/8/8/8/1pK5/k7/8 w - -', [[1, 6000, 'c8a8 a2b1'], [2, 5000, 'c3b4 b3b2'], [3, 0, 'c8c4 b3b2']], 'c8a8'],
  ['R7/8/8/8/8/1pK5/k7/8 b - -', [[1, -6000, 'a2b1 c3b3']]],
  ['R7/8/8/8/8/1pK5/8/1k6 w - -', [[1, 7000, 'c3b3 b1c1'], [2, 6500, 'a8b8 b1c1'], [3, 6000, 'a8a3 b1b2']], 'c3b3'],
];
const REP_DRAW = 'r7/4n1kp/8/R7/4K2P/2N5/5P2/8 b - -';
const REP_WIN = '2k4r/pp5p/3r1p1p/8/8/4K3/PPP3PP/1R3R2 b - -';

let site: SiteServer;
test.beforeAll(async () => {
  const extra: Record<string, [number, number, string][]> = {
    [REP_DRAW]: [[1, -40, 'a8a5 c3a4']],
    [REP_WIN]: [[1, 450, 'd6d2 b1d1']],
    // The user's moves hold (0.00), the others lose; the attacker's first line is Kd5 where the
    // board is A1 (twice: Kd5 a repetition the second time, Kf5 then), Ke5 at A2, Kg5 at A3 with
    // e5 within 0.30.
    [HOLD.u0]: [
      [1, 0, 'e8e7 e5d5'],
      [2, -1100, 'e8d8 e5d6'],
      [3, -1100, 'e8f8 e5f6'],
    ],
    // A line for each legal move: the search asks for five.
    [HOLD.a1]: [
      [1, 0, 'e5d5 e7d7'],
      [2, 0, 'e5f5 e7f7'],
      [3, -400, 'e5d4 e7d6'],
      [4, -400, 'e5f4 e7f6'],
    ],
    [HOLD.u1]: [
      [1, 0, 'e7d7 d5e5'],
      [2, -1100, 'e7e8 d5d6'],
      [3, -1100, 'e7f6 d5d6'],
    ],
    [HOLD.a2]: [
      [1, 0, 'd5e5 d7e7'],
      [2, -400, 'd5c5 d7e6'],
      [3, -400, 'd5c4 d7e6'],
      [4, -400, 'd5d4 d7e6'],
      [5, -400, 'e4e5 d7e7'],
    ],
    [HOLD.u2]: [
      [1, 0, 'd7e7 e5d5'],
      [2, -1100, 'd7c7 e5e6'],
      [3, -1100, 'd7d8 e5e6'],
    ],
    [HOLD.u3]: [
      [1, 0, 'e7f7 f5g5'],
      [2, -1100, 'e7d6 f5f6'],
      [3, -1100, 'e7e8 f5f6'],
    ],
    [HOLD.a3]: [
      [1, 10, 'f5g5 f7e7'],
      [2, 0, 'e4e5 f7e7'],
      [3, -400, 'f5e5 f7e7'],
      [4, -400, 'f5f4 f7f6'],
      [5, -400, 'f5g4 f7f6'],
    ],
    [KING_IN_FRONT]: [
      [1, 6480, 'd4d5 f8e7'],
      [2, 0, 'd4e5 f8e7'],
      [3, 0, 'e4e5 f8e7'],
    ],
    [AFTER_KD5_KIF]: [[1, -6480, 'f8f7 d5d6']],
    // Maia's moves before Stockfish's own (Ke7 72%, Ke8 19%, Kf7 7%), searched alone together.
    [`${AFTER_KD5_KIF}|f8e7 f8e8`]: [
      [1, -6500, 'f8e7 d5e5'],
      [2, -6500, 'f8e8 d5e6'],
    ],
    // Ke3 keeps the win; Kc3 and Kd2 let it go (scores for the side to move).
    [OPPOSITION]: [
      [1, 900, 'd3e3 e5d6'],
      [2, 0, 'd3c3 e5d5'],
      [3, 0, 'd3d2 e5d4'],
    ],
    [AFTER_KE3]: [[1, -900, 'e5d6 e3e4']],
    [AFTER_KD2]: [[1, 0, 'e5d5 d2d3']],
    [AFTER_KD5]: [
      [1, 0, 'd2e3 d5e5'],
      [2, 0, 'd2d3 d5e5'],
      [3, 0, 'e2e4 d5e4'],
    ],
    [AFTER_KD2_KE3]: [[1, 0, 'd5e5 e3d3']],
    // Every move of the bishop and knight's mate about +1.6; Bc4 hangs the bishop (0.00), confirmed
    // by the deeper search of the lines' moves and it.
    [BN.u0]: [
      [1, 165, 'e1d2 e5d4'],
      [2, 164, 'e1f2 e5e4'],
      [3, 164, 'e1e2 e5d4'],
    ],
    [BN.a1]: [[1, -165, 'e5d4 f1d3']],
    [BN.u1]: [
      [1, 160, 'f1d3 d4c5'],
      [2, 158, 'b1c3 d4c4'],
      [3, 157, 'd2e2 d4e4'],
    ],
    [BN.bc4]: [[1, 0, 'd4c4 d2e3']],
    [`${BN.u1}|f1d3 b1c3 d2e2 f1c4`]: [
      [1, 160, 'f1d3 d4c5'],
      [2, 158, 'b1c3 d4c4'],
      [3, 157, 'd2e2 d4e4'],
      [4, 0, 'f1c4 d4c4'],
    ],
  };
  for (const [key, lines] of ROOK_PAWN) extra[key] = lines;
  for (const [key, uci, others] of BREAKTHROUGH) extra[key] = [[1, key.includes(' w ') ? 700 : -700, uci], ...(others ?? []).map((m, i): [number, number, string] => [i + 2, 0, m])];
  // The breakthrough's defence thinks a while: time for premoves to be set, taken off and set again.
  const slowAt = Object.fromEntries(BREAKTHROUGH.filter(([key]) => key.includes(' b ')).map(([key]) => [key, DEFENCE_MS]));
  site = await serveSite({ engine: fakeEngine(ENGINE_MS, extra, false, undefined, slowAt) });
});
test.afterAll(async () => {
  await site.close();
});

/** Signed in, synced; `routes` laid over GitHub's (a later route wins). */
async function setUp(page: Page, routes?: () => Promise<void>): Promise<FakeGit> {
  const { git, github } = world();
  await serveGithub(page, github);
  await routes?.();
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return git;
}

/** This device's endgame results, as synced. */
function endgameEvents(git: FakeGit): Record<string, unknown>[] {
  return [...git.textsOf()]
    .filter(([p]) => p.startsWith('progress/'))
    .flatMap(([, t]) => t.split('\n').filter(Boolean))
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .filter((e) => e['k'] === 'practice' && e['preset'] === 'endgame');
}

const sq = (uci: string, i: number) => uci.slice(i, i + 2);

test('an endgame: a move that lets the win slip, found after playing on, taken back, the keeping move shown; the try counted once as missed', async ({ page }) => {
  test.setTimeout(60_000);
  const git = await setUp(page);
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: /^Endgames/ }).click();
  await expect(page).toHaveURL(/#\/endgames$/);
  await expect(page.getByTestId('endgame-counts')).toHaveText('0 due · 23 new');
  // Six groups, the two added in §5.150 among them.
  await expect(page.locator('#endgame-group-rook-vs')).toHaveText('Rook against a pawn or a minor piece');
  await expect(page.locator('#endgame-group-minors')).toHaveText('Minor pieces');
  await expect(page.locator('[data-endgame="rook-vs-pawn"] .muted').first()).toHaveText('White to play and win (win the pawn)');
  await expect(page.getByTestId('endgame-next')).toHaveText('Next new: Queen mate');
  await expect(page.getByTestId('endgame-opponent')).toContainText('The opponent: Stockfish alone.');
  await page.getByRole('link', { name: 'Take the opposition', exact: true }).click();
  await expect(page).toHaveURL(/#\/endgames\/opposition$/);
  const game = page.getByTestId('endgame-game');
  const feedback = page.getByTestId('endgame-feedback');
  await expect(game).toHaveAttribute('data-phase', 'user');
  await expect(game.locator('.train-counters')).toHaveText('White to play and win (queen a pawn)');
  // A first try: the method is open.
  await expect(page.locator('.endgame-method')).toHaveAttribute('open', '');

  // Kd2: Stockfish answers at once, the move still being judged; Ke3 played on meanwhile. The
  // judge, searched again deeper with the lines' moves (after the answer, which went first), still
  // a draw: the game stops back on Kd2, the moves after it waiting with it.
  await clickSquare(page, 'd3', 'white');
  await clickSquare(page, 'd2', 'white');
  await page.waitForSelector('[data-testid="endgame-game"][data-moves="2"][data-phase="user"]', { timeout: ENGINE_MS * 3 });
  await expect(feedback).toHaveText('Your move');
  await clickSquare(page, 'd2', 'white');
  await clickSquare(page, 'e3', 'white');
  await expect(game).toHaveAttribute('data-phase', 'slip', { timeout: ENGINE_MS * 8 });
  await expect(feedback).toHaveText('Kd2 lets the win slip. Take it back and find a better move.');
  await expect(page.getByTestId('endgame-slip-later')).toBeVisible();
  await expect(game).toHaveAttribute('data-moves', '4');
  await expect(page.getByTestId('practice-moves')).toHaveText('1. Kd2 Kd5 2. Ke3 Ke5');
  await expect(page.locator('.game-move.endgame-slip-move')).toHaveText('1. Kd2');
  await expect(page.locator('.game-move.endgame-after-slip')).toHaveCount(3);
  const cmds = commands(site.requests);
  const recheck = cmds.findIndex((c) => /^go depth \d+ movetime 15000 searchmoves d3e3 d3c3 d3d2$/.test(c));
  expect(recheck).toBeGreaterThan(-1);
  // Stockfish's answer to Kd2 was searched before the judge's deeper search.
  expect(cmds.slice(0, recheck).some((c) => c.startsWith(`position fen ${AFTER_KD2} `))).toBe(true);
  // Nothing answers it while it waits.
  await page.waitForTimeout(ENGINE_MS * 2);
  await expect(game).toHaveAttribute('data-moves', '4');
  await page.getByTestId('endgame-takeback').click();
  await expect(game).toHaveAttribute('data-phase', 'user');
  await expect(game).toHaveAttribute('data-moves', '0');

  // Again Kd2, then the move that keeps the win shown: taken back, its arrow on the board.
  await clickSquare(page, 'd3', 'white');
  await clickSquare(page, 'd2', 'white');
  await expect(game).toHaveAttribute('data-phase', 'slip');
  await expect(feedback).toHaveText('Kd2 lets the win slip. Take it back and find a better move.');
  // Analysed from there and back (the board at Kd2): the game still waits on the slip.
  await game.getByRole('button', { name: 'Analyse', exact: true }).click();
  await expect(page).toHaveURL(/#\/analysis\?.*line=Kd2&.*back=%23%2Fendgames%2Fopposition/);
  await page.getByRole('button', { name: /^← Back/ }).click();
  await expect(page).toHaveURL(/#\/endgames\/opposition$/);
  await expect(game).toHaveAttribute('data-phase', 'slip');
  await expect(page.getByTestId('endgame-feedback')).toHaveText('Kd2 lets the win slip. Take it back and find a better move.');
  await page.getByRole('button', { name: 'Show a move that keeps it' }).click();
  await expect(game).toHaveAttribute('data-moves', '0');
  await expect(feedback).toHaveText('Your move: the hint is on the board');
  await expect(game.locator('cg-container svg.cg-shapes g[cgHash]')).toHaveCount(1);
  await clickSquare(page, 'd3', 'white');
  await clickSquare(page, 'e3', 'white');
  await expect(game).toHaveAttribute('data-moves', '2');
  await expect(game).toHaveAttribute('data-phase', 'user');
  await expect(page.getByTestId('practice-moves')).toContainText('1. Ke3 Kd6');
  await expect(game).toContainText('This try counts as missed: play it out, or start again.');

  // One event for the try, however many slips: a draw (the win let go) at the start's position, at Kd2.
  await expect(page.locator('.chip')).toHaveText('1 change waiting');
  await page.locator('.chip').click();
  await expect.poll(() => endgameEvents(git).length, { timeout: 15_000 }).toBe(1);
  const [e] = endgameEvents(git);
  expect(e).toMatchObject({ card: `x|${OPPOSITION}`, res: 'draw', preset: 'endgame', mv: 1 });

  // Restarted: the try already counted, nothing more recorded; the list says it is due.
  await page.getByRole('button', { name: 'Restart' }).click();
  await expect(game).toHaveAttribute('data-moves', '0');
  await page.locator('.chapter-head .back').click();
  await expect(page).toHaveURL(/#\/endgames$/);
  await expect(page.locator('[data-endgame="opposition"] [data-testid="endgame-standing"]')).toHaveText('Due · missed last time ✗');
  await expect(page.getByTestId('endgame-counts')).toHaveText('1 due · 22 new');
  await expect(page.getByTestId('endgame-next')).toHaveText('Next due: Take the opposition');
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  expect(endgameEvents(git).length).toBe(1);
});

test('an endgame solved first time: the breakthrough along Stockfish’s line, the pawn queened, back tomorrow', async ({ page }) => {
  test.setTimeout(60_000);
  const git = await setUp(page);
  await page.evaluate(() => (location.hash = '#/endgames/breakthrough'));
  const game = page.getByTestId('endgame-game');
  await expect(game).toHaveAttribute('data-phase', 'user');
  for (let i = 0; i < BREAKTHROUGH.length; i += 2) {
    const uci = BREAKTHROUGH[i]![1];
    await clickSquare(page, sq(uci, 0), 'white');
    await clickSquare(page, sq(uci, 2), 'white');
    if (uci.length === 5) {
      await page.getByRole('dialog', { name: 'Promote to' }).getByRole('button', { name: 'queen', exact: true }).click();
      break;
    }
    await expect(game).toHaveAttribute('data-moves', String(i + 2));
    await expect(game).toHaveAttribute('data-phase', 'user');
  }
  // The end waits for the judges still out.
  await expect(game).toHaveAttribute('data-phase', 'over', { timeout: ENGINE_MS * 8 });
  await expect(page.getByTestId('endgame-feedback')).toHaveText('The pawn queens: the win is yours.');
  await expect(page.getByTestId('endgame-counted')).toHaveText('Solved first time: it comes back in a while.');
  await expect(page.locator('.chip')).toHaveText('1 change waiting');
  await page.locator('.chip').click();
  await expect.poll(() => endgameEvents(git).length, { timeout: 15_000 }).toBe(1);
  expect(endgameEvents(git)[0]).toMatchObject({ card: `x|${BREAKTHROUGH[0]![0]}`, res: 'win', preset: 'endgame', mv: 5 });
  await page.evaluate(() => (location.hash = '#/endgames'));
  await expect(page.locator('[data-endgame="breakthrough"] [data-testid="endgame-standing"]')).toHaveText('Solved once · back tomorrow ✓');
});

test('an endgame on premoves: one taken off, one dropped when the answer makes it illegal, then played one after another to the pawn queened', async ({ page }) => {
  test.setTimeout(60_000);
  await setUp(page);
  await page.evaluate(() => (location.hash = '#/endgames/breakthrough'));
  const game = page.getByTestId('endgame-game');
  const moves = page.getByTestId('practice-moves');
  // The premove's squares on the board (chessground hides the squares it no longer uses).
  const marks = game.locator('cg-board square.current-premove').filter({ visible: true });
  const play = async (uci: string) => {
    await clickSquare(page, sq(uci, 0), 'white');
    await clickSquare(page, sq(uci, 2), 'white');
  };
  await expect(game).toHaveAttribute('data-phase', 'user');
  await play('b5b6');
  await expect(game).toHaveAttribute('data-phase', 'opponent');
  // bxc7 premoved while Stockfish thinks, taken off by a click on an empty square, set again.
  await play('b6c7');
  await expect(game).toHaveAttribute('data-premove', 'b6c7');
  await expect(marks).toHaveCount(2);
  await clickSquare(page, 'e4', 'white');
  await expect(game).toHaveAttribute('data-premove', '');
  await expect(marks).toHaveCount(0);
  await play('b6c7');
  await expect(game).toHaveAttribute('data-premove', 'b6c7');
  // 1...cxb6 takes the pawn it would have moved: dropped, the user to move, the board clear of it.
  await expect(game).toHaveAttribute('data-moves', '2', { timeout: DEFENCE_MS * 4 });
  await expect(game).toHaveAttribute('data-phase', 'user');
  await expect(game).toHaveAttribute('data-premove', '');
  await expect(marks).toHaveCount(0);
  await expect(moves).toHaveText('1. b6 cxb6');

  // Then each move premoved while the answer comes, played as it lands: c6, c7, and c8 a queen.
  await play('a5a6');
  await expect(game).toHaveAttribute('data-phase', 'opponent');
  for (const [uci, after] of [['c5c6', 5], ['c6c7', 7], ['c7c8', 9]] as const) {
    await play(uci);
    await expect(game).toHaveAttribute('data-premove', uci);
    if (after === 9) break;
    await expect(game).toHaveAttribute('data-moves', String(after), { timeout: DEFENCE_MS * 4 });
    await expect(game).toHaveAttribute('data-premove', '');
    await expect(game).toHaveAttribute('data-phase', 'opponent');
  }
  await expect(game).toHaveAttribute('data-phase', 'over', { timeout: DEFENCE_MS * 8 });
  await expect(moves).toHaveText('1. b6 cxb6 2. a6 bxa6 3. c6 b5 4. c7 b4 5. c8=Q');
  await expect(page.getByTestId('endgame-feedback')).toHaveText('The pawn queens: the win is yours.');
});

test('bishop and knight: its own goal line, a hung bishop stopped though every move scores under +2', async ({ page }) => {
  await setUp(page);
  await page.evaluate(() => (location.hash = '#/endgames/bishop-knight'));
  const game = page.getByTestId('endgame-game');
  await expect(game).toHaveAttribute('data-phase', 'user');
  await expect(game.locator('.train-counters')).toHaveText('White to play and win (mate)');
  // Kd2 at +1.65: kept, and answered.
  await clickSquare(page, 'e1', 'white');
  await clickSquare(page, 'd2', 'white');
  await expect(game).toHaveAttribute('data-moves', '2');
  await expect(game).toHaveAttribute('data-phase', 'user');
  // Bc4 hangs the bishop: 0.00 from +1.60, stopped (on +2's line nothing here could be).
  await clickSquare(page, 'f1', 'white');
  await clickSquare(page, 'c4', 'white');
  await expect(game).toHaveAttribute('data-phase', 'slip', { timeout: ENGINE_MS * 8 });
  await expect(page.getByTestId('endgame-feedback')).toHaveText('Bc4 lets the win slip. Take it back and find a better move.');
  await page.getByTestId('endgame-takeback').click();
  await expect(game).toHaveAttribute('data-moves', '2');
  await expect(game).toHaveAttribute('data-phase', 'user');
});

test('rook against a pawn: the king first, the pawn won, the rest a rook mate', async ({ page }) => {
  test.setTimeout(90_000);
  await setUp(page);
  await page.evaluate(() => (location.hash = '#/endgames/rook-vs-pawn'));
  const game = page.getByTestId('endgame-game');
  await expect(game).toHaveAttribute('data-phase', 'user');
  await expect(game.locator('.train-counters')).toHaveText('White to play and win (win the pawn)');
  const moves = ROOK_PAWN.filter(([, , uci]) => uci).map(([, , uci]) => uci!);
  for (const [i, uci] of moves.entries()) {
    await clickSquare(page, sq(uci, 0), 'white');
    await clickSquare(page, sq(uci, 2), 'white');
    if (i === moves.length - 1) break;
    await expect(game).toHaveAttribute('data-moves', String(2 * i + 2), { timeout: ENGINE_MS * 4 });
    await expect(game).toHaveAttribute('data-phase', 'user');
  }
  // The pawn taken: the defender's king bare, once the judges are in. Played this fast, each answer
  // stopped the search of the position before it (the answer goes first, §5.146), so the six judges
  // run one after another now, a search each.
  await expect(game).toHaveAttribute('data-phase', 'over', { timeout: ENGINE_MS * 14 });
  await expect(page.getByTestId('endgame-feedback')).toHaveText('The pawn has fallen: the rest is a rook mate.');
  await expect(page.getByTestId('endgame-counted')).toHaveText('Solved first time: it comes back in a while.');
});

test('the opponent: Stockfish alone without Maia; with Maia, its move once Stockfish finds it sound', async ({ page }) => {
  test.setTimeout(180_000);
  await setUp(page);
  await page.evaluate(() => (location.hash = '#/endgames/king-in-front'));
  const game = page.getByTestId('endgame-game');
  const moves = page.getByTestId('practice-moves');
  await expect(game).toHaveAttribute('data-phase', 'user');
  await clickSquare(page, 'd4', 'white');
  await clickSquare(page, 'd5', 'white');
  await expect(moves).toHaveText('1. Kd5 Kf7', { timeout: ENGINE_MS * 4 });

  // Maia from the list's offer: the note says it defends now.
  await page.evaluate(() => (location.hash = '#/endgames'));
  const note = page.getByTestId('endgame-opponent');
  await note.getByRole('button', { name: 'Get Maia…' }).click();
  await page.getByRole('dialog', { name: 'Enable Maia' }).getByRole('button', { name: /^Download/ }).click();
  await expect(note).toHaveText('The opponent: Maia 2600 plays the move a strong player would try, among the moves Stockfish finds sound.', { timeout: 120_000 });

  // Again: Maia's Ke7, searched alone by Stockfish (lost either way, no material given) and played.
  await page.evaluate(() => (location.hash = '#/endgames/king-in-front'));
  await expect(game).toHaveAttribute('data-phase', 'user');
  await expect(moves).toHaveText('');
  await clickSquare(page, 'd4', 'white');
  await clickSquare(page, 'd5', 'white');
  await expect(moves).toHaveText('1. Kd5 Ke7', { timeout: 30_000 });
  expect(commands(site.requests).some((c) => / searchmoves f8e7 f8e8$/.test(c))).toBe(true);
});

test('a draw’s attacker: no going back to a position seen, and the pawn pushed once a third is held', async ({ page }) => {
  await setUp(page);
  await page.evaluate(() => (location.hash = '#/endgames/hold-opposition'));
  const game = page.getByTestId('endgame-game');
  const moves = page.getByTestId('practice-moves');
  await expect(game).toHaveAttribute('data-phase', 'user');
  const play = async (from: string, to: string, n: number) => {
    await clickSquare(page, from, 'black');
    await clickSquare(page, to, 'black');
    await expect(game).toHaveAttribute('data-moves', String(n), { timeout: ENGINE_MS * 6 });
    await expect(game).toHaveAttribute('data-phase', 'user');
  };
  await play('e8', 'e7', 2);
  await play('e7', 'd7', 4);
  await play('d7', 'e7', 6);
  // Kd5 again would be a position seen: Kf5, as good.
  await expect(moves).toContainText('4. Kf5');
  // Four moves held of twelve: e5, Kg5 Stockfish's first line.
  await play('e7', 'f7', 8);
  await expect(moves).toContainText('4. Kf5 Kf7 5. e5');
  await expect(game.locator('.train-counters')).toHaveText('Black to play and draw (hold 12 moves) · held 4 of 12');
});

/** The explorer naming the two games at every line end, and Lichess's export of them. */
async function serveGames(page: Page): Promise<string[]> {
  const requests: string[] = [];
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  await page.route('https://explorer.lichess.org/**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'Authorization', 'access-control-allow-methods': 'GET,OPTIONS' } });
    }
    const url = new URL(route.request().url());
    requests.push(`explorer${url.searchParams.get('until') ? ` until=${url.searchParams.get('until')}` : ''}`);
    await route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ white: 10, draws: 2, black: 8, moves: [], topGames: REP_GAMES.map(([id]) => ({ id })), recentGames: [] }) });
  });
  await page.route('https://lichess.org/api/games/export/**', async (route) => {
    requests.push(`export ${route.request().postData()}`);
    const pgn = REP_GAMES.map(([id, moves]) => `[Event "Rated blitz game"]\n[GameId "${id}"]\n[White "Alice"]\n[Black "Bob"]\n[Result "*"]\n\n${moves} *\n\n\n`).join('');
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/x-chess-pgn' }, body: pgn });
  });
  return requests;
}

test('the repertoire’s endgames: gathered from the games at the line ends, by category, played, kept, removed', async ({ page }) => {
  test.setTimeout(90_000);
  await lichessLogin(page);
  let requests: string[] = [];
  const git = await setUp(page, async () => void (requests = await serveGames(page)));
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: /^Endgames/ }).click();
  const section = page.getByTestId('endgame-repertoire');
  await expect(section.getByRole('heading', { name: 'From your repertoire' })).toBeVisible();
  await section.getByRole('button', { name: 'Gather from your repertoire' }).click();
  // Three line ends, each naming both games; only 3...cxd4's games reach it. A draw and a win kept.
  await expect(page.getByTestId('rep-endgame-gather')).toHaveText('Every line end walked: 2 kept from 6 games. The next gather reads older games.', { timeout: ENGINE_MS * 10 });
  expect(requests.filter((r) => r === 'explorer')).toHaveLength(3);
  expect(requests.filter((r) => r.startsWith('export'))).toHaveLength(3);
  await expect(page.getByTestId('rep-endgame-counts')).toHaveText('2 kept · 0 due · 2 new');
  const items = section.locator('.endgame-item');
  await expect(items).toHaveCount(2);
  // Rook and minor piece before queens and two rooks.
  const draw = items.nth(0);
  await expect(draw.locator('.endgame-title')).toHaveText('R+N vs R+N · pawns 1 v 2');
  await expect(draw).toContainText('Black to play and draw (hold 15 moves)');
  await expect(draw.locator('.endgame-source')).toHaveText('Main line, …2. Nf3 d6 3. d4 cxd4');
  await expect(items.nth(1).locator('.endgame-title')).toHaveText('R+R vs R+R · pawns 5 v 5');
  await expect(items.nth(1)).toContainText('Black to play and win (queen a pawn or go 5 points up)');
  await expect(section.getByRole('button', { name: /^Rook and minor piece/ })).toHaveText('Rook and minor piece 1');
  await expect(section.getByRole('button', { name: /^Rook endings/ })).toBeDisabled();

  // Played: the drill as the theoretical ones', its source under the board; a hint counts the try missed.
  await section.getByTestId('rep-endgame-next').click();
  await expect(page).toHaveURL(/#\/endgames\/r-[0-9a-f]{8}$/);
  const game = page.getByTestId('endgame-game');
  await expect(game).toHaveAttribute('data-phase', 'user');
  await expect(game.locator('.train-counters')).toHaveText('Black to play and draw (hold 15 moves) · held 0 of 15');
  await expect(page.getByTestId('endgame-source')).toContainText('From Main line, …2. Nf3 d6 3. d4 cxd4: Alice–Bob, move 23, 20 moves after your line’s end (after Ra5). Stockfish at the start: -0.40.');
  await expect(page.locator('.study-title')).toHaveText('Rook and minor piece · R+N vs R+N · pawns 1 v 2');
  await game.getByRole('button', { name: 'Hint' }).click();
  await expect(game).toContainText('This try counts as missed: play it out, or start again.');
  await expect(page.locator('.chip')).toHaveText('1 change waiting');
  await page.locator('.chip').click();
  await expect.poll(() => endgameEvents(git).length, { timeout: 15_000 }).toBe(1);
  expect(endgameEvents(git)[0]).toMatchObject({ card: `x|${REP_DRAW}`, res: 'loss', preset: 'endgame', mv: 0 });

  // Back on the list, and after a reload: kept on the device, the missed one due.
  await page.locator('.chapter-head .back').click();
  await page.reload();
  await expect(page.getByTestId('rep-endgame-counts')).toHaveText('2 kept · 1 due · 1 new');
  await expect(section.locator('[data-category="rook-minor"] [data-testid="endgame-standing"]')).toHaveText('Due · missed last time ✗');
  await expect(section.getByTestId('rep-endgame-next')).toHaveText('Next due: R+N vs R+N · pawns 1 v 2');

  // A category chosen; one removed.
  await section.getByRole('button', { name: /^Queens and two rooks/ }).click();
  await expect(items).toHaveCount(1);
  await expect(page.getByTestId('rep-endgame-counts')).toHaveText('1 kept · 0 due · 1 new');
  await items.getByRole('button', { name: 'Remove' }).click();
  await expect(items).toHaveCount(0);
  await section.getByRole('button', { name: /^All/ }).click();
  await expect(items).toHaveCount(1);

  // Gathered again: older games asked for, none new.
  await section.getByRole('button', { name: 'Gather more' }).click();
  await expect(page.getByTestId('rep-endgame-gather')).toContainText('Every line end walked (games up to ', { timeout: ENGINE_MS * 10 });
  expect(requests.filter((r) => r.startsWith('explorer until='))).toHaveLength(3);
  expect(requests.filter((r) => r.startsWith('export'))).toHaveLength(3);
});
