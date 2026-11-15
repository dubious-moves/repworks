// Search (PLAN.md §5.166), on a desktop viewport and an emulated phone, over the fixture
// repertoire (Test repertoire: "Main line", 1. e4 c5 2. Nf3 with "A made-up comment", and
// "Alapin", 1. e4 c5 2. c3 Nf6): opened from the home; a chapter found by its name and opened; ←
// back to the same words and hits; a comment found by two of its words, opened at its move; a
// position by its moves, with the analysis board's link; words that find nothing; one letter;
// and the address read again after a reload.
//
// Control run on 2026-11-11: with a hit's click not settling the address first (no
// `onClickCapture` on the results), the test fails where ← comes back from the comment's chapter
// (the box reads "alapin", the words before: the hit was followed within the 300 ms the address
// waits for the typing to stop).
//
// Found by the full run (2026-11-11): the test failed once in thirty at the position's words,
// the box reading "comment MADE-up" again. A step of the page's start (its effect that takes
// another entry's words) ran after the first keys under load and put the address's words back.
// The box now only takes words it neither started with nor wrote; 80 runs of 80 pass since.
//
// Openings by name (§5.181), control run on 2026-11-15: with the openings' chunk never read
// (`loadOpenings` a no-op), both tests fail: the second at its first step (no Openings group),
// the first where 1. d4 d5 is named.
import { test, expect, type Page } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

async function setUp(page: Page): Promise<void> {
  await serveGithub(page, world().github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
}

const box = (page: Page) => page.getByLabel('Search the studies');
const group = (page: Page, name: string) => page.getByTestId('search-results').getByRole('region', { name, exact: true });

test('search: a chapter by its name, a comment by its words, a position by its moves, each opened where it is', async ({ page, isMobile }) => {
  await setUp(page);
  await page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'Search' }).click();
  await expect(page).toHaveURL(/#\/search$/);
  await expect(page).toHaveTitle('Search · Repworks');
  await expect(page.getByTestId('search-hint')).toContainText('Two letters or more');
  // A new search takes the keys at once on a desktop (a phone's keyboard comes up with the tap).
  if (!isMobile) await expect(box(page)).toBeFocused();

  // A chapter by its name, with its study; the address follows the words.
  await box(page).fill('alapin');
  await expect(group(page, 'Chapters').getByRole('link')).toHaveText(['Test repertoire · Alapin']);
  await expect(group(page, 'Chapters').locator('mark')).toHaveText(['Alapin']);
  await expect(page).toHaveURL(/#\/search\?q=alapin$/);
  await group(page, 'Chapters').getByRole('link').click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch2Alapn$/);
  // ← comes back to the words and their hits.
  await page.locator('.chapter-head .back').click();
  await expect(page).toHaveURL(/#\/search\?q=alapin$/);
  await expect(box(page), '← comes back to the words').toHaveValue('alapin');
  await expect(group(page, 'Chapters').getByRole('link')).toHaveText(['Test repertoire · Alapin']);

  // A comment by two of its words, in any order: its chapter, its move, the words marked.
  await box(page).fill('comment MADE-up');
  const comment = group(page, 'Comments').locator('.search-hit');
  await expect(comment).toHaveCount(1);
  await expect(comment.getByRole('link')).toHaveText('Test repertoire · Main line');
  await expect(comment).toContainText('2. Nf3');
  await expect(comment.locator('.search-snippet')).toHaveText('A made-up comment');
  await expect(comment.locator('mark')).toHaveText(['made-up', 'comment']);
  await comment.getByRole('link').click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3$/);
  await expect(page.locator('.move.current')).toHaveText(/Nf3/);
  await page.locator('.chapter-head .back').click();
  await expect(box(page)).toHaveValue('comment MADE-up');

  // A position by its moves: the chapter that reaches it, and the analysis board at it.
  await box(page).fill('e4 c5 c3');
  await expect(page.getByTestId('search-position')).toContainText('The position after 1. e4 c5 2. c3');
  await expect(page.getByTestId('search-position').getByRole('link', { name: 'Analysis board' })).toHaveAttribute('href', '#/analysis?line=e4,c5,c3');
  const place = group(page, 'Position').locator('.search-hit');
  await expect(place).toHaveCount(1);
  await expect(place.getByRole('link')).toHaveText('Test repertoire · Alapin');
  await expect(place).toContainText('1. e4 c5 2. c3');
  // 1. e4 c5 is in both chapters; a line the repertoire doesn't play is a position with no chapter.
  await box(page).fill('1.e4 c5');
  await expect(group(page, 'Position').getByRole('link')).toHaveText(['Test repertoire · Main line', 'Test repertoire · Alapin']);
  await box(page).fill('1.d4 d5');
  // The position is named from the bundled openings (§5.181).
  await expect(page.getByTestId('search-position')).toContainText('The position after 1. d4 d5 (D00 · Queen\'s Pawn Game): no chapter reaches it');
  await expect(page.getByTestId('search-results').locator('.search-hit')).toHaveCount(0);

  // Words that find nothing, and one letter.
  await box(page).fill('zebra crossing');
  await expect(page.getByTestId('search-results')).toHaveText('Nothing found for “zebra crossing”.');
  await box(page).fill('z');
  await expect(page.getByTestId('search-hint')).toBeVisible();

  // The address alone, after a reload: the study by its name, with its chapters counted.
  await page.goto(`${site.url}#/search?q=test%20rep`);
  await page.reload();
  await expect(box(page)).toHaveValue('test rep');
  const study = group(page, 'Studies').locator('.search-hit');
  await expect(study.getByRole('link')).toHaveText('Test repertoire');
  await expect(study).toContainText('2 chapters');
  await study.getByRole('link').click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd/);
});

test('search: an opening by its name, the repertoire’s own first; its hit searches for its position (§5.181)', async ({ page }) => {
  await setUp(page);
  await page.goto(`${site.url}#/search`);
  await box(page).fill('alapin');
  const openings = group(page, 'Openings');
  // 31 names hold the word: the one a chapter plays first, eight shown, the rest counted.
  await expect(openings.locator('.search-hit')).toHaveCount(8);
  await expect(openings.locator('h2')).toHaveText('Openings 31');
  await expect(openings).toContainText('23 more not shown');
  const first = openings.locator('.search-hit').first();
  await expect(first.getByRole('link')).toHaveText('Sicilian Defense: Alapin Variation');
  await expect(first.locator('mark')).toHaveText('Alapin');
  await expect(first).toContainText('B22 · 1. e4 c5 2. c3 · 1 chapter');
  // One no chapter plays says so.
  await expect(openings.locator('.search-hit').nth(1)).toContainText('no chapter');
  // The chapter of that name comes before the list's openings.
  await expect(group(page, 'Chapters').getByRole('link')).toHaveText(['Test repertoire · Alapin']);
  await expect(page.getByTestId('search-results').locator('section h2')).toHaveText(['Chapters 1', 'Openings 31']);

  // The hit: a search for its moves, so the chapter that reaches the position and the analysis board.
  await first.getByRole('link').click();
  await expect(page).toHaveURL(/#\/search\?q=1\.%20e4%20c5%202\.%20c3$/);
  await expect(box(page)).toHaveValue('1. e4 c5 2. c3');
  await expect(page.getByTestId('search-position')).toContainText('The position after 1. e4 c5 2. c3 (B22 · Sicilian Defense: Alapin Variation)');
  await expect(group(page, 'Position').getByRole('link')).toHaveText(['Test repertoire · Alapin']);
  // ← comes back to the name and its hits.
  await page.goBack();
  await expect(box(page)).toHaveValue('alapin');
  await expect(openings.locator('.search-hit')).toHaveCount(8);

  // A line past its last name keeps it; the repertoire's Sicilians are both counted at 1. e4 c5.
  await box(page).fill('e4 c5 c3 Nf6 e5');
  await expect(page.getByTestId('search-position')).toContainText('(B22 · Sicilian Defense: Alapin Variation)');
  await box(page).fill('sicilian defense');
  await expect(openings.locator('.search-hit').first()).toContainText('B20 · 1. e4 c5 · 2 chapters');
  // Nothing wider than the phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
