// Find a line in the study (PLAN.md §5.210), on a desktop viewport and an emulated phone, over the
// fixture repertoire (Test repertoire: "Main line", 1. e4 c5 2. Nf3 d6 (2... Nc6 3. d4) 3. d4
// cxd4, and "Alapin", 1. e4 c5 2. c3 Nf6): from the ☰ menu in the Main line, a line of the other
// chapter typed without spaces after the numbers, Enter goes to its last move there; "/" opens it
// again (desktop), a side line typed with spaces, its link followed; a line the study leaves, the
// place where it leaves; moves that aren't a line; Escape closes it.
import { test, expect, type Page } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { studyMenu } from './board.ts';
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

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Find a line' });
const box = (page: Page) => dialog(page).getByLabel('Moves from the start');
const result = (page: Page) => page.getByTestId('find-line-result');

test('find a line: typed with or without spaces, the study’s place at its last move', async ({ page, isMobile }) => {
  await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(page.locator('.notation .move').first()).toBeVisible();

  // From the ☰ menu: a line of the other chapter, no space after the numbers; Enter goes there.
  await studyMenu(page, 'Find a line');
  await expect(dialog(page)).toBeVisible();
  if (!isMobile) await expect(box(page)).toBeFocused();
  await expect(result(page)).toContainText('Moves from the start');
  await box(page).fill('1.e4 c5 2.c3 Nf6');
  await expect(result(page).getByRole('link')).toHaveText(['Alapin']);
  await expect(result(page)).toContainText('1. e4 c5 2. c3 Nf6');
  await box(page).press('Enter');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch2Alapn\?at=e4,c5,c3,Nf6$/);
  await expect(page.locator('.notation .move.current')).toHaveText(/Nf6/);

  // Again ("/" on a desktop): a side line of the Main line, with spaces; its link followed.
  if (isMobile) await studyMenu(page, 'Find a line');
  else await page.keyboard.press('/');
  await expect(box(page)).toHaveValue('');
  await box(page).fill('1. e4 c5 2. Nf3 Nc6 3. d4');
  await expect(result(page).getByRole('link')).toHaveText(['Main line']);
  await result(page).getByRole('link', { name: 'Main line' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3,Nc6,d4$/);
  await expect(page.locator('.notation .move.current')).toHaveText(/d4/);

  // A line the study leaves: the place where it leaves, this chapter's; Go goes there.
  await studyMenu(page, 'Find a line');
  await box(page).fill('1.e4 c5 2.Nf3 d6 3.d4 Nf6');
  await expect(result(page)).toContainText('No chapter reaches 1. e4 c5 2. Nf3 d6 3. d4 Nf6. The study follows it as far as 1. e4 c5 2. Nf3 d6 3. d4');
  await expect(result(page).getByRole('link')).toHaveText(['Main line']);
  await dialog(page).getByRole('button', { name: 'Go' }).click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3,d6,d4$/);
  await expect(page.locator('.notation .move.current')).toHaveText(/d4/);

  // A place in the chapter already open, its link followed: the board goes there (it once stayed
  // where it was, the address alone changed). Then the browser's Back: the place before.
  await studyMenu(page, 'Find a line');
  await box(page).fill('1.e4 c5 2.Nf3');
  await result(page).getByRole('link', { name: 'Main line' }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3$/);
  await expect(page.locator('.notation .move.current')).toHaveText(/Nf3/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3,d6,d4$/);
  await expect(page.locator('.notation .move.current')).toHaveText(/d4/);

  // Moves that aren't a line from the start: said, and nowhere to go. Escape closes it.
  await studyMenu(page, 'Find a line');
  await box(page).fill('1.e4 e5 2.Ke3');
  await expect(result(page)).toContainText('aren’t moves from the start');
  await expect(dialog(page).getByRole('button', { name: 'Go' })).toBeDisabled();
  await box(page).press('Escape');
  await expect(dialog(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3,d6,d4$/);
});

// A link followed into the installed app while it is open (PLAN.md §5.215): the browser focuses the
// window and hands the link to `launchQueue`, as `focus-existing` has it; the app goes there. The
// queue is a stand-in here (no browser test can install the app): the consumer the app set is
// called as the browser calls it.
test('a link followed into the open app goes to its move; a launch with no link, or one elsewhere, changes nothing', async ({ page }) => {
  await page.addInitScript(() => {
    // Chromium has a queue of its own, read-only on window: defined over, not assigned.
    Object.defineProperty(window, 'launchQueue', {
      value: { setConsumer: (consume: unknown) => ((window as unknown as { launched: unknown }).launched = consume) },
    });
  });
  await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(page.locator('.notation .move').first()).toBeVisible();
  const launch = (params: { files?: unknown[]; targetURL?: string }) =>
    page.evaluate((p) => (window as unknown as { launched: (p: unknown) => void }).launched(p), params);

  await launch({ files: [], targetURL: `${site.url}#/study/Rep0Najd/Ch2Alapn?at=e4,c5,c3,Nf6` });
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch2Alapn\?at=e4,c5,c3,Nf6$/);
  await expect(page.locator('.notation .move.current')).toHaveText(/Nf6/);
  // A move of the chapter already open.
  await launch({ files: [], targetURL: `${site.url}#/study/Rep0Najd/Ch2Alapn?at=e4,c5` });
  await expect(page.locator('.notation .move.current')).toHaveText(/c5/);
  // Back comes back to the move before, as from any link.
  await page.goBack();
  await expect(page.locator('.notation .move.current')).toHaveText(/Nf6/);
  // The app's icon clicked again (no link), and a link that isn't the app's: the page stays.
  await launch({ files: [] });
  await launch({ targetURL: 'https://example.org/repworks/#/train' });
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch2Alapn\?at=e4,c5,c3,Nf6$/);
});
