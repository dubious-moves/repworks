// Lc0 vs Maia from a move (PLAN.md §5.144), with the real Lc0 network and Maia in their workers
// and a fake Lichess explorer: the move menu's item, the one-time download, the line as it is
// decided (the database's most played move where it has games, Lc0's search on its side, Maia
// where the database has none), Stop, and the line added to the chapter.
import { test, expect, type Page } from '@playwright/test';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { serveGithub, world } from './github.ts';
import { fakeExplorer, lichessLogin, serveExplorer } from './explorer.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeEach(async () => {
  site = await serveSite();
});
test.afterEach(async () => {
  await site.close();
});

// After 1. e4 c5 2. Nf3 d6 3. d4 cxd4: White to move, people's move from 5,000 games.
const AFTER_CXD4 = 'rnbqkbnr/pp2pppp/3p4/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq -';

async function openChapter(page: Page) {
  const ex = fakeExplorer();
  ex.games.set(AFTER_CXD4, [
    { san: 'Nxd4', uci: 'f3d4', white: 2000, draws: 1500, black: 1000 },
    { san: 'Qxd4', uci: 'd1d4', white: 200, draws: 200, black: 100 },
  ]);
  await serveGithub(page, world().github);
  await serveExplorer(page, ex);
  await lichessLogin(page);
  // Lc0's search kept short: 100 nodes a move.
  await page.addInitScript(() => localStorage.getItem('repworks-continuation') ?? localStorage.setItem('repworks-continuation', JSON.stringify({ plies: 4, nodes: 100 })));
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await page.getByRole('link', { name: 'Test repertoire', exact: true }).click();
  await expect(page.locator('.notation')).toContainText('A made-up comment');
  return ex;
}

const engineFiles = (s: SiteServer) => s.requests.filter((r) => /\/engines\/(791556|maia|ort-wasm)/.test(r));

test('Lc0 vs Maia from a move: the download, the line and its sources, Stop, added to the chapter', async ({ page }) => {
  test.setTimeout(240_000);
  await openChapter(page);
  await page.locator('.notation .move', { hasText: 'cxd4' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Lc0 vs Maia continuation' }).click();
  const dialog = page.getByRole('dialog', { name: 'Lc0 vs Maia from 3...cxd4' });
  // The chapter is Black's: Lc0 plays Black; the settings remembered.
  await expect(dialog.getByLabel('Lc0 plays')).toHaveValue('black');
  await expect(dialog.getByLabel('Moves')).toHaveValue('4');
  await expect(dialog.getByLabel('Lc0’s search')).toHaveValue('100');
  await expect(dialog).toContainText('blitz/rapid/classical, 1600–2500');

  // Nothing stored yet: Start asks for the download first.
  await dialog.getByRole('button', { name: 'Start' }).click();
  await expect(dialog).toContainText('one-time');
  expect(engineFiles(site)).toEqual([]);
  await dialog.getByRole('button', { name: /^Download .* and start$/ }).click();

  // 4. Nxd4 from the games (4,500 of 5,000), then Lc0's move, then Maia's where the fake has no
  // games, then Lc0's again.
  const moves = dialog.getByRole('list', { name: 'The continuation' }).getByRole('listitem');
  await expect(moves).toHaveCount(4, { timeout: 180_000 });
  await expect(moves.nth(0)).toHaveText('4. Nxd4 Lichess · 90% of 5,000 games');
  // Lc0's share of the visits, its nodes (fewer once no other move could catch up), its eval White's.
  await expect(moves.nth(1)).toHaveText(/^4\.\.\.\S+ Lc0 · \d+(\.\d)?% of (100 nodes|\d\d nodes \(decided early\)) · [+−-]?\d+\.\d\d$/);
  await expect(moves.nth(1)).toHaveClass(/lc0/);
  await expect(moves.nth(2)).toHaveText(/^5\. \S+ Maia \d+ · \d+(\.\d)?% \(no games\)$/);
  await expect(moves.nth(3)).toHaveText(/^5\.\.\.\S+ Lc0 · /);
  expect(engineFiles(site).length).toBeGreaterThanOrEqual(4);

  // Run again, stopped while Lc0 searches: what was decided stays.
  const line = await moves.allTextContents();
  await dialog.getByRole('button', { name: 'Run again' }).click();
  await expect(dialog.getByRole('status')).toContainText('Lc0 searching', { timeout: 60_000 });
  await dialog.getByRole('button', { name: 'Stop' }).click();
  await expect(dialog.getByRole('status')).toHaveText('Stopped.');
  await expect(moves).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Run again' }).click();
  await expect(moves).toHaveCount(4, { timeout: 120_000 });
  // The same position, the same line.
  expect(await moves.allTextContents()).toEqual(line);

  await dialog.getByRole('button', { name: 'Add to the chapter' }).click();
  await expect(dialog).toHaveCount(0);
  const sans = line.map((t) => /^\d+\.(?:\.\.)?\s?(\S+)/.exec(t)![1]!);
  // The board on the line's last move, the line in the notation after 3...cxd4.
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', ['e4 c5 Nf3 d6 d4 cxd4', ...sans].join(' '));
  for (const san of sans) await expect(page.locator('.notation')).toContainText(san);
});
