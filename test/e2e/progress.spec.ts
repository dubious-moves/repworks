// The progress page (PLAN.md §5.122), on a desktop viewport and an emulated phone, against the
// fixture repertoire (a Black Sicilian: 1... c5 answered on 2026-09-30 and 2026-10-05, 2... d6
// suspended) with two misses of 1... c5 added (2... e5 tried), on 2026-10-06 and 10-07. Opened
// from the training card: the recall, the moves, the forecast, the time, the chapters, the move
// missed twice pinned and opened in its chapter.
import { test, expect } from '@playwright/test';
import { FakeGit } from '../support/fakeGit.ts';
import { FakeGithub } from '../support/fakeGithub.ts';
import { fixtureFiles, REPO, TOKEN } from '../support/syncWorld.ts';
import { serveGithub } from './github.ts';
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

test('progress: recall against the scheduler, the moves, the days ahead and behind, the chapters, a move missed twice', async ({ page }) => {
  const files = fixtureFiles();
  const path = 'progress/Desktop1/2026-10-05.jsonl';
  files.set(path, files.get(path)! + miss(9, '2026-10-06T10:00:00.000Z') + miss(10, '2026-10-07T10:00:00.000Z'));
  const git = new FakeGit(files);
  await page.clock.install({ time: new Date('2026-10-08T12:00:00Z') });
  await serveGithub(page, new FakeGithub(git, { repo: REPO, branch: 'main', token: TOKEN }));
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);

  await page.locator('.train-card').getByRole('link', { name: 'Progress' }).click();
  await expect(page).toHaveURL(/#\/progress$/);

  // c5's first answer counts apart; its three later ones: one right, two missed.
  const recall = page.getByTestId('progress-recall');
  await expect(recall.locator('.stat').first()).toHaveText('33%right of 3 reviews');
  await expect(recall).toContainText("right at a move's first review (1)");
  await expect(recall).toContainText('Too few reviews yet to judge the scheduler');
  await recall.getByText(/By predicted recall, all time \(3 reviews\)/).click();
  await expect(recall.locator('tbody tr')).not.toHaveCount(0);

  // The fixture's five moves: c5 reviewed (young), d6 suspended, three never started.
  const moves = page.getByTestId('progress-moves');
  await expect(moves.locator('h2')).toHaveText('Moves: 5');
  await expect(moves).toContainText('1young');
  await expect(moves).toContainText('3not started');
  await expect(moves).toContainText('Left out: 1 suspended');

  // c5, missed yesterday, comes back within the fortnight.
  await expect(page.getByTestId('progress-forecast').locator('h2')).toHaveText(/^Reviews ahead: [1-9]\d* in 14 days$/);
  await expect(page.getByTestId('progress-forecast').locator('.bar')).toHaveCount(14);
  // Single answers, days apart: no minutes.
  await expect(page.getByTestId('progress-minutes').locator('h2')).toHaveText(/^Last 14 days: 0 min on \d days$/);
  await expect(page.getByTestId('progress-minutes')).toContainText('4 reviews and 0 new moves');

  // Both chapters play 1... c5: the same recall, so in the study's order.
  const rows = page.getByTestId('progress-chapters').locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator('td')).toHaveText(['Test repertoire: Main line', /^\d+%$/, '2 of 4', '1 of 4']);
  await expect(rows.nth(1).locator('td')).toHaveText(['Test repertoire: Alapin', /^\d+%$/, '2 of 4', '1 of 2']);

  const missed = page.getByTestId('progress-missed');
  await expect(missed.locator('h2')).toHaveText('Missed again and again: 1');
  await expect(missed.locator('li')).toContainText('missed 2 of 4 · your move c5 · last tried e5');
  await missed.getByRole('button', { name: 'Pin' }).click();
  await expect(missed.getByRole('button', { name: 'Unpin' })).toHaveAttribute('aria-pressed', 'true');
  await missed.getByRole('link', { name: 'Study' }).click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch1Najdf\?at=e4,c5$/);
});
