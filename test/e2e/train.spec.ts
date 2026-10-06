// The training screen (PLAN.md §5.7), on a desktop viewport and an emulated phone, with the fake
// GitHub holding the fixture repertoire (a Black Sicilian: 1... c5 reviewed before, 2... d6
// suspended) and Playwright's clock set to a day when 1... c5 is due. The home screen's counts; a
// session that auto-plays, asks the due move, takes a wrong move back, accepts the right one,
// teaches the new lines and suspends a move; a reload in the middle that carries on; the review
// events reaching the fake repo; and the taught moves asked again after their learning step.
import { test, expect, type Page } from '@playwright/test';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

/** The trainer asks for a move: the feedback line says nothing for it (§5.17), so the phase tells. */
const asked = (page: Page) => expect(page.locator('.train-grid')).toHaveAttribute('data-phase', 'ask');

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

const DAY = new Date('2026-12-01T10:00:00Z');
const C5 = 'r|rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -|c7c5';
const CXD4 = 'r|rnbqkbnr/pp2pppp/3p4/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq -|c5d4';
const NC6 = 'r|rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -|b8c6';
const NF6 = 'r|rnbqkbnr/pp1ppppp/8/2p5/4P3/2P5/PP1P1PPP/RNBQKBNR b KQkq -|g8f6';

async function setUp(page: Page): Promise<FakeGit> {
  const { git, github } = world();
  await page.clock.install({ time: DAY });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return git;
}

const feedback = (page: Page) => page.locator('.train-feedback');
async function play(page: Page, from: string, to: string) {
  await clickSquare(page, from, 'black');
  await clickSquare(page, to, 'black');
}

/** The events this device pushed, parsed. */
function pushed(git: FakeGit): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const [path, text] of git.textsOf()) {
    if (!path.startsWith('progress/') || path.startsWith('progress/Desktop1/') || path.startsWith('progress/Phone001/')) continue;
    for (const line of text.split('\n')) if (line) out.push(JSON.parse(line) as Record<string, unknown>);
  }
  return out.sort((a, b) => (a['n'] as number) - (b['n'] as number));
}

test('train: the counts, a due move asked, a wrong move taken back, new lines taught, a suspend, a reload', async ({ page }) => {
  const git = await setUp(page);
  await expect(page.locator('.train-card h2')).toHaveText('Train: 1 due · 3 new');
  await page.locator('.train-card').getByRole('link', { name: 'Train' }).click();
  await expect(page).toHaveURL(/#\/train$/);
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/);

  // 1. e4 is played for the user; 1... c5 is due and asked. A wrong move goes back.
  await asked(page);
  await expect(page.locator('.train-line')).toContainText('1. e4');
  await expect(page.locator('.train-counters')).toContainText('1 due · 3 new');
  await play(page, 'e7', 'e5');
  await expect(feedback(page)).toHaveText('Not in your repertoire: try again');
  await expect(page.locator('cg-board piece.black.pawn')).toHaveCount(8);
  await play(page, 'c7', 'c5');

  // The first new line: 2. Nf3, then 2... d6 (suspended) played for the user, 3. d4, and the new
  // move 3... cxd4 shown with its arrow.
  await expect(feedback(page)).toHaveText('New move: play cxd4');
  await expect(page.locator('.train-line')).toContainText('1. e4 c5 2. Nf3 d6 3. d4');
  await expect(page.locator('.train-counters')).toContainText('0 due · 3 new');
  await play(page, 'c5', 'd4');
  await expect(feedback(page)).toHaveText(/New move learned: cxd4|New move: play Nc6/);

  // A reload in the middle carries on from the log: c5 and cxd4 are answered, Nc6 comes next.
  await page.reload();
  await expect(feedback(page)).toHaveText('New move: play Nc6');
  await expect(page.locator('.train-counters')).toContainText('0 due · 2 new');
  // "Always play this for me": recorded, the move played, and an undo offered.
  await page.getByRole('button', { name: 'Always play this for me' }).click();
  await expect(page.getByRole('button', { name: 'Undo: ask Nc6 again' })).toBeVisible();

  // The Alapin line: 1. e4 c5 played (both answered), 2. c3, then 2... Nf6 taught.
  await expect(feedback(page)).toHaveText('New move: play Nf6');
  await play(page, 'g8', 'f6');
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('2 lines');

  // The events reach the data repo with the next sync.
  await page.locator('.chip').click();
  await expect.poll(() => pushed(git).length).toBe(4);
  const events = pushed(git);
  expect(events.map((e) => [e['k'], e['card']])).toEqual([
    ['review', C5],
    ['taught', CXD4],
    ['suspend', NC6],
    ['taught', NF6],
  ]);
  expect(events[0]).toMatchObject({ g: 1, w: ['e7e5'] });
  expect(typeof events[0]!['ms']).toBe('number');

  // Back home: nothing due now; the taught moves come back after their learning step.
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.locator('.train-card h2')).toHaveText('Train: 0 due · 0 new');
  await expect(page.locator('.train-card')).toContainText('2 more today from');
  await page.clock.fastForward('04:01:00');
  await page.reload();
  await expect(page.locator('.train-card h2')).toHaveText('Train: 2 due · 0 new');
  await page.locator('.train-card').getByRole('link', { name: 'Train' }).click();
  await asked(page);
  await expect(page.locator('.train-line')).toContainText('1. e4 c5 2. Nf3 d6 3. d4');
  await play(page, 'c5', 'd4');
  // Right first time: the feedback line stays quiet (§5.17), and the Alapin's Nf6 is asked next.
  await expect(page.locator('.train-line')).toContainText('2. c3');
  await asked(page);
  await expect(feedback(page)).toHaveText('');
});

test('train one study from the study list and Escape stops', async ({ page, isMobile }) => {
  await setUp(page);
  await page.getByRole('link', { name: 'Train Test repertoire' }).click();
  await expect(page).toHaveURL(/#\/train\/Rep0Najd$/);
  await expect(page.locator('.study-title')).toHaveText('Training · Test repertoire');
  await asked(page);
  if (!isMobile) {
    // Space for Hint.
    await page.keyboard.press(' ');
    await expect(feedback(page)).toHaveText('Play c5');
    await page.keyboard.press('Escape');
  } else {
    await page.getByRole('button', { name: 'Hint' }).click();
    await expect(feedback(page)).toHaveText('Play c5');
    await page.getByRole('button', { name: 'Stop' }).click();
  }
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('0 moves reviewed');
  await page.getByRole('button', { name: 'Train again' }).click();
  await asked(page);
});

test('the chapter view shows the move’s card and toggles its suspend; the debug panel lists conflicting moves', async ({ page }) => {
  const git = await setUp(page);
  await page.locator('summary', { hasText: 'Settings and debug' }).click();
  await expect(page.locator('.repertoire-stats')).toContainText('5 cards · 3 lines');
  await expect(page.locator('.repertoire-conflicts li')).toHaveText(['Test repertoire: e4 c5 Nf3 → d6, Nc6']);

  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await page.locator('.move[data-path="e4 c5"]').click({ position: { x: 6, y: 8 } }); // the move, not its +1
  const panel = page.getByRole('region', { name: 'Training card' });
  await expect(panel).toContainText('Due');
  await expect(panel).toContainText('2 reviews');
  await expect(panel).toContainText('Also met in 1 other place');
  // White's move makes no card here (a Black chapter).
  await page.locator('.move[data-path="e4 c5 Nf3"]').click();
  await expect(panel).toHaveCount(0);
  await page.locator('.move[data-path="e4 c5 Nf3 d6"]').click();
  await expect(panel).toContainText('Always played for you');
  await panel.getByRole('button', { name: 'Ask me this move again' }).click();
  await expect(panel).toContainText('New: not learned yet');
  await panel.getByRole('button', { name: 'Always play this for me' }).click();
  await expect(panel).toContainText('Always played for you');
  await page.locator('.chip').click();
  await expect.poll(() => pushed(git).map((e) => e['k'])).toEqual(['unsuspend', 'suspend']);
});

test('mistakes: fail a move, pin it, see it, retry and drill it with nothing graded; the pin comes due after 30 minutes', async ({ page }) => {
  const git = await setUp(page);
  await expect(page.locator('.train-card h2')).toHaveText('Train: 1 due · 3 new');
  await page.goto(`${site.url}#/train`);
  await asked(page);
  await play(page, 'e7', 'e5');
  await expect(feedback(page)).toHaveText('Not in your repertoire: try again');
  await play(page, 'c7', 'c5');
  await page.getByRole('button', { name: 'Pin this mistake' }).click();
  await expect(page.getByRole('button', { name: 'Pin this mistake' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.getByRole('button', { name: 'Mistakes' }).click();

  const today = page.getByRole('region', { name: "Today's mistakes" });
  await expect(today.locator('li')).toHaveCount(1);
  await expect(today.locator('li')).toContainText('Main line 1. e4 c5');
  await expect(today.locator('li')).toContainText('tried e5');
  await expect(today.getByRole('button', { name: 'Unpin' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Pinned' }).locator('li')).toContainText('0 of 3 clean');

  // Retry: from the line's start, 1. e4 played, 1... c5 asked.
  await today.getByRole('link', { name: 'Retry' }).click();
  await expect(page.locator('.study-title')).toHaveText('Retry mistakes');
  await asked(page);
  await play(page, 'c7', 'c5');
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('1 move, 1 right first time');

  // The pin comes due 30 minutes after it was made, and its drill is recorded.
  await page.clock.fastForward('00:31:00');
  await page.goto(`${site.url}#/`);
  await page.getByRole('link', { name: 'Drill pinned (1)' }).click();
  await expect(page.locator('.study-title')).toHaveText('Drill pinned');
  await asked(page);
  await play(page, 'c7', 'c5');
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('1 move, 1 right first time');

  await page.locator('.chip').click();
  await expect.poll(() => pushed(git).map((e) => e['k'])).toEqual(['review', 'pin', 'drill']);
  expect(pushed(git)[2]).toMatchObject({ card: C5, ok: true });
  await page.goto(`${site.url}#/mistakes`);
  await expect(page.getByRole('region', { name: 'Pinned' }).locator('li')).toContainText('1 of 3 clean');
});

test('show and grade: a session run with 2 and 4 only, its review events checked', async ({ page }) => {
  const git = await setUp(page);
  await expect(page.locator('.train-card h2')).toHaveText('Train: 1 due · 3 new');
  await page.getByRole('link', { name: 'Show and grade' }).click();
  await expect(page).toHaveURL(/#\/show$/);
  await expect(page.locator('.study-title')).toHaveText('Show and grade');

  // 1. e4 is played for the user; 1... c5 is due. 4 shows it and marks it missed, the next press
  // grades it Again and plays on. The board never takes a move.
  await asked(page);
  await page.keyboard.press('4');
  await expect(feedback(page)).toHaveText('Play c5');
  await expect(page.getByRole('button', { name: 'Knew it (2)' })).toBeVisible();
  await page.keyboard.press('2');
  await expect(feedback(page)).toHaveText('That’s the move: it comes back soon');

  // The new moves are shown and learned by two presses each, with no grade.
  for (const expected of ['New move: play cxd4', 'New move: play Nc6', 'New move: play Nf6']) {
    await expect(feedback(page)).toHaveText(expected);
    await page.keyboard.press('2');
    await page.keyboard.press('2');
  }
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('1 move reviewed, 0 right first time · 3 new');

  await page.locator('.chip').click();
  await expect.poll(() => pushed(git).length).toBe(4);
  const events = pushed(git);
  expect(events.map((e) => [e['k'], e['card']])).toEqual([
    ['review', C5],
    ['taught', CXD4],
    ['taught', NC6],
    ['taught', NF6],
  ]);
  expect(events[0]).toMatchObject({ g: 1 });
  expect(events[0]!['w']).toBeUndefined();
});
