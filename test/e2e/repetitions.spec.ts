// Repetitions and mistakes asked again (PLAN.md §5.77, the owner's requests of 2026-10-08), on a
// desktop viewport and an emulated phone, with the fixture repertoire of train.spec.ts (a Black
// Sicilian: 1... c5 due, 3... cxd4 new) and the settings at their defaults: a line learned is
// walked twice, a mistake is asked again at its line's end until right twice in a row, and a
// move missed in a drill comes back until it is right.
import { test, expect, type Page } from '@playwright/test';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

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

async function setUp(page: Page): Promise<FakeGit> {
  const { git, github } = world();
  await page.clock.install({ time: DAY });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return git;
}

const phase = (page: Page) => page.locator('.train-grid');
const asked = (page: Page) => expect(phase(page)).toHaveAttribute('data-phase', 'ask');
const feedback = (page: Page) => page.locator('.train-feedback');
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

test('a mistake is asked again at the line\'s end until right twice in a row; a new line is walked twice; each graded or taught once', async ({ page }) => {
  const git = await setUp(page);
  // The defaults, in the training settings.
  await page.locator('.train-card').getByRole('button', { name: 'Training settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Training settings' });
  await expect(dialog.locator('input[name="repetitions"]')).toHaveValue('2');
  await expect(dialog.locator('input[name="mistake-retries"]')).toHaveValue('2');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await page.locator('.train-card').getByRole('link', { name: 'Train' }).click();
  // 1... c5 is due: a wrong move first, then c5.
  await asked(page);
  await play(page, 'e7', 'e5');
  await expect(feedback(page)).toHaveText('Not in your repertoire: try again');
  await play(page, 'c7', 'c5');
  // At the line's end the mistake comes back: 1. e4 played again, c5 asked.
  await expect(feedback(page)).toHaveText('Your mistake again: each right 2 times in a row');
  await asked(page);
  await expect(feedback(page)).toHaveText('Your mistake again: 0 of 2 right in a row');
  await expect(page.locator('.train-line')).toContainText('1. e4');
  await expect(page.locator('.train-counters')).toContainText('mistakes left 1');
  // A miss in the retry starts its streak again.
  await play(page, 'g8', 'f6');
  await expect(feedback(page)).toHaveText('Not in your repertoire: try again');
  await play(page, 'c7', 'c5');
  await asked(page);
  await expect(feedback(page)).toHaveText('Your mistake again: 0 of 2 right in a row');
  await play(page, 'c7', 'c5');
  await asked(page);
  await expect(feedback(page)).toHaveText('Your mistake again: 1 of 2 right in a row');
  await play(page, 'c7', 'c5');
  // Done: the line's end, waiting for "Next line".
  await expect(feedback(page)).toHaveText(/^Line done · Next: /);
  await expect(page.locator('.train-counters')).not.toContainText('mistakes left');
  await page.getByRole('button', { name: 'Next line' }).click();

  // The new line: cxd4 taught, then the line again with cxd4 asked (no arrow, no name).
  await expect(feedback(page)).toHaveText('New move: play cxd4');
  await play(page, 'c5', 'd4');
  await expect(feedback(page)).toHaveText('The line again: 2 of 2');
  await asked(page);
  await expect(page.locator('.train-counters')).toContainText('2 of 2 times');
  await expect(page.locator('.train-line')).toContainText('1. e4 c5 2. Nf3 d6 3. d4');
  await expect(page.locator('cg-container svg.cg-shapes line')).toHaveCount(0);
  await play(page, 'c5', 'd4');
  await expect(feedback(page)).toHaveText(/^Line done · Next: /);

  // One review and one taught event: what was asked again recorded nothing.
  await page.locator('.chip').click();
  await expect.poll(() => pushed(git).length).toBe(2);
  expect(pushed(git).map((e) => [e['k'], e['card']])).toEqual([
    ['review', C5],
    ['taught', CXD4],
  ]);
  expect(pushed(git)[0]).toMatchObject({ g: 1, w: ['e7e5'] });
});

test('a drill: a move missed again comes back until it is right; Repetitions 1 walks a line once', async ({ page }) => {
  await setUp(page);
  await page.goto(`${site.url}#/train`);
  await asked(page);
  await play(page, 'e7', 'e5');
  await play(page, 'c7', 'c5');
  await expect(feedback(page)).toHaveText('Your mistake again: each right 2 times in a row');
  await page.getByRole('button', { name: 'Stop' }).click();

  await page.goto(`${site.url}#/mistakes/drill`);
  await expect(page.locator('.study-title')).toHaveText('Drill mistakes');
  await asked(page);
  await play(page, 'e7', 'e5');
  await expect(feedback(page)).toHaveText('Not in your repertoire: try again');
  await play(page, 'c7', 'c5');
  // Missed: asked once more.
  await asked(page);
  await expect(feedback(page)).toHaveText('Missed earlier: once more');
  await expect(page.locator('.train-counters')).toContainText('2 of 2');
  await play(page, 'c7', 'c5');
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('1 move, 0 right first time');

  // Repetitions 1 and no retries: a mistake isn't asked again, the new line is walked once.
  await page.goto(`${site.url}#/train`);
  await page.getByRole('button', { name: 'Training settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Training settings' });
  await dialog.locator('input[name="repetitions"]').fill('0');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Repetitions: a whole number from 1 to 5.');
  await dialog.locator('input[name="repetitions"]').fill('1');
  await dialog.locator('input[name="mistake-retries"]').fill('0');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  expect(JSON.parse((await page.evaluate(() => localStorage.getItem('repworks.trainPrefs')))!)).toMatchObject({ repetitions: 1, mistakeRetries: 0 });
  // The line picked starts played from its start, up to the new move.
  await page.goto(`${site.url}#/train/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3,d6,d4,cxd4`);
  await expect(feedback(page)).toHaveText('New move: play cxd4');
  await play(page, 'c5', 'd4');
  await expect(page.getByRole('region', { name: 'Session done' })).toBeVisible();
  await expect(page.locator('.train-counters')).not.toContainText('times');
});
