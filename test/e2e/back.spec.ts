// The app's ← (the owner's request, 2026-10-08), on a desktop viewport and an emulated phone: back
// to the page it was opened from, past the page's own entries (a study's chapters, training's
// lines), and up to the page's parent when it was opened from outside the app; a button that
// stands out.
import { test, expect, type Page } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { openMoveMenu } from './board.ts';
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
  const { github } = world();
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
}

const back = (page: Page) => page.locator('.chapter-head .back');

test('← goes back where the page was opened from, past a study’s chapters, and stands out', async ({ page }) => {
  await setUp(page);
  // The home, a study, its other chapter, then the analysis board from a move.
  await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd/);
  // The phone picks chapters from the head's select, the desktop from the side list: wait for
  // whichever this viewport shows before choosing, since isVisible() doesn't wait for the study.
  const chapter = page.getByLabel('Chapter', { exact: true });
  const link = page.getByRole('navigation', { name: 'Chapters' }).getByRole('link', { name: 'Alapin' });
  await expect(chapter.or(link).filter({ visible: true }).first()).toBeVisible();
  if (await chapter.isVisible()) await chapter.selectOption({ label: 'Alapin' });
  else await link.click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch2Alapn/);
  await openMoveMenu(page, 'e4 c5');
  await page.getByRole('menuitem', { name: 'Analyse from here' }).click();
  await expect(page).toHaveURL(/#\/analysis\?/);
  // A button of its own: filled, not a bare arrow.
  const fill = await back(page).evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(fill).not.toBe('rgba(0, 0, 0, 0)');
  // ←: the chapter the board was opened from; ← again: past both chapters, the home.
  await back(page).click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch2Alapn/);
  await back(page).click();
  await expect(page.locator('.study-card').first()).toBeVisible();
  expect(new URL(page.url()).hash).toMatch(/^(#\/?)?$/);
});

test('← from training goes back past the lines trained to the page it was opened from', async ({ page }) => {
  await setUp(page);
  await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd/);
  await page.goto(`${site.url}#/train/Rep0Najd`);
  await page.goto(`${site.url}#/train/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3,Nc6,d4`);
  await expect(page.locator('.train-grid')).toBeVisible();
  await back(page).click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd/);
});

test('← on a page opened from outside the app goes up to its parent', async ({ page, context }) => {
  await setUp(page);
  const other = await context.newPage();
  await serveGithub(other, world().github);
  await other.goto(`${site.url}#/mistakes`);
  await expect(other.locator('.study-title')).toHaveText('Mistakes');
  await other.locator('.chapter-head .back').click();
  await expect(other.locator('.study-card').first()).toBeVisible();
});
