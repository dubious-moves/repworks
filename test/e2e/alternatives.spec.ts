// Alternative moves (PLAN.md §5.18), on a desktop viewport and an emulated phone, with the fixture
// repertoire of train.spec.ts (a Black Sicilian: 1... c5 due): a wrong move saved as an
// alternative, then played again in the Interactive view and taken back for free; listed in the study's
// card panel, and removed there; shown in blue by Space in show and grade (§5.114). A misclick taken
// back, by its button and by Backspace.
import { test, expect, type Page } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare, openMoveMenu } from './board.ts';
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

  // Show and grade (1), then Space (§5.114): the alternative in blue, and gone at a second press.
  const shapes = page.locator('.train-board cg-container svg.cg-shapes line');
  await page.keyboard.press('1');
  await expect(page.getByRole('button', { name: /^Alternatives/ })).toBeVisible();
  await page.keyboard.press(' ');
  await expect(feedback(page)).toHaveText('Alternatives: e5');
  await expect(shapes).toHaveCount(1);
  await expect(shapes).toHaveAttribute('stroke', '#003088');
  await page.keyboard.press(' ');
  await expect(shapes).toHaveCount(0);
  // The move shown takes them away (the board moves); Space then shows them again, for the
  // position the move was asked in.
  await page.keyboard.press(' ');
  await expect(shapes).toHaveCount(1);
  await page.keyboard.press('2');
  await expect(phase(page)).toHaveAttribute('data-phase', 'shown');
  await expect(feedback(page)).toHaveText('Play c5');
  await expect(shapes).toHaveCount(0);
  await page.keyboard.press(' ');
  await expect(feedback(page)).toHaveText('Alternatives: e5');
  await expect(shapes).toHaveCount(1);
  await expect(shapes).toHaveAttribute('stroke', '#003088');

  // The menu of 1... c5 in the study lists it; its item removes it.
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf?at=e4,c5`);
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5');
  await openMoveMenu(page);
  await page.getByRole('menuitem', { name: 'Remove alternative e5' }).click();
  await expect(page.locator('.cv-board .feedback')).toHaveText('e5 removed from the alternatives: it counts as a wrong move again');
  await openMoveMenu(page);
  await expect(page.getByRole('menuitem', { name: /^Remove alternative/ })).toHaveCount(0);
});

test('a misclick is taken back: not counted wrong, not saved as an alternative', async ({ page }) => {
  const { github } = world();
  await page.clock.install({ time: new Date('2026-12-01T10:00:00Z') });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);

  // 1... c5 is asked: 1... e5 by the button, then 1... d5 by Backspace, are misclicks; c5 then is right first time.
  await page.goto(`${site.url}${LINE}`);
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await play(page, 'e7', 'e5');
  await expect(feedback(page)).toHaveText('Not in your repertoire: try again');
  // Beside the note on a phone (the panel's buttons are below the fold), in the panel on a desktop.
  await page.getByRole('button', { name: test.info().project.name === 'phone' ? 'Misclick' : 'Misclick: take e5 back', exact: true }).click();
  await expect(feedback(page)).toHaveText('e5 taken back as a misclick: try again');
  await expect(page.getByRole('button', { name: /^Misclick/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Undo: e5/ })).toHaveCount(0);
  await play(page, 'd7', 'd5');
  await expect(phase(page)).toHaveAttribute('data-phase', 'wrong');
  await page.keyboard.press('Backspace');
  await expect(feedback(page)).toHaveText('d5 taken back as a misclick: try again');
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await play(page, 'c7', 'c5');
  await expect(page.getByRole('button', { name: 'Pin this mistake' })).toHaveCount(0);

  // e5 is no alternative: wrong again in the Interactive view.
  await page.goto(`${site.url}#/play/Rep0Najd/Ch1Najdf?at=e4`);
  await expect(phase(page)).toHaveAttribute('data-phase', 'ask');
  await play(page, 'e7', 'e5');
  await expect(feedback(page)).toHaveText('Not in your repertoire: try again');
});

test('an alternative is added from the study: the move played on the board is saved, and the chapter is not changed', async ({ page }) => {
  const { github } = world();
  await page.clock.install({ time: new Date('2026-12-01T10:00:00Z') });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);

  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf?at=e4,c5`);
  const adding = page.locator('.cv-board .alt-adding');
  // Counted once the notation is drawn: before it, there are none.
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5');
  const variations = await page.locator('.notation .variation').count();
  await openMoveMenu(page);
  await page.getByRole('menuitem', { name: 'Add alternative…' }).click();
  await expect(adding).toContainText('Play the alternative on the board.');
  // The board shows the position before 1... c5, and the notation still stands at c5.
  await play(page, 'e7', 'e5');
  await expect(page.locator('.cv-board .feedback')).toHaveText('e5 saved as an alternative');
  await expect(adding).toHaveCount(0);
  await openMoveMenu(page);
  await expect(page.getByRole('menuitem', { name: 'Remove alternative e5' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5');
  await expect(page.locator('.notation .variation')).toHaveCount(variations);

  // The repertoire's own move, and one saved already, are refused with a reason.
  await openMoveMenu(page);
  await page.getByRole('menuitem', { name: 'Add alternative…' }).click();
  await play(page, 'c7', 'c5');
  await expect(page.locator('.cv-board .feedback')).toHaveText("c5 is the repertoire's move here already");
  await openMoveMenu(page);
  await page.getByRole('menuitem', { name: 'Add alternative…' }).click();
  await page.keyboard.press('Escape');
  await expect(adding).toHaveCount(0);
  // Cancel does the same.
  await openMoveMenu(page);
  await page.getByRole('menuitem', { name: 'Add alternative…' }).click();
  await adding.getByRole('button', { name: 'Cancel' }).click();
  await expect(adding).toHaveCount(0);
});
