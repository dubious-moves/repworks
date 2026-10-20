// Idea cards (PLAN.md §5.128), on a desktop viewport and an emulated phone: a small French Advance
// deck (test/fixtures/ideas, public opening knowledge) imported as a reference study, its cards
// made from the ☰ menu, then asked from the study's Train button on the home: each new card shown
// first, then asked; a side line's move answered with its comment (Again), the answer found, a `!`
// move beside the first right (Good), Show and the owner's grade (Hard), and the card missed asked
// again at the end, ungraded. The events synced, then the cards removed from the same menu.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildImport, readImport } from '../../src/core/import/plan.ts';
import { FakeGit } from '../support/fakeGit.ts';
import { FakeGithub } from '../support/fakeGithub.ts';
import { fixtureFiles, REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare, studyMenu } from './board.ts';
import { serveGithub } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

const DECK = readFileSync(new URL('../fixtures/ideas/french-advance.pgn', import.meta.url), 'utf8');

/** The fixture repo with the deck imported as a reference study, as the Import screen would write it. */
function deckWorld() {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const built = buildImport(readImport(DECK), { name: 'French Advance ideas', kind: 'reference', source: { kind: 'file', name: 'french-advance.pgn' }, sides: new Map() }, { random, taken: new Set(['Rep0Najd']), now: '2026-10-20T08:00:00.000Z' });
  if (!built.ok) throw new Error(built.error);
  const files = fixtureFiles();
  for (const [path, text] of built.files) files.set(path, text);
  const git = new FakeGit(files);
  const github = new FakeGithub(git, { repo: REPO, branch: 'main', token: TOKEN });
  const meta = built.studies[0]!.meta;
  return { git, github, sid: meta.id, cids: meta.chapters };
}

async function play(page: Page, from: string, to: string) {
  await clickSquare(page, from, 'black');
  await clickSquare(page, to, 'black');
}

test('idea cards made for a study, asked from its Train button, and removed', async ({ page }) => {
  const { git, github, sid, cids } = deckWorld();
  await serveGithub(page, github);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('button.chip')).toHaveText(/^synced/);
  await page.evaluate((h) => (location.hash = h), `#/study/${sid}/${cids[1]}`);
  await expect(page.locator('.cg-wrap')).toBeVisible();
  await studyMenu(page, 'Make idea cards');
  await expect(page.getByText('3 idea cards made')).toBeVisible();

  await page.evaluate(() => (location.hash = '#/'));
  await expect(page.getByTestId('home-ideas')).toContainText('Ideas: 0 due · 3 new');
  await page.getByRole('link', { name: 'Train French Advance ideas' }).click();
  const card = page.getByTestId('idea-card');

  // A new card: shown first, its explanation, arrows and side lines, then asked.
  await expect(card).toHaveAttribute('data-phase', 'learn');
  await expect(card).toHaveAttribute('data-card', `i|${sid}|${cids[1]}`);
  await expect(card).toContainText('A pawn chain is weakest at its base');
  await expect(card.locator('.read-side-lines')).toContainText('(3... b6) Playable');
  await expect(card.locator('.cg-wrap')).toHaveClass(/orientation-black/);
  await page.getByRole('button', { name: 'Ask me (Space)' }).click();
  await expect(card).toHaveAttribute('data-phase', 'asking');
  await expect(page.getByTestId('idea-question')).toHaveText("White's pawns on d4 and e5 cramp you. Which pawn break attacks them?");
  await expect(card).not.toContainText('A pawn chain is weakest');
  // A side line's move: its comment, not the answer, Again.
  await play(page, 'b7', 'b6');
  await expect(page.getByTestId('idea-feedback')).toContainText('b6 isn’t the answer (Again)');
  await expect(page.getByTestId('idea-feedback')).toContainText('Playable, to trade the bad bishop');
  await play(page, 'c7', 'c5');
  await expect(card).toHaveAttribute('data-phase', 'back');
  await expect(page.getByTestId('idea-result')).toHaveText('c5: right, after b6. Recorded: Again.');
  await page.getByRole('button', { name: 'Next (Space)' }).click();

  // A first move marked ! beside the main one is right too: Good.
  await expect(card).toHaveAttribute('data-card', `i|${sid}|${cids[2]}`);
  await page.getByRole('button', { name: 'Ask me (Space)' }).click();
  await play(page, 'c8', 'd7');
  await expect(page.getByTestId('idea-result')).toHaveText('Bd7: right. Recorded: Good.');
  // The main line played out on the back.
  await page.getByRole('button', { name: 'End of the line' }).click();
  await expect(card.locator('.read-move')).toContainText('6... c4');
  await page.getByRole('button', { name: 'Next (Space)' }).click();

  // Show, then the owner's grade.
  await expect(card).toHaveAttribute('data-card', `i|${sid}|${cids[3]}`);
  await page.getByRole('button', { name: 'Ask me (Space)' }).click();
  await page.getByRole('button', { name: 'Show (Space)' }).click();
  await expect(page.getByTestId('idea-result')).toHaveText('Shown. The answer: Bd7.');
  await expect(card.locator('.read-side-lines')).toContainText('(7... Nxd4?? 8. Nxd4 Qxd4? 9. Bb5+)');
  await page.getByRole('button', { name: /^Hard/ }).click();

  // The card missed: asked again at the end, not graded.
  await expect(card).toHaveAttribute('data-card', `i|${sid}|${cids[1]}`);
  await expect(card).toContainText('again, not graded');
  await play(page, 'c7', 'c5');
  await expect(page.getByTestId('idea-result')).toHaveText('c5: right.');
  await page.getByRole('button', { name: 'Next (Space)' }).click();
  await expect(page.getByTestId('ideas-done')).toContainText('3 cards answered: 0 easy, 1 good, 1 hard, 1 again');

  await page.evaluate((h) => (location.hash = h), `#/study/${sid}/${cids[1]}`);
  await expect(page.locator('.cg-wrap')).toBeVisible();
  await studyMenu(page, 'Remove the idea cards');
  await page.locator('button.chip').click();
  const log = () =>
    [...git.textsOf()]
      .filter(([p]) => p.startsWith('progress/'))
      .map(([, t]) => t)
      .join('');
  await expect.poll(log, { timeout: 15_000 }).toContain(`"k":"idea","card":"i|${sid}|${cids[3]}","on":false`);
  expect(log()).toContain(`"k":"idea","card":"i|${sid}|${cids[1]}","on":true`);
  expect(log()).not.toContain(`"card":"i|${sid}|${cids[0]}"`);
  expect(log()).toMatch(new RegExp(`"k":"review","card":"i\\|${sid}\\|${cids[1]}","g":1,"ms":\\d+,"w":\\["b7b6"\\]`));
  expect(log()).toContain(`"card":"i|${sid}|${cids[2]}","g":3`);
  expect(log()).toContain(`"card":"i|${sid}|${cids[3]}","g":2`);
});
