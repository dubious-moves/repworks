// The owner's third testing notes, on a desktop viewport and an emulated phone, with the fixture
// repertoire of train.spec.ts (a Black Sicilian: 1... c5 due, 2... d6 suspended, new moves after
// it): new moves shown as a sequence, stepped through and then played; a dialog closed by a click
// on its backdrop.
import { test, expect, type Page } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';
import { walkOnce } from './prefs.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

async function setUp(page: Page) {
  const { github } = world();
  await page.clock.install({ time: new Date('2026-12-01T10:00:00Z') });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
}

const feedback = (page: Page) => page.locator('.train-feedback');
const phase = (page: Page) => page.locator('.train-grid');
const arrows = (page: Page) => page.locator('cg-container svg.cg-shapes line');
async function play(page: Page, from: string, to: string) {
  await clickSquare(page, from, 'black');
  await clickSquare(page, to, 'black');
}

test('show sequence: the new move is played to watch, stepped back and forth, then found with no arrow', async ({ page }) => {
  await walkOnce(page);
  await setUp(page);
  await page.locator('.train-card').getByRole('button', { name: 'Training settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Training settings' });
  await dialog.locator('select[name="new-moves"]').selectOption('sequence');
  await expect(dialog.getByLabel('New moves in a sequence')).toHaveValue('5');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);

  await page.goto(`${site.url}#/train/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3,d6,d4,cxd4`);
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  // 1... c5 is due: asked. Then 3... cxd4, the line's only new move, is shown as a sequence.
  await play(page, 'c7', 'c5');
  await expect(feedback(page)).toHaveText('New move: watch it, then play it');
  await expect(phase(page)).toHaveAttribute('data-phase', 'previewed');
  await expect(page.locator('.train-line')).toContainText('3. d4 cxd4');
  const back = page.getByRole('button', { name: 'Back', exact: true });
  await back.click();
  await expect(page.locator('.train-line .muted')).toHaveText('1. e4 c5 2. Nf3 d6 3. d4');
  await expect(back).toBeDisabled();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.train-line')).toContainText('3. d4 cxd4');

  // Played from the sequence's start: asked with no arrow, and found.
  await page.getByRole('button', { name: 'Play it' }).click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await expect(page.locator('.train-line .muted')).toHaveText('1. e4 c5 2. Nf3 d6 3. d4');
  await expect(feedback(page)).toHaveText('New move: find it');
  await expect(arrows(page)).toHaveCount(0);
  await play(page, 'c5', 'd4');
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('1 new');
});

test('a dialog closes on a click on its backdrop, not on one inside it', async ({ page }) => {
  await setUp(page);
  await page.locator('.train-card').getByRole('button', { name: 'Training settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Training settings' });
  const box = (await dialog.boundingBox())!;
  // Inside, in its padding: it stays.
  await page.mouse.click(box.x + 4, box.y + 4);
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
});
