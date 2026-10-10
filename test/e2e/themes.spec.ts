// The themes (src/ui/themes.css, src/app/theme.ts), on a desktop viewport and an emulated phone:
// one chosen in the settings is on <html> at once and after a reload; the styles gallery shows
// the app in a frame per theme, the frames follow each other, and they never reach GitHub.
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
  const { github } = world();
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
}

const background = (page: Page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

test('a theme chosen in the settings is shown at once and kept', async ({ page }) => {
  await setUp(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest');
  const dark = await background(page);
  await page.getByText('Settings and debug').click();
  await page.getByLabel('Theme').selectOption('paper');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  expect(await background(page)).not.toBe(dark);
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'light');
  await page.reload();
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
});

test('the gallery: a frame per theme, following each other, never syncing', async ({ page }) => {
  await setUp(page);
  const fromFrames: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith('https://api.github.com/') && r.frame() !== page.mainFrame()) fromFrames.push(r.url());
  });
  await page.goto(`${site.url}styles.html`);
  const frames = page.locator('iframe[data-theme-frame]');
  await expect(frames).toHaveCount(5);
  for (const id of ['forest', 'slate', 'walnut', 'midnight', 'paper']) {
    const f = page.frameLocator(`iframe[data-theme-frame="${id}"]`);
    await expect(f.locator('html')).toHaveAttribute('data-theme', id);
    await expect(f.locator('.study-card').first()).toBeVisible();
  }

  // A screen picked above opens in every frame.
  await page.getByRole('navigation', { name: 'Screens' }).getByRole('button', { name: 'Storm' }).click();
  for (const f of page.frames().filter((x) => x !== page.mainFrame())) await expect.poll(() => f.evaluate(() => location.hash)).toBe('#/storm');

  // A screen opened in one frame opens in the others.
  const slate = page.frames().find((x) => x.url().includes('theme=slate'))!;
  await slate.evaluate(() => (location.hash = '#/games'));
  for (const f of page.frames().filter((x) => x !== page.mainFrame())) await expect.poll(() => f.evaluate(() => location.hash)).toBe('#/games');

  // A theme left out goes; "Use this one" makes it the app's.
  await page.getByRole('group', { name: 'Themes' }).getByLabel('Walnut').uncheck();
  await expect(frames).toHaveCount(4);
  await page.getByRole('region', { name: 'Midnight' }).getByRole('button', { name: 'Use this one' }).click();
  expect(await page.evaluate(() => localStorage.getItem('repworks-theme'))).toBe('midnight');
  expect(fromFrames).toEqual([]);
});
