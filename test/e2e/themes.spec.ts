// The themes (src/ui/themes.css, src/app/theme.ts), on a desktop viewport and an emulated phone:
// one chosen in the settings is on <html> at once and after a reload; the styles gallery shows
// the app in a frame per theme, the frames follow each other, and they never reach GitHub.
import { test, expect, type Locator, type Page } from '@playwright/test';
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

/**
 * WCAG 2's contrast of an element's text with what is behind it: the first opaque background up
 * its ancestors (a half-transparent one is passed over), else the page's.
 */
const contrast = (target: Locator) =>
  target.evaluate((el) => {
    const rgba = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const luminance = ([r, g, b]: number[]) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r!) + 0.7152 * f(g!) + 0.0722 * f(b!);
    };
    let behind: number[] | undefined;
    for (let e: Element | null = el; e && !behind; e = e.parentElement) {
      const c = rgba(getComputedStyle(e).backgroundColor);
      if (c.length === 3 || (c.length === 4 && c[3] === 1)) behind = c;
    }
    behind ??= rgba(getComputedStyle(document.documentElement).backgroundColor);
    const [a, b] = [luminance(rgba(getComputedStyle(el).color)), luminance(behind)];
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });

test('a theme chosen in the settings is shown at once and kept', async ({ page }) => {
  await setUp(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'forest');
  const dark = await background(page);
  await page.locator('details.settings > summary').click();
  await page.getByLabel('Theme').selectOption('paper');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
  expect(await background(page)).not.toBe(dark);
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'light');
  await page.reload();
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');
});

// The light theme (PLAN.md §5.156): a transparent button kept the accent's near-white text, so the
// training screen's buttons, its line list and the games' filters were white on white (1.0 to 1.1:1);
// the sync chip's warning was amber on the phone's dark green bar (1.8:1).
test('on the light theme the training screen, its line list, the games’ filters and the offline chip read clearly', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('repworks-theme', 'paper'));
  await setUp(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'paper');

  await page.goto(`${site.url}#/train`);
  await expect(page.locator('.train-grid')).toHaveAttribute('data-phase', 'ask');
  for (const name of [/^Show and grade/, 'Read', 'Analyse', 'Stop']) {
    expect(await contrast(page.getByRole('button', { name, exact: typeof name === 'string' }).first())).toBeGreaterThanOrEqual(4.5);
  }
  await page.locator('.train-list-head').click();
  // The line's own chapter comes unfolded.
  await expect(page.locator('.line-list-line').first()).toBeVisible();
  for (const part of ['.train-list-head', '.line-list-toggle', '.line-list-line']) {
    expect(await contrast(page.locator(part).first()), part).toBeGreaterThanOrEqual(4.5);
  }

  await page.goto(`${site.url}#/games`);
  expect(await contrast(page.locator('label.chip', { hasText: 'blitz' }))).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(page.getByRole('button', { name: 'Hide', exact: true }))).toBeGreaterThanOrEqual(4.5);

  // Offline: in the top bar on the phone, in the footer on a desktop.
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.sync-chip')).toHaveText('offline');
  expect(await contrast(page.locator('.sync-chip'))).toBeGreaterThanOrEqual(4.5);
});

test('the gallery: a frame per theme, following each other, never syncing', async ({ page }) => {
  await setUp(page);
  const fromFrames: string[] = [];
  page.on('request', (r) => {
    if (r.url().startsWith('https://api.github.com/') && r.frame() !== page.mainFrame()) fromFrames.push(r.url());
  });
  await page.goto(`${site.url}styles.html`);
  const frames = page.locator('iframe[data-theme-frame]');
  await expect(frames).toHaveCount(8);
  for (const id of ['forest', 'slate', 'walnut', 'midnight', 'paper', 'mist', 'grove', 'fjord']) {
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
  await expect(frames).toHaveCount(7);
  await page.getByRole('region', { name: 'Midnight' }).getByRole('button', { name: 'Use this one' }).click();
  expect(await page.evaluate(() => localStorage.getItem('repworks-theme'))).toBe('midnight');
  expect(fromFrames).toEqual([]);
});

/** A board piece's look: its box against the board's, how far it is off its square's centre, its filter and background. */
const look = (l: Locator) =>
  l.evaluate((el) => {
    const b = el.getBoundingClientRect();
    const c = el.closest('cg-container')?.getBoundingClientRect() ?? b;
    const [x, y] = ((el as HTMLElement).style.transform.match(/-?[\d.]+/g) ?? ['0', '0']).map(Number);
    const square = c.width / 8;
    return {
      width: b.width / c.width,
      // How far the piece's centre is from its square's (chessground's translate is the square's corner).
      offCentre: Math.hypot(b.x + b.width / 2 - (c.x + x! + square / 2), b.y + b.height / 2 - (c.y + y! + square / 2)),
      filter: getComputedStyle(el).filter,
      background: getComputedStyle(el).backgroundImage,
    };
  });
const rim = (filter: string) => Number(/\) (-?[\d.]+)px/.exec(filter)![1]);

test('the boards’ look: piece set, size, outline and the slate board, as usual until changed, and kept', async ({ page }) => {
  await setUp(page);
  const html = page.locator('html');
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  const black = page.locator('.cv-board cg-board piece.black').first();
  const white = page.locator('.cv-board cg-board piece.white').first();
  const board = page.locator('.cv-board cg-board');
  await expect(black).toBeVisible();
  const usual = { black: await look(black), board: await look(board) };
  expect(usual.black.width).toBeCloseTo(0.125, 3);
  expect(usual.black.filter).toBe('none');
  expect(usual.board.background).not.toContain('conic');
  for (const a of ['data-pieces', 'data-outline', 'data-piece-set', 'data-board']) await expect(html).not.toHaveAttribute(a, /.*/);

  await page.goto(`${site.url}#/`);
  await page.locator('details.settings > summary').click();
  const preview = page.getByTestId('board-look-preview').locator('piece.black.queen');
  const usualQueen = await look(preview);
  await page.getByLabel('Piece set').selectOption('staunty');
  await page.getByLabel('Piece size').fill('115');
  await page.getByLabel('Outline').fill('3');
  await page.getByLabel('High-contrast board').check();
  await expect(html).toHaveAttribute('data-piece-set', 'staunty');
  await expect(page.locator('link#piece-set')).toHaveAttribute('href', /pieces\/staunty\.css$/);
  await expect(page.locator('.board-look output').first()).toHaveText('115%');
  // The preview follows at once: another image, bigger, outlined.
  await expect.poll(async () => (await look(preview)).background).not.toBe(usualQueen.background);
  expect((await look(preview)).width).toBeCloseTo(0.14375, 3);
  expect((await look(preview)).filter).toContain('drop-shadow');

  await page.reload();
  await expect(html).toHaveAttribute('data-piece-set', 'staunty');
  await expect(html).toHaveAttribute('data-board', 'contrast');
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(black).toBeVisible();
  await expect.poll(async () => (await look(black)).background).not.toBe(usual.black.background);
  const after = { black: await look(black), white: await look(white), board: await look(board) };
  expect(after.black.background).toContain('data:image/svg+xml');
  expect(after.black.width).toBeCloseTo(0.14375, 3);
  expect(after.black.offCentre).toBeLessThan(1);
  expect(after.white.offCentre).toBeLessThan(1);
  // Sharp outlines (no blur): white around Black's pieces, black and thinner around White's, 3% and 1.35% of the square.
  expect(after.black.filter).toMatch(/drop-shadow\(rgb\(255, 255, 255\) [\d.]+px 0px 0px\)/);
  expect(after.white.filter).toMatch(/drop-shadow\(rgb\(0, 0, 0\) [\d.]+px 0px 0px\)/);
  const square = (await board.boundingBox())!.width / 8;
  expect(rim(after.black.filter)).toBeCloseTo(square * 0.03, 1);
  expect(rim(after.white.filter)).toBeCloseTo(square * 0.0135, 1);
  expect(after.board.background).toContain('rgb(95, 122, 142)');

  // Back to the usual: nothing left on <html>, nothing stored.
  await page.goto(`${site.url}#/`);
  await page.locator('details.settings > summary').click();
  await page.getByLabel('Piece set').selectOption('cburnett');
  await page.getByLabel('Piece size').fill('100');
  await page.getByLabel('Outline').fill('0');
  await page.getByLabel('High-contrast board').uncheck();
  for (const a of ['data-pieces', 'data-outline', 'data-piece-set', 'data-board']) await expect(html).not.toHaveAttribute(a, /.*/);
  await expect(page.locator('link#piece-set')).toHaveCount(0);
  expect(await page.evaluate(() => [localStorage.getItem('repworks-pieces'), localStorage.getItem('repworks-contrast-board')])).toEqual([null, null]);
});

test('the earlier "pieces easy to see from a distance" tick becomes 110% with an outline of 2', async ({ page }) => {
  await setUp(page);
  await page.evaluate(() => localStorage.setItem('repworks-big-pieces', '1'));
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-outline', '');
  await page.locator('details.settings > summary').click();
  await expect(page.getByLabel('Piece size')).toHaveValue('110');
  await expect(page.getByLabel('Outline')).toHaveValue('2');
  expect(await page.evaluate(() => localStorage.getItem('repworks-big-pieces'))).toBeNull();
});
