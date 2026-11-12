// The progress page (PLAN.md §5.122), on a desktop viewport and an emulated phone, against the
// fixture repertoire (a Black Sicilian: 1... c5 answered on 2026-09-30 and 2026-10-05, 2... d6
// suspended) with two misses of 1... c5 added (2... e5 tried), on 2026-10-06 and 10-07. Opened
// from the training card: the recall, the moves, the forecast, the time, the chapters, the move
// missed twice pinned and opened in its chapter.
//
// The days trained (PLAN.md §5.167): the runs of days in a row, the calendar of 26 weeks and its
// shades, a day told by a tap, the columns inside a 360px phone, and a day's local midnight.
// Controls run (2026-11-11), each failing the test named:
// - the four opacities declared on the calendar's grid, not its card (as first built): "the days
//   trained" fails at the legend, whose squares outside the grid had no colour;
// - the calendar's squares at a fixed 12px (`repeat(26, 12px)`, the plan's first figure): "the
//   days trained" fails at 360px, the last column past the card's edge;
// - the days as UTC's (`localDays` from `Date.UTC`): "a day ends at the device's midnight" fails,
//   both answers on the 6th.
import { test, expect, type Page } from '@playwright/test';
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
  // Each day under its weekday (§5.158): the clock's 2026-10-08 is a Thursday.
  await expect(page.getByTestId('progress-forecast').locator('.bar-day').first()).toHaveText('T8');
  // Single answers, days apart: no minutes, said in a line instead of empty bars (§5.158).
  await expect(page.getByTestId('progress-minutes').locator('h2')).toHaveText(/^Last 14 days: 0 min on \d days$/);
  await expect(page.getByTestId('progress-minutes').locator('.bar')).toHaveCount(0);
  await expect(page.getByTestId('progress-minutes').getByTestId('bars-empty')).toHaveText('No minutes counted: the answers were more than five minutes apart.');
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

const answer = (n: number, t: string) => `{"v":1,"n":${n},"t":"${t}","k":"review","card":"${C5}","g":3}\n`;

async function openProgress(page: Page, extra: string, now: string): Promise<void> {
  const files = fixtureFiles();
  const path = 'progress/Desktop1/2026-10-05.jsonl';
  files.set(path, files.get(path)! + extra);
  await page.clock.install({ time: new Date(now) });
  await serveGithub(page, new FakeGithub(new FakeGit(files), { repo: REPO, branch: 'main', token: TOKEN }));
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await page.locator('.train-card').getByRole('link', { name: 'Progress' }).click();
  await expect(page.getByTestId('progress-days')).toBeVisible();
}

/** The page again at a later time: the clock set, the page left and come back to. */
async function laterOn(page: Page, now: string): Promise<void> {
  await page.clock.setSystemTime(new Date(now));
  await page.goBack();
  await page.locator('.train-card').getByRole('link', { name: 'Progress' }).click();
  await expect(page.getByTestId('progress-days')).toBeVisible();
}

const stats = (page: Page) => page.getByTestId('progress-days').locator('.stat');
const square = (page: Page, day: string) => page.locator(`.cal > .cal-day[title^="${day}:"]`);
const place = (page: Page, day: string) =>
  square(page, day).evaluate((el) => {
    const s = getComputedStyle(el);
    return [s.gridColumnStart, s.gridRowStart];
  });

test('the days trained: the run of days in a row, the longest, a calendar of 26 weeks shaded by the day’s answers, a day told by a tap', async ({ page }) => {
  // The fixture's answers on 30 September and 5 October; then two on the 6th (20 minutes apart),
  // three on the 7th (a minute apart) and one today, Thursday the 8th.
  const extra =
    answer(9, '2026-10-06T10:00:00.000Z') +
    answer(10, '2026-10-06T10:20:00.000Z') +
    answer(11, '2026-10-07T10:00:00.000Z') +
    answer(12, '2026-10-07T10:01:00.000Z') +
    answer(13, '2026-10-07T10:02:00.000Z') +
    answer(14, '2026-10-08T09:00:00.000Z');
  await openProgress(page, extra, '2026-10-08T12:00:00Z');
  const card = page.getByTestId('progress-days');

  await expect(card.locator('h2')).toHaveText('Last 26 weeks: 5 days trained');
  await expect(stats(page)).toHaveText(['4days in a row', '4days, the longest run', '5of the last 30 days']);
  // The fortnight's chart reads the same days' last 14.
  await expect(page.getByTestId('progress-minutes').locator('h2')).toHaveText('Last 14 days: 2 min on 5 days');
  await expect(page.getByTestId('progress-minutes').locator('.bar')).toHaveCount(14);

  // 25 whole weeks from a Monday, then Monday to today: Monday first, today the last square.
  const squares = card.locator('.cal > .cal-day');
  await expect(squares).toHaveCount(25 * 7 + 4);
  await expect(squares.first()).toHaveAttribute('title', 'Mon, Apr 13: no training');
  expect(await place(page, 'Mon, Apr 13')).toEqual(['2', '2']);
  expect(await place(page, 'Sun, Apr 19')).toEqual(['2', '8']);
  expect(await place(page, 'Mon, Apr 20')).toEqual(['3', '2']);
  await expect(squares.last()).toHaveAttribute('title', 'Thu, Oct 8: 1 answer, 0 new moves, 0 min');
  await expect(squares.last()).toHaveClass(/\btoday\b/);
  await expect(card.locator('.cal-day.today')).toHaveCount(1);
  expect(await place(page, 'Thu, Oct 8')).toEqual(['27', '5']);
  // The months over their first day's column. April's last weeks have no name: May's is two columns on.
  await expect(card.locator('.cal-month')).toHaveText(['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
  expect(await card.locator('.cal-month').first().evaluate((el) => getComputedStyle(el).gridColumnStart)).toBe('4');

  // The shades: the busiest day has three answers, so one, two and three answers are a third each.
  await expect(square(page, 'Wed, Oct 7')).toHaveClass(/\bs3\b/);
  await expect(square(page, 'Tue, Oct 6')).toHaveClass(/\bs2\b/);
  await expect(square(page, 'Mon, Oct 5')).toHaveClass(/\bs1\b/);
  await expect(square(page, 'Wed, Sep 30')).toHaveClass(/\bs1\b/);
  await expect(square(page, 'Sun, Oct 4')).toHaveClass(/\bs0\b/);
  await expect(card.locator('.cal > .cal-day:not(.s0)')).toHaveCount(5);
  // Four colours, in the calendar and in its legend, each its own.
  const colour = (selector: string) => card.locator(selector).first().evaluate((el) => getComputedStyle(el).backgroundColor);
  const shades = await Promise.all([0, 1, 2, 3].map((i) => colour(`.cal > .cal-day.s${i}`)));
  expect(new Set(shades).size).toBe(4);
  expect(shades).not.toContain('rgba(0, 0, 0, 0)');
  await expect(card.locator('.cal-key')).toHaveText([' none', ' 1', ' 2', ' 3']);
  expect(await Promise.all([0, 1, 2, 3].map((i) => colour(`.cal-key .cal-day.s${i}`)))).toEqual(shades);

  // Under the calendar: today, until a day is tapped.
  const told = page.getByTestId('cal-told');
  await expect(told).toHaveText('Thu, Oct 8: 1 answer, 0 new moves, 0 min');
  await square(page, 'Wed, Oct 7').click();
  await expect(told).toHaveText('Wed, Oct 7: 3 answers, 0 new moves, 2 min');
  await expect(square(page, 'Wed, Oct 7')).toHaveClass(/\bpicked\b/);
  await square(page, 'Sun, Oct 4').click();
  await expect(told).toHaveText('Sun, Oct 4: no training');

  // The 26 columns inside the card, and the page not scrolling sideways: here, and at 360px.
  const fits = async () => {
    const box = (await card.boundingBox())!;
    const last = (await squares.last().boundingBox())!;
    const first = (await squares.first().boundingBox())!;
    expect(last.x + last.width).toBeLessThanOrEqual(box.x + box.width - 12 + 0.5);
    expect(first.width).toBeGreaterThanOrEqual(8);
    expect(Math.abs(first.width - first.height)).toBeLessThan(0.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  };
  await fits();
  await page.setViewportSize({ width: 360, height: 740 });
  await fits();

  // The next day, nothing answered yet: the run still stands, said as yesterday's.
  await laterOn(page, '2026-10-09T12:00:00Z');
  await expect(stats(page)).toHaveText(['4days in a row up to yesterday', '4days, the longest run', '5of the last 30 days']);
  await expect(card.locator('.cal > .cal-day')).toHaveCount(25 * 7 + 5);
  await expect(card.locator('.cal-day.today')).toHaveAttribute('title', 'Fri, Oct 9: no training');
  // A day with nothing: the run is over, the longest kept.
  await laterOn(page, '2026-10-10T12:00:00Z');
  await expect(stats(page)).toHaveText(['0days in a row', '4days, the longest run', '5of the last 30 days']);
});

test.describe('on a device two hours ahead of UTC', () => {
  test.use({ timezoneId: 'Europe/Stockholm' });

  test('a day ends at the device’s midnight: answers a minute before and after it are two days’', async ({ page }) => {
    // 23:59 on Tuesday the 6th and 00:01 on Wednesday the 7th in Stockholm: both the 6th in UTC.
    await openProgress(page, answer(9, '2026-10-06T21:59:00.000Z') + answer(10, '2026-10-06T22:01:00.000Z'), '2026-10-08T12:00:00Z');
    await expect(square(page, 'Tue, Oct 6')).toHaveAttribute('title', 'Tue, Oct 6: 1 answer, 0 new moves, 0 min');
    // The two minutes across midnight are counted on the later answer's day.
    await expect(square(page, 'Wed, Oct 7')).toHaveAttribute('title', 'Wed, Oct 7: 1 answer, 0 new moves, 2 min');
    // The fixture's answer at 21:00 UTC on 30 September is 23:00 there, still the 30th.
    await expect(square(page, 'Wed, Sep 30')).toHaveClass(/\bs3\b/);
    // The 5th, 6th and 7th in a row, nothing yet on the 8th.
    await expect(stats(page).first()).toHaveText('3days in a row up to yesterday');
    await expect(stats(page).nth(1)).toHaveText('3days, the longest run');
  });
});
