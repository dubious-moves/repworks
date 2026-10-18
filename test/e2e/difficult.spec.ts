// Difficult lines (PLAN.md §5.124), on a desktop viewport and an emulated phone, against the
// fixture repertoire (a Black Sicilian: 1... c5 answered on 2026-09-30 and 2026-10-05) with two
// misses of 1... c5 added, on 2026-10-06 and 10-07, which make it difficult. Opened from the
// training card: c5 asked and, due, graded; asked again by "Again", now not due: practice, with no
// event.
import { test, expect, type Page } from '@playwright/test';
import { FakeGit } from '../support/fakeGit.ts';
import { FakeGithub } from '../support/fakeGithub.ts';
import { fixtureFiles, REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { serveGithub } from './github.ts';
import { walkOnce } from './prefs.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

const C5 = 'r|rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -|c7c5';
const miss = (n: number, t: string) => `{"v":1,"n":${n},"t":"${t}","k":"review","card":"${C5}","g":1,"w":["e7e5"]}\n`;
const asked = (page: Page) => expect(page.locator('.train-grid')).toHaveAttribute('data-phase', 'ask');

/** The review events this device wrote, from the fake repo. */
function reviews(git: FakeGit): unknown[] {
  const out: unknown[] = [];
  for (const [path, text] of git.textsOf()) {
    if (!path.startsWith('progress/') || path.startsWith('progress/Desktop1/') || path.startsWith('progress/Phone001/')) continue;
    for (const line of text.split('\n')) if (line && (JSON.parse(line) as { k: string }).k === 'review') out.push(JSON.parse(line));
  }
  return out;
}

test('difficult lines: the difficult move asked, graded while due, practice once it is not', async ({ page }) => {
  await walkOnce(page);
  const files = fixtureFiles();
  const path = 'progress/Desktop1/2026-10-05.jsonl';
  files.set(path, files.get(path)! + miss(9, '2026-10-06T10:00:00.000Z') + miss(10, '2026-10-07T10:00:00.000Z'));
  const git = new FakeGit(files);
  await page.clock.install({ time: new Date('2026-10-08T12:00:00Z') });
  await serveGithub(page, new FakeGithub(git, { repo: REPO, branch: 'main', token: TOKEN }));
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);

  // Both chapters play 1... c5: one line each, the move asked in the first.
  await page.locator('.train-card').getByRole('link', { name: 'Difficult lines (1)' }).click();
  await expect(page).toHaveURL(/#\/difficult$/);
  await expect(page.locator('.study-title')).toHaveText('Difficult lines');
  await asked(page);
  await clickSquare(page, 'c7', 'black');
  await clickSquare(page, 'c5', 'black');
  const done = page.getByRole('region', { name: 'Session done' });
  await expect(done).toContainText('1 line · 1 move asked, 1 right first time · 1 due graded, the rest practice');
  await page.locator('.chip').click();
  await expect.poll(() => reviews(git).length).toBe(1);
  expect(reviews(git)[0]).toMatchObject({ card: C5, g: 3 });

  // Again: c5, answered right, isn't due now. Asked, missed, and nothing recorded.
  await done.getByRole('button', { name: 'Again' }).click();
  await asked(page);
  await clickSquare(page, 'e7', 'black');
  await clickSquare(page, 'e5', 'black');
  await clickSquare(page, 'c7', 'black');
  await clickSquare(page, 'c5', 'black');
  await expect(done).toContainText('1 line · 1 move asked, 0 right first time · 0 due graded, the rest practice');
  await page.locator('.chip').click();
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  expect(reviews(git)).toHaveLength(1);
});
