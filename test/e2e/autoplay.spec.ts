// The owner's second testing notes on training (PLAN.md §5.17), on a desktop viewport and an
// emulated phone, with the fixture repertoire of train.spec.ts (a Black Sicilian: 1... c5 due,
// 2... d6 suspended, three new moves). A picked line's end keeps the board and, set to go on,
// moves to the next line by itself, which starts auto-played from the chapter's start; the
// feedback line never says "Your move" or "Correct"; a new move tried first; time travel bringing
// a move just taught due, its review recorded at the real time, and "Back to now".
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
const CXD4 = 'r|rnbqkbnr/pp2pppp/3p4/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq -|c5d4';

async function setUp(page: Page): Promise<FakeGit> {
  const { git, github } = world();
  await page.clock.install({ time: DAY });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return git;
}

const feedback = (page: Page) => page.locator('.train-feedback');
const phase = (page: Page) => page.locator('.train-grid');
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

/** Opens the training settings from the home card, applies `change`, and saves. */
async function trainingSettings(page: Page, change: (dialog: ReturnType<Page['getByRole']>) => Promise<unknown>) {
  await page.locator('.train-card').getByRole('button', { name: 'Training settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Training settings' });
  await change(dialog);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
}

/** Records every text the feedback line and the line's moves show, from now on. */
async function watch(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { seen: { feedback: string[]; moves: string[] } };
    w.seen = { feedback: [], moves: [] };
    const note = () => {
      const f = document.querySelector('.train-feedback')?.textContent ?? '';
      const m = document.querySelector('.train-line .muted')?.textContent ?? '';
      if (w.seen.feedback.at(-1) !== f) w.seen.feedback.push(f);
      if (w.seen.moves.at(-1) !== m) w.seen.moves.push(m);
    };
    new MutationObserver(note).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
}
const seen = (page: Page) => page.evaluate(() => (window as unknown as { seen: { feedback: string[]; moves: string[] } }).seen);

test('a picked line ends with the board kept and goes on to the next line, which starts auto-played; the feedback stays quiet', async ({ page }) => {
  await walkOnce(page);
  await setUp(page);
  await trainingSettings(page, (d) => d.getByLabel('At a line\'s end').selectOption('go'));
  await page.goto(`${site.url}#/train/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3,d6,d4,cxd4`);
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await watch(page);

  // 1... c5 is due: asked after 1. e4. Then 2... d6 (suspended) is played and 3... cxd4 taught.
  await play(page, 'c7', 'c5');
  await expect(feedback(page)).toHaveText('New move: play cxd4');
  await expect(page.locator('cg-container svg.cg-shapes line')).toHaveCount(1);
  await play(page, 'c5', 'd4');

  // The line's end: the board stays on its last position, the numbers and the buttons under it.
  const done = page.getByRole('region', { name: 'Session done' });
  await expect(done).toContainText('Line done');
  await expect(page.locator('cg-board')).toBeVisible();
  await expect(page.locator('.train-line')).toContainText('3. d4 cxd4');
  await expect(phase(page)).toHaveAttribute('data-phase', 'done');
  await expect(done.getByRole('status')).toContainText('Next: Line 2');

  // …and the next line of the list opens by itself, played from the chapter's start up to its new
  // move: 1... c5, answered today, is played for the user.
  await expect(page).toHaveURL(/#\/train\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3,Nc6,d4$/);
  await watch(page);
  await expect(feedback(page)).toHaveText('New move: play Nc6');
  expect((await seen(page)).moves).toContain('1. e4');
  await play(page, 'b8', 'c6');
  await expect(done).toContainText('Line done');
  await expect(done.getByRole('status')).toContainText('Next: Line 1 · Alapin');

  // Escape stays on this line's end.
  await page.keyboard.press('Escape');
  await expect(done.getByRole('status')).toHaveCount(0);
  await page.waitForTimeout(3000);
  await expect(page).toHaveURL(/at=e4,c5,Nf3,Nc6,d4$/);
  const texts = (await seen(page)).feedback;
  expect(texts).not.toContain('Your move');
  expect(texts).not.toContain('Correct');
});

test('time travel: a new move tried first, then due at +4 hours, its review recorded at the real time; back to now', async ({ page }) => {
  await walkOnce(page);
  const git = await setUp(page);
  await trainingSettings(page, (d) => d.locator('select[name="new-moves"]').selectOption('try'));
  await page.goto(`${site.url}#/train/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3,d6,d4,cxd4`);
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await play(page, 'c7', 'c5');
  // Tried first: no name, no arrow; found, it says so.
  await expect(feedback(page)).toHaveText('New move: find it');
  await expect(page.locator('cg-container svg.cg-shapes line')).toHaveCount(0);
  await play(page, 'c5', 'd4');
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('1 new');

  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.locator('.train-card h2')).toHaveText('Train: 0 due · 2 new');
  await trainingSettings(page, (d) => d.locator('select[name="time"]').selectOption('4'));
  const banner = page.locator('.banner-time');
  await expect(banner).toContainText('Time +4 hours');
  await expect(page.locator('.train-card h2')).toHaveText('Train: 1 due · 2 new');

  // The move taught is asked: the line starts at it, after 3. d4.
  await page.locator('.train-card').getByRole('link', { name: 'Train' }).click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await expect(page.locator('.train-line')).toContainText('1. e4 c5 2. Nf3 d6 3. d4');
  await play(page, 'c5', 'd4');
  await expect(feedback(page)).toHaveText(/^$|New move|^Line done/);
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.locator('.chip').click();
  await expect.poll(() => pushed(git).filter((e) => e['k'] === 'review' && e['card'] === CXD4).length).toBe(1);
  const review = pushed(git).find((e) => e['k'] === 'review' && e['card'] === CXD4)!;
  expect(review['g']).toBe(3);
  const at = Date.parse(review['t'] as string);
  expect(at - DAY.getTime()).toBeLessThan(3_600_000);

  await banner.getByRole('button', { name: 'Back to now' }).click();
  await expect(banner).toHaveCount(0);
  await page.getByRole('button', { name: 'Home' }).click();
  await expect(page.locator('.train-card h2')).toHaveText('Train: 0 due · 2 new');
});

test('Learn waits at each line\'s end with the board kept, and "Next line" goes on', async ({ page }) => {
  await walkOnce(page);
  await setUp(page);
  await page.goto(`${site.url}#/learn/Rep0Najd/Ch1Najdf`);
  // Learn teaches: the moves up to the first new one are played from the chapter's start.
  await expect(feedback(page)).toHaveText('New move: play cxd4');
  await expect(page.locator('.train-line')).toContainText('1. e4 c5 2. Nf3 d6 3. d4');
  await play(page, 'c5', 'd4');
  await expect(feedback(page)).toHaveText('Line done · Next: Line 2');
  await expect(phase(page)).toHaveAttribute('data-phase', 'lineDone');
  await page.waitForTimeout(3000);
  await expect(feedback(page)).toHaveText('Line done · Next: Line 2');
  await page.getByRole('button', { name: 'Next line' }).click();
  // From the chapter's start again, up to the next new move.
  await expect(feedback(page)).toHaveText('New move: play Nc6');
  await expect(page.locator('.train-line')).toContainText('1. e4 c5 2. Nf3');
  await play(page, 'b8', 'c6');
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('2 lines');
  await expect(page.locator('cg-board')).toBeVisible();
});
