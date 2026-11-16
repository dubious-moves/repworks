// Repertoire training and Learn on the Chessnut Move (PLAN.md §5.192), against the simulated Move
// (test/e2e/chessnut.ts), on a desktop viewport and an emulated phone, with train.spec.ts's world
// (the fixture repertoire, a Black Sicilian: 1... c5 due, 2... d6 always played, three new moves)
// and its day. The board is connected through its chip first, then the session started; the
// simulated robot takes longer over a move than the trainer's pace (600 ms).
// - The day's queue: the start driven turned (Black nearest the user); 1.e4 played only once the
//   board shows the start, driven, lit blue and said; a wrong move by hand put back by the robot,
//   lit red and said; the right move by hand taken, lit green, and recorded; the next line's moves
//   (the opponent's and the own move always played) each driven from the position the one before
//   reached; the new move's arrow lit green and said; a move made on the screen driven.
// - Learn with new moves shown as a sequence: the moves up to it and the sequence's move each
//   driven in turn; stepping back and forth at once drives nothing, the move stopped on is driven
//   after a second; "Play it", then the new move by hand.
//
// Controls (each run once, 2026-11-16, and each failed the named tests):
// - the tick sent when its timer ends, the board not waited on (`tickDue` sending at once): both
//   tests, at their journeys (a drive sent while the one before was under way);
// - `useBoardMirror` not called by the session's board: both tests (nothing driven);
// - the mirror's `played` left out: both tests (no red, no green);
// - the session's words not said (`sessionSpeech` not called): both tests;
// - no `delayMs` while a sequence is stepped: "Learn with a sequence …" (the step back driven at once).
import { test, expect, type Page } from '@playwright/test';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { installFakeMove, type FakeMoveOptions } from './chessnut.ts';
import { serveGithub, world } from './github.ts';
import { walkOnce } from './prefs.ts';
import { serveSite, type SiteServer } from './server.ts';

type Move = { hand(fen: string): void; position(): string; lights(): number[]; drives(): string[]; journeys(): [string, string][]; lit(): number[][] };

/** The board after `sans` from the start, as a board FEN. */
function after(sans: string[]): string {
  const pos = Chess.default();
  for (const san of sans) pos.play(parseSan(pos, san)!);
  return makeFen(pos.toSetup()).split(' ')[0]!;
}
/** A board FEN turned half round (a1 ↔ h8), as the board is set up for a Black player. */
const turn = (board: string) =>
  board
    .split('/')
    .reverse()
    .map((rank) => [...rank].reverse().join(''))
    .join('/');
/** The board after `sans`, as the Black player's board shows it. */
const t = (...sans: string[]) => turn(after(sans));
/** A square's index on the board's lights (a1 = 0), turned for the Black player. */
const sq = (name: string) => 63 - ((name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97));
const LIGHT = { off: 0, red: 1, green: 2, blue: 3 };
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const DAY = new Date('2026-12-01T10:00:00Z');
const C5 = 'r|rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -|c7c5';
const LINE = ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4'];

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

const move = (page: Page) => ({
  hand: (board: string) => page.evaluate((f) => (window as unknown as { __move: Move }).__move.hand(f), board),
  position: () => page.evaluate(() => (window as unknown as { __move: Move }).__move.position()),
  lights: () => page.evaluate(() => (window as unknown as { __move: Move }).__move.lights()),
  drives: () => page.evaluate(() => (window as unknown as { __move: Move }).__move.drives()),
  journeys: () => page.evaluate(() => (window as unknown as { __move: Move }).__move.journeys()),
  lit: () => page.evaluate(() => (window as unknown as { __move: Move }).__move.lit()),
});
const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
const lit = async (b: ReturnType<typeof move>, colour: number, ...squares: string[]) => {
  const l = await b.lights();
  return squares.every((s) => l[sq(s)] === colour);
};
const phase = (page: Page) => page.locator('.train-grid');
const feedback = (page: Page) => page.locator('.train-feedback');
/** Whether the device's log in IndexedDB holds an event for `card`. */
const logged = (page: Page, card: string) =>
  page.evaluate(
    (c) =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open('repworks');
        open.onerror = () => resolve(false);
        open.onsuccess = () => {
          const req = open.result.transaction('log').objectStore('log').getAll();
          req.onerror = () => resolve(false);
          req.onsuccess = () => {
            resolve((req.result as { raw: string }[]).some((e) => e.raw.includes(c)));
            open.result.close();
          };
        };
      }),
    card,
  );

/** The fixture repertoire synced on its day, the simulated Move, speech recorded and on, the board connected. */
async function setUp(page: Page, board: FakeMoveOptions): Promise<void> {
  await page.addInitScript(installFakeMove, board);
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w['__spoken'] = [];
    w['SpeechSynthesisUtterance'] = function (this: { text: string }, text: string) {
      this.text = text;
    };
    Object.defineProperty(window, 'speechSynthesis', { value: { speak: (u: { text: string }) => (w['__spoken'] as string[]).push(u.text), cancel() {} } });
    localStorage.setItem('repworks-board', JSON.stringify({ speak: true }));
  });
  const { github } = world();
  await page.clock.install({ time: DAY });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.sync-chip')).toHaveText(/^synced/);
  const chip = page.getByTestId('board-chip');
  await chip.click();
  await expect(chip).toHaveText('♞ 87%');
}

test("the day's queue on the board: each move played for the user driven in turn, lit and said; a wrong move by hand put back and lit red, the right one green; a new move's arrow lit; a move on the screen driven", async ({ page }) => {
  test.setTimeout(60_000);
  await walkOnce(page);
  await setUp(page, { driveMs: 1000 });
  const b = move(page);
  await page.evaluate(() => (location.hash = '#/train'));

  // The start driven turned; 1.e4 only once the board shows it, driven, lit blue and said; 1... c5 asked.
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await expect.poll(b.position).toBe(t('e4'));
  expect(await b.journeys()).toEqual([
    [START, turn(START)],
    [turn(START), t('e4')],
  ]);
  await expect.poll(() => lit(b, LIGHT.blue, 'e2', 'e4')).toBe(true);
  expect(await spoken(page)).toContain('e, 4.');
  await expect(page.getByTestId('board-chip').locator('[data-dot]')).toHaveAttribute('data-dot', 'ok');

  // 1... e5 by hand: not the repertoire. Taken back on the screen, put back by the robot, lit red, said.
  await b.hand(t('e4', 'e5'));
  await expect(feedback(page)).toHaveText('Not in your repertoire: try again');
  await expect.poll(b.position, { timeout: 5000 }).toBe(t('e4'));
  expect((await b.journeys()).at(-1)).toEqual([t('e4', 'e5'), t('e4')]);
  await expect.poll(() => lit(b, LIGHT.red, 'e7', 'e5')).toBe(true);
  expect(await spoken(page)).toContain('Not in your repertoire. Try again.');
  await expect(page.getByTestId('board-chip').locator('[data-dot]')).toHaveAttribute('data-dot', 'ok');

  // 1... c5 by hand: taken, lit green until the next move, and recorded. The line goes on: 2. Nf3
  // and 2... d6 (always played for the user), each driven once the board shows the move before,
  // lit blue and said; then the line's end.
  await b.hand(t('e4', 'c5'));
  await expect(feedback(page)).toHaveText(/^Line done · Next: /, { timeout: 10_000 });
  await expect.poll(b.position).toBe(t(...LINE.slice(0, 4)));
  expect((await b.journeys()).slice(3)).toEqual([
    [t('e4', 'c5'), t(...LINE.slice(0, 3))],
    [t(...LINE.slice(0, 3)), t(...LINE.slice(0, 4))],
  ]);
  expect((await b.lit()).some((l) => l[sq('c7')] === LIGHT.green && l[sq('c5')] === LIGHT.green && l[sq('e7')] === LIGHT.off)).toBe(true);
  await expect.poll(() => lit(b, LIGHT.blue, 'd7', 'd6')).toBe(true);
  await expect.poll(() => logged(page, C5)).toBe(true);
  expect((await spoken(page)).slice(-2)).toEqual(['Knight f, 3.', 'd, 6. Line done.']);

  // The next line: 3. d4 driven, and the new move 3... cxd4 shown: its arrow lit green, and said.
  await page.getByRole('button', { name: 'Next line' }).click();
  await expect(feedback(page)).toHaveText('New move: play cxd4');
  await expect.poll(b.position).toBe(t(...LINE.slice(0, 5)));
  expect((await b.journeys()).at(-1)).toEqual([t(...LINE.slice(0, 4)), t(...LINE.slice(0, 5))]);
  await expect.poll(() => lit(b, LIGHT.green, 'c5', 'd4')).toBe(true);
  expect(await lit(b, LIGHT.blue, 'd2')).toBe(true);
  expect((await spoken(page)).at(-1)).toBe('d, 4. New move: play c takes d, 4.');

  // 3... cxd4 on the screen: driven on the board, lit green.
  await clickSquare(page, 'c5', 'black');
  await clickSquare(page, 'd4', 'black');
  await expect(feedback(page)).toHaveText(/^Line done · Next: /);
  await expect.poll(b.position).toBe(t(...LINE));
  expect((await b.journeys()).at(-1)).toEqual([t(...LINE.slice(0, 5)), t(...LINE)]);
  await expect.poll(() => lit(b, LIGHT.green, 'c5', 'd4')).toBe(true);
  expect(await b.drives()).toHaveLength(7);
});

test('Learn with a sequence shown, on the board: its moves driven in turn; stepping at once drives nothing, the move stopped on is driven after a second; then the new move by hand', async ({ page }) => {
  test.setTimeout(60_000);
  await walkOnce(page, { newMoves: 'sequence', autoPlayLearn: 'due' });
  await setUp(page, { driveMs: 800 });
  const b = move(page);
  await page.evaluate(() => (location.hash = '#/learn/Rep0Najd/Ch1Najdf'));

  // From the chapter's start, each move driven once the board shows the one before; then the
  // sequence's one new move, 3... cxd4, shown: driven too.
  await expect(phase(page)).toHaveAttribute('data-phase', 'previewed', { timeout: 20_000 });
  await expect.poll(b.position).toBe(t(...LINE));
  const walk = [START, turn(START), ...LINE.map((_, i) => t(...LINE.slice(0, i + 1)))];
  expect(await b.journeys()).toEqual(walk.slice(1).map((to, i) => [walk[i], to]));
  expect(await spoken(page)).toContain('d, 4. A new move: watch it, then play it.');
  expect((await spoken(page)).at(-1)).toBe('c takes d, 4.');

  // A step back and forward at once: nothing driven.
  const drives = walk.length - 1;
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(1500);
  expect(await b.drives()).toHaveLength(drives);
  // A step back, stayed on: driven after a second, not before.
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('.train-line')).not.toContainText('cxd4');
  await page.waitForTimeout(500);
  expect(await b.drives()).toHaveLength(drives);
  await expect.poll(b.position, { timeout: 5000 }).toBe(t(...LINE.slice(0, 5)));
  expect(await b.drives()).toHaveLength(drives + 1);

  // "Play it": the new move asked with no arrow; played by hand, it is found.
  await page.getByRole('button', { name: 'Play it' }).click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await expect(feedback(page)).toHaveText('New move: find it');
  expect((await spoken(page)).at(-1)).toBe('A new move: find it.');
  await b.hand(t(...LINE));
  await expect(feedback(page)).toHaveText(/^Line done · Next: /);
  await expect.poll(() => lit(b, LIGHT.green, 'c5', 'd4')).toBe(true);
  expect(await b.drives()).toHaveLength(drives + 1);
});
