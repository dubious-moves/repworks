// A bad record doesn't blank the page (the owner's phone, 2026-10-07: the home screen empty after
// an update, as Preact leaves it below an uncaught render error). A migrated state whose due time
// is past what a Date holds made the debug panel's card table throw; now the time reads "?", and
// a part that still fails shows its error in place (src/ui/Guard.tsx).
import { test, expect } from '@playwright/test';
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

// mistake-lab's state with a billion scheduled days: valid as an event, its due beyond any Date.
const SNAPSHOT = '{"v":1,"n":9,"t":"2026-10-06T10:00:00.000Z","k":"snapshot","card":"m|Far00001_4","st":2,"stab":30,"diff":5,"reps":3,"lapses":0,"sched":1000000000,"last":"2026-10-01T10:00:00.000Z"}\n';

test('a card due past what a Date holds: home is drawn, the debug table says "?"', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const files = fixtureFiles();
  files.set('progress/Desktop1/2026-10-05.jsonl', files.get('progress/Desktop1/2026-10-05.jsonl')! + SNAPSHOT);
  await serveGithub(page, new FakeGithub(new FakeGit(files), { repo: REPO, branch: 'main', token: TOKEN }));
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=phone`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await expect(page.getByRole('heading', { name: 'Studies' })).toBeVisible();
  await page.getByText('Settings and debug').click();
  await expect(page.locator('table.cards tr', { hasText: 'm|Far00001_4' }).locator('td').nth(2)).toHaveText('?');
  await expect(page.locator('.guard')).toHaveCount(0);
  expect(errors).toEqual([]);
});
