// Studies as Qchess's (PLAN.md §5.15), on a desktop viewport and an emulated phone: the study
// cards; a study made with no import, renamed, its chapter renamed and turned, a chapter added
// and deleted, then the study deleted from its card, each checked in the fake data repo; and
// Qchess's switch between training and the study: a session left for the study at the move on
// the board, the line edited there, and the session taken up again with the edit in its plan and
// nothing asked twice.
import { test, expect, type Page } from '@playwright/test';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { chapterSettings, clickSquare, newChapter } from './board.ts';
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
const C5 = 'r|rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -|c7c5';
const CXD4 = 'r|rnbqkbnr/pp2pppp/3p4/2p5/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq -|c5d4';
const NF6_NAJDORF = 'r|rnbqkbnr/pp2pppp/3p4/8/3NP3/8/PPP2PPP/RNBQKB1R b KQkq -|g8f6';

async function setUp(page: Page): Promise<FakeGit> {
  const { git, github } = world();
  await page.clock.install({ time: DAY });
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return git;
}

async function sync(page: Page) {
  await page.locator('.chip').click();
  await expect(page.locator('.chip')).toHaveText(/^synced/);
}

/** The events this device pushed, parsed. */
function pushed(git: FakeGit): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const [path, text] of git.textsOf()) {
    if (!path.startsWith('progress/') || path.startsWith('progress/Desktop1/') || path.startsWith('progress/Phone001/')) continue;
    for (const line of text.split('\n')) if (line) out.push(JSON.parse(line) as Record<string, unknown>);
  }
  return out.sort((a, b) => (a['n'] as number) - (b['n'] as number));
}

const card = (page: Page, name: string) => page.locator('.study-card').filter({ has: page.getByRole('link', { name, exact: true }) });

test('the study cards: kind, chapters, side and today’s moves; a card opens its study', async ({ page }) => {
  await setUp(page);
  const rep = card(page, 'Test repertoire');
  await expect(rep.locator('.study-card-badge')).toHaveText('Repertoire');
  await expect(rep.locator('.study-card-meta')).toHaveText('2 chaptersBlack1 due · 3 new');
  await expect(rep.getByRole('link', { name: 'Train Test repertoire' })).toHaveAttribute('href', '#/train/Rep0Najd');
  // Anywhere on the card opens the study, but its buttons.
  const box = (await rep.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - 8);
  await expect(page).toHaveURL(/#\/study\/Rep0Najd/);
  await expect(page.locator('.notation')).toContainText('1. e4');
});

test('a study made with no import, managed where Qchess has it, and deleted from its card', async ({ page, isMobile }) => {
  const git = await setUp(page);

  // New study: a name, its kind, and a first chapter with its side.
  await page.getByRole('button', { name: '+ New study' }).click();
  let dialog = page.getByRole('dialog', { name: 'New study' });
  await dialog.getByRole('button', { name: 'Create study' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Please enter a study name.');
  await dialog.getByLabel('Study name').fill('Caro-Kann');
  await dialog.getByLabel('Reference').check();
  await dialog.getByLabel('First chapter').fill('Advance');
  await dialog.getByLabel('Black').check();
  await dialog.getByLabel('Study name').press('Enter');
  await expect(page).toHaveURL(/#\/study\/[A-Za-z0-9]{8}\/[A-Za-z0-9]{8}$/);
  const [, sid, cid] = /#\/study\/(\w{8})\/(\w{8})/.exec(page.url())!;
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-black/);
  await expect(page.locator('.chapter-view .study-title').first()).toContainText('Caro-Kann');
  await clickSquare(page, 'e2', 'black');
  await clickSquare(page, 'e4', 'black');
  await clickSquare(page, 'c7', 'black');
  await clickSquare(page, 'c6', 'black');
  await expect(page.locator('.move[data-path="e4 c6"]')).toHaveText('c6');
  await sync(page);
  const files = () => git.textsOf();
  expect(JSON.parse(files().get(`studies/${sid}/study.json`)!)).toEqual({ format: 1, id: sid, name: 'Caro-Kann', kind: 'reference', chapters: [cid] });
  expect(files().get(`studies/${sid}/${cid}.pgn`)).toBe('[Event "Caro-Kann: Advance"]\n[Result "*"]\n[StudyName "Caro-Kann"]\n[ChapterName "Advance"]\n[Orientation "black"]\n\n1. e4 c6 *\n');

  // The study's ⚙: renamed and made a repertoire, every chapter's StudyName with it.
  await page.getByRole('button', { name: 'Study settings' }).click();
  dialog = page.getByRole('dialog', { name: 'Study settings' });
  await expect(dialog.getByLabel('Study name')).toHaveValue('Caro-Kann');
  await expect(dialog.getByLabel('Reference')).toBeChecked();
  await dialog.getByLabel('Study name').fill('Caro-Kann Defence');
  await dialog.getByLabel('Repertoire').check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.chapter-view .study-title').first()).toContainText('Caro-Kann Defence');
  // The chapter's ⚙: renamed and turned; a second chapter added.
  dialog = await chapterSettings(page, 'Advance');
  await dialog.getByLabel('Chapter name').fill('Advance 3. e5');
  await dialog.getByLabel('White').check();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('.cg-wrap')).toHaveClass(/orientation-white/);
  await newChapter(page, 'Exchange');
  await expect(page.getByLabel('Chapter', { exact: true }).locator('option')).toHaveText(['Advance 3. e5', 'Exchange']);
  if (!isMobile) await expect(page.getByRole('navigation', { name: 'Chapters' }).getByRole('link')).toHaveText(['Advance 3. e5', 'Exchange']);
  await sync(page);
  const meta = JSON.parse(files().get(`studies/${sid}/study.json`)!) as { name: string; kind: string; chapters: string[] };
  expect(meta).toMatchObject({ name: 'Caro-Kann Defence', kind: 'repertoire' });
  expect(meta.chapters).toHaveLength(2);
  expect(files().get(`studies/${sid}/${cid}.pgn`)).toBe('[Event "Caro-Kann Defence: Advance 3. e5"]\n[Result "*"]\n[StudyName "Caro-Kann Defence"]\n[ChapterName "Advance 3. e5"]\n[Orientation "white"]\n\n1. e4 c6 *\n');
  // The new chapter is for the side of the chapter it was made from.
  expect(files().get(`studies/${sid}/${meta.chapters[1]}.pgn`)).toContain('[ChapterName "Exchange"]\n[Orientation "white"]');

  // The chapter deleted, after asking.
  dialog = await chapterSettings(page, 'Exchange');
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Delete chapter' }).click();
  await expect(page.getByLabel('Chapter', { exact: true }).locator('option')).toHaveText(['Advance 3. e5']);

  // Home: its card, then deleted from it; a refusal at the question keeps it.
  await page.locator('.chapter-head .back').click();
  const c = card(page, 'Caro-Kann Defence');
  await expect(c.locator('.study-card-meta')).toContainText('1 chapter');
  await expect(c.locator('.study-card-meta')).toContainText('White');
  page.once('dialog', (d) => void d.dismiss());
  await c.getByRole('button', { name: 'Delete Caro-Kann Defence' }).click();
  await expect(c).toBeVisible();
  page.once('dialog', (d) => {
    expect(d.message()).toBe('Delete the study “Caro-Kann Defence” and its 1 chapter?');
    void d.accept();
  });
  await c.getByRole('button', { name: 'Delete Caro-Kann Defence' }).click();
  await expect(c).toHaveCount(0);
  await expect(page.locator('.study-card')).toHaveCount(1);
  await sync(page);
  expect([...files().keys()].filter((p) => p.startsWith(`studies/${sid}/`))).toEqual([]);
  expect(files().has('studies/Rep0Najd/study.json')).toBe(true);
});

test('a study renamed from its card, and deleted from its settings in the chapter view', async ({ page }) => {
  const git = await setUp(page);
  await card(page, 'Test repertoire').getByRole('button', { name: 'Settings of Test repertoire' }).click();
  let dialog = page.getByRole('dialog', { name: 'Study settings' });
  await dialog.getByLabel('Study name').fill('Sicilian');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(card(page, 'Sicilian')).toBeVisible();
  await card(page, 'Sicilian').getByRole('link', { name: 'Sicilian', exact: true }).click();
  await expect(page.locator('.notation')).toContainText('1. e4');
  await page.getByRole('button', { name: 'Study settings' }).click();
  dialog = page.getByRole('dialog', { name: 'Study settings' });
  page.once('dialog', (d) => void d.accept());
  await dialog.getByRole('button', { name: 'Delete study' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByText('No studies yet: make one, or import one.')).toBeVisible();
  await sync(page);
  expect([...git.textsOf().keys()].filter((p) => p.startsWith('studies/'))).toEqual([]);
});

test('train ↔ study: the line on the board opened editable, edited, and the session taken up again', async ({ page }) => {
  const git = await setUp(page);
  await page.locator('.train-card').getByRole('link', { name: 'Train' }).click();
  const feedback = page.locator('.train-feedback');
  await expect(feedback).toHaveText('Your move');
  await clickSquare(page, 'c7', 'black');
  await clickSquare(page, 'c5', 'black');
  await expect(feedback).toHaveText('New move: play cxd4');

  // Study: the chapter, at the move on the board, editable.
  await page.getByRole('group', { name: 'Study or train' }).getByRole('button', { name: 'Study' }).click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch1Najdf\?at=e4,c5,Nf3,d6,d4$/);
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6 d4');
  await expect(page.getByRole('group', { name: 'Study or train' }).getByRole('button', { name: 'Study' })).toHaveAttribute('aria-pressed', 'true');
  // The line goes on: 3... cxd4 4. Nxd4 Nf6, a new move of the repertoire.
  await page.locator('.move[data-path="e4 c5 Nf3 d6 d4 cxd4"]').click();
  await clickSquare(page, 'f3', 'black');
  await clickSquare(page, 'd4', 'black');
  await clickSquare(page, 'g8', 'black');
  await clickSquare(page, 'f6', 'black');
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6');

  // Train: the session again, planned from the edited chapter; 1... c5, answered, isn't asked.
  await page.getByRole('group', { name: 'Study or train' }).getByRole('button', { name: 'Train' }).click();
  await expect(page).toHaveURL(/#\/train$/);
  await expect(feedback).toHaveText('New move: play cxd4');
  await expect(page.locator('.train-line')).toContainText('1. e4 c5 2. Nf3 d6 3. d4');
  await expect(page.locator('.train-counters')).toContainText('0 due · 4 new');
  await clickSquare(page, 'c5', 'black');
  await clickSquare(page, 'd4', 'black');
  await expect(feedback).toHaveText('New move: play Nf6');
  await expect(page.locator('.train-line')).toContainText('3. d4 cxd4 4. Nxd4');
  await clickSquare(page, 'g8', 'black');
  await clickSquare(page, 'f6', 'black');
  await expect(feedback).toHaveText(/New move learned: Nf6|New move: play Nc6/);
  await sync(page);
  // One answer each: the review before the visit, the two moves taught after it.
  await expect.poll(() => pushed(git).map((e) => [e['k'], e['card']])).toEqual([
    ['review', C5],
    ['taught', CXD4],
    ['taught', NF6_NAJDORF],
  ]);
  expect(git.textsOf().get('studies/Rep0Najd/Ch1Najdf.pgn')).toContain('3. d4 cxd4 4. Nxd4 Nf6 *');
});

test('train ↔ study from the chapter view: a repertoire study trains, the Interactive view plays from the move shown', async ({ page }) => {
  await setUp(page);
  await page.goto(`${site.url}#/study/Rep0Najd/Ch2Alapn?at=e4,c5`);
  await expect(page.locator('.move.current')).toHaveAttribute('data-path', 'e4 c5');
  const sw = page.getByRole('group', { name: 'Study or train' });
  await expect(sw.getByRole('button', { name: 'Train' })).toHaveAttribute('title', 'Train this study');
  await sw.getByRole('button', { name: 'Train' }).click();
  await expect(page).toHaveURL(/#\/train\/Rep0Najd$/);
  await expect(page.locator('.train-feedback')).toHaveText('Your move');

  // Play from here, to the study at the board's move, and Train: played again from that move.
  await page.goto(`${site.url}#/play/Rep0Najd/Ch2Alapn?at=e4`);
  await expect(page.locator('.train-feedback')).toHaveText('Your move');
  await page.getByRole('group', { name: 'Study or train' }).getByRole('button', { name: 'Study' }).click();
  await expect(page).toHaveURL(/#\/study\/Rep0Najd\/Ch2Alapn\?at=e4$/);
  await expect(sw.getByRole('button', { name: 'Train' })).toHaveAttribute('title', 'Back to the training session');
  await page.locator('.move[data-path="e4 c5 c3"]').click();
  await sw.getByRole('button', { name: 'Train' }).click();
  await expect(page).toHaveURL(/#\/play\/Rep0Najd\/Ch2Alapn\?at=e4,c5,c3$/);
  await expect(page.locator('.train-feedback')).toHaveText('Your move');
  await expect(page.locator('.train-line')).toContainText('1. e4 c5 2. c3');
});
