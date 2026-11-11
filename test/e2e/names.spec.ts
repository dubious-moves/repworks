// Long names (PLAN.md §5.164), on a desktop viewport and an emulated phone: the fixture repertoire
// with its study named by 72 characters with no space to break at (a file's name) and its first
// chapter by a long title. No page scrolls sideways: the study's head wraps the name, the storm's
// Study and Chapter dropdowns keep to the card, and its heading and its table wrap the name.
//
// Control run on 2026-11-11, on the phone project: without §5.164's rules (`.storm-scope label`,
// `.study-title`'s and `h2`'s `overflow-wrap`, the table's) the test fails at "the study page"
// (154px past the window), and with only that fixed at "the storm, the study chosen" (509px).
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

const STUDY = 'Najdorf_Sicilian_with_an_unbreakable_name_that_has_no_spaces_at_all_2026';
const CHAPTER = 'Quickstarter Guide: 1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 and the slow manoeuvring plans that follow';

function longNames() {
  const files = fixtureFiles();
  const meta = 'studies/Rep0Najd/study.json';
  files.set(meta, files.get(meta)!.replace('"Test repertoire"', `"${STUDY}"`));
  const chapter = 'studies/Rep0Najd/Ch1Najdf.pgn';
  files.set(chapter, files.get(chapter)!.replace('[ChapterName "Main line"]', `[ChapterName "${CHAPTER}"]`));
  return new FakeGithub(new FakeGit(files), { repo: REPO, branch: 'main', token: TOKEN });
}

/** How far the page can be scrolled sideways, in px: none is 0. */
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('long names: no page scrolls sideways, and the storm’s dropdowns keep to their card', async ({ page }) => {
  await serveGithub(page, longNames());
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await expect(page.getByRole('link', { name: STUDY, exact: true })).toBeVisible();
  expect(await sideways(page), 'the home').toBe(0);

  await page.getByRole('link', { name: STUDY, exact: true }).click();
  await expect(page.locator('.notation')).toContainText('A made-up comment');
  await expect(page.locator('.chapter-head .study-title')).toContainText(STUDY);
  expect(await sideways(page), 'the study page').toBe(0);

  await page.goto(`${site.url}#/storm/Rep0Najd`);
  const study = page.getByLabel('Study');
  await expect(study).toHaveValue('Rep0Najd');
  expect(await sideways(page), 'the storm, the study chosen').toBe(0);
  // The dropdowns end inside their card, whatever their longest option.
  const card = (await page.locator('.storm-scope').boundingBox())!;
  for (const select of [study, page.getByLabel('Chapter')]) {
    const box = (await select.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(card.x + card.width + 0.5);
  }

  await page.goto(`${site.url}#/storm`);
  await expect(page.locator('.storm-chapters')).toContainText(STUDY);
  expect(await sideways(page), 'the storm, the whole repertoire').toBe(0);

  await page.goto(`${site.url}#/train/Rep0Najd`);
  await expect(page.locator('.chapter-head')).toContainText(STUDY);
  expect(await sideways(page), 'training').toBe(0);
});
