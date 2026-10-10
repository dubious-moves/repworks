// The engine panel on the study page (PLAN.md §5.31), with a scripted fake engine (engine.ts) in
// place of Stockfish: the switch remembered, the lines with evals from White's side, the eval
// bar and arrows, a line previewed and added to the chapter, the threat, a new position mid-search
// stopping the old search first, nothing running in training, and the phone's layout.
import { test, expect, type Page } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';
import { studyMenu } from './board.ts';
import { AFTER_E4, commands, fakeEngine, START, START_THREAT } from './engine.ts';

let site: SiteServer;
test.beforeEach(async () => {
  site = await serveSite({ engine: fakeEngine() });
});
test.afterEach(async () => {
  await site.close();
});

async function openChapter(page: Page) {
  await serveGithub(page, world().github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
  await expect(page.locator('.notation')).toContainText('A made-up comment');
}

const positions = (s: SiteServer) => commands(s.requests).filter((c) => c.startsWith('position fen ')).map((c) => c.slice(13).split(' ').slice(0, 4).join(' '));

test('the engine’s lines, eval bar and arrows; a line previewed and added; the switch remembered', async ({ page }) => {
  await openChapter(page);
  const panel = page.getByRole('region', { name: 'Engine' });
  // Off by default: nothing asked.
  await expect(panel.getByRole('switch', { name: 'Engine' })).not.toBeChecked();
  await panel.getByRole('switch', { name: 'Engine' }).check();
  const lines = panel.locator('.engine-line');
  await expect(lines).toHaveCount(3);
  await expect(panel.locator('.engine-depth')).toHaveText('Depth 20');
  await expect(lines.nth(0)).toHaveText(/^\+0\.30\s*1\. e4 e5 2\. Nf3 Nc6/);
  await expect(lines.nth(1)).toHaveText(/^\+0\.25\s*1\. d4 d5 2\. c4/);
  await expect(lines.nth(2).locator('.engine-eval')).toHaveText('-3.00');
  expect(commands(site.requests).slice(0, 3)).toEqual(['uci', 'setoption name Hash value ' + (page.viewportSize()!.width <= 768 ? 16 : 32), 'isready']);
  expect(commands(site.requests)).toContain('setoption name MultiPV value 3');
  expect(commands(site.requests)).toContain('go depth 20 movetime 8000');
  // White's share of the bar at +0.30 (Lichess's formula: 52.8%), and the arrows: the best and one more (g4, three pawns down, is too far behind).
  const share = Number(await page.locator('.eval-bar').getAttribute('data-white'));
  expect(share).toBeCloseTo(52.8, 1);
  await expect(page.locator('.cg-wrap svg.cg-shapes line')).toHaveCount(2);

  // A line's move previewed: the board shows it, nothing is added until Add.
  await lines.nth(1).getByRole('button', { name: 'd5' }).click();
  const bar = page.getByRole('group', { name: 'Line from the engine' });
  await expect(bar).toContainText('Engine: d4 d5');
  await expect(page.locator('.cg-wrap svg.cg-shapes line')).toHaveCount(0);
  await bar.getByRole('button', { name: 'Previous move in the line' }).click();
  await expect(bar).toContainText('Engine: d4');
  await bar.getByRole('button', { name: 'Next move in the line' }).click();
  await expect(page.locator('.notation')).not.toContainText('d4 d5');
  await bar.getByRole('button', { name: 'Add' }).click();
  await expect(bar).toHaveCount(0);
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'd4 d5');
  await expect(page.locator('.notation .variation').first()).toHaveText('1. d4 d5');
  await studyMenu(page, 'Undo');
  await expect(page.locator('.notation')).not.toContainText('1. d4 d5');

  // Remembered on this device.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Engine' }).getByRole('switch', { name: 'Engine' })).toBeChecked();
  await expect(page.getByRole('region', { name: 'Engine' }).locator('.engine-line')).toHaveCount(3);
});

test('a new position mid-search stops the old one first; Black to move is scored from White’s side; the threat', async ({ page }) => {
  await openChapter(page);
  const panel = page.getByRole('region', { name: 'Engine' });
  await panel.getByRole('switch', { name: 'Engine' }).check();
  await expect(panel.locator('.engine-depth')).toHaveText('Depth 20');
  // The start's search is done; on to 1. e4.
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(panel.locator('.engine-line').first()).toHaveText(/^\+0\.30\s*1… c5 2\. Nf3 d6/);
  await expect(panel.locator('.engine-line').nth(2).locator('.engine-eval')).toHaveText('+0.40');
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4');
  await expect(panel.locator('.engine-depth')).toHaveText('Depth 20');
  // Back to the start and on to 1. e4 again: both from the cache, nothing asked.
  const before = commands(site.requests).length;
  await page.getByRole('button', { name: 'Previous move' }).click();
  await expect(panel.locator('.engine-line').first()).toHaveText(/^\+0\.30\s*1\. e4/);
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(panel.locator('.engine-line').first()).toHaveText(/1… c5/);
  await page.waitForTimeout(300);
  expect(commands(site.requests).slice(before), JSON.stringify(commands(site.requests))).toEqual([]);
  expect(positions(site)).toEqual([START, AFTER_E4]);

  // The threat at the start: the position with Black to move, one red arrow.
  await page.getByRole('button', { name: 'Start' }).click();
  await panel.getByRole('button', { name: 'Show threat' }).click();
  await expect(panel.locator('.engine-line')).toHaveCount(1);
  await expect(panel.locator('.engine-line')).toHaveText(/^Threat\s*1… e5 2\. Nf3/);
  await expect(page.locator('.eval-bar')).toHaveCount(0);
  await expect(page.locator('.cg-wrap svg.cg-shapes line')).toHaveCount(1);
  expect(positions(site)).toContain(START_THREAT);
  await panel.getByRole('button', { name: 'Show threat' }).click();
  await expect(panel.locator('.engine-line')).toHaveCount(3);
});

test('a position changed while the engine searches: stop, then the new position', async ({ page }) => {
  // A slow engine (3 s a search), so the move is always made while the start is searched.
  await site.close();
  site = await serveSite({ engine: fakeEngine(3000) });
  await openChapter(page);
  const panel = page.getByRole('region', { name: 'Engine' });
  await panel.getByRole('switch', { name: 'Engine' }).check();
  // Straight on, while the start's search runs.
  await expect.poll(() => commands(site.requests)).toContain('go depth 20 movetime 8000');
  await page.getByRole('button', { name: 'Next move' }).click();
  await expect(panel.locator('.engine-line').first()).toHaveText(/1… c5/);
  const cmds = commands(site.requests).filter((c) => c.startsWith('position') || c === 'stop' || c.startsWith('go'));
  expect(cmds.slice(0, 5)).toEqual([`position fen ${START} 0 1`, 'go depth 20 movetime 8000', 'stop', `position fen ${AFTER_E4} 0 1`, 'go depth 20 movetime 8000']);
});

test('nothing runs in training; the panel fits the phone', async ({ page }) => {
  await openChapter(page);
  const panel = page.getByRole('region', { name: 'Engine' });
  await panel.getByRole('switch', { name: 'Engine' }).check();
  await expect(panel.locator('.engine-line')).toHaveCount(3);
  const widths = await page.evaluate(() => [...document.querySelectorAll('.engine, .engine *, .eval-bar')].map((e) => e.getBoundingClientRect().right));
  expect(Math.max(...widths)).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
  await page.getByRole('button', { name: 'Train', exact: true }).click();
  await expect(page.locator('.train-grid')).toBeVisible();
  const n = commands(site.requests).length;
  await page.waitForTimeout(600);
  expect(commands(site.requests).slice(n).filter((c) => c.startsWith('go'))).toEqual([]);
  await expect(page.getByRole('region', { name: 'Engine' })).toHaveCount(0);
});
