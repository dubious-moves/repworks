// Paused lines and a study prioritized (PLAN.md §5.70), on a desktop viewport and an emulated
// phone, with the fixture repertoire (a Black Sicilian: 1... c5 due, 2... d6 suspended, three new
// moves). A line paused from the line list shows ⏸ and leaves the home screen's new moves; picked,
// it is practised with nothing recorded, and Unpause brings it back. A chapter paused and unpaused
// as a whole.
import { test, expect, type Locator, type Page } from '@playwright/test';
import type { FakeGit } from '../support/fakeGit.ts';
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

const DAY = new Date('2026-12-01T10:00:00Z');
const ALAPIN = 'l|Rep0Najd|Ch2Alapn|e4 c5 c3 Nf6';

async function setUp(page: Page): Promise<FakeGit> {
  const { git, github } = world();
  await page.clock.install({ time: DAY });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return git;
}

function pushed(git: FakeGit): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const [path, text] of git.textsOf()) {
    if (!path.startsWith('progress/') || path.startsWith('progress/Desktop1/') || path.startsWith('progress/Phone001/')) continue;
    for (const line of text.split('\n')) if (line) out.push(JSON.parse(line) as Record<string, unknown>);
  }
  return out.sort((a, b) => (a['n'] as number) - (b['n'] as number));
}

async function sync(page: Page) {
  await page.locator('.chip').click();
  await expect(page.locator('.chip')).toHaveText(/^synced/);
}

/** The list, unfolded on the phone (it is open beside the board on a wide screen). */
async function lines(page: Page): Promise<Locator> {
  const list = page.getByRole('complementary', { name: 'Lines to train' });
  if ((await list.getByRole('button', { name: /Show lines/ }).count()) > 0) await list.getByRole('button', { name: /Show lines/ }).click();
  return list;
}

const asked = (page: Page) => expect(page.locator('.train-grid')).toHaveAttribute('data-phase', 'ask');

test('a line paused from the list: ⏸, out of the new moves, practised with nothing recorded, unpaused', async ({ page }) => {
  const git = await setUp(page);
  await expect(page.locator('.train-card h2')).toHaveText('Train: 1 due · 3 new');

  await page.goto(`${site.url}#/train/Rep0Najd`);
  await asked(page);
  const list = await lines(page);
  await list.getByRole('button', { name: 'Alapin', exact: true }).click();
  const row = list.locator('.line-list-row').filter({ hasText: 'Nf6' });
  await row.getByRole('button', { name: 'Line 1: more' }).click();
  await row.getByRole('button', { name: 'Pause' }).click();
  await expect(row.locator('.dot-paused')).toBeVisible();
  await expect(row).toContainText('Paused');
  const alapin = list.locator('.line-list-chapter').filter({ hasText: 'Alapin' });
  await expect(alapin).toContainText('1 paused');
  await expect(alapin.getByRole('button', { name: /Learn/ })).toHaveCount(0);
  await sync(page);
  expect(pushed(git).map((e) => [e['k'], e['card'], e['mark']])).toEqual([['line', ALAPIN, 'paused']]);

  // Picked, it is practised: its moves asked (a new one shown), nothing recorded.
  await row.locator('.line-list-line').click();
  await expect(page.locator('.train-paused')).toContainText('Paused: practice only');
  // 1... c5 is played up to the line's first need; the move never learned is shown, as a new
  // move is, but nothing is recorded for it.
  await expect(page.locator('.train-feedback')).toHaveText('New move: play Nf6');
  await clickSquare(page, 'g8', 'black');
  await clickSquare(page, 'f6', 'black');
  await expect(page.getByRole('region', { name: 'Session done' })).toContainText('Line done');
  await sync(page);
  expect(pushed(git)).toHaveLength(1);

  await page.locator('.train-paused').getByRole('button', { name: 'Unpause' }).click();
  await expect(page.locator('.train-paused')).toContainText('Unpaused');
  await sync(page);
  expect(pushed(git).map((e) => [e['k'], e['card'], e['mark']])).toEqual([
    ['line', ALAPIN, 'paused'],
    ['line', ALAPIN, 'none'],
  ]);
});

test('a chapter paused as a whole and unpaused; the home screen counts the paused lines', async ({ page }) => {
  const git = await setUp(page);
  await page.goto(`${site.url}#/train/Rep0Najd`);
  await asked(page);
  const list = await lines(page);
  const main = list.locator('.line-list-chapter').filter({ hasText: 'Main line' });
  await main.getByRole('button', { name: 'Main line: more' }).click();
  await list.getByRole('button', { name: 'Pause all lines' }).click();
  await expect(main).toContainText('2 paused');
  await expect(list.locator('.line-list-row .dot-paused')).toHaveCount(2);

  await page.goto(`${site.url}#/`);
  // 1... c5 is on the Alapin line too, so it is still due; 2... Nc6 and 3... cxd4 are held.
  await expect(page.locator('.train-card h2')).toHaveText('Train: 1 due · 1 new · 2 paused');

  await page.goto(`${site.url}#/train/Rep0Najd`);
  await asked(page);
  const again = await lines(page);
  const head = again.locator('.line-list-chapter').filter({ hasText: 'Main line' });
  await head.getByRole('button', { name: 'Main line: more' }).click();
  await again.getByRole('button', { name: 'Unpause all lines' }).click();
  await expect(head).not.toContainText('paused');
  await sync(page);
  const marks = pushed(git).map((e) => [e['card'], e['mark']]);
  expect(marks).toEqual([
    ['l|Rep0Najd|Ch1Najdf|e4 c5 Nf3 d6 d4 cxd4', 'paused'],
    ['l|Rep0Najd|Ch1Najdf|e4 c5 Nf3 Nc6 d4', 'paused'],
    ['l|Rep0Najd|Ch1Najdf|e4 c5 Nf3 d6 d4 cxd4', 'none'],
    ['l|Rep0Najd|Ch1Najdf|e4 c5 Nf3 Nc6 d4', 'none'],
  ]);
});
