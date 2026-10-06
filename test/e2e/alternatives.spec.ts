// Alternative moves (PLAN.md §5.18), on a desktop viewport and an emulated phone, with the fixture
// repertoire of train.spec.ts (a Black Sicilian: 1... c5 due): a wrong move saved as an
// alternative, then played again in the Interactive view and taken back for free; listed in the study's
// card panel, and removed there.
import { test, expect, type Page } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

const feedback = (page: Page) => page.locator('.train-feedback');
const phase = (page: Page) => page.locator('.train-grid');
async function play(page: Page, from: string, to: string) {
  await clickSquare(page, from, 'black');
  await clickSquare(page, to, 'black');
}
const LINE = '#/train/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3,d6,d4,cxd4';

test('a wrong move saved as an alternative is free next time, and is listed and removed in the study', async ({ page }) => {
  const { github } = world();
  await page.clock.install({ time: new Date('2026-12-01T10:00:00Z') });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);

  // 1... c5 is asked: 1... e5 is wrong, then saved as an alternative; c5 then is right first time.
  await page.goto(`${site.url}${LINE}`);
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await play(page, 'e7', 'e5');
  await expect(feedback(page)).toHaveText('Not in your repertoire: try again');
  await page.getByRole('button', { name: 'Save e5 as alternative' }).click();
  await expect(feedback(page)).toHaveText('e5 saved as an alternative: try again');
  await expect(page.getByRole('button', { name: /^Undo: e5/ })).toBeVisible();
  await play(page, 'c7', 'c5');
  await expect(page.getByRole('button', { name: 'Pin this mistake' })).toHaveCount(0);

  // Later, the line played in the Interactive view (every own move asked): e5 is taken back for free.
  await page.goto(`${site.url}#/play/Rep0Najd/Ch1Najdf?at=e4`);
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await play(page, 'e7', 'e5');
  await expect(feedback(page)).toHaveText('e5: a good alternative, but your repertoire plays something else: try again');
  await expect(page.getByRole('button', { name: /^Save .* as alternative/ })).toHaveCount(0);
  await play(page, 'c7', 'c5');
  await expect(phase(page)).not.toHaveAttribute('data-phase', 'ask');

  // The study's card panel on 1... c5 lists it; its ✕ removes it.
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf?at=e4,c5`);
  const panel = page.getByRole('region', { name: 'Training card' });
  await expect(panel.locator('.card-alts')).toContainText('Alternatives here: e5');
  await panel.getByRole('button', { name: 'Remove e5 from the alternatives' }).click();
  await expect(panel.locator('.card-alts')).toHaveCount(0);
});
