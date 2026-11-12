// What a day's new moves will cost (PLAN.md §5.170), on a desktop viewport and an emulated phone:
// the line under "New moves a day" in the training settings, as the number is typed, on a made-up
// repertoire of sixty moves (ten lines of six White moves), none started, at 10:00 on 1 December.
//
// Controls run (2026-11-12), each failing both tests:
// - the line computed from the setting saved, not the number typed (`now.newPerDay`): "At 4 a
//   day" still reads "At 20 a day";
// - the day counted from tomorrow (`doneIn + 1`): "learned by Dec 3" reads "Dec 4".
import { test, expect, type Page } from '@playwright/test';
import { FakeGit } from '../support/fakeGit.ts';
import { FakeGithub } from '../support/fakeGithub.ts';
import { fixtureFiles, REPO, TOKEN } from '../support/syncWorld.ts';
import { serveGithub } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

// Black's first move is the line's own, so no two lines reach the same position: sixty moves.
const FIRST = ['a3 a6', 'b3 b6', 'g3 c6', 'h3 d6', 'a4 e6', 'b4 g6', 'g4 h6', 'h4 a5', 'c4 b5', 'f4 h5'];
const cid = (i: number) => `Ch${String(i).padStart(2, '0')}Line`;
const A3 = 'r|rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -|a2a3';

function sixty(): Map<string, string> {
  const files = new Map([...fixtureFiles()].filter(([path]) => !path.startsWith('studies/') && !path.startsWith('progress/')));
  files.set('studies/Rep0Big0/study.json', `${JSON.stringify({ format: 1, id: 'Rep0Big0', name: 'Sixty moves', kind: 'repertoire', chapters: FIRST.map((_, i) => cid(i)) }, null, 2)}\n`);
  FIRST.forEach((first, i) => files.set(`studies/Rep0Big0/${cid(i)}.pgn`, `[ChapterName "Line ${i + 1}"]\n[Orientation "white"]\n\n1. ${first} 2. Nf3 Nf6 3. Nc3 Ng8 4. e4 Nf6 5. d4 Ng8 6. Be2 *\n`));
  return files;
}

async function openSettings(page: Page, files: Map<string, string>) {
  await page.clock.install({ time: new Date('2026-12-01T10:00:00Z') });
  await serveGithub(page, new FakeGithub(new FakeGit(files), { repo: REPO, branch: 'main', token: TOKEN }));
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  await page.locator('.train-card').getByRole('button', { name: 'Training settings' }).click();
  return page.getByRole('dialog', { name: 'Training settings' });
}

test('the forecast under New moves a day: the reviews a day in two weeks and the day the moves left are learned, as the number is typed', async ({ page }) => {
  const dialog = await openSettings(page, sixty());
  const line = dialog.getByTestId('new-moves-forecast');
  const field = dialog.getByLabel('New moves a day');

  // The setting as saved, 20 a day: sixty moves in three days, today the first.
  await expect(field).toHaveValue('20');
  await expect(line).toHaveText(/^At 20 a day: about \d+ reviews? a day in two weeks, and the 60 moves left learned by Dec 3\.$/);

  // Sixty learned in three days are quiet in the second week: their third review is past it.
  await expect(line).toHaveText('At 20 a day: about 0 reviews a day in two weeks, and the 60 moves left learned by Dec 3.');

  // 4 a day: 56 in the fortnight, the last four on the fifteenth day. Each day of the second week
  // holds that day's 4 first reviews and the second reviews of the 4 taught three days before.
  await field.fill('4');
  await expect(line).toHaveText('At 4 a day: about 8 reviews a day in two weeks, and the 60 moves left learned by Dec 15.');
  // Twice the moves a day (until the sixty run out on the eighth day).
  await field.fill('8');
  await expect(line).toHaveText('At 8 a day: about 5 reviews a day in two weeks, and the 60 moves left learned by Dec 8.');
  await field.fill('60');
  await expect(line).toHaveText(/^At 60 a day: about \d+ reviews a day in two weeks, and the 60 moves left learned today\.$/);
  await field.fill('1');
  await expect(line).toHaveText('At 1 a day: about 2 reviews a day in two weeks, and the 60 moves left learned by Jan 29, 2027.');
  await field.fill('0');
  await expect(line).toHaveText('At 0 a day: about 0 reviews a day in two weeks, and none of the 60 moves left learned.');
  // No number, or none a limit can be: no line.
  await field.fill('');
  await expect(line).toHaveCount(0);
  await field.fill('2.5');
  await expect(line).toHaveCount(0);
  await field.fill('2000');
  await expect(line).toHaveCount(0);

  // A lower retention is longer intervals: the second review eight days on, not three, so the
  // week's first day has only its own first reviews.
  await field.fill('4');
  await expect(line).toHaveText(/about 8 reviews a day/);
  await dialog.getByLabel('Retention').fill('0.8');
  await expect(line).toHaveText('At 4 a day: about 7 reviews a day in two weeks, and the 60 moves left learned by Dec 15.');
  await dialog.getByLabel('Retention').fill('0.9');
  // A first review a day later (a step past midnight) moves the week's reviews by a day, not their number.
  await dialog.getByLabel('First review after a new move').fill('20');
  await expect(line).toHaveText('At 4 a day: about 8 reviews a day in two weeks, and the 60 moves left learned by Dec 15.');

  // The line inside the dialog, the page not scrolling sideways.
  const [box, lineBox] = [(await dialog.boundingBox())!, (await line.boundingBox())!];
  expect(lineBox.x).toBeGreaterThanOrEqual(box.x);
  expect(lineBox.x + lineBox.width).toBeLessThanOrEqual(box.x + box.width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  await expect(dialog).toContainText('The reviews are counted with every answer right: misses add to them.');
});

test('moves taught today come off today’s share, and a move started is not left to learn', async ({ page }) => {
  const files = sixty();
  // 1. a3 taught at 09:00 today.
  files.set('progress/Desktop1/2026-12-01.jsonl', `{"v":1,"n":1,"t":"2026-12-01T09:00:00.000Z","k":"taught","card":"${A3}"}\n`);
  const dialog = await openSettings(page, files);
  const line = dialog.getByTestId('new-moves-forecast');
  await expect(dialog).toContainText('1 taught today.');
  // 59 left; at 1 a day none today (the one is taught), so 59 days from tomorrow.
  await dialog.getByLabel('New moves a day').fill('1');
  await expect(line).toHaveText('At 1 a day: about 2 reviews a day in two weeks, and the 59 moves left learned by Jan 29, 2027.');
  // At 30: 29 today, the other 30 tomorrow.
  await dialog.getByLabel('New moves a day').fill('30');
  await expect(line).toHaveText(/and the 59 moves left learned by Dec 2\.$/);
});
