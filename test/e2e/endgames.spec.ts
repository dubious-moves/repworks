// Endgames (PLAN.md §5.145), on a desktop viewport and an emulated phone, with the fake engine's
// lines scripted per position: the list from the home screen; "Take the opposition" with Kd2
// throwing the win away: Stockfish answers at once while the move is judged in the background
// (§5.146), the user plays on, and the judge (searched again deeper) stops the game back on Kd2
// ("lets the win slip"), the moves after it dimmed; taken back with them, the move that keeps it
// shown as an arrow, Ke3 played and Stockfish's answer; the try counted once as missed (one
// `practice` event, synced, at Kd2), the list saying so. Then the breakthrough solved first time
// along Stockfish's own line (b6 cxb6 a6 bxa6 c6 b5 c7 b4 c8=Q), the list saying when it comes back.
import { test, expect, type Page } from '@playwright/test';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { commands, fakeEngine } from './engine.ts';
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

let site: SiteServer;
test.beforeAll(async () => {
  const extra: Record<string, [number, number, string][]> = {
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
  };
  for (const [key, uci, others] of BREAKTHROUGH) extra[key] = [[1, key.includes(' w ') ? 700 : -700, uci], ...(others ?? []).map((m, i): [number, number, string] => [i + 2, 0, m])];
  site = await serveSite({ engine: fakeEngine(ENGINE_MS, extra) });
});
test.afterAll(async () => {
  await site.close();
});

async function setUp(page: Page): Promise<FakeGit> {
  const { git, github } = world();
  await serveGithub(page, github);
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
  await page.getByRole('link', { name: 'Endgames' }).click();
  await expect(page).toHaveURL(/#\/endgames$/);
  await expect(page.getByTestId('endgame-counts')).toHaveText('0 due · 10 new');
  await expect(page.getByTestId('endgame-next')).toHaveText('Next new: Queen mate');
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
  await expect(page.getByTestId('endgame-counts')).toHaveText('1 due · 9 new');
  await expect(page.getByTestId('endgame-next')).toHaveText('Next due: Take the opposition');
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  expect(endgameEvents(git).length).toBe(1);
});

test('an endgame solved first time: the breakthrough along Stockfish’s line, the pawn queened, back tomorrow', async ({ page }) => {
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
