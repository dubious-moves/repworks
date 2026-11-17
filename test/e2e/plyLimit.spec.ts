// The ply limit (PLAN.md §5.194), on a desktop viewport and an emulated phone, with the fixture
// repertoire of train.spec.ts (a Black Sicilian: 1... c5 due, 2... d6 suspended, 3... cxd4 new). A
// line picked stops at the limit and waits: "Continue" walks on past it, "Finish" ends there. The
// chip in the counters' row shows the limit, its ✕ takes it off, and the training settings set it.
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

const DAY = new Date('2026-12-01T10:00:00Z');
const LINE = `#/train/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3,d6,d4,cxd4`;

async function setUp(page: Page, plyLimit: number) {
  await walkOnce(page, { plyLimit });
  const { github } = world();
  await page.clock.install({ time: DAY });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
}

const feedback = (page: Page) => page.locator('.train-feedback');
const phase = (page: Page) => page.locator('.train-grid');
async function play(page: Page, from: string, to: string) {
  await clickSquare(page, from, 'black');
  await clickSquare(page, to, 'black');
}

test('a line picked stops at the ply limit and waits; Continue walks on to its end', async ({ page }) => {
  await setUp(page, 4);
  await page.goto(`${site.url}${LINE}`);
  await expect(page.locator('.ply-limit-chip')).toContainText('Ply limit 4');
  // From the start: 1. e4, then 1... c5 asked; 2. Nf3, and 2... d6 (always played for the user).
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await play(page, 'c7', 'c5');
  await expect(phase(page)).toHaveAttribute('data-phase', 'lineDone');
  await expect(feedback(page)).toHaveText('Ply limit: 2 more moves in this line');
  await expect(page.locator('.train-line')).toContainText('2. Nf3 d6');
  await expect(page.locator('.train-line')).not.toContainText('3. d4');
  // It waits for a press, whatever "At a line's end" says: the session's only line.
  await page.waitForTimeout(2000);
  await expect(phase(page)).toHaveAttribute('data-phase', 'lineDone');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(feedback(page)).toHaveText('New move: play cxd4');
  await play(page, 'c5', 'd4');
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('Line done');
});

test('Finish at the ply limit ends the line there; the chip takes the limit off, and the settings set it', async ({ page }) => {
  await setUp(page, 4);
  await page.goto(`${site.url}${LINE}`);
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await play(page, 'c7', 'c5');
  await expect(phase(page)).toHaveAttribute('data-phase', 'lineDone');
  await page.getByRole('button', { name: 'Finish' }).first().click();
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('Line done');
  await expect(page.locator('.train-line')).not.toContainText('3. d4');

  // The limit taken off by the chip, and again: the line is walked to its end.
  await page.getByRole('button', { name: 'Take the ply limit off' }).click();
  await expect(page.locator('.ply-limit-chip')).toHaveCount(0);
  await page.getByRole('button', { name: 'Train again' }).click();
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await play(page, 'c7', 'c5');
  await expect(feedback(page)).toHaveText('New move: play cxd4');

  // Set again in the training settings, which name the move it stops after.
  await page.getByRole('button', { name: 'Training settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Training settings' });
  await dialog.getByLabel('Ply limit').fill('6');
  await expect(dialog.getByTestId('ply-limit-help')).toContainText('Ply 6: after Black’s 3rd move');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.ply-limit-chip')).toContainText('Ply limit 6');
});
