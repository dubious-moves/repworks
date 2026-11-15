// Stockfish's version (PLAN.md §5.75): 18 by default; Stockfish 19 chosen in the engine settings
// downloads its own build and runs it on the study page, and the choice stays after a reload.
// The same for Stockfish 19 with its full net (§5.186), on the desktop.
import { test, expect } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeEach(async () => {
  site = await serveSite();
});
test.afterEach(async () => {
  await site.close();
});

test('Stockfish 19 chosen: its build downloaded and searching, the choice kept', async ({ page }) => {
  test.setTimeout(60_000);
  const w = world();
  await serveGithub(page, w.github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Engine' });
  await expect(panel.locator('.engine-name')).toHaveText('SF18');
  await panel.getByRole('button', { name: 'Engine settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Engine settings' });
  const version = dialog.getByRole('group', { name: 'Version' });
  await expect(version.getByRole('button', { name: 'Stockfish 18' })).toHaveAttribute('aria-pressed', 'true');
  await version.getByRole('button', { name: 'Stockfish 19', exact: true }).click();
  await expect(dialog.getByText('Stockfish 19 (lite), on this device.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await panel.getByRole('switch', { name: 'Engine' }).check();
  await expect(panel.locator('.engine-name')).toHaveText('SF19');
  await expect(panel.locator('.engine-depth')).toHaveText(/^Depth ([1-9]\d)/, { timeout: 30_000 });
  expect(site.requests.some((r) => /\/engines\/stockfish-19-lite-single\.[0-9a-f]{10}\.wasm$/.test(r))).toBe(true);
  expect(site.requests.some((r) => /\/engines\/stockfish-18-lite-single\./.test(r))).toBe(false);
  await page.reload();
  await expect(panel.locator('.engine-name')).toHaveText('SF19');
});

test('Stockfish 19 with its full net chosen: the size said, its build downloaded and searching, the choice kept', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a desktop choice: 99 MB, and the same Chromium');
  test.setTimeout(120_000);
  const w = world();
  await serveGithub(page, w.github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Engine' });
  await panel.getByRole('button', { name: 'Engine settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Engine settings' });
  await dialog.getByRole('group', { name: 'Version' }).getByRole('button', { name: 'Stockfish 19, full net' }).click();
  await expect(dialog.getByText(/Stockfish 19 with its full net, on this device: stronger at the same depth than the lite builds, and a download of 99\.\d MB, once\./)).toBeVisible();
  await expect(dialog.locator('.engine-files', { hasText: 'Stockfish 19 full net ·' })).toHaveAttribute('data-stored', 'no');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await panel.getByRole('switch', { name: 'Engine' }).check();
  await expect(panel.locator('.engine-name')).toHaveText('SF19F');
  await expect(panel.locator('.engine-depth')).toHaveText(/^Depth ([1-9]\d)/, { timeout: 90_000 });
  expect(site.requests.some((r) => /\/engines\/stockfish-19-single\.[0-9a-f]{10}\.wasm$/.test(r))).toBe(true);
  expect(site.requests.some((r) => /\/engines\/stockfish-1[89]-lite-single\./.test(r))).toBe(false);
  await page.reload();
  await expect(panel.locator('.engine-name')).toHaveText('SF19F');
});
