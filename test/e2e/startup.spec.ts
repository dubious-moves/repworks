// A start that stalls or fails says so instead of leaving the page blank (the owner's phone,
// 2026-10-10: after a reload the page stayed empty below the top bar, with no error shown).
import { test, expect } from '@playwright/test';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

test('a database that never opens: the step waited on is named, with Reload', async ({ page }) => {
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (this: IDBFactory, name: string, version?: number) {
      // The request for the app's own database never answers, as the phone's seemed not to.
      return name === 'repworks' ? ({} as IDBOpenDBRequest) : open.call(this, name, version);
    };
  });
  await page.goto(site.url);
  const status = page.locator('.starting');
  await expect(status).toContainText('Still starting: waiting for opening the local database', { timeout: 10_000 });
  await expect(status.getByRole('button', { name: 'Reload' })).toBeVisible();
});

test('a database that fails while read: the error is shown, not a blank page', async ({ page }) => {
  await page.addInitScript(() => {
    IDBDatabase.prototype.transaction = () => {
      throw new DOMException('the test broke it', 'UnknownError');
    };
  });
  await page.goto(site.url);
  await expect(page.locator('.banner-warn')).toHaveText(
    "Repworks couldn't start while reading the device and its studies: UnknownError: the test broke it",
  );
  await expect(page.locator('.starting')).toHaveCount(0);
});
