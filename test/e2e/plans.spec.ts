// Plan cards (PLAN.md §5.61), on a desktop viewport and an emulated phone: a card made from a
// commented move's menu in the test repertoire (2.Nf3, "A made-up comment" with an arrow), reviewed
// in the game cards' session (Show plan, then Good), and removed from the same menu; the events synced.
import { test, expect } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { studyMenu } from './board.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

const KEY = 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -';

test('a plan card made from a move’s menu, reviewed with the game cards, and removed', async ({ page }) => {
  const { git, github } = world();
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('button.chip')).toHaveText(/^synced/);
  await page.evaluate(() => (location.hash = '#/study/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3'));
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3');
  await studyMenu(page, 'Make a plan card');

  await page.evaluate(() => (location.hash = '#/games'));
  await expect(page.getByTestId('games-queue')).toContainText('0 due · 1 new today');
  await page.getByRole('link', { name: 'Review' }).click();
  const card = page.locator('.game-card');
  await expect(card).toHaveAttribute('data-kind', 'plan');
  await expect(card).toHaveAttribute('data-card', `p|${KEY}`);
  await expect(card).toContainText('Recall the plan');
  await expect(card.locator('.cg-wrap')).toHaveClass(/orientation-black/);
  await page.getByRole('button', { name: 'Show plan' }).click();
  await expect(page.getByTestId('plan-notes')).toHaveText('A made-up comment');
  await page.getByRole('button', { name: 'Good' }).click();
  await expect(page.getByTestId('games-done')).toContainText('1 card answered: 0 easy, 1 good, 0 hard, 0 again');

  await page.evaluate(() => (location.hash = '#/study/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3'));
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3');
  await studyMenu(page, 'Remove the plan card');
  await page.locator('button.chip').click();
  const log = () =>
    [...git.textsOf()]
      .filter(([p]) => p.startsWith('progress/'))
      .map(([, t]) => t)
      .join('');
  await expect.poll(log, { timeout: 15_000 }).toContain(`"k":"plan","card":"p|${KEY}","on":false,"side":"black"`);
  expect(log()).toContain(`"k":"plan","card":"p|${KEY}","on":true,"side":"black"`);
  expect(log()).toContain(`"k":"review","card":"p|${KEY}","g":3`);
});

test('a plan card’s comment has its lines clickable, as in the Read view (§5.175)', async ({ page, isMobile }) => {
  const { git, github } = world();
  const path = 'studies/Rep0Najd/Ch1Najdf.pgn';
  const text = git.textsOf().get(path)!.replace('{ A made-up comment }', '{ A made-up comment. Or (Or 2. c3 Nf6 3. e5 Nd5) and (Not 2... d6 since 3. d4 cxd4). }');
  git.commitIfHead(git.head, 'Lines in the comment', new Map([[path, text]]), []);
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('button.chip')).toHaveText(/^synced/);
  await page.evaluate(() => (location.hash = '#/study/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3'));
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3');
  await studyMenu(page, 'Make a plan card');
  await page.evaluate(() => (location.hash = '#/games'));
  await page.getByRole('link', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Show plan' }).click();
  const notes = page.getByTestId('plan-notes');
  // The lines are clickable: the first replaces 2.Nf3, the second starts after it.
  await expect(notes.locator('.line-move')).toHaveText(['c3', 'Nf6', 'e5', 'Nd5', 'd6', 'd4', 'cxd4']);
  const bar = page.getByRole('group', { name: 'Line from the comment' });
  await notes.locator('.line-move', { hasText: 'Nf6' }).click();
  await expect(bar).toContainText('From the comment: c3 Nf6');
  await notes.locator('.line-move', { hasText: 'cxd4' }).click();
  await expect(bar).toContainText('From the comment: d6 d4 cxd4');
  if (isMobile) await bar.getByRole('button', { name: 'Back' }).click();
  else await page.keyboard.press('Escape');
  await expect(bar).toHaveCount(0);
  // The card still grades.
  await page.getByRole('button', { name: 'Good' }).click();
  await expect(page.getByTestId('games-done')).toContainText('1 card answered');
});
