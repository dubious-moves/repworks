// The study page's Review panel (PLAN.md §5.216), on a desktop viewport and an emulated phone,
// over the fixture repertoire (Test repertoire, for Black: "Main line", 1. e4 c5 2. Nf3 d6
// (2... Nc6 3. d4) 3. d4 cxd4, and "Alapin", 1. e4 c5 2. c3 Nf6) with a session's list in the data
// repo: no panel without a list; the panel folded at first, its count; an item clicked goes to its
// move, in another chapter too; "Next open"; OK, taken back, a note; an item whose move is deleted
// says so; the answers in the device's log after a sync, and still there after a reload.
// Positions (§5.218): a removed line and the comment it was written into share a move and are one
// position, counted once; answered once (an event per item), taken back, one item answered on its
// own, a note on all; a position whose items are in two lists, under the first; "Changed since" on
// one item of a position while the other waits; "OK all open" after a confirmation, one taken back.
// "Look first" (§5.220): a marked position says so and comes first in its list; the heads count
// those still waiting; "Next open" goes to them first; "OK all open" leaves them waiting and says
// how many stay; answered, the mark stays on the row and leaves the counts.
import { test, expect, type Page } from '@playwright/test';
import { writeReviewList, type ReviewList } from '../../src/core/study/reviewList.ts';
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

/** A chapter as long as a real one: the Main line, then the kings stepping aside and back 150 times. */
const LONG = `[Event "Test repertoire: Main line"]\n[Result "*"]\n[StudyName "Test repertoire"]\n[ChapterName "Main line"]\n[Orientation "black"]\n\n1. e4 c5 2. Nf3 d6 (2... Nc6 3. d4) 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be2 e5 7. Nb3 Be7 8. O-O O-O ${Array.from({ length: 150 }, (_, i) => `${9 + 2 * i}. Kh1 Kh8 ${10 + 2 * i}. Kg1 Kg8`).join(' ')} *\n`;

// A batch split by priority, as a session did by hand. At 2. Nf3 a reply taken out and written into
// the comment: two items of one list. At 2. c3 the same, the removed line in the low list.
const BATCH: ReviewList = {
  v: 1,
  sid: 'Rep0Najd',
  name: 'batch-2',
  title: 'Sicilian batch 2',
  created: '2026-11-28T09:00:00.000Z',
  chapters: { Ch1Najdf: 'Main line', Ch2Alapn: 'Alapin' },
  items: [
    { id: 'Ch1Najdf.comment.e4,c5,Nf3', cid: 'Ch1Najdf', kind: 'comment', at: ['e4', 'c5', 'Nf3'], lead: '1. e4 c5', part: '2. Nf3', detail: ['added after the old text: (2... e6 3. d4)'] },
    { id: 'Ch1Najdf.removed.e4,c5,Nf3,e6', cid: 'Ch1Najdf', kind: 'removed', at: ['e4', 'c5', 'Nf3'], lead: '1. e4 c5 2. Nf3', part: 'e6 3. d4', san: 'e6', text: 'You never met it.' },
    { id: 'Ch2Alapn.question.e4,c5,c3,Nf6', cid: 'Ch2Alapn', kind: 'question', at: ['e4', 'c5', 'c3', 'Nf6'], lead: '1. e4 c5 2. c3', part: 'Nf6', text: 'Drill 3. e5 Nd5 here?' },
    { id: 'Ch2Alapn.comment.e4,c5,c3', cid: 'Ch2Alapn', kind: 'comment', at: ['e4', 'c5', 'c3'], lead: '1. e4 c5', part: '2. c3', detail: ['was: Solid.', 'now: Solid. (2... d5 3. exd5)'] },
  ],
};
const LOW: ReviewList = {
  ...BATCH,
  name: 'batch-2-low',
  title: 'Sicilian batch 2, low priority',
  created: '2026-11-28T08:59:00.000Z',
  items: [
    { id: 'Ch2Alapn.removed.e4,c5,c3,d5', cid: 'Ch2Alapn', kind: 'removed', at: ['e4', 'c5', 'c3'], lead: '1. e4 c5 2. c3', part: 'd5 3. exd5', san: 'd5' },
    { id: 'Ch1Najdf.glyphs.e4,c5,Nf3,d6', cid: 'Ch1Najdf', kind: 'glyphs', at: ['e4', 'c5', 'Nf3', 'd6'], lead: '1. e4 c5 2. Nf3', part: 'd6', detail: ['none → !'] },
    { id: 'Ch1Najdf.arrows.e4,c5,Nf3,d6,d4', cid: 'Ch1Najdf', kind: 'arrows', at: ['e4', 'c5', 'Nf3', 'd6', 'd4'], lead: '1. e4 c5 2. Nf3 d6', part: '3. d4', detail: ['added Gd4d5'] },
  ],
};

async function setUp(page: Page, lists: boolean | ReviewList[], long = false) {
  const w = world();
  const files = (lists === true ? [LIST] : lists || []).map((l) => [`review/Rep0Najd/${l.name}.json`, writeReviewList(l)] as [string, string]);
  if (files.length) w.git.commitIfHead(w.git.head, 'session: a Sicilian batch', new Map([...files, ...(long ? [['studies/Rep0Najd/Ch1Najdf.pgn', LONG] as [string, string]] : [])]), []);
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

test('a long chapter: the folded panel keeps its row under the notation, and opened its items can be reached (the owner’s report, 2026-11-27)', async ({ page }) => {
  await setUp(page, true, true);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(page.locator('.notation .move').nth(600)).toBeAttached();
  const head = panel(page).locator('> summary');
  await head.scrollIntoViewIfNeeded();
  await expect(head).toBeInViewport({ ratio: 1 });
  expect((await panel(page).boundingBox())!.height).toBeGreaterThanOrEqual(28);
  await head.click();
  await item(page, 0).locator('.review-go').click();
  await expect(page.locator('.notation .move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6');
  await item(page, 2).getByRole('button', { name: 'OK', exact: true }).scrollIntoViewIfNeeded();
  await expect(item(page, 2).getByRole('button', { name: 'OK', exact: true })).toBeInViewport({ ratio: 1 });
  // The notation keeps room of its own beside the open panel.
  expect((await page.locator('.cv-panel .notation').boundingBox())!.height).toBeGreaterThanOrEqual(120);
});

test('a session’s list: folded at first; an item goes to its move; answered in place, and the answers reach the log', async ({ page }) => {
  const w = await setUp(page, true);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(page.locator('.notation .move').first()).toBeVisible();

  // Folded until opened, with what waits.
  await expect(panel(page)).toHaveCount(1);
  await expect(panel(page)).not.toHaveAttribute('open', '');
  await expect(panel(page).locator('> summary')).toHaveText(/Review\s+3 positions open\s+of 3/);
  await expect(item(page, 0)).toBeHidden();
  await panel(page).locator('> summary').click();
  await expect(panel(page).locator('.review-list > summary')).toHaveText(/Sicilian batch 1\s+3 positions open of 3/);
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
  await expect(count(page)).toHaveText('2 positions open');
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
  await expect(count(page)).toHaveText('1 position open');
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

const list = (page: Page, n: number) => panel(page).locator('.review-list').nth(n);
const change = (page: Page, n: number, m: number) => item(page, n).locator('.review-change').nth(m);
/** A position's own row of buttons (each of its items has one too, once asked for). */
const answer = (page: Page, n: number) => item(page, n).getByRole('group', { name: 'Your answer', exact: true });
const log = (w: ReturnType<typeof world>) => [...w.git.textsOf()].filter(([p]) => p.startsWith('progress/')).map(([, t]) => t).join('');

test('items at one move are one position: counted and answered once, one of them on its own, changed since in part, its items in two lists', async ({ page }) => {
  const w = await setUp(page, [BATCH, LOW]);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(page.locator('.notation .move').first()).toBeVisible();
  await panel(page).locator('> summary').click();

  // Seven items at five positions. The low list's removed line is with its comment, under the newer list.
  await expect(panel(page).locator('> summary')).toHaveText(/Review\s+5 positions open\s+of 5/);
  await expect(list(page, 0).locator('> summary')).toHaveText(/Sicilian batch 2\s+3 positions open of 3/);
  await expect(list(page, 1).locator('> summary')).toHaveText(/Sicilian batch 2, low priority\s+2 positions open of 2/);
  await expect(panel(page).locator('.review-item')).toHaveCount(5);
  await expect(list(page, 0).locator('.review-item')).toHaveCount(3);

  // The position: the move as its head, the comment's change read without a click, the line taken out, the session's words.
  await expect(item(page, 0).locator('> .review-go .review-part')).toHaveText('2. Nf3');
  await expect(item(page, 0).locator('.review-change')).toHaveCount(2);
  await expect(change(page, 0, 0)).toContainText('Comment');
  await expect(change(page, 0, 0).getByText('added after the old text: (2... e6 3. d4)')).toBeVisible();
  await expect(change(page, 0, 1)).toContainText('Removed');
  await expect(change(page, 0, 1).locator('.review-part')).toHaveText('e6 3. d4');
  await expect(change(page, 0, 1)).toContainText('You never met it.');
  await item(page, 0).locator('> .review-go').click();
  await expect(page.locator('.notation .move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3');
  await expect(item(page, 0)).toHaveClass(/\bhere\b/);

  // One OK for both items; the same button takes both back.
  await answer(page, 0).getByRole('button', { name: 'OK', exact: true }).click();
  await expect(count(page)).toHaveText('4 positions open');
  await expect(item(page, 0).locator('> .review-state')).toHaveText('OK');
  await expect(answer(page, 0).getByRole('button', { name: 'OK', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await answer(page, 0).getByRole('button', { name: 'OK', exact: true }).click();
  await expect(count(page)).toHaveText('5 positions open');
  await expect(item(page, 0).locator('> .review-state')).toHaveCount(0);

  // One item on its own: No to the removed line leaves the comment waiting; OK to the comment, and nothing waits there.
  await answer(page, 0).getByRole('button', { name: 'One by one' }).click();
  await item(page, 0).getByRole('group', { name: 'Your answer to Removed' }).getByRole('button', { name: 'No', exact: true }).click();
  await expect(change(page, 0, 1).locator('.review-state')).toHaveText('No');
  await expect(change(page, 0, 0).locator('.review-state')).toHaveCount(0);
  await expect(count(page)).toHaveText('5 positions open');
  await expect(answer(page, 0).getByRole('button', { name: 'No', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await item(page, 0).getByRole('group', { name: 'Your answer to Comment' }).getByRole('button', { name: 'OK', exact: true }).click();
  await expect(count(page)).toHaveText('4 positions open');
  await expect(item(page, 0).locator('.review-change .review-state')).toHaveText(['OK', 'No']);
  await expect(item(page, 0).locator('> .review-state')).toHaveCount(0);

  // A note on the position goes to both, each keeping its answer, and is said once.
  await answer(page, 0).getByRole('button', { name: 'One by one' }).click();
  await answer(page, 0).getByRole('button', { name: 'Note' }).click();
  await item(page, 0).getByLabel('Your note').pressSequentially('see h6 too');
  await item(page, 0).getByLabel('Your note').press('Enter');
  await expect(item(page, 0).locator('.review-note')).toHaveText(['You: see h6 too']);
  await expect(item(page, 0).locator('.review-change .review-state')).toHaveText(['OK', 'No']);

  // The position whose items are in two lists: the comment of this list, the removed line of the other, named.
  await expect(item(page, 2).locator('> .review-go .review-part')).toHaveText('2. c3');
  await expect(change(page, 2, 0).getByText('now: Solid. (2... d5 3. exd5)')).toBeVisible();
  await expect(change(page, 2, 1).locator('.review-part')).toHaveText('d5 3. exd5');
  await expect(change(page, 2, 1).locator('.review-from')).toHaveText('from Sicilian batch 2, low priority');
  await expect(change(page, 2, 0).locator('.review-from')).toHaveCount(0);

  // The removed reply played again in the chapter: that item says so, the comment still waits. OK then
  // answers the comment and leaves the edit as the other's answer.
  await item(page, 2).locator('> .review-go').click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch2Alapn\?at=e4,c5,c3$/);
  await expect(page.locator('.notation .move.current')).toHaveAttribute('data-path', 'e4 c5 c3');
  await clickSquare(page, 'd7', 'black');
  await clickSquare(page, 'd5', 'black');
  await expect(page.locator('.notation .move.current')).toHaveAttribute('data-path', 'e4 c5 c3 d5');
  await expect(change(page, 2, 1).locator('.review-state')).toHaveText('Changed since');
  await expect(change(page, 2, 0).locator('.review-state')).toHaveCount(0);
  await expect(count(page)).toHaveText('4 positions open');
  await answer(page, 2).getByRole('button', { name: 'OK', exact: true }).click();
  await expect(count(page)).toHaveText('3 positions open');
  await expect(item(page, 2).locator('.review-change .review-state')).toHaveText(['OK', 'Changed since']);
  await expect(answer(page, 2).getByRole('button', { name: 'OK', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // Synced: an event per item, each under its own list's card; none for the item the edit answered.
  await page.locator('.chip').click();
  await expect.poll(() => (log(w).match(/"k":"answer"/g) ?? []).length, { timeout: 15_000 }).toBe(9);
  expect(log(w)).toContain('"card":"v|Rep0Najd|batch-2|Ch1Najdf.comment.e4,c5,Nf3","a":"ok","note":"see h6 too"');
  expect(log(w)).toContain('"card":"v|Rep0Najd|batch-2|Ch1Najdf.removed.e4,c5,Nf3,e6","a":"no","note":"see h6 too"');
  expect(log(w)).toContain('"card":"v|Rep0Najd|batch-2|Ch2Alapn.comment.e4,c5,c3","a":"ok"');
  expect(log(w)).not.toContain('batch-2-low');

  // A reload: the same positions wait.
  await page.reload();
  await expect(count(page)).toHaveText('3 positions open');
});

test('"OK all open" on a list: asked first, every item still waiting under it answered, one taken back', async ({ page }) => {
  const w = await setUp(page, [BATCH, LOW]);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(page.locator('.notation .move').first()).toBeVisible();
  await panel(page).locator('> summary').click();
  await expect(count(page)).toHaveText('5 positions open');

  // Asked first: Cancel answers nothing.
  await list(page, 1).getByRole('button', { name: 'OK all open…' }).click();
  await expect(list(page, 1).getByRole('group', { name: 'OK all open' })).toContainText('OK for the 2 positions still open in this list? Each can be taken back.');
  await list(page, 1).getByRole('button', { name: 'Cancel' }).click();
  await expect(count(page)).toHaveText('5 positions open');
  await list(page, 1).getByRole('button', { name: 'OK all open…' }).click();
  await list(page, 1).getByRole('button', { name: 'OK all 2' }).click();
  await expect(count(page)).toHaveText('3 positions open');
  await expect(list(page, 1).locator('> summary')).toHaveText(/Sicilian batch 2, low priority\s+2 positions, all answered/);
  await expect(list(page, 1).locator('.review-item > .review-state')).toHaveText(['OK', 'OK']);
  await expect(list(page, 1).getByRole('button', { name: 'OK all open…' })).toHaveCount(0);

  // One of them taken back, as any answer: it waits again, and the list offers the button again.
  await answer(page, 3).getByRole('button', { name: 'OK', exact: true }).click();
  await expect(count(page)).toHaveText('4 positions open');
  await expect(list(page, 1).locator('> summary')).toHaveText(/1 position open of 2/);

  // The newer list: what waits under it, the other list's removed line at 2. c3 with it. An answer given before stays.
  await item(page, 1).getByRole('button', { name: 'No', exact: true }).click();
  await expect(count(page)).toHaveText('3 positions open');
  await list(page, 0).getByRole('button', { name: 'OK all open…' }).click();
  await list(page, 0).getByRole('button', { name: 'OK all 2' }).click();
  await expect(count(page)).toHaveText('1 position open');
  await expect(list(page, 0).locator('.review-item > .review-state')).toHaveText(['OK', 'No', 'OK']);

  await page.locator('.chip').click();
  await expect.poll(() => (log(w).match(/"k":"answer"/g) ?? []).length, { timeout: 15_000 }).toBe(8);
  expect(log(w)).toContain('"card":"v|Rep0Najd|batch-2-low|Ch2Alapn.removed.e4,c5,c3,d5","a":"ok"');
  expect(log(w)).toContain('"card":"v|Rep0Najd|batch-2|Ch2Alapn.question.e4,c5,c3,Nf6","a":"no"');
  expect((log(w).match(/"card":"v\|Rep0Najd\|batch-2\|Ch2Alapn.question[^\n]*"a":"ok"/g) ?? []).length).toBe(0);
});

// A batch as the audit writes it: one list, the session's marks on what to read first. The marked
// positions are the third and the fourth in the file.
const MARKED: ReviewList = {
  v: 1,
  sid: 'Rep0Najd',
  name: 'batch-6',
  title: 'Sicilian batch 6',
  created: '2026-11-28T12:00:00.000Z',
  chapters: { Ch1Najdf: 'Main line', Ch2Alapn: 'Alapin' },
  items: [
    { id: 'Ch1Najdf.glyphs.e4,c5,Nf3,d6', cid: 'Ch1Najdf', kind: 'glyphs', at: ['e4', 'c5', 'Nf3', 'd6'], lead: '1. e4 c5 2. Nf3', part: 'd6', detail: ['none → !'] },
    { id: 'Ch1Najdf.arrows.e4,c5,Nf3,d6,d4', cid: 'Ch1Najdf', kind: 'arrows', at: ['e4', 'c5', 'Nf3', 'd6', 'd4'], lead: '1. e4 c5 2. Nf3 d6', part: '3. d4', detail: ['added Gd4d5'] },
    { id: 'Ch1Najdf.comment.e4,c5,Nf3', cid: 'Ch1Najdf', kind: 'comment', at: ['e4', 'c5', 'Nf3'], lead: '1. e4 c5', part: '2. Nf3', detail: ['added after the old text: (2... e6 3. d4)'] },
    { id: 'Ch1Najdf.removed.e4,c5,Nf3,e6', cid: 'Ch1Najdf', kind: 'removed', at: ['e4', 'c5', 'Nf3'], lead: '1. e4 c5 2. Nf3', part: 'e6 3. d4', san: 'e6', text: 'Your line: found by 81% of 2000 players, so a clickable. A judgement.', first: true },
    { id: 'Ch1Najdf.question.e4,c5,Nf3,d6,d4,cxd4', cid: 'Ch1Najdf', kind: 'question', at: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4'], lead: '1. e4 c5 2. Nf3 d6 3. d4', part: 'cxd4', text: 'A rule for the next batches: "a recapture gets a sentence, not a line". Accept?', first: true },
  ],
};

test('"look first": marked positions say so and come first; the heads count them; "Next open" goes to them first; "OK all open" leaves them waiting', async ({ page }) => {
  const w = await setUp(page, [MARKED]);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch1Najdf`);
  await expect(page.locator('.notation .move').first()).toBeVisible();
  // Folded, the panel's head already says how many to look at first.
  await expect(panel(page).locator('> summary')).toHaveText(/Review\s+4 positions open\s+of 4\s+· 2 to look at first/);
  await panel(page).locator('> summary').click();
  await expect(list(page, 0).locator('> summary')).toHaveText(/Sicilian batch 6\s+4 positions open of 4\s+· 2 to look at first/);

  // The two marked positions first, each saying so; the others after them, in the file's order.
  await expect(panel(page).locator('.review-item > .review-go .review-part')).toHaveText(['2. Nf3', 'cxd4', 'd6', '3. d4']);
  await expect(panel(page).locator('.review-item.is-first')).toHaveCount(2);
  await expect(item(page, 0).locator('> .review-go .review-first')).toHaveText('Look first');
  await expect(item(page, 1).locator('> .review-go .review-first')).toHaveText('Look first');
  await expect(item(page, 2).locator('.review-first')).toHaveCount(0);
  // The mark is inside the row on the phone too, not pushed off it.
  await expect(item(page, 0).locator('.review-first')).toBeInViewport({ ratio: 1 });

  // "Next open" from an unmarked position still goes to the marked ones first.
  await item(page, 3).locator('> .review-go').click();
  await expect(page.locator('.notation .move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6 d4');
  await panel(page).getByRole('button', { name: 'Next open' }).click();
  await expect(page.locator('.notation .move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3');
  await panel(page).getByRole('button', { name: 'Next open' }).click();
  await expect(page.locator('.notation .move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6 d4 cxd4');

  // "OK all open" answers the two unmarked positions only, and says so before it does.
  await list(page, 0).getByRole('button', { name: 'OK all open…' }).click();
  await expect(list(page, 0).getByRole('group', { name: 'OK all open' })).toContainText('OK for the 2 positions still open in this list? The 2 marked “Look first” stay open. Each can be taken back.');
  await list(page, 0).getByRole('button', { name: 'OK all 2' }).click();
  await expect(count(page)).toHaveText('2 positions open');
  await expect(panel(page).locator('.review-item.is-waiting > .review-go .review-part')).toHaveText(['2. Nf3', 'cxd4']);
  await expect(list(page, 0).locator('> summary')).toHaveText(/2 positions open of 4\s+· 2 to look at first/);
  // Only marked positions wait: nothing is left for the button to answer.
  await expect(list(page, 0).getByRole('button', { name: 'OK all open…' })).toHaveCount(0);

  // A marked position answered: its mark stays on the row, the counts drop. Both answered: no count of them is left.
  await answer(page, 0).getByRole('button', { name: 'No', exact: true }).click();
  await expect(list(page, 0).locator('> summary')).toHaveText(/1 position open of 4\s+· 1 to look at first/);
  await expect(item(page, 0).locator('.review-first')).toHaveText('Look first');
  await answer(page, 1).getByRole('button', { name: 'OK', exact: true }).click();
  await expect(count(page)).toHaveText('all answered');
  await expect(panel(page).locator('.review-first-count')).toHaveCount(0);

  // Synced: the two "OK all" answers, the No for both items at 2. Nf3, the OK for the question.
  await page.locator('.chip').click();
  await expect.poll(() => (log(w).match(/"k":"answer"/g) ?? []).length, { timeout: 15_000 }).toBe(5);
  expect(log(w)).toContain('"card":"v|Rep0Najd|batch-6|Ch1Najdf.removed.e4,c5,Nf3,e6","a":"no"');
  expect(log(w)).toContain('"card":"v|Rep0Najd|batch-6|Ch1Najdf.glyphs.e4,c5,Nf3,d6","a":"ok"');
});
