// Puzzles from the games that played the repertoire's lines (PLAN.md §5.47, §5.48), on a desktop
// viewport and an emulated phone: a White repertoire chapter 26 plies deep, a fake dataset (its
// meta.json, an index that lists three real puzzles at every position of the chapter, and the
// real bodies cut from the published set), the size said before a collect, the collect, puzzles
// dealt in a storm with the disguise, one solved through the opponent's replies and one missed,
// the review, and the answers synced as `z|` events.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeUci } from 'chessops/util';
import { parseSan } from 'chessops/san';
import { positionKey } from '../../src/core/chess/positionKey.ts';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { fakeExplorer, lichessLogin, serveExplorer } from './explorer.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite();
});
test.afterAll(async () => {
  await site.close();
});

const FIX = new URL('../fixtures/puzzles/', import.meta.url);
const BODIES = readFileSync(new URL('puzzles-0a1.ndjson', FIX), 'utf8');
const META = readFileSync(new URL('meta.json', FIX), 'utf8');
/** The White-to-move puzzles of the fixture, their solutions in UCI. */
const SOLUTIONS: Record<string, string[]> = {
  '0bwf2': ['h4e7', 'b4e7', 'f3g4', 'c3b2', 'c1b2'],
  '16JA8': ['h3h8'],
  '1ERqy': ['e2e4', 'e7g5', 'e5d5'],
};
const LINE = '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 Nbd7 7. Rc1 c6 8. Bd3 dxc4 9. Bxc4 Nd5 10. Bxe7 Qxe7 11. O-O Nxc3 12. Rxc3 e5 13. Qc2 exd4';

/** Every position of the line, keyed: the fake index lists the puzzles at each. */
function lineKeys(): string[] {
  const pos = Chess.default();
  const keys = [positionKey(makeFen(pos.toSetup()))];
  for (const san of LINE.replace(/\d+\./g, '').split(/\s+/).filter(Boolean)) {
    pos.play(parseSan(pos, san)!);
    keys.push(positionKey(makeFen(pos.toSetup())));
  }
  return keys;
}

interface World {
  git: FakeGit;
  requests: { url: string; auth: string | undefined; method: string }[];
}

async function setUp(page: Page): Promise<World> {
  const { git, github } = world();
  git.commitIfHead(
    git.head,
    'a deep chapter',
    new Map([
      ['studies/Rep1Qgdx/study.json', JSON.stringify({ format: 1, id: 'Rep1Qgdx', name: 'QGD', kind: 'repertoire', chapters: ['Ch1Ortho'] }, null, 2) + '\n'],
      ['studies/Rep1Qgdx/Ch1Ortho.pgn', `[Event "QGD: Orthodox"]\n[StudyName "QGD"]\n[ChapterName "Orthodox"]\n[Orientation "white"]\n\n${LINE} *\n`],
    ]),
    [],
  );
  await lichessLogin(page);
  await page.addInitScript(() => localStorage.setItem('repworks-storm', JSON.stringify({ deepen: false })));
  await serveGithub(page, github);
  await serveExplorer(page, fakeExplorer());
  const requests: World['requests'] = [];
  const index = JSON.stringify(Object.fromEntries(lineKeys().map((k) => [k, Object.keys(SOLUTIONS).map((id) => [id, 1600, 'w', 14, 30, [23]])])));
  await page.route('https://skaeglund.github.io/puzzle-explorer-data/**', async (route) => {
    const r = route.request();
    const url = new URL(r.url());
    requests.push({ url: url.pathname, auth: r.headers()['authorization'], method: r.method() });
    const body = url.pathname.endsWith('meta.json') ? META : url.pathname.includes('/index/') ? index : BODIES;
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }, body });
  });
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.chip')).toHaveText(/^synced/);
  return { git, requests };
}

async function play(page: Page, ucis: string[]) {
  const side = (await page.locator('.storm-card').getAttribute('data-side')) as 'white' | 'black';
  for (const [i, uci] of ucis.entries()) {
    // Each move after the opponent's reply: the puzzle's plies played so far are 2 per move.
    await expect(page.locator('.storm-card')).toHaveAttribute('data-step', String(2 * i));
    await expect(page.locator('.storm-card')).toHaveAttribute('data-phase', 'solving');
    await clickSquare(page, uci.slice(0, 2), side);
    await clickSquare(page, uci.slice(2, 4), side);
  }
}
const userMoves = (ucis: string[]) => ucis.filter((_, i) => i % 2 === 0);

/** A legal first move that isn't the solution's and doesn't mate. */
function wrongMove(id: string): string {
  const body = BODIES.split('\n').filter(Boolean).map((l) => JSON.parse(l) as { id: string; fen: string }).find((b) => b.id === id)!;
  const pos = Chess.fromSetup(parseFen(body.fen).unwrap()).unwrap();
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      if (pos.board.get(from)?.role === 'king') continue;
      const uci = makeUci({ from, to });
      const after = pos.clone();
      after.play({ from, to });
      if (uci !== SOLUTIONS[id]![0] && !after.isCheckmate() && !(pos.board.get(from)?.role === 'pawn' && (to >> 3 === 7 || to >> 3 === 0))) return uci;
    }
  }
  throw new Error('no wrong move');
}

test('puzzles: the size asked first, collected, dealt with the disguise, solved and missed, synced', async ({ page }) => {
  const w = await setUp(page);
  await page.goto(`${site.url}#/storm/Rep1Qgdx`);
  const card = page.getByRole('region', { name: 'Puzzles' });
  await expect(card.getByTestId('puzzle-count')).toContainText('0 ready · 0 found · 0 of');
  // Nothing is asked of the dataset before Collect.
  expect(w.requests).toHaveLength(0);
  await card.getByRole('button', { name: 'Collect puzzles…' }).click();
  await expect(card).toContainText('Best on Wi-Fi');
  expect(w.requests).toHaveLength(0);
  await card.getByRole('button', { name: /^Collect: about \d+ MB$/ }).click();
  await expect(card.getByTestId('puzzle-count')).toContainText('3 ready · 3 found');
  await expect(card).toContainText('3 puzzles found');
  await expect(card.getByRole('button', { name: 'Collected' })).toBeDisabled();
  expect(w.requests.every((r) => r.method === 'GET' && r.auth === undefined)).toBe(true);
  expect(w.requests.filter((r) => r.url.includes('/index/')).length).toBeGreaterThan(0);

  // Puzzles only: the share at 100%.
  await card.getByLabel('Share of cards').selectOption('100');
  await page.getByRole('button', { name: 'Start storm' }).click();
  await expect(page.locator('.storm-card')).toBeVisible();
  // The disguise: no rating, no depth, the same words as a position's.
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  await expect(page.locator('.storm-card .train-line')).not.toContainText('past the line');
  await expect(page.locator('.storm-card')).not.toContainText('rated');

  // The first: solved through the opponent's replies.
  const first = (await page.locator('.storm-card').getAttribute('data-card'))!.slice(2);
  await play(page, userMoves(SOLUTIONS[first]!));
  await expect(page.getByTestId('storm-verdict')).toContainText('Solved');
  await expect(page.getByTestId('puzzle-facts')).toContainText('rated');
  await expect(page.getByTestId('storm-points')).toHaveText('2');

  // The second: a wrong first move.
  await expect.poll(async () => (await page.locator('.storm-card').getAttribute('data-card'))!.slice(2)).not.toBe(first);
  const second = (await page.locator('.storm-card').getAttribute('data-card'))!.slice(2);
  await play(page, [wrongMove(second)]);
  await expect(page.getByTestId('storm-verdict')).toContainText('Not the solution');
  await expect(page.getByTestId('storm-points')).toHaveText('0');

  await page.getByRole('button', { name: /^End/ }).click();
  const rows = page.locator('.storm-row');
  await expect(rows.nth(0)).toContainText('Solved');
  await expect(rows.nth(1)).toContainText('Not the solution');
  await page.locator('.chip').click();
  await expect
    .poll(() => {
      const texts = [...w.git.textsOf()].filter(([p]) => p.startsWith('progress/')).map(([, t]) => t).join('');
      return [texts.includes(`"card":"z|${first}","b":"great"`), texts.includes(`"card":"z|${second}","b":"blunder"`)];
    }, { timeout: 15_000 })
    .toEqual([true, true]);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(wide).toBeLessThanOrEqual(0);
});
