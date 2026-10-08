// The training screen's line list and the owner's first Phase 1 testing round (PLAN.md §5.16), on
// a desktop viewport and an emulated phone, with the fixture repertoire of train.spec.ts (a Black
// Sicilian: 1... c5 due, 2... d6 suspended, three new moves). A line picked from the list is
// trained at once: its due move graded, its new move taught; picked again, its moves are asked
// with nothing recorded. The daily limit changed from the site and written to settings.json; the
// day with nothing left, which still offers the next line and the study; show and grade switched
// on by "1" in the middle of a session and off again.
import { test, expect, type Page } from '@playwright/test';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

/** The trainer asks for a move: the feedback line says nothing for it (§5.17), so the phase tells. */
const asked = (page: Page) => expect(page.locator('.train-grid')).toHaveAttribute('data-phase', 'ask');

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

const DAY = new Date('2026-12-01T10:00:00Z');
const C5 = 'r|rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -|c7c5';
const NC6 = 'r|rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq -|b8c6';

async function setUp(page: Page): Promise<FakeGit> {
  const { git, github } = world();
  await page.clock.install({ time: DAY });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return git;
}

const feedback = (page: Page) => page.locator('.train-feedback');
async function play(page: Page, from: string, to: string) {
  await clickSquare(page, from, 'black');
  await clickSquare(page, to, 'black');
}

function pushed(git: FakeGit): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const [path, text] of git.textsOf()) {
    if (!path.startsWith('progress/') || path.startsWith('progress/Desktop1/') || path.startsWith('progress/Phone001/')) continue;
    for (const line of text.split('\n')) if (line) out.push(JSON.parse(line) as Record<string, unknown>);
  }
  return out.sort((a, b) => (a['n'] as number) - (b['n'] as number));
}

/** The list, unfolded on the phone (it is open beside the board on a wide screen). */
async function lines(page: Page) {
  const list = page.getByRole('complementary', { name: 'Lines to train' });
  if ((await list.getByRole('button', { name: /Show lines/ }).count()) > 0) await list.getByRole('button', { name: /Show lines/ }).click();
  return list;
}

const shot = async (page: Page, name: string) => {
  if (process.env['REPWORKS_SHOTS']) await page.screenshot({ path: `${process.env['REPWORKS_SHOTS']}/${name}-${page.viewportSize()!.width}.png` });
};

test('the line list: a line picked and trained, then practised again with nothing recorded', async ({ page }) => {
  const git = await setUp(page);
  await page.goto(`${site.url}#/train/Rep0Najd`);
  await asked(page);
  const list = await lines(page);
  await expect(list.locator('.line-list-chapter')).toHaveCount(2);
  await expect(list.locator('.line-list-chapter').first()).toContainText('Main line');
  await expect(list.locator('.line-list-chapter').first()).toContainText('Learn 0/2');
  // The chapter of the line on the board is open; the other one opens on a click.
  await expect(list.getByRole('button', { name: 'Main line' })).toHaveAttribute('aria-expanded', 'true');
  await list.getByRole('button', { name: 'Alapin' }).click();
  await expect(list.locator('.line-list-line')).toHaveCount(3);
  await list.getByRole('button', { name: 'Alapin' }).click();
  const rows = list.locator('.line-list-line');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Line 1');
  await expect(rows.nth(0)).toContainText('New · 1');
  // Line 2 shows its own moves, from where it leaves line 1.
  await expect(rows.nth(1)).toContainText('2... Nc6 3. d4');
  await shot(page, 'list');

  // Line 2 picked: 1... c5 is due and graded, 2... Nc6 is new and taught.
  await rows.nth(1).click();
  await expect(page).toHaveURL(/#\/train\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3,Nc6,d4$/);
  await expect(page.locator('.study-title')).toHaveText('Line · Main line');
  await asked(page);
  await play(page, 'c7', 'c5');
  await expect(feedback(page)).toHaveText('New move: play Nc6');
  await play(page, 'b8', 'c6');
  const done = page.getByRole('region', { name: 'Session done' });
  await expect(done).toContainText('Line done');
  await expect(done.getByRole('button', { name: 'Next line' })).toBeVisible();
  await page.locator('.chip').click();
  await expect.poll(() => pushed(git).map((e) => [e['k'], e['card'], e['g']])).toEqual([
    ['review', C5, 3],
    ['taught', NC6, undefined],
  ]);

  // Again: nothing on it is due now, and every move is asked anyway, a wrong one included, with
  // nothing recorded.
  await done.getByRole('button', { name: 'Again' }).click();
  await asked(page);
  await play(page, 'e7', 'e5');
  await expect(feedback(page)).toHaveText('Not in your repertoire: try again');
  await play(page, 'c7', 'c5');
  await asked(page);
  await play(page, 'b8', 'c6');
  await expect(done).toContainText('Line done');
  await page.locator('.chip').click();
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  expect(pushed(git)).toHaveLength(2);

  // Line 2 in the list is now learned, due again after its learning step.
  await expect((await lines(page)).locator('.line-list-line').nth(1)).toContainText(/Due/);
});

test('the daily limit: changed from the site, nothing left, the next line learned anyway, and the study', async ({ page }) => {
  const git = await setUp(page);
  await expect(page.locator('.train-card h2')).toHaveText('Train: 1 due · 3 new');
  await page.getByRole('button', { name: 'Training settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Training settings' });
  await dialog.getByLabel('New moves a day').fill('0');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.train-card h2')).toHaveText('Train: 1 due · 0 new');
  await page.locator('.chip').click();
  await expect.poll(() => git.textsOf().get('settings.json')).toBe('{\n  "format": 1,\n  "train": {\n    "newPerDay": 0\n  }\n}\n');

  // A value out of range is refused.
  await page.getByRole('button', { name: 'Training settings' }).click();
  await dialog.getByLabel('New moves a day').fill('-3');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByRole('alert')).toContainText('a whole number from 0 to 1000');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  // The due move, then nothing: the screen says why and offers the next line and the study.
  await page.getByRole('link', { name: 'Train', exact: true }).first().click();
  await asked(page);
  await play(page, 'c7', 'c5');
  const done = page.getByRole('region', { name: 'Session done' });
  await expect(done).toContainText('Session done');
  await done.getByRole('button', { name: 'Train again' }).click();
  await expect(done).toContainText('Nothing to train now');
  await expect(done).toContainText('Today\'s 0 new moves are learned');
  await shot(page, 'nothing');
  await done.getByRole('button', { name: 'Learn the next line' }).click();
  await expect(page).toHaveURL(/#\/train\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3,d6,d4,cxd4$/);
  // A line picked starts auto-played (§5.17): 1... c5, just reviewed, and 2... d6, suspended, are
  // played up to the new move.
  await expect(feedback(page)).toHaveText('New move: play cxd4');
  await expect(page.locator('.train-line')).toContainText('1. e4 c5 2. Nf3 d6 3. d4');
  await page.getByRole('button', { name: 'Stop' }).click();

  // "Study" with no line on the board still opens the study.
  await page.goto(`${site.url}#/train/Rep0Najd`);
  await expect(done).toContainText('Nothing to train now');
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd/);
});

test('show and grade switched on by 1 in the middle of a session, and off again', async ({ page }) => {
  // The queue goes on by itself at a line's end here (§5.17's "go on"); train.spec.ts covers "wait".
  await page.addInitScript(() => localStorage.setItem('repworks.trainPrefs', JSON.stringify({ lineEnd: 'go' })));
  const git = await setUp(page);
  await page.goto(`${site.url}#/train`);
  await asked(page);
  // A wrong move first, then the keys: the move is failed whatever is told.
  await play(page, 'e7', 'e5');
  await expect(feedback(page)).toHaveText('Not in your repertoire: try again');
  await page.keyboard.press('1');
  await expect(page.getByRole('button', { name: 'Show (2)' })).toBeVisible();
  await page.keyboard.press('2');
  await expect(feedback(page)).toHaveText('Play c5');
  await expect(page.getByRole('button', { name: 'Play the moves' })).toBeDisabled();
  await page.keyboard.press('2');
  await expect(feedback(page)).toHaveText(/That’s the move|New move: play cxd4/);
  await expect(feedback(page)).toHaveText('New move: play cxd4');
  await shot(page, 'show');
  // Back to moving the pieces.
  await page.getByRole('button', { name: 'Play the moves' }).click();
  await expect(page.getByRole('button', { name: 'Show and grade (1)' })).toBeVisible();
  await play(page, 'c5', 'd4');
  await expect(feedback(page)).toHaveText(/New move learned: cxd4|New move: play Nc6/);
  await page.locator('.chip').click();
  await expect.poll(() => pushed(git).map((e) => [e['k'], e['g']])).toEqual([
    ['review', 1],
    ['taught', undefined],
  ]);
});
