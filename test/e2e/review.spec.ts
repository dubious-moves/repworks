// The study page's Review panel (PLAN.md §5.216), on a desktop viewport and an emulated phone,
// over the fixture repertoire (Test repertoire, for Black: "Main line", 1. e4 c5 2. Nf3 d6
// (2... Nc6 3. d4) 3. d4 cxd4, and "Alapin", 1. e4 c5 2. c3 Nf6) with a session's list in the data
// repo: no panel without a list; the panel folded at first, its count; an item clicked goes to its
// move, in another chapter too; "Next open"; OK, taken back, a note; an item whose move is deleted
// says so; the answers in the device's log after a sync, and still there after a reload.
import { test, expect, type Page } from '@playwright/test';
import { writeReviewList, type ReviewList } from '../../src/core/study/reviewList.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { openMoveMenu } from './board.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

const LIST: ReviewList = {
  v: 1,
  sid: 'Rep0Najd',
  name: 'batch-1',
  title: 'Sicilian batch 1',
  created: '2026-11-27T18:00:00.000Z',
  chapters: { Ch1Najdf: 'Main line', Ch2Alapn: 'Alapin' },
  items: [
    { id: 'Ch1Najdf.move.e4,c5,Nf3,d6', cid: 'Ch1Najdf', kind: 'move', at: ['e4', 'c5', 'Nf3', 'd6'], lead: '1. e4 c5 2. Nf3', part: 'd6', san: 'd6', detail: ['was: 1. e4 c5 2. Nf3 Nc6 3. d4', 'now: 1. e4 c5 2. Nf3 d6 3. d4 cxd4'] },
    { id: 'Ch1Najdf.added.e4,c5,Nf3,Nc6', cid: 'Ch1Najdf', kind: 'added', at: ['e4', 'c5', 'Nf3', 'Nc6'], lead: '1. e4 c5 2. Nf3', part: 'Nc6 3. d4', text: 'Kept as a side line for the move order.' },
    { id: 'Ch2Alapn.question.e4,c5,c3,Nf6', cid: 'Ch2Alapn', kind: 'question', at: ['e4', 'c5', 'c3', 'Nf6'], lead: '1. e4 c5 2. c3', part: 'Nf6', text: 'Drill 3. e5 Nd5 here, or leave it to the comment?' },
  ],
};

async function setUp(page: Page, withList: boolean) {
  const w = world();
  if (withList) w.git.commitIfHead(w.git.head, 'session: Sicilian batch 1', new Map([['review/Rep0Najd/batch-1.json', writeReviewList(LIST)]]), []);
  await serveGithub(page, w.github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return w;
}

const panel = (page: Page) => page.locator('details.review-panel');
const item = (page: Page, n: number) => panel(page).locator('.review-item').nth(n);
const count = (page: Page) => page.getByTestId('review-count');

test('no list for the study: no panel', async ({ page }) => {
  await setUp(page, false);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(page.locator('.notation .move').first()).toBeVisible();
  await expect(panel(page)).toHaveCount(0);
});

test('a session’s list: folded at first; an item goes to its move; answered in place, and the answers reach the log', async ({ page }) => {
  const w = await setUp(page, true);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(page.locator('.notation .move').first()).toBeVisible();

  // Folded until opened, with what waits.
  await expect(panel(page)).toHaveCount(1);
  await expect(panel(page)).not.toHaveAttribute('open', '');
  await expect(panel(page).locator('> summary')).toHaveText(/Review\s+3 open\s+of 3/);
  await expect(item(page, 0)).toBeHidden();
  await panel(page).locator('> summary').click();
  await expect(panel(page).locator('.review-list > summary')).toHaveText(/Sicilian batch 1\s+3 open of 3/);
  await expect(panel(page).locator('.review-chapter')).toHaveText(['Main line', 'Alapin']);
  await expect(item(page, 0)).toContainText('My move');
  await expect(item(page, 0).locator('.review-part')).toHaveText('d6');
  await expect(item(page, 1)).toContainText('Kept as a side line for the move order.');

  // "Next open" starts at the first; an item clicked goes to its move and is marked as the place.
  await panel(page).getByRole('button', { name: 'Next open' }).click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3,d6$/);
  await expect(page.locator('.notation .move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6');
  await expect(item(page, 0)).toHaveClass(/\bhere\b/);
  await item(page, 1).locator('.review-go').click();
  await expect(page.locator('.notation .move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 Nc6');
  await expect(item(page, 1)).toHaveClass(/\bhere\b/);
  await expect(item(page, 0)).not.toHaveClass(/\bhere\b/);

  // OK on the first: counted, shown, pressed.
  await item(page, 0).getByRole('button', { name: 'OK', exact: true }).click();
  await expect(count(page)).toHaveText('2 open');
  await expect(item(page, 0).locator('.review-state')).toHaveText('OK');
  await expect(item(page, 0).getByRole('button', { name: 'OK', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // The other chapter's item: the board goes there, the panel stays as it was left. A note alone answers it.
  await item(page, 2).locator('.review-go').click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch2Alapn\?at=e4,c5,c3,Nf6$/);
  await expect(page.locator('.notation .move.current')).toHaveAttribute('data-path', 'e4 c5 c3 Nf6');
  await expect(panel(page)).toHaveAttribute('open', '');
  await item(page, 2).getByRole('button', { name: 'Note' }).click();
  // Typed into the field, the keys are the note's, not the board's.
  await item(page, 2).getByLabel('Your note').pressSequentially('ask me later, f is fine');
  await item(page, 2).getByLabel('Your note').press('Enter');
  await expect(item(page, 2).locator('.review-note')).toHaveText('You: ask me later, f is fine');
  await expect(item(page, 2).locator('.review-state')).toHaveText('Noted');
  await expect(count(page)).toHaveText('1 open');
  await expect(page.locator('.notation .move.current')).toHaveAttribute('data-path', 'e4 c5 c3 Nf6');

  // The side line deleted in the chapter: its item says the chapter changed, and nothing waits.
  await panel(page).getByRole('button', { name: 'Next open' }).click();
  await expect(page.locator('.notation .move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 Nc6');
  await openMoveMenu(page, 'e4 c5 Nf3 Nc6');
  await page.getByRole('menuitem', { name: 'Delete from here' }).click();
  await expect(item(page, 1).locator('.review-state')).toHaveText('Changed since');
  await expect(count(page)).toHaveText('all answered');
  await expect(panel(page).getByRole('button', { name: 'Next open' })).toHaveCount(0);

  // "No" with the note kept; the same button again takes the answer back, the note staying.
  await item(page, 2).getByRole('button', { name: 'No', exact: true }).click();
  await expect(item(page, 2).locator('.review-state')).toHaveText('No');
  await item(page, 2).getByRole('button', { name: 'No', exact: true }).click();
  await expect(item(page, 2).locator('.review-state')).toHaveText('Noted');

  // Synced: the answers are lines of this device's log, under each item's card.
  await page.locator('.chip').click();
  const log = () => [...w.git.textsOf()].filter(([p]) => p.startsWith('progress/')).map(([, t]) => t).join('');
  await expect.poll(() => (log().match(/"k":"answer"/g) ?? []).length, { timeout: 15_000 }).toBe(4);
  expect(log()).toContain('"k":"answer","card":"v|Rep0Najd|batch-1|Ch1Najdf.move.e4,c5,Nf3,d6","a":"ok"');
  expect(log()).toContain('"k":"answer","card":"v|Rep0Najd|batch-1|Ch2Alapn.question.e4,c5,c3,Nf6","a":"open","note":"ask me later, f is fine"');
  expect(log()).toContain('"a":"no","note":"ask me later, f is fine"');
  // The list itself is the session's: the device never wrote it.
  expect(w.git.textsOf().get('review/Rep0Najd/batch-1.json')).toBe(writeReviewList(LIST));

  // A reload: folded again, the answers as they were.
  await page.reload();
  await expect(panel(page)).not.toHaveAttribute('open', '');
  await expect(count(page)).toHaveText('all answered');
  await panel(page).locator('> summary').click();
  // Nothing waits, so the list inside is folded too: opened, the states are there.
  await panel(page).locator('.review-list > summary').click();
  await expect(panel(page).locator('.review-state')).toHaveText(['OK', 'Changed since', 'Noted']);
});
