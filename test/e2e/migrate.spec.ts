// The migration from mistake-lab (PLAN.md §5.64), on a desktop viewport and an emulated phone:
// mistake-lab's Gist faked with the migration's fixture (test/fixtures/mistake-lab), read with a
// token typed once; the dry run's report; the run's events and two studies synced; a second run
// refused.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

const DIR = join(import.meta.dirname, '..', 'fixtures', 'mistake-lab');
const PROGRESS = readFileSync(join(DIR, 'progress.json'), 'utf8');
const REVIEWS = readFileSync(join(DIR, 'reviews.json'), 'utf8');

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

test('the migration: the dry run’s report, the run synced with its studies, a second run refused', async ({ page }) => {
  const { git, github } = world();
  await serveGithub(page, github);
  const auth: string[] = [];
  await page.route('https://api.github.com/gists/**', async (route) => {
    auth.push(route.request().headers()['authorization'] ?? 'none');
    await route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' },
      body: JSON.stringify({ files: { 'mistakelab_progress.json': { size: 1, truncated: false, content: PROGRESS }, 'mistakelab_reviews.json': { size: 1, truncated: false, content: REVIEWS }, 'mistakelab_evals.json': { size: 1, truncated: false, content: '{}' } } }),
    });
  });
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await page.goto(`${site.url}#/migrate`);
  await page.getByLabel('mistake-lab’s gist').fill('0123456789abcdef0123');
  await page.getByLabel('GitHub token (optional; not kept)').fill('ghp_typedOnce');
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Dry run' }).click();
  const report = page.getByTestId('migrate-report');
  await expect(report).toContainText('5 game cards and 1 plan cards carried over');
  await expect(report).toContainText('1 repertoire reviews');
  await expect(report).toContainText('8/6K1/8/3pP3/8/2b5/8/k7 w - d6');
  await expect(page.getByTestId('migrate-message')).toContainText('no games file');
  expect(auth).toEqual(['Bearer ghp_typedOnce']);
  // Nothing written by the dry run.
  expect([...git.textsOf()].some(([p, t]) => p.startsWith('progress/') && t.includes('snapshot'))).toBe(false);

  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('migrate-message')).toContainText('events recorded, and the Notes study and the From mistake-lab study');
  await page.locator('.chip').click();
  await expect
    .poll(() => {
      const log = [...git.textsOf()].filter(([p]) => p.startsWith('progress/')).map(([, t]) => t).join('');
      return (log.match(/"k":"snapshot"/g) ?? []).length;
    }, { timeout: 15_000 })
    .toBe(6);
  const files = [...git.textsOf()];
  expect(files.some(([p, t]) => p.endsWith('study.json') && t.includes('Notes (from mistake-lab)'))).toBe(true);
  expect(files.some(([p, t]) => p.endsWith('.pgn') && t.includes('Keep the knight on f6'))).toBe(true);
  expect(files.some(([p, t]) => p.endsWith('study.json') && t.includes('"From mistake-lab"') && t.includes('repertoire'))).toBe(true);
  // The token isn't kept anywhere on the device.
  const kept = await page.evaluate(() => JSON.stringify(localStorage));
  expect(kept).not.toContain('ghp_typedOnce');

  // A second run is refused.
  await page.getByRole('button', { name: 'Dry run' }).click();
  await expect(report).toContainText('5 game cards');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByTestId('migrate-message')).toContainText('isn’t run twice');
});
