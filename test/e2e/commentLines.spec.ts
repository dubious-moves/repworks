// Lines from the comments quizzed in review (PLAN.md §5.98), on a desktop viewport and an emulated
// phone, with the fixture repertoire (a Black Sicilian, 1... c5 due on the day) and two lines
// written in its comments: an important one on 1. e4, offered from the walk's start, and one on
// 2. Nf3, met where the line ends. The chip in the counters' row and its small boards; a comment
// shown after a wrong move leaving the line out; at the line's end, "Quiz lines" playing both on
// the board (or "Next line" going on), a wrong move taken back, nothing recorded for them; "Quiz
// now" on the chip playing one mid-walk, the move asked waiting after it; the setting turning
// them off.
import { test, expect, type Page } from '@playwright/test';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';
import { walkOnce } from './prefs.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

const DAY = new Date('2026-12-01T10:00:00Z');
const C5 = 'r|rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -|c7c5';
const CH1 = 'studies/Rep0Najd/Ch1Najdf.pgn';

async function setUp(page: Page): Promise<FakeGit> {
  const { git, github } = world();
  const text = git
    .textsOf()
    .get(CH1)!
    .replace('1. e4 c5', '1. e4 { Or (1. d4! Nf6 2. c4 e6), a line of its own. } 1... c5')
    .replace('{ A made-up comment }', '{ A made-up comment. White can also play (2. c3 Nf6 3. e5 Nd5) }');
  git.commitIfHead(git.head, 'Lines in the comments', new Map([[CH1, text]]), []);
  await page.clock.install({ time: DAY });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return git;
}

const feedback = (page: Page) => page.locator('.train-feedback');
const phase = (page: Page) => page.locator('.train-grid');
const chip = (page: Page) => page.locator('.comment-offer-chip');
async function play(page: Page, from: string, to: string) {
  await clickSquare(page, from, 'black');
  await clickSquare(page, to, 'black');
}

function pushed(git: FakeGit): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const [path, text] of git.textsOf()) {
    if (!path.startsWith('progress/') || path.startsWith('progress/Desktop1/') || path.startsWith('progress/Phone001/')) continue;
    for (const line of text.split('\n')) if (line) out.push(JSON.parse(line) as Record<string, unknown>);
  }
  return out.sort((a, b) => (a['n'] as number) - (b['n'] as number));
}

test('comment lines: offered in the counters\' row, left out of a comment shown, quizzed on the board at the line\'s end, nothing recorded', async ({ page }) => {
  await walkOnce(page);
  const git = await setUp(page);
  await page.goto(`${site.url}#/train`);
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');

  // 1... c5 asked: the line on 1. e4 (an alternative to it, from the start) is offered already.
  await expect(chip(page)).toHaveClass(/important/);
  await expect(chip(page)).toContainText('1');
  await chip(page).click();
  const card = page.getByRole('group', { name: 'Lines from the comments' });
  await expect(card.locator('.mini-board')).toHaveCount(1);
  await expect(card).toContainText('Important');
  await expect(card).toContainText('1. d4!');
  await expect(card.locator('.mini-board cg-board piece')).toHaveCount(32);
  await expect(card.getByRole('checkbox', { name: 'At the end' })).toBeChecked();
  await expect(card.getByRole('button', { name: 'Quiz now' })).toBeEnabled();
  // Pressed again, and the pointer away: it goes.
  await chip(page).click();
  await page.mouse.move(0, 0);
  await expect(card).toHaveCount(0);

  // A wrong move shows the comments of 1. e4: the line to be quizzed is left out of them.
  await play(page, 'e7', 'e5');
  await expect(feedback(page)).toHaveText('Not in your repertoire: try again');
  await expect(page.locator('.train-comments')).toContainText('Or (…), a line of its own.');
  await expect(page.locator('.train-comments')).not.toContainText('d4');
  await play(page, 'c7', 'c5');

  // The line's end: the second line, on 2. Nf3, is met there; it waits for "Next line" or "Quiz lines".
  await expect(chip(page)).toContainText('2');
  await expect(feedback(page)).toHaveText(/^Line done · Next: /);
  await expect(page.getByRole('button', { name: 'Next line' })).toBeVisible();
  await page.getByRole('button', { name: 'Quiz lines (2)' }).click();
  await expect(feedback(page)).toHaveText('Important line from the comments · 1 of 2');
  await expect(page.locator('.train-line')).toContainText('(…)');
  // The board goes back to the start, then 1. d4 is played; 1... Nf6 is asked.
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await expect(page.locator('.train-line')).toContainText('(1. d4)');
  await play(page, 'e7', 'e5');
  await expect(feedback(page)).toHaveText('Not the comment’s move: try again');
  await play(page, 'g8', 'f6');
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await expect(page.locator('.train-line')).toContainText('(1. d4 Nf6 2. c4)');
  await play(page, 'e7', 'e6');

  await expect(feedback(page)).toHaveText('Line from the comments · 2 of 2');
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await expect(page.locator('.train-line')).toContainText('(2. c3)');
  await play(page, 'g8', 'f6');
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await play(page, 'f6', 'd5');

  // Back at the line's end: nothing left to quiz.
  await expect(feedback(page)).toHaveText(/^Line done · Next: /);
  await expect(page.getByRole('button', { name: /^Quiz lines/ })).toHaveCount(0);
  await expect(page.locator('.train-line')).toHaveText(/Main line\s*1\. e4 c5$/);
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('2 lines from the comments, 3 of 4 moves found first time');
  // Only 1... c5's review reaches the data repo, with the next sync.
  await page.locator('.chip').click();
  await expect.poll(() => pushed(git).map((e) => e['k'])).toEqual(['review']);
  expect(pushed(git)[0]).toMatchObject({ card: C5, g: 1 });
});

test('comment lines: "Quiz now" mid-walk, the move asked waiting after it; "Next line" leaves the rest', async ({ page }) => {
  await walkOnce(page);
  await setUp(page);
  await page.goto(`${site.url}#/train`);
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  // 1... c5 asked: the line on 1. e4 quizzed now, from the chip.
  await chip(page).click();
  await page.getByRole('group', { name: 'Lines from the comments' }).getByRole('button', { name: 'Quiz now' }).click();
  await expect(page.getByRole('group', { name: 'Lines from the comments' })).toHaveCount(0);
  await expect(feedback(page)).toHaveText('Important line from the comments');
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await expect(page.locator('.train-line')).toContainText('(1. d4)');
  await play(page, 'g8', 'f6');
  await expect(page.locator('.train-line')).toContainText('(1. d4 Nf6 2. c4)');
  await play(page, 'e7', 'e6');
  // Back at 1... c5, asked again; the line is quizzed, so its comment shows it.
  await expect(page.locator('.train-line')).not.toContainText('(');
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await expect(feedback(page)).toHaveText('');
  await play(page, 'e7', 'e5');
  await expect(page.locator('.train-comments')).toContainText('1. d4! Nf6 2. c4 e6');
  await chip(page).click();
  await expect(page.getByRole('group', { name: 'Lines from the comments' }).getByRole('button', { name: 'Quiz again' })).toBeVisible();
  await page.locator('.train-board').click({ position: { x: 5, y: 5 } });
  await page.mouse.move(0, 0);
  await play(page, 'c7', 'c5');
  // The line's end: only 2. c3 left for "Quiz lines"; "Next line" goes on without it.
  await expect(page.getByRole('button', { name: 'Quiz lines (1)' })).toBeVisible();
  await page.getByRole('button', { name: 'Next line' }).click();
  await expect(page.getByRole('button', { name: /^Quiz lines/ })).toHaveCount(0);
  await expect(page.locator('.train-aside-moves')).toHaveCount(0);
});

test('comment lines: picked off from the chip, Skip, and the setting', async ({ page }) => {
  await walkOnce(page);
  await setUp(page);
  await page.goto(`${site.url}#/train`);
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  // Picked off from the chip: only the line met at the end is quizzed.
  await chip(page).click();
  await page.getByRole('group', { name: 'Lines from the comments' }).getByRole('checkbox', { name: 'At the end' }).uncheck();
  await expect(chip(page)).toContainText('0/1');
  // A press on the board closes it.
  await page.locator('.train-board').click({ position: { x: 5, y: 5 } });
  await page.mouse.move(0, 0);
  await expect(page.getByRole('group', { name: 'Lines from the comments' })).toHaveCount(0);
  await play(page, 'c7', 'c5');
  await page.getByRole('button', { name: 'Quiz lines (1)' }).click();
  await expect(feedback(page)).toHaveText('Line from the comments');
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await page.getByRole('button', { name: 'Skip this line' }).click();
  await expect(feedback(page)).toHaveText(/^Line done · Next: /);

  // The setting, in the training settings: off, kept on this device.
  await page.getByRole('button', { name: 'Training settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Training settings' });
  await expect(dialog.locator('select[name="comment-lines"]')).toHaveValue('all');
  await dialog.locator('select[name="comment-lines"]').selectOption('off');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('repworks.trainPrefs')))!)).toMatchObject({ comments: 'off' });
});

test('comment lines: off, nothing offered and nothing quizzed', async ({ page }) => {
  await walkOnce(page, { comments: 'off' });
  await setUp(page);
  await page.goto(`${site.url}#/train`);
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await expect(chip(page)).toHaveCount(0);
  await play(page, 'c7', 'c5');
  await expect(feedback(page)).toHaveText(/^Line done · Next: /);
  await expect(chip(page)).toHaveCount(0);
});
