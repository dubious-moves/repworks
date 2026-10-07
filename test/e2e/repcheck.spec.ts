// What the games say about the repertoire (PLAN.md §5.58–§5.60), on a desktop viewport and an
// emulated phone, against the test data repo's Black repertoire (1.e4 c5 2.Nf3 d6, 2...Nc6, 2.c3
// Nf6): four games from mistake-lab's Gist. 2...e6 is played twice (a deviation of two games,
// a mistake each time: the older one's card was reviewed before the newer game, so the newer game
// relapses it and the card is rescheduled), 2...d5 against 2.c3 once (dismissed), and 3.Bb5+ is a
// gap. A chapter is opened from a deviation.
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

const players = { white: { user: { name: 'Rival', id: 'rival' }, rating: 1850 }, black: { user: { name: 'Me', id: 'me' }, rating: 1800 } };
const cps = (...v: number[]) => v.map((e) => ({ eval: e }));
const game = (id: string, createdAt: number, moves: string, analysis?: { eval: number }[]) => ({ id, rated: true, speed: 'blitz', createdAt, status: 'resign', winner: 'white', players, moves, ...(analysis ? { analysis } : {}) });
const GAMES = {
  version: 2,
  usernames: ['me'],
  games: [
    game('RcOld001', 1_790_000_000_000, 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6', cps(20, 20, 20, 300, 300, 300, 300, 300)),
    game('RcNew001', 1_791_300_000_000, 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6', cps(20, 20, 20, 300, 300, 300, 300, 300)),
    game('RcC3xxxx', 1_791_310_000_000, 'e4 c5 c3 d5 exd5 Qxd5'),
    game('RcGap001', 1_791_320_000_000, 'e4 c5 Nf3 d6 Bb5+ Bd7'),
  ],
};
// The older game's mistake reviewed on 2026-10-06 at 10:00, before the newer game (in the fixture's
// Desktop1 file, as its ninth event).
const REVIEW = '{"v":1,"n":1,"t":"2026-10-06T10:00:00.000Z","k":"review","card":"m|RcOld001_4","g":3}\n';

async function setUp(page: Page): Promise<FakeGit> {
  const files = fixtureFiles();
  files.set('progress/Desktop1/2026-10-05.jsonl', files.get('progress/Desktop1/2026-10-05.jsonl')! + REVIEW.replace('"n":1', '"n":9'));
  const git = new FakeGit(files);
  await serveGithub(page, new FakeGithub(git, { repo: REPO, branch: 'main', token: TOKEN }));
  const cors = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  await page.route('https://api.github.com/gists/**', (route) => route.fulfill({ status: 200, headers: { ...cors, etag: '"g1"' }, body: JSON.stringify({ files: { 'mistakelab_games.json': { size: 9, truncated: false, content: JSON.stringify(GAMES) } } }) }));
  await page.addInitScript(() => localStorage.setItem('repworks-games', JSON.stringify({ gist: '0123456789abcdef0123' })));
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return git;
}

const progressLog = (git: FakeGit) =>
  [...git.textsOf()]
    .filter(([p]) => p.startsWith('progress/'))
    .map(([, t]) => t)
    .join('');

test('deviations, gaps and a dismissal; a relapse rescheduled; a chapter opened from a deviation', async ({ page }) => {
  const git = await setUp(page);
  await page.getByRole('link', { name: 'Games' }).click();
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByTestId('games-status')).toContainText('Gist: 4 games read');
  // The newer game met the reviewed position with the same mistake: relapsed, and rescheduled.
  await expect(page.getByTestId('recid-summary')).toContainText('0 fixed · 1 relapsed');

  await page.getByRole('link', { name: 'Repertoire check' }).click();
  await expect(page).toHaveURL(/#\/repertoire-check$/);
  const devs = page.getByTestId('deviation');
  await expect(devs).toHaveCount(2);
  await expect(devs.first()).toContainText('2… e6');
  await expect(devs.first()).toContainText('2 games');
  await expect(devs.first()).toContainText('your repertoire: d6');
  await expect(page.getByTestId('gaps')).toContainText('3. Bb5+');
  await expect(page.getByTestId('weak-spots')).toContainText('None found.');

  await devs.filter({ hasText: 'd5' }).getByRole('button', { name: 'Dismiss' }).click();
  await expect(devs).toHaveCount(1);
  await expect(page.getByTestId('deviations')).toContainText('1 position dismissed.');

  await page.locator('button.chip').click();
  await expect.poll(() => progressLog(git), { timeout: 15_000 }).toContain('"k":"relapse","card":"m|RcOld001_4","g":"RcNew001","at":"2026-10-06T');
  const log = progressLog(git);
  expect(log).toMatch(/"k":"dismiss","card":"d\|rnbqkbnr\/pp1ppppp\/8\/2p5\/4P3\/2P5\/PP1P1PPP\/RNBQKBNR b KQkq -","on":true/);
  expect(log.match(/"k":"relapse"/g)).toHaveLength(1);

  await devs.first().getByRole('button', { name: 'Open the chapter' }).click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3$/);
});
