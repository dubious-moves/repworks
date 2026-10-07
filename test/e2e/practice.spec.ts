// Practice (PLAN.md §5.57), on a desktop viewport and an emulated phone: a game played on from the
// start against the fake explorer (a Lichess login on the device), with the fake engine judging the
// user's moves (a blunder among them), stopped after five moves; its review (the key move, its
// line, saved as a practice mistake), the history entry after a reload, and the events synced.
// Then an advantage card from mistake-lab's Gist, drilled in the game cards' session: the user's
// move lets the advantage fall to +0.6, which ends the drill as a collapse, graded Again.
// Then (PLAN.md §6, item 2) a game as Black from 1.e4 against the test repertoire (1...c5 2.Nf3 d6
// 3.d4 cxd4): 2...e6 taken back ("isn't your repertoire"), the hint, 2...d6 played; a premove
// (3...cxd4) set while the opponent thinks and played after its move; the page reloaded and the game
// resumed; its review showing the corrected deviation.
import { test, expect, type Page } from '@playwright/test';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { fakeEngine, SLOW } from './engine.ts';
import { fakeExplorer, lichessLogin, serveExplorer } from './explorer.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

function after(sans: string[]): { fen: string; key: string } {
  const pos = Chess.default();
  for (const san of sans) pos.play(parseSan(pos, san)!);
  const fen = makeFen(pos.toSetup());
  return { fen, key: fen.split(' ').slice(0, 4).join(' ') };
}

// The game: 1.e4 c5 2.Nf3 d6 3.d4? (the engine wanted Bb5+) cxd4 4.Nxd4 Nf6 5.Nc3 a6.
const GAME = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'];
const BEFORE_D4 = after(GAME.slice(0, 4));
const AFTER_D4 = after(GAME.slice(0, 5));
const ADV = 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7'.split(' ');
const PEAK = after(ADV.slice(0, 18));

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite({
    engine: fakeEngine(SLOW, {
      [BEFORE_D4.key]: [
        [1, 80, 'f1b5 c8d7'],
        [2, 70, 'c2c3 g8f6'],
        [3, 60, 'b1c3 g8f6'],
      ],
      // Black to move after 3.d4: +1.5 for Black.
      [AFTER_D4.key]: [[1, 150, 'c5d4 f3d4']],
      [PEAK.key]: [
        [1, 60, 'd2d4 b8d7'],
        [2, 50, 'd2d3 b8d7'],
        [3, 40, 'a2a4 c8b7'],
      ],
    }),
  });
});
test.afterAll(async () => {
  await site.close();
});

const players = { white: { user: { name: 'Me', id: 'me' }, rating: 1800 }, black: { user: { name: 'Rival', id: 'rival' }, rating: 1850 } };
const GAMES = {
  version: 2,
  usernames: ['me'],
  games: [{ id: 'GameAdv1', rated: true, speed: 'rapid', createdAt: 1_790_000_000_000, status: 'resign', winner: 'black', players, opening: { name: 'Ruy Lopez' }, moves: ADV.join(' '), analysis: ADV.map((_, i) => ({ eval: i < 14 ? 30 : 400 })) }],
};

async function setUp(page: Page): Promise<{ git: FakeGit }> {
  const { git, github } = world();
  await serveGithub(page, github);
  // The opponent's moves: one move with its games at each position the game reaches.
  const ex = fakeExplorer();
  for (let i = 1; i < GAME.length; i += 2) {
    const at = after(GAME.slice(0, i));
    const pos = Chess.default();
    for (const san of GAME.slice(0, i)) pos.play(parseSan(pos, san)!);
    const move = parseSan(pos, GAME[i]!)!;
    ex.games.set(at.key, [{ san: GAME[i]!, uci: makeUci(move), white: 40, draws: 20, black: 40 }]);
  }
  await serveExplorer(page, ex);
  await lichessLogin(page);
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  await page.route('https://api.github.com/gists/**', (route) => route.fulfill({ status: 200, headers: { ...cors, etag: '"g1"' }, body: JSON.stringify({ files: { 'mistakelab_games.json': { size: 9, truncated: false, content: JSON.stringify(GAMES) } } }) }));
  await page.route('https://lichess.org/api/games/user/**', (route) => route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/x-ndjson' }, body: '' }));
  await page.addInitScript(() => localStorage.setItem('repworks-games', JSON.stringify({ gist: '0123456789abcdef0123' })));
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return { git };
}

const progressLog = (git: FakeGit) =>
  [...git.textsOf()]
    .filter(([p]) => p.startsWith('progress/'))
    .map(([, t]) => t)
    .join('');

test('a practice game: played against the explorer, stopped, reviewed, kept in the history and synced', async ({ page }) => {
  const { git } = await setUp(page);
  await page.evaluate(() => (location.hash = '#/practice?fen=' + encodeURIComponent('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')));
  const game = page.locator('.practice-game');
  await expect(game).toHaveAttribute('data-phase', 'user');
  for (let i = 0; i < GAME.length; i += 2) {
    const pos = Chess.default();
    for (const san of GAME.slice(0, i)) pos.play(parseSan(pos, san)!);
    const m = parseSan(pos, GAME[i]!)! as { from: number; to: number };
    const sq = (n: number) => 'abcdefgh'[n % 8]! + String(Math.floor(n / 8) + 1);
    await clickSquare(page, sq(m.from), 'white');
    await clickSquare(page, sq(m.to), 'white');
    // The opponent's reply from the database: two moves more.
    await expect(game).toHaveAttribute('data-moves', String(i + 2));
    await expect(game).toHaveAttribute('data-phase', 'user');
  }
  await expect(page.getByText(/Opponent: DB \(100\)/)).toBeVisible();
  await page.getByRole('button', { name: 'Stop & review' }).click();

  const review = page.getByTestId('practice-review');
  await expect(review.getByTestId('practice-end')).toContainText('Stopped.');
  await expect(review.getByTestId('practice-accuracy')).toContainText('1 key move');
  await expect(review.getByTestId('practice-keys')).toContainText('d4');
  await review.getByTestId('practice-keys').getByRole('button', { name: 'd4' }).click();
  await review.getByRole('button', { name: 'Show the line' }).click();
  await expect(review.getByTestId('practice-line')).toHaveText('Best: Bb5+ Bd7');
  await review.getByRole('button', { name: 'Save as a mistake' }).click();
  await expect(review).toContainText('Saved: it is in your game cards.');
  await expect(review).toContainText('Kept in the history.');

  // After a reload: the game in the list, its review reopened.
  await page.evaluate(() => (location.hash = '#/games'));
  await page.reload();
  const row = page.getByTestId('history-row');
  await expect(row).toContainText('Practice');
  await expect(row).toContainText('Stopped');
  await row.click();
  await expect(page).toHaveURL(/#\/games\/history\/rev_\d+_[a-z0-9]+$/);
  await expect(page.getByTestId('practice-keys')).toContainText('d4');

  await page.locator('.chip').click();
  await expect.poll(() => progressLog(git), { timeout: 15_000 }).toMatch(/"k":"played","card":"h\|rev_/);
  const log = progressLog(git);
  expect(log).toContain('"k":"practice","card":"x|rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -","res":"loss"');
  expect(log).toMatch(/"k":"saved","card":"m\|_practice_\d+_4","item":\{"kind":"mistake"/);
});

test('an advantage card drilled in the game cards’ session: a collapse, graded Again', async ({ page }) => {
  const { git } = await setUp(page);
  await page.getByRole('link', { name: 'Games' }).click();
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByTestId('games-queue')).toContainText('0 due · 1 new today');
  await page.getByRole('link', { name: 'Review' }).click();
  const card = page.locator('.game-card');
  await expect(card).toHaveAttribute('data-card', 'm|GameAdv1_a19');
  await expect(card).toContainText('you were +4.0 at move 10');
  await clickSquare(page, 'd2', 'white');
  await clickSquare(page, 'd4', 'white');
  await expect(page.getByTestId('practice-end')).toContainText('The advantage is gone');
  await expect(page.getByTestId('practice-end')).toContainText('Recorded: Again');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('games-done')).toContainText('1 card answered: 0 easy, 0 good, 0 hard, 1 again');
  await page.locator('.chip').click();
  await expect.poll(() => progressLog(git), { timeout: 15_000 }).toContain('"k":"review","card":"m|GameAdv1_a19","g":1');
});

test('voice input (§5.63): a move said and played, the opponent’s spoken, a move confirmed by yes', async ({ page }) => {
  // A recognizer the test speaks into, and speech that is only written down.
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w['__spoken'] = [];
    w['SpeechRecognition'] = class {
      onresult: ((e: unknown) => void) | null = null;
      constructor() {
        w['__rec'] = this;
      }
      start() {}
      stop() {}
    };
    w['__say'] = (alts: string[]) => {
      const result = Object.assign(alts.map((t) => ({ transcript: t })), { isFinal: true });
      (w['__rec'] as { onresult(e: unknown): void }).onresult({ resultIndex: 0, results: { length: 1, 0: result } });
    };
    w['SpeechSynthesisUtterance'] = function (this: { text: string }, t: string) {
      this.text = t;
    };
    Object.defineProperty(window, 'speechSynthesis', {
      value: {
        speak(u: { text: string; onend?: () => void }) {
          (w['__spoken'] as string[]).push(u.text);
          setTimeout(() => u.onend?.(), 0);
        },
        cancel() {},
      },
    });
  });
  await setUp(page);
  await page.evaluate(() => (location.hash = '#/practice?fen=' + encodeURIComponent('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')));
  const game = page.locator('.practice-game');
  await expect(game).toHaveAttribute('data-phase', 'user');
  await page.getByTestId('voice').getByRole('button', { name: /Voice/ }).click();
  await expect(page.getByTestId('voice-note')).toHaveText('Listening');
  await page.evaluate(() => (window as unknown as { __say(a: string[]): void }).__say(['egg four', 'egg for']));
  await expect(game).toHaveAttribute('data-moves', '2');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).toContain('c, 5');

  await page.getByLabel('Confirm moves').check();
  await page.evaluate(() => (window as unknown as { __say(a: string[]): void }).__say(['night of three']));
  await expect(page.getByTestId('voice-note')).toHaveText('Nf3?');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken)).toContain('Knight f, 3?');
  await expect(game).toHaveAttribute('data-moves', '2');
  await page.evaluate(() => (window as unknown as { __say(a: string[]): void }).__say(['yes']));
  await expect(game).toHaveAttribute('data-moves', '4');
  await expect(page.getByTestId('practice-moves')).toContainText('2. Nf3');
});

test('practising from a position: the repertoire check, the hint, a premove, and the game resumed after a reload', async ({ page }) => {
  await setUp(page);
  const line = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6', 'Be2'];
  const ex = fakeExplorer();
  for (let i = 2; i < line.length; i += 2) {
    const pos = Chess.default();
    for (const san of line.slice(0, i)) pos.play(parseSan(pos, san)!);
    ex.games.set(after(line.slice(0, i)).key, [{ san: line[i]!, uci: makeUci(parseSan(pos, line[i]!)!), white: 40, draws: 20, black: 40 }]);
  }
  await serveExplorer(page, ex);
  // The opponent's 3.d4 comes late, so a premove can be set while it thinks.
  const slow = after(line.slice(0, 4)).key;
  await page.route('https://explorer.lichess.org/**', async (route) => {
    const fen = new URL(route.request().url()).searchParams.get('fen') ?? '';
    if (route.request().method() !== 'OPTIONS' && fen.split(' ').slice(0, 4).join(' ') === slow) await new Promise((r) => setTimeout(r, 2500));
    await route.fallback();
  });
  await page.evaluate((fen) => (location.hash = '#/practice?fen=' + encodeURIComponent(fen)), after(['e4']).fen);
  const game = page.locator('.practice-game');
  await expect(game).toHaveAttribute('data-phase', 'user');
  const move = async (uci: string) => {
    await clickSquare(page, uci.slice(0, 2), 'black');
    await clickSquare(page, uci.slice(2, 4), 'black');
  };
  await move('c7c5');
  await expect(game).toHaveAttribute('data-moves', '2');
  await expect(game).toHaveAttribute('data-phase', 'user');

  // Off the repertoire: taken back, the study move named; the hint points at it.
  await move('e7e6');
  await expect(page.getByTestId('practice-deviation')).toContainText('e6 isn’t your repertoire: the study move is d6');
  await expect(game).toHaveAttribute('data-moves', '2');
  const hint = page.getByRole('button', { name: 'Hint' });
  await hint.click();
  await hint.click();
  await expect(hint).toBeDisabled();
  await move('d7d6');
  await expect(page.getByTestId('practice-deviation')).toHaveCount(0);
  await expect(game).toHaveAttribute('data-moves', '3');

  // A premove while the opponent thinks, played once it has moved.
  await expect(game).toHaveAttribute('data-phase', 'opponent');
  await move('c5d4');
  await expect(game).toHaveAttribute('data-premove', 'c5d4');
  await expect(game).toHaveAttribute('data-moves', '6');
  await expect(game).toHaveAttribute('data-premove', '');
  await expect(game).toHaveAttribute('data-phase', 'user');

  // A reload: the game offered again, and resumed where it was.
  await page.reload();
  const banner = page.getByTestId('practice-resume');
  await expect(banner).toContainText('6 moves played');
  await banner.getByRole('button', { name: 'Resume' }).click();
  await expect(game).toHaveAttribute('data-moves', '6');
  await expect(game).toHaveAttribute('data-phase', 'user');
  await move('g8f6');
  await expect(game).toHaveAttribute('data-moves', '8');
  await expect(game).toHaveAttribute('data-phase', 'user');
  await move('a7a6');
  await expect(game).toHaveAttribute('data-moves', '10');
  await expect(game).toHaveAttribute('data-phase', 'user');
  await page.getByRole('button', { name: 'Stop & review' }).click();
  const review = page.getByTestId('practice-review');
  await expect(review.getByTestId('practice-keys')).toContainText('d6 📖 corrected: you first tried e6');
  // Ended: nothing is offered again.
  await page.reload();
  await expect(page.getByTestId('practice-resume')).toHaveCount(0);
});
