// Repertoire coverage (PLAN.md §5.26), on a desktop viewport and an emulated phone: a reference
// study (a course) beside the fixture repertoire (Black: 1. e4 c5 2. Nf3 d6 3. d4 cxd4, with
// 2... Nc6 3. d4; and the Alapin, 2. c3 Nf6), its gaps ranked with a fake explorer, one added to
// a chapter, synced, and undone.
import { test, expect, type Page } from '@playwright/test';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { fakeExplorer, lichessLogin, serveExplorer, type FakeExplorer } from './explorer.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';
const AFTER_C5 = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -';
const AFTER_D6 = 'rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -';

const COURSE = 'studies/Crs0Sici/Ch1Sicil.pgn';
async function setUp(page: Page, options: { login?: boolean } = {}): Promise<{ git: FakeGit; fake: FakeExplorer }> {
  const { git, github } = world();
  git.commitIfHead(
    git.head,
    'a course',
    new Map([
      ['studies/Crs0Sici/study.json', JSON.stringify({ format: 1, id: 'Crs0Sici', name: 'Sicilian course', kind: 'reference', chapters: ['Ch1Sicil'] }, null, 2) + '\n'],
      [COURSE, '[Event "Sicilian course: Open"]\n[StudyName "Sicilian course"]\n[ChapterName "Open"]\n[Orientation "black"]\n\n1. e4 c5 2. Nf3 (2. c3 d5 3. exd5 Qxd5) (2. Nc3 Nc6) 2... d6 3. d4 cxd4 4. Nxd4 Nf6 *\n'],
    ]),
    [],
  );
  if (options.login !== false) await lichessLogin(page);
  await serveGithub(page, github);
  const fake = fakeExplorer();
  fake.games.set(START, [
    { san: 'e4', white: 300, draws: 200, black: 100 },
    { san: 'd4', white: 200, draws: 100, black: 100 },
  ]);
  fake.games.set(AFTER_C5, [
    { san: 'Nf3', white: 150, draws: 100, black: 50 },
    { san: 'Nc3', white: 30, draws: 20, black: 10 },
    { san: 'c3', white: 20, draws: 10, black: 10 },
  ]);
  fake.games.set(AFTER_D6, [
    { san: 'd4', white: 90, draws: 60, black: 30 },
    { san: 'Bb5+', white: 10, draws: 5, black: 5 },
  ]);
  await serveExplorer(page, fake);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return { git, fake };
}

const report = (page: Page) => page.getByRole('region', { name: 'Coverage report' });
const gaps = (page: Page) => report(page).locator('.coverage-gap');

test('a course against the repertoire: its gaps found and ranked, one added to a chapter, synced, and undone', async ({ page }) => {
  const { git, fake } = await setUp(page);
  await page.getByRole('button', { name: 'Settings of Sicilian course' }).click();
  await page.getByRole('dialog', { name: 'Study settings' }).getByRole('button', { name: 'Coverage…' }).click();
  await expect(page).toHaveURL(/#\/coverage\/Crs0Sici$/);

  // Three lines: 4. Nxd4 where the main line ends, 2. Nc3 which the repertoire doesn't meet, and
  // 2... d5 against the Alapin, where the repertoire plays 2... Nf6.
  await expect(report(page).locator('.coverage-summary')).toHaveText('3 lines · 0 present · 2 missing in 2 places · 1 where you play another move');
  await expect(report(page)).toContainText('Ranked by Lichess’s games');
  // 4. Nxd4: 1. e4 (60%) × 2. Nf3 (75%) × 3. d4 (90%) = 40.5% of games, 67.5% from 1. e4 c5; the
  // depth discount still leaves it above 2. Nc3 (15% from the root).
  await expect(gaps(page)).toHaveCount(2);
  await expect(gaps(page).nth(0)).toContainText('Line ends');
  await expect(gaps(page).nth(0).locator('.coverage-moves')).toHaveText('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4');
  await expect(gaps(page).nth(0).locator('.coverage-figures')).toContainText('P 68% · 41% of games · ply 7');
  await expect(gaps(page).nth(1)).toContainText('Unmet');
  await expect(gaps(page).nth(1).locator('.coverage-figures')).toContainText('P 15% · 9.0% of games · ply 3');
  const asked = fake.requests.filter((r) => r.url.startsWith('https://explorer.lichess.org/lichess'));
  expect(asked.length).toBe(3);
  expect(asked.every((r) => r.auth === 'Bearer lip_e2e')).toBe(true);
  await report(page).getByText('Where you play another move (1)').click();
  await expect(report(page).locator('.coverage-alternatives')).toContainText('1. e4 c5 2. c3 d5');

  // 2. Nc3 Nc6 added to a chapter that reaches 1. e4 c5: the Main line.
  const nc3 = gaps(page).nth(1);
  await expect(nc3.getByRole('combobox', { name: 'Add to chapter' })).toHaveValue('0');
  await nc3.getByRole('button', { name: 'Add the line' }).click();
  await expect(report(page).locator('.coverage-summary')).toHaveText('3 lines · 1 present · 1 missing in 1 place · 1 where you play another move');
  await page.locator('.chip').click();
  await expect.poll(() => git.textsOf().get('studies/Rep0Najd/Ch1Najdf.pgn')).toContain('(2. Nc3 Nc6)');
  // Nothing asked again: the answers are kept.
  expect(fake.requests.filter((r) => r.url.startsWith('https://explorer.lichess.org/lichess')).length).toBe(3);

  // Undone: the chapter as it was, the gap back.
  const done = report(page).getByRole('list', { name: 'Added' });
  await expect(done).toContainText('Added 2. Nc3 to Main line.');
  await done.getByRole('button', { name: 'Undo' }).click();
  await expect(report(page).locator('.coverage-summary')).toHaveText('3 lines · 0 present · 2 missing in 2 places · 1 where you play another move');
  await expect(done).toHaveCount(0);
  await page.locator('.chip').click();
  await expect.poll(() => git.textsOf().get('studies/Rep0Najd/Ch1Najdf.pgn')).not.toContain('Nc3');
});

test('without a Lichess login the gaps are listed unranked, with the login offered; the course opens at a gap', async ({ page }) => {
  await setUp(page, { login: false });
  await page.goto(`${site.url}#/coverage/Crs0Sici`);
  await expect(gaps(page)).toHaveCount(2);
  await expect(report(page).getByRole('button', { name: 'Log in with Lichess' })).toBeVisible();
  await expect(gaps(page).nth(0).locator('.coverage-figures')).toContainText('P —');
  await gaps(page).filter({ hasText: 'Nxd4' }).getByRole('link').click();
  await expect(page).toHaveURL(/#\/study\/Crs0Sici\/Ch1Sicil\?at=e4,c5,Nf3,d6,d4,cxd4,Nxd4$/);
  await expect(page.locator('.move.current')).toHaveText(/Nxd4/);
  // Nothing in the report is wider than the screen.
  await page.goto(`${site.url}#/coverage/Crs0Sici`);
  await expect(gaps(page)).toHaveCount(2);
  const wide = await page.evaluate(() => [...document.querySelectorAll('.coverage, .coverage *')].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5).map((e) => `${e.tagName}.${e.className}`).slice(0, 8));
  expect(wide).toEqual([]);
});
