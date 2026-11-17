// "Again" at a line's end (PLAN.md §5.199), on a desktop viewport and an emulated phone, with the
// fixture repertoire of train.spec.ts (a Black Sicilian: 1... c5 due, 2... d6 suspended, three new
// moves). At a line's end held for "Next line", and at the session's end, "Again" walks the line
// once more from the chapter's start, every move asked but a suspended one, nothing graded or
// taught, then comes back to the line's end as it was.
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
const NC6 = 'r|rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -|b8c6';
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
const again = (page: Page) => page.getByRole('button', { name: 'Again', exact: true });
async function play(page: Page, from: string, to: string) {
  await clickSquare(page, from, 'black');
  await clickSquare(page, to, 'black');
}

function pushed(git: FakeGit): [unknown, unknown][] {
  const out: Record<string, unknown>[] = [];
  for (const [path, text] of git.textsOf()) {
    if (!path.startsWith('progress/') || path.startsWith('progress/Desktop1/') || path.startsWith('progress/Phone001/')) continue;
    for (const line of text.split('\n')) if (line) out.push(JSON.parse(line) as Record<string, unknown>);
  }
  return out.sort((a, b) => (a['n'] as number) - (b['n'] as number)).map((e) => [e['k'], e['card']]);
}

test('Again at a held line end walks the line from its start, nothing graded or taught, and waits there again', async ({ page }) => {
  await walkOnce(page, { autoPlayLearn: 'due' });
  const git = await setUp(page);
  await page.goto(`${site.url}#/learn/Rep0Najd/Ch1Najdf`);
  await expect(feedback(page)).toHaveText('New move: play cxd4');
  await play(page, 'c5', 'd4');
  await expect(feedback(page)).toHaveText('Line done · Next: Line 2');
  await again(page).click();
  // From the chapter's start: 1... c5 asked (reviewed, not due), 2... d6 played (suspended), 3... cxd4 asked.
  await expect(feedback(page)).toHaveText('The line again: nothing graded');
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await expect(page.locator('.train-line')).toContainText('1. e4');
  await play(page, 'c7', 'c5');
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await expect(page.locator('.train-line')).toContainText('3. d4');
  await play(page, 'c5', 'd4');
  // Back at the line's end, as it was.
  await expect(feedback(page)).toHaveText('Line done · Next: Line 2');
  await expect(again(page)).toBeVisible();
  await page.getByRole('button', { name: 'Next line' }).click();
  await expect(feedback(page)).toHaveText('New move: play Nc6');
  await play(page, 'b8', 'c6');
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('2 lines');
  await page.locator('.chip').click();
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  // Only the two moves taught: nothing from the walk again.
  await expect.poll(() => pushed(git)).toEqual([
    ['taught', CXD4],
    ['taught', NC6],
  ]);
});

test('Again at the session’s end walks its last line once more, nothing graded; "Train again" starts afresh', async ({ page }) => {
  await walkOnce(page);
  const git = await setUp(page);
  await page.goto(`${site.url}#/train/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3,Nc6,d4`);
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await play(page, 'c7', 'c5');
  await expect(feedback(page)).toHaveText('New move: play Nc6');
  await play(page, 'b8', 'c6');
  const done = page.getByRole('region', { name: 'Session done' });
  await expect(done).toContainText('Line done');
  await expect(done.getByRole('button', { name: 'Train again' })).toBeVisible();
  await done.getByRole('button', { name: 'Again', exact: true }).click();
  await expect(done).toHaveCount(0);
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  // A wrong move is taken back, as ever: still nothing recorded.
  await play(page, 'e7', 'e5');
  await expect(feedback(page)).toHaveText('Not in your repertoire: try again');
  await play(page, 'c7', 'c5');
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await play(page, 'b8', 'c6');
  await expect(done).toContainText('Line done');
  await page.locator('.chip').click();
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await expect.poll(() => pushed(git)).toEqual([
    ['review', C5],
    ['taught', NC6],
  ]);
});
