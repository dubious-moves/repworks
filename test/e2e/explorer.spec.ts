// The explorer panel (PLAN.md §5.23), on a desktop viewport and an emulated phone, with a fake
// Lichess explorer and ChessDB and the fixture repertoire (Main line: 1. e4 c5 2. Nf3 d6 …, and
// Alapin: 1. e4 c5 2. c3 Nf6, both Black's).
import { test, expect, type Page } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { fakeExplorer, lichessLogin, serveExplorer, serveLocalExplorer, type FakeExplorer } from './explorer.ts';
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

function positions(): FakeExplorer {
  const fake = fakeExplorer();
  fake.games.set(START, [
    { san: 'e4', white: 300, draws: 200, black: 100, averageRating: 2101 },
    { san: 'd4', white: 120, draws: 120, black: 60 },
    { san: 'c4', white: 40, draws: 40, black: 20 },
  ]);
  fake.evals.set(START, [
    ['e4', 30],
    ['d4', 25],
    ['Nf3', 20],
  ]);
  fake.games.set(AFTER_C5, [
    { san: 'Nf3', white: 50, draws: 30, black: 20 },
    { san: 'c3', white: 20, draws: 20, black: 10 },
  ]);
  fake.evals.set(AFTER_C5, [
    ['Nf3', 33],
    ['c3', 15],
  ]);
  return fake;
}

async function setUp(page: Page, options: { login?: boolean } = {}): Promise<FakeExplorer> {
  const { github } = world();
  if (options.login !== false) await lichessLogin(page);
  await serveGithub(page, github);
  const fake = await serveExplorer(page, positions());
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return fake;
}

const panel = (page: Page) => page.getByRole('region', { name: 'Explorer' });
const rows = (page: Page) => panel(page).locator('.ex-row .ex-san');

test('the panel: Qchess’s rows, sorted by eval, a row clicked plays its move, and it turns off', async ({ page }) => {
  const fake = await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  // White to move: the best eval for White first, the novelty (ChessDB's Nf3) in its place, c4
  // (no eval) last.
  await expect(rows(page)).toHaveText(['e4', 'd4', 'Nf3', 'c4']);
  const e4 = panel(page).locator('.ex-row', { hasText: 'e4' }).first();
  await expect(e4).toHaveClass(/covered/);
  // The Alapin plays 1. e4 too.
  await expect(e4.locator('.ex-rep')).toHaveText('1');
  await expect(e4.locator('.ex-eval')).toHaveText('+0.30');
  await expect(e4.locator('.ex-share')).toHaveText('60%');
  await expect(e4.locator('.ex-count')).toHaveText('600');
  await expect(e4.locator('.ex-white')).toHaveText('50%');
  await expect(e4).toHaveAttribute('title', 'Average rating: 2101');
  await expect(panel(page).locator('.ex-row.novelty')).toHaveText(/Nf3.*novelty/);
  await expect(panel(page).locator('.ex-total .ex-count')).toHaveText('1,000');
  const asked = fake.requests.filter((r) => r.url.startsWith('https://explorer.lichess.org/lichess'));
  expect(asked).toHaveLength(1);
  expect(asked[0]!.auth).toBe('Bearer lip_e2e');
  expect(asked[0]!.url).toContain('speeds=blitz,rapid,classical&ratings=1600,1800,2000,2200,2500');

  // Sorted by popularity instead: c4 among the games, the novelty after them.
  await panel(page).getByRole('combobox', { name: 'Sort' }).selectOption('popularity');
  await expect(rows(page)).toHaveText(['e4', 'd4', 'c4', 'Nf3']);

  // A click on d4 plays it, as a variation of the chapter.
  await panel(page).locator('.ex-row', { hasText: 'd4' }).first().click();
  await expect(page.locator('.move.current')).toHaveText(/d4/);

  // Off: no panel, remembered after a reload.
  await page.getByRole('button', { name: 'Explorer', exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.notation')).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Explorer', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('tabs: Masters asks Lichess’s masters with no filter; ChessDB shows its moves alone', async ({ page }) => {
  const fake = await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(rows(page)).toHaveText(['e4', 'd4', 'Nf3', 'c4']);
  await panel(page).getByRole('tab', { name: 'Masters' }).click();
  await expect.poll(() => fake.requests.some((r) => r.url.startsWith('https://explorer.lichess.org/masters?fen='))).toBe(true);
  expect(fake.requests.find((r) => r.url.includes('/masters'))!.url).not.toContain('speeds=');
  await panel(page).getByRole('tab', { name: 'ChessDB' }).click();
  await expect(rows(page)).toHaveText(['e4', 'd4', 'Nf3']);
  await expect(panel(page).locator('.ex-count')).toHaveCount(0);
});

test('a move other repertoire chapters play is marked, and its list opens the other chapter there', async ({ page }) => {
  await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await page.locator('.move[data-path="e4 c5"]').click({ position: { x: 6, y: 8 } });
  await expect(rows(page)).toHaveText(['Nf3', 'c3']);
  // The chapter plays Nf3 here; the Alapin plays c3.
  await expect(panel(page).locator('.ex-row', { hasText: 'Nf3' })).toHaveClass(/covered/);
  const mark = panel(page).locator('.ex-row', { hasText: 'c3' }).locator('.ex-rep');
  await expect(mark).toHaveText('1');
  await mark.click();
  await page.getByRole('menuitem', { name: /Alapin/ }).click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch2Alapn/);
  await expect(page.locator('.move.current')).toHaveText(/c3/);
});

test('no Lichess login: the games tab says so and offers it; ChessDB still answers', async ({ page }) => {
  const fake = await setUp(page, { login: false });
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(panel(page).getByText(/needs a Lichess login/)).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Log in with Lichess' })).toBeVisible();
  expect(fake.requests.filter((r) => r.url.startsWith('https://explorer.lichess.org'))).toHaveLength(0);
  await panel(page).getByRole('tab', { name: 'ChessDB' }).click();
  await expect(rows(page)).toHaveText(['e4', 'd4', 'Nf3']);
});

test('Lichess asks to slow down: the panel says it waits', async ({ page }) => {
  const fake = await setUp(page);
  fake.refuse.push(429);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(panel(page).getByText(/Lichess asked to slow down/)).toBeVisible();
});

test('the settings: the filter changed is what Lichess is asked', async ({ page }) => {
  const fake = await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(rows(page)).toHaveText(['e4', 'd4', 'Nf3', 'c4']);
  await panel(page).getByRole('button', { name: 'Explorer settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Explorer settings' });
  await expect(dialog.locator('.explorer-stats')).toContainText('This tab: 1 Lichess requests (0 refused for speed)');
  await dialog.getByRole('button', { name: 'Bullet' }).click();
  await dialog.getByRole('button', { name: '1600' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => fake.requests.filter((r) => r.url.startsWith('https://explorer.lichess.org/lichess')).at(-1)?.url).toContain('speeds=blitz,rapid,classical,bullet&ratings=1800,2000,2200,2500');
  // The panel fits the screen (the phone's included).
  const wide = await page.evaluate(() => [...document.querySelectorAll('.explorer, .explorer *')].filter((e) => e.getBoundingClientRect().right > document.documentElement.clientWidth + 0.5).map((e) => `${e.tagName}.${e.className} ${Math.round(e.getBoundingClientRect().right)}`).slice(0, 8));
  expect(wide).toEqual([]);
});

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -';
const AFTER_E5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -';

test('the Practical column on the chapter’s moves: rows by rounds, green, a click, a long-press, the prepared bars', async ({ page }) => {
  const fake = await setUp(page);
  // After 1. e4, Black's move (the chapter is Black's): c5 and e5 picked, b6 (under 2%, no eval) not.
  fake.games.set(AFTER_E4, [
    { san: 'c5', white: 250, draws: 150, black: 200 },
    { san: 'e5', white: 120, draws: 100, black: 80 },
    { san: 'b6', white: 3, draws: 1, black: 1 },
  ]);
  fake.evals.set(AFTER_E4, [
    ['c5', -25],
    ['e5', -30],
  ]);
  fake.games.set(AFTER_E5, [{ san: 'Nf3', white: 150, draws: 100, black: 50 }]);
  fake.evals.set(AFTER_E5, [['Nf3', 40]]);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(rows(page)).toHaveText(['e4', 'd4', 'Nf3', 'c4']);
  // White's move here: no values, since the chapter is Black's.
  await expect(panel(page).locator('.ex-row .ex-prac').first()).toHaveText('');
  await page.locator('.move[data-path="e4"]').click({ position: { x: 6, y: 8 } });
  await expect(rows(page)).toHaveText(['c5', 'e5', 'b6']);
  const cell = (san: string) => panel(page).locator('.ex-row', { has: page.locator('.ex-san', { hasText: new RegExp(`^${san}$`) }) }).locator('.ex-prac');
  await expect(cell('c5')).toHaveText(/^\d+%$/);
  await expect(cell('e5')).toHaveText(/^\d+%$/);
  await expect(panel(page).locator('.ex-prac.best')).toHaveCount(1);
  await expect(cell('c5')).toHaveAttribute('title', /^Practical \d+%/);
  // b6 wasn't picked: a click computes it (too few games: –), without playing the move.
  await expect(cell('b6')).toHaveText('');
  await cell('b6').click();
  await expect(cell('b6')).toHaveText('–');
  await expect(page.locator('.move.current')).toHaveText(/e4/);
  // A tap on a value shows its details under the table.
  await cell('c5').click();
  await expect(panel(page).getByRole('status', { name: 'Practical: c5' })).toContainText(/Practical \d+%/);
  // A right-click (a long-press on the phone) leaves e5 out; again brings it back.
  await cell('e5').click({ button: 'right' });
  await expect(cell('e5')).toHaveText('×');
  await cell('e5').click({ button: 'right' });
  await expect(cell('e5')).toHaveText(/^\d+%$/);
  // The Score header switches the bars to the prepared split.
  await panel(page).getByRole('button', { name: 'Score' }).click();
  await expect(panel(page).getByRole('button', { name: 'Prepared' })).toBeVisible();
  await expect(panel(page).locator('.ex-bar.prep')).toHaveCount(2);
  await expect(panel(page).locator('.ex-bar.prep').first()).toHaveAttribute('title', /^Prepared \d+ \/ \d+ \/ \d+/);
  // Lichess's data, with the token, for the search too.
  expect(fake.requests.filter((r) => r.url.includes(encodeURIComponent('4p3/4P3')) && r.url.startsWith('https://explorer.lichess.org/lichess')).length).toBeGreaterThan(0);
});

test('the local explorer: its address tested, then the Lichess tab answered by it with no login; Masters stays Lichess’s', async ({ page }) => {
  const fake = await setUp(page, { login: false });
  const local = await serveLocalExplorer(fake, new URL(site.url).origin);
  try {
    await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
    await expect(panel(page).getByText(/needs a Lichess login/)).toBeVisible();
    await panel(page).getByRole('button', { name: 'Explorer settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Explorer settings' });
    // Nothing there first: the test says so.
    await dialog.locator('input[name="local"]').fill('127.0.0.1:1');
    await dialog.getByRole('button', { name: 'Test' }).click();
    await expect(dialog.getByRole('alert')).toContainText('nothing answers at http://127.0.0.1:1');
    await dialog.locator('input[name="local"]').fill(local.address);
    await dialog.getByRole('button', { name: 'Test' }).click();
    await expect(dialog.locator('.local-tested')).toContainText('Answers: lichess_db_standard_rated_2026-09.pgn.zst (made 2026-10-01) · its games: blitz, rapid; ratings 1800, 2000 · 12,345 positions, 67,890 games');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toHaveCount(0);

    // The games tab is the local explorer's, asked with no token.
    await expect(panel(page).getByRole('tab', { name: 'Local' })).toBeVisible();
    await expect(rows(page)).toHaveText(['e4', 'd4', 'Nf3', 'c4']);
    const asked = fake.requests.filter((r) => r.url.startsWith('local /lichess'));
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((r) => r.auth === undefined)).toBe(true);
    expect(asked[0]!.url).toContain('speeds=blitz,rapid,classical');
    expect(fake.requests.filter((r) => r.url.startsWith('https://explorer.lichess.org'))).toHaveLength(0);

    // Masters is Lichess's: it still needs the login.
    await panel(page).getByRole('tab', { name: 'Masters' }).click();
    await expect(panel(page).getByText(/needs a Lichess login/)).toBeVisible();
  } finally {
    await local.close();
  }
});
