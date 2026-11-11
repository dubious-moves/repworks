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
  await expect(page.getByTestId('search-position')).toContainText('The position after 1. d4 d5: no chapter reaches it');
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
