// A rehearsal of Phase 0's acceptance test (PLAN.md §4.11) in Playwright: a desktop page and an
// emulated Android phone against one fake GitHub, both offline while they edit the same chapter,
// then synced in the plan's order. The live test, with the real GitHub on the owner's real
// devices, is still the owner's; this one shows the app gets there.
//
// The chapter is the fixture's "Main line":
//   1. e4 c5 2. Nf3 { A made-up comment } 2... d6 (2... Nc6 3. d4) 3. d4 cxd4
// N = 2. Nf3 (its comment), S = 2... Nc6 and what follows, P = 3. d4, Q = 3... cxd4.
import { test, expect, devices, type Browser, type Page } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare, comment, drawInDrawMode, openMoveMenu } from './board.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

const CHAPTER = 'studies/Rep0Najd/Ch1Najdf.pgn';
const at = (path: string) => `${site.url}#/study/Rep0Najd/Ch1Najdf?at=${path}`;

async function device(browser: Browser, name: string, github: Parameters<typeof serveGithub>[1], options = {}): Promise<Page> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=${name}`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  // The worker controls the page once the shell is cached, so the app starts offline later.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  return page;
}

/**
 * Two reviews, waited for in the debug panel's card table (each device starts with none): a
 * reload before the second one's write lands would lose it, and the step's count with it.
 */
async function recordTwoReviews(page: Page) {
  await page.goto(`${site.url}#/`);
  await page.getByText('Settings and debug').click();
  await page.getByRole('button', { name: 'Record a test review' }).click();
  await page.getByRole('button', { name: 'Record a test review' }).click();
  await expect(page.locator('table.cards tr', { hasText: 'r|test|e2e4' }).locator('td').nth(1)).toHaveText('2');
}

async function syncNow(page: Page) {
  await page.locator('.chip').click();
  await expect(page.locator('.chip')).toHaveText(/^synced/);
}

async function cardTable(page: Page): Promise<string> {
  await page.goto(`${site.url}#/`);
  const debug = page.locator('details.debug');
  if (!(await debug.evaluate((d) => (d as HTMLDetailsElement).open))) await page.getByText('Settings and debug').click();
  return (await page.locator('table.cards').innerText()).trim();
}

test('two devices edit offline, sync, lose nothing, and agree', async ({ browser, isMobile }) => {
  test.skip(isMobile, 'one run drives both devices');
  test.setTimeout(120_000);
  const { git, github } = world();
  const desktop = await device(browser, 'desktop', github);
  const phone = await device(browser, 'phone', github, devices['Pixel 7']);
  const commitsBefore = git.log().length;

  // 2. Both offline.
  await desktop.context().setOffline(true);
  await phone.context().setOffline(true);

  // 3. Desktop: a variation (3. Bb5+ instead of 3. d4), N's comment rewritten, S deleted, an
  //    arrow on P, two test reviews.
  await desktop.goto(at('e4,c5,Nf3,d6'));
  await expect(desktop.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6');
  await clickSquare(desktop, 'f1', 'black');
  await clickSquare(desktop, 'b5', 'black');
  await expect(desktop.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6 Bb5+');
  await desktop.locator('.move[data-path="e4 c5 Nf3"]').click();
  await comment(desktop, 'desktop text');
  await desktop.locator('.move[data-path="e4 c5 Nf3 Nc6"]').click();
  await openMoveMenu(desktop, 'e4 c5 Nf3 Nc6');
  await desktop.getByRole('menuitem', { name: 'Delete from here' }).click();
  await desktop.locator('.move[data-path="e4 c5 Nf3 d6 d4"]').click();
  await expect(desktop.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6 d4');
  await drawInDrawMode(desktop, 'f8', 'b4', 'black', 'blue');
  await recordTwoReviews(desktop);

  // 4. Phone: another comment on N, a move inside S, a glyph on Q, a new chapter, two reviews;
  //    then the app killed and opened again offline, its edits still there.
  await phone.goto(at('e4,c5,Nf3'));
  await comment(phone, 'phone text');
  await phone.locator('.move[data-path="e4 c5 Nf3 Nc6 d4"]').click();
  await expect(phone.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 Nc6 d4');
  await clickSquare(phone, 'c5', 'black');
  await clickSquare(phone, 'd4', 'black');
  await expect(phone.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 Nc6 d4 cxd4');
  await phone.locator('.move[data-path="e4 c5 Nf3 d6 d4 cxd4"]').click();
  await openMoveMenu(phone);
  await phone.getByRole('menuitem', { name: 'Comment' }).click();
  await phone.getByRole('dialog').getByRole('button', { name: 'Good move' }).click();
  await expect(phone.locator('.move.current')).toContainText('cxd4!');
  await phone.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await phone.getByText('Chapter and study').click();
  await phone.getByLabel('Name', { exact: true }).fill('Phone chapter');
  await phone.getByRole('button', { name: 'Add chapter' }).click();
  await expect(phone.getByLabel('Chapter', { exact: true }).locator('option:checked')).toHaveText('Phone chapter');
  await recordTwoReviews(phone);
  await phone.reload();
  await expect(phone.locator('.studies')).toContainText('3 chapters');
  await expect(phone.locator('.chip')).toHaveText('offline · 5 changes waiting');

  // (3 files: the chapter, the new chapter, study.json; and 2 events.)

  // 5. Desktop online and syncs; then the phone; then the desktop pulls.
  await desktop.context().setOffline(false);
  await syncNow(desktop);
  await phone.context().setOffline(false);
  await syncNow(phone);
  await syncNow(desktop);

  // 6. The same result on both.
  const final = git.textsOf().get(CHAPTER)!;
  for (const page of [desktop, phone]) {
    await page.goto(at('e4,c5,Nf3'));
    await expect(page.locator('.conflict-box')).toContainText('desktop text');
    await expect(page.locator('.conflict-box')).toContainText('phone text');
    await expect(page.locator('.notation .variation', { hasText: /^3\. Bb5\+$/ })).toHaveCount(1);
    await expect(page.locator('.move[data-path="e4 c5 Nf3 d6 d4 cxd4"]')).toHaveText('cxd4!');
    await expect(page.locator('.move[data-path="e4 c5 Nf3 Nc6 d4 cxd4"]')).toBeVisible();
    await expect(page.getByLabel('Chapter', { exact: true })).toContainText('Phone chapter');
    await page.goto(`${site.url}#/conflicts`);
    await expect(page.locator('.conflicts li')).toHaveCount(2);
  }
  // N carries both comments inside markers (the phone's first: it merged, syncing later); S is
  // kept as far as the phone's move, marked; the variation, the arrow and the glyph are there,
  // and N's own arrows from before are untouched.
  expect(final.replace(/\d{4}-\d\d-\d\d/g, 'DAY').split('\n\n')[1]).toBe(
    '1. e4 c5 2. Nf3 { <<<<<<< phone DAY\nphone text\n=======\ndesktop text\n>>>>>>> desktop DAY } { [%csl Gd4][%cal Gd2d4] } ' +
      '2... d6 (2... Nc6 { <<<<<<< kept: deleted on desktop DAY } 3. d4 cxd4) 3. d4 { [%cal Bf8b4] } (3. Bb5+) 3... cxd4! *\n',
  );
  // All four reviews, and the same card states on both.
  const desktopCards = await cardTable(desktop);
  expect(desktopCards).toContain('r|test|e2e4\t4');
  expect(await cardTable(phone)).toBe(desktopCards);
  // One commit per sync, each named by its device.
  const messages = git.log().slice(commitsBefore).map((c) => c.message.split('\n')[0]);
  expect(messages).toEqual([expect.stringMatching(/^desktop: \d+ study files?, 2 events$/), expect.stringMatching(/^phone: \d+ study files?, 2 events$/)]);

  // 7. The phone resolves both conflicts; after a sync the desktop shows none.
  await phone.goto(at('e4,c5,Nf3'));
  await phone.getByRole('button', { name: 'Keep both' }).click();
  await phone.locator('.move[data-path="e4 c5 Nf3 Nc6"]').click();
  await phone.getByRole('button', { name: 'Keep the line' }).click();
  await syncNow(phone);
  await syncNow(desktop);
  await desktop.goto(`${site.url}#/conflicts`);
  await expect(desktop.locator('.card')).toContainText('No open conflicts.');
  expect(git.textsOf().get(CHAPTER)).not.toContain('<<<<<<<');
});
