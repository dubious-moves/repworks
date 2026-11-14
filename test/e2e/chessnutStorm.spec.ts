// The storm's untimed sessions on the Chessnut Move (CHESSNUT.md §5.2, §6 part (e)), against the
// simulated Move (test/e2e/chessnut.ts), on a desktop viewport and an emulated phone. The test
// repertoire synced (github.ts's world), the board connected through its chip, then the storm's
// store seeded with positions whose lists Stockfish scored deep enough to judge (storm.spec.ts's
// ladder, a chosen move put first where a test needs it), so every move is graded from its list.
// - A set: each card set up before it is asked (the screen's board takes no move meanwhile), the
//   arrival lit blue; the top move by hand graded, lit bright green and said, written as an answer
//   from the screen is; the next card by itself.
// - A held card: the move taken back by the robot after the put-back time, tried again; taken back
//   by hand, Try again at once; Show the move: the move driven back, the best lit green.
// - Show and grade: the top move lit once the moves are shown; a move named on the board graded
//   "#3 of 12", then on by itself.
// - Castling by hand graded by its list (standard UCI, e1g1), lit on the king's squares, and a card
//   needing a third queen not dealt.
// - `playArrival`: the position before the arrival driven first, then the card.
// - "Play on the screen" during a slow setup.
// - A puzzle: the opponent's reply driven after the right move, the next move asked once the board
//   shows it.
// Part (f), the timed storm and the review (CHESSNUT.md §5.3, §6 part (f)):
// - A timed storm: the clock stands still through each card's setup (a 2 s drive), runs while the
//   card is asked, stops at the verdict and stays so through the next card's setup.
// - The review: opened and stepped quickly, only the row stayed on is driven; a row's arrows lit
//   (the move played red, the best green once shown); a retry by hand graded, lit and said.
//
// Controls (each run once, 2026-11-14, on the desktop project, and each failed the named tests):
// - `deal` going straight to `solving` with the board linked: "a set …", "a held card …",
//   "castling …", "playArrival …", "Play on the screen …";
// - `answerMove` keeping the screen's castling spelling (no `standard`): "castling …";
// - the held card's take-back by itself not scheduled: "a held card …";
// - the set's next card not scheduled with the board linked: "a set …", "a puzzle …";
// - show and grade's next card not scheduled: "show and grade …".
// Part (f)'s (each run once, 2026-11-14, on the desktop project, and each failed the named test):
// - `setPhase` starting the timed storm's clock in `setup` as in `solving`: "a timed storm …";
// - the review's board passing no `mirror`: "the review …";
// - the review's `delayMs` gone (every row stepped through driven): "the review …";
// - the retry's `onMove` dropping `board` (no verdict said): "the review …";
// - a puzzle's reply asked at once (`setPhase('solving')` with the board linked): "a puzzle …".
// The link's own fix for "a held card …" (the same wrong move made again after the robot took it
// back was never read) has its control in test/unit/core/board/link.test.ts.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { Chess, castlingSide, normalizeMove } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { kingCastlesTo, makeUci, parseSquare, parseUci } from 'chessops/util';
import { positionKey } from '../../src/core/chess/positionKey.ts';
import type { FakeGit } from '../support/fakeGit.ts';
import { REPO, TOKEN } from '../support/syncWorld.ts';
import { clickSquare } from './board.ts';
import { installFakeMove, type FakeMoveOptions } from './chessnut.ts';
import { fakeEngine } from './engine.ts';
import { fakeExplorer, lichessLogin, serveExplorer } from './explorer.ts';
import { serveGithub, world } from './github.ts';
import { serveSite, type SiteServer } from './server.ts';

type Move = { hand(fen: string): void; position(): string; lights(): number[]; drives(): string[] };

const LADDER = [20, 5, -25, -40, -60, -80, -100, -120];
const LIGHT = { off: 0, red: 1, green: 2, blue: 3, darkGreen: 4, brightGreen: 5, yellow: 6, orange: 7 };

const positionOf = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
const fen4 = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
const boardOf = (fen: string) => fen.split(' ')[0]!;
/** Every legal move in standard UCI, sorted (storm.spec.ts's order, best first). */
function ranked(fen: string): string[] {
  const pos = positionOf(fen);
  const out = new Set<string>();
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      const side = castlingSide(pos, { from, to });
      const piece = pos.board.get(from)!;
      const promo = piece.role === 'pawn' && (to >> 3 === 7 || to >> 3 === 0);
      out.add(side ? makeUci({ from, to: kingCastlesTo(pos.turn, side) }) : makeUci(promo ? { from, to, promotion: 'queen' } : { from, to }));
    }
  }
  return [...out].sort();
}
/** The FEN after a UCI move (either castling spelling). */
function afterUci(fen: string, uci: string): string {
  const pos = positionOf(fen);
  pos.play(normalizeMove(pos, parseUci(uci)!));
  return makeFen(pos.toSetup());
}
/** The fake engine's lines (the look-ahead's): the ladder over the first 12 moves. */
const ladderLines = (fen: string): [number, number, string][] => ranked(fen.split(' ').length === 4 ? `${fen} 0 1` : fen).slice(0, 12).map((uci, i) => [i + 1, LADDER[Math.min(i, LADDER.length - 1)]!, uci]);

interface Card {
  card: string;
  fen: string;
  before?: string;
  list: string[];
  stored: Record<string, unknown>;
}
/**
 * A stored position after `sans` (from `from`, else the start), the side to move the user's, its
 * list the ladder over its moves with `first` put first, scored by Stockfish past the judge's depth
 * (so the look-ahead never replaces it), and the move that reached it as its arrival.
 */
function card(sans: string[], o: { first?: string[]; from?: string } = {}): Card {
  const pos = o.from ? positionOf(o.from) : Chess.default();
  let arrived: { san: string; uci: string; before: string } | null = null;
  for (const san of sans) {
    const before = makeFen(pos.toSetup());
    const move = parseSan(pos, san)! as { from: number; to: number };
    const side = castlingSide(pos, move);
    arrived = { san, uci: side ? makeUci({ from: move.from, to: kingCastlesTo(pos.turn, side) }) : makeUci(move), before };
    pos.play(move);
  }
  const fen = makeFen(pos.toSetup());
  const first = o.first ?? [];
  const list = [...first, ...ranked(fen).filter((u) => !first.includes(u))].slice(0, 12);
  const id = `s|${fen4(fen)}`;
  return {
    card: id,
    fen,
    ...(arrived ? { before: arrived.before } : {}),
    list,
    stored: {
      card: id,
      key: fen4(fen),
      fen,
      side: pos.turn,
      ply: sans.length,
      lines: [{ sid: 'Rep0Najd', cid: 'Ch1Najdf', path: sans.length ? sans : [fen4(fen)] }],
      names: [],
      arrived,
      scored: list.map((u, i) => ({ u, s: LADDER[Math.min(i, LADDER.length - 1)]! })),
      src: 'sf',
      depth: 40,
      invented: false,
      unc: null,
      games: null,
      at: Date.now(),
    },
  };
}

const NAJDORF = card(['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4']);
const QGD = card(['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6']);
const ITALIAN = card(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], { first: ['c2c3', 'e1g1'] });
const QUEENS = card([], { from: '4k3/8/8/8/8/8/8/QQQ1K3 w - - 0 1' });

let site: SiteServer;
test.beforeAll(async () => {
  site = await serveSite({ engine: fakeEngine(undefined, {}, true), engineLines: ladderLines });
});
test.afterAll(async () => {
  await site.close();
});

const move = (page: Page) => ({
  hand: (board: string) => page.evaluate((f) => (window as unknown as { __move: Move }).__move.hand(f), board),
  position: () => page.evaluate(() => (window as unknown as { __move: Move }).__move.position()),
  lights: () => page.evaluate(() => (window as unknown as { __move: Move }).__move.lights()),
  drives: () => page.evaluate(() => (window as unknown as { __move: Move }).__move.drives()),
});
const spoken = (page: Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
/** A square's index on the board's lights (a1 = 0). */
const sq = (name: string) => (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);
/** The lights on a move's two squares. */
const litOn = async (page: Page, uci: string) => {
  const l = await move(page).lights();
  return [l[sq(uci.slice(0, 2))], l[sq(uci.slice(2, 4))]];
};

/** The world synced, the simulated Move, speech recorded, the board's settings, the board connected. */
async function setUp(page: Page, o: { board?: FakeMoveOptions; prefs?: Record<string, unknown>; prepare?: (git: FakeGit) => void } = {}): Promise<FakeGit> {
  await page.addInitScript(installFakeMove, o.board ?? {});
  await page.addInitScript((prefs) => {
    const w = window as unknown as Record<string, unknown>;
    w['__spoken'] = [];
    w['SpeechSynthesisUtterance'] = function (this: { text: string }, t: string) {
      this.text = t;
    };
    Object.defineProperty(window, 'speechSynthesis', { value: { speak: (u: { text: string }) => (w['__spoken'] as string[]).push(u.text), cancel() {} } });
    localStorage.setItem('repworks-board', JSON.stringify({ speak: true, ...prefs }));
    localStorage.getItem('repworks-storm') ?? localStorage.setItem('repworks-storm', JSON.stringify({ deepen: false }));
  }, o.prefs ?? {});
  const { git, github } = world();
  o.prepare?.(git);
  await serveGithub(page, github);
  await serveExplorer(page, fakeExplorer());
  await lichessLogin(page);
  await page.goto(`${site.url}#setup?repo=${encodeURIComponent(REPO)}&token=${TOKEN}&name=desktop`);
  await expect(page.locator('.sync-chip')).toHaveText(/^synced/);
  const chip = page.getByTestId('board-chip');
  await chip.click();
  await expect(chip).toHaveText('♞ 87%');
  return git;
}

/** The storm's store seeded with these cards, then the storm's page. */
async function seed(page: Page, cards: Card[]): Promise<void> {
  await page.evaluate(async (ps) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open('repworks-storm', 1);
      r.onupgradeneeded = () => {
        for (const s of ['positions', 'puzzleCandidates', 'puzzleBodies', 'meta']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s);
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const tx = db.transaction('positions', 'readwrite');
    for (const p of ps) tx.objectStore('positions').put(p, (p as { card: string }).card);
    await new Promise((resolve) => (tx.oncomplete = resolve));
    db.close();
  }, cards.map((c) => c.stored));
  await page.evaluate(() => (location.hash = '#/storm'));
  await expect(page.getByTestId('storm-count')).toContainText(`${cards.length} position`);
}

const stormCard = (page: Page) => page.locator('.storm-card');
const cardOf = async (page: Page, cards: Card[]) => {
  const id = await stormCard(page).getAttribute('data-card');
  return cards.find((c) => c.card === id)!;
};
/** The card asked: set up first, then solving. */
async function asked(page: Page, c: Card) {
  await expect(stormCard(page)).toHaveAttribute('data-card', c.card);
  await expect(stormCard(page)).toHaveAttribute('data-phase', 'solving', { timeout: 10_000 });
  expect((await move(page).drives()).at(-1)).toBe(boardOf(c.fen));
}

test('a set on the board: each card set up before it is asked, the arrival lit; the top move by hand graded, lit, said and written; the next card by itself', async ({ page }) => {
  test.setTimeout(60_000);
  const git = await setUp(page, { board: { driveMs: 1500 } });
  const b = move(page);
  const cards = [NAJDORF, QGD];
  await seed(page, cards);
  await page.getByRole('button', { name: /^Set of/ }).click();
  // Setting up: the card shown, not asked; a move on the screen's board isn't taken.
  await expect(stormCard(page)).toHaveAttribute('data-phase', 'setup');
  await expect(page.getByTestId('storm-verdict')).toContainText('Setting up the board…');
  const first = await cardOf(page, cards);
  await clickSquare(page, first.list[0]!.slice(0, 2), 'white');
  await clickSquare(page, first.list[0]!.slice(2, 4), 'white');
  await asked(page, first);
  await expect(page.getByTestId('storm-verdict')).toContainText('Find a good move');
  // The move that reached it lit blue.
  const arrival = (c: Card) => {
    const pos = positionOf(c.before!);
    const m = [...pos.allDests()].flatMap(([from, ds]) => [...ds].map((to) => makeUci({ from, to }))).find((u) => fen4(afterUci(c.before!, u)) === fen4(c.fen))!;
    return m;
  };
  await expect.poll(() => litOn(page, arrival(first))).toEqual([LIGHT.blue, LIGHT.blue]);

  // The top move by hand: Best move!, lit bright green, said; the next card by itself.
  const best = first.list[0]!;
  await b.hand(boardOf(afterUci(first.fen, best)));
  await expect(page.getByTestId('storm-verdict')).toContainText('Best move!');
  await expect.poll(() => litOn(page, best)).toEqual([LIGHT.brightGreen, LIGHT.brightGreen]);
  await expect.poll(() => spoken(page)).toContain('Best move.');
  await expect(page.locator('.storm-next')).toBeVisible();
  const second = cards.find((c) => c !== first)!;
  await expect(stormCard(page)).toHaveAttribute('data-card', second.card, { timeout: 4000 });
  await expect(stormCard(page)).toHaveAttribute('data-phase', 'setup');
  await asked(page, second);
  await expect.poll(() => litOn(page, arrival(second))).toEqual([LIGHT.blue, LIGHT.blue]);

  // Its answer from the board written as one from the screen: a set's, the move in standard UCI.
  await page.locator('.sync-chip').click();
  await expect
    .poll(() => [...git.textsOf()].filter(([p]) => p.startsWith('progress/')).map(([, t]) => t).join(''), { timeout: 15_000 })
    .toContain(`"card":"${first.card}","b":"great","u":"${best}"`);
});

test('a held card on the board: taken back by the robot and tried again; taken back by hand, Try again at once; Show the move: driven back, the best lit green', async ({ page }) => {
  test.setTimeout(60_000);
  await setUp(page, { prefs: { putBackMs: 3500 } });
  const b = move(page);
  await seed(page, [QGD]);
  await page.getByRole('button', { name: /^Set of/ }).click();
  await asked(page, QGD);
  const worst = QGD.list[LADDER.length - 1]!;
  const wrong = boardOf(afterUci(QGD.fen, worst));

  // A mistake by hand: held, lit orange, the bar to the take-back; the robot takes it back after 3.5 s.
  await b.hand(wrong);
  await expect(stormCard(page)).toHaveAttribute('data-phase', 'held');
  await expect(page.getByTestId('storm-verdict')).toContainText('Mistake');
  await expect.poll(() => litOn(page, worst)).toEqual([LIGHT.orange, LIGHT.orange]);
  await expect(page.locator('.storm-next')).toBeVisible();
  await expect.poll(() => spoken(page)).toContain('Mistake.');
  await page.waitForTimeout(2500);
  await expect(stormCard(page)).toHaveAttribute('data-phase', 'held');
  await expect(stormCard(page)).toHaveAttribute('data-phase', 'solving', { timeout: 3000 });
  await expect.poll(b.position).toBe(boardOf(QGD.fen));
  await expect(page.getByTestId('storm-counted')).toContainText('Mistake');

  // Again, then taken back by hand: Try again at once (well before the 3.5 s).
  await b.hand(wrong);
  await expect(stormCard(page)).toHaveAttribute('data-phase', 'held');
  await b.hand(boardOf(QGD.fen));
  await expect(stormCard(page)).toHaveAttribute('data-phase', 'solving', { timeout: 2000 });

  // A third time: no attempts left, so no take-back by itself. Show the move: the move driven back,
  // the best lit green, the move's own lights gone.
  await b.hand(wrong);
  await expect(page.getByTestId('storm-verdict')).toContainText('Mistake');
  await expect(page.locator('.storm-next')).toHaveCount(0);
  await page.getByRole('button', { name: /^Show the move/ }).click();
  await expect(page.locator('.storm-best')).toContainText('best');
  await expect.poll(b.position).toBe(boardOf(QGD.fen));
  const best = QGD.list[0]!;
  await expect.poll(() => litOn(page, best)).toEqual([LIGHT.green, LIGHT.green]);
  expect((await b.lights()).filter((l) => l === LIGHT.orange)).toEqual([]);
});

test('show and grade on the board: the top move lit once the moves are shown; a move named on the board graded #3 of 12, then on by itself', async ({ page }) => {
  await setUp(page);
  const b = move(page);
  await seed(page, [QGD]);
  await page.getByTestId('storm-show-start').click();
  await asked(page, QGD);
  const best = QGD.list[0]!;
  // Hidden: only the arrival lit.
  await expect.poll(async () => (await b.lights()).filter((l) => l !== LIGHT.off).length).toBe(2);
  await page.getByRole('button', { name: /^Show the moves/ }).click();
  await expect.poll(() => litOn(page, best)).toEqual([LIGHT.brightGreen, LIGHT.brightGreen]);
  // Twelve arrows on the screen; only the top move's lit, beside the arrival.
  expect((await b.lights()).filter((l) => l !== LIGHT.off && l !== LIGHT.blue).length).toBe(2);

  const third = QGD.list[2]!;
  await b.hand(boardOf(afterUci(QGD.fen, third)));
  await expect(page.getByTestId('storm-verdict')).toContainText(/Good move.*#3 of 12/);
  await expect.poll(() => litOn(page, third)).toEqual([LIGHT.darkGreen, LIGHT.darkGreen]);
  await expect.poll(() => spoken(page)).toContain(`Good. The best move was ${spokenSan(QGD.fen, best)}.`);
  // The screen keeps the card's position with every move: the board follows; then the session goes on by itself.
  await expect.poll(b.position).toBe(boardOf(QGD.fen));
  await expect(page.getByTestId('storm-summary')).toBeVisible({ timeout: 5000 });
});
/** A SAN as the board's speech says it (voice.ts's `moveToSpeech`, for the plain moves used here). */
function spokenSan(fen: string, uci: string): string {
  const pos = positionOf(fen);
  const piece = pos.board.get(parseSquare(uci.slice(0, 2))!)!;
  const names: Record<string, string> = { knight: 'Knight', bishop: 'Bishop', rook: 'Rook', queen: 'Queen', king: 'King' };
  const to = uci.slice(2, 4);
  return piece.role === 'pawn' ? `${to[0]}, ${to[1]}` : `${names[piece.role]} ${to[0]}, ${to[1]}`;
}

test('castling by hand: graded by its list in standard UCI, lit on the king’s squares; a card needing a third queen not dealt', async ({ page }) => {
  const git = await setUp(page);
  const b = move(page);
  await seed(page, [ITALIAN, QUEENS]);
  await page.getByRole('button', { name: /^Set of/ }).click();
  // Only the Italian: the three queens can't be set up.
  await expect(page.getByTestId('storm-set')).toContainText('1 of 1');
  await asked(page, ITALIAN);
  // O-O by hand (the king first, then the rook: the board reports the end).
  await b.hand(boardOf(afterUci(ITALIAN.fen, 'e1g1')));
  await expect(page.getByTestId('storm-verdict')).toContainText('#2 of 12');
  // Lit in its band's colour (Great or Good) on the king's two squares, not the rook's.
  await expect.poll(async () => [LIGHT.green, LIGHT.darkGreen].includes((await b.lights())[sq('e1')]!)).toBe(true);
  const lit = await b.lights();
  expect(lit[sq('g1')]).toBe(lit[sq('e1')]);
  expect(lit[sq('h1')]).toBe(LIGHT.off);
  // The screen shows the king castled; the board kept it.
  expect(await b.position()).toBe(boardOf(afterUci(ITALIAN.fen, 'e1g1')));
  await page.locator('.sync-chip').click();
  await expect
    .poll(() => [...git.textsOf()].filter(([p]) => p.startsWith('progress/')).map(([, t]) => t).join(''), { timeout: 15_000 })
    .toContain(`"card":"${ITALIAN.card}"`);
  const texts = [...git.textsOf()].filter(([p]) => p.startsWith('progress/')).map(([, t]) => t).join('');
  expect(texts).toContain('"u":"e1g1"');
  expect(texts).not.toContain('"u":"e1h1"');
});

test('playArrival: the position before the arrival driven first, then the card', async ({ page }) => {
  await setUp(page, { prefs: { playArrival: true } });
  const b = move(page);
  await seed(page, [NAJDORF]);
  await page.getByRole('button', { name: /^Set of/ }).click();
  await asked(page, NAJDORF);
  expect((await b.drives()).slice(-2)).toEqual([boardOf(NAJDORF.before!), boardOf(NAJDORF.fen)]);
});

test('Play on the screen during a slow setup: the card asked on the screen at once', async ({ page }) => {
  await setUp(page, { board: { driveMs: 5000 } });
  await seed(page, [NAJDORF]);
  await page.getByRole('button', { name: /^Set of/ }).click();
  await expect(stormCard(page)).toHaveAttribute('data-phase', 'setup');
  await page.getByRole('button', { name: /^Play on the screen/ }).click();
  await expect(stormCard(page)).toHaveAttribute('data-phase', 'solving');
  const best = NAJDORF.list[0]!;
  await clickSquare(page, best.slice(0, 2), 'white');
  await clickSquare(page, best.slice(2, 4), 'white');
  await expect(page.getByTestId('storm-verdict')).toContainText('Best move!');
});

/* ------------------------------------------------------------------ puzzles (puzzles.spec.ts's world) */

const FIX = new URL('../fixtures/puzzles/', import.meta.url);
const BODIES = readFileSync(new URL('puzzles-0a1.ndjson', FIX), 'utf8');
const META = readFileSync(new URL('meta.json', FIX), 'utf8');
const SOLUTIONS: Record<string, string[]> = {
  '0bwf2': ['h4e7', 'b4e7', 'f3g4', 'c3b2', 'c1b2'],
  '16JA8': ['h3h8'],
  '1ERqy': ['e2e4', 'e7g5', 'e5d5'],
};
const LINE = '1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3 Nbd7 7. Rc1 c6 8. Bd3 dxc4 9. Bxc4 Nd5 10. Bxe7 Qxe7 11. O-O Nxc3 12. Rxc3 e5 13. Qc2 exd4';
function lineKeys(): string[] {
  const pos = Chess.default();
  const keys = [positionKey(makeFen(pos.toSetup()))];
  for (const san of LINE.replace(/\d+\./g, '').split(/\s+/).filter(Boolean)) {
    pos.play(parseSan(pos, san)!);
    keys.push(positionKey(makeFen(pos.toSetup())));
  }
  return keys;
}

test('a puzzle on the board: the right move by hand, the reply driven before the next move is asked, solved', async ({ page }) => {
  test.setTimeout(90_000);
  await setUp(page, {
    board: { driveMs: 2000 },
    prepare: (git) =>
      git.commitIfHead(
        git.head,
        'a deep chapter',
        new Map([
          ['studies/Rep1Qgdx/study.json', JSON.stringify({ format: 1, id: 'Rep1Qgdx', name: 'QGD', kind: 'repertoire', chapters: ['Ch1Ortho'] }, null, 2) + '\n'],
          ['studies/Rep1Qgdx/Ch1Ortho.pgn', `[Event "QGD: Orthodox"]\n[StudyName "QGD"]\n[ChapterName "Orthodox"]\n[Orientation "white"]\n\n${LINE} *\n`],
        ]),
        [],
      ),
  });
  const b = move(page);
  const index = JSON.stringify(Object.fromEntries(lineKeys().map((k) => [k, Object.keys(SOLUTIONS).map((id) => [id, 1600, 'w', 14, 30, [23]])])));
  await page.route('https://skaeglund.github.io/puzzle-explorer-data/**', async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith('meta.json') ? META : url.pathname.includes('/index/') ? index : BODIES;
    await route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }, body });
  });
  await page.evaluate(() => (location.hash = '#/storm/Rep1Qgdx'));
  const panel = page.getByRole('region', { name: 'Puzzles' });
  await panel.getByRole('button', { name: 'Collect puzzles…' }).click();
  await panel.getByRole('button', { name: /^Collect: about \d+ MB$/ }).click();
  await expect(panel.getByTestId('puzzle-count')).toContainText('3 ready');
  await panel.getByLabel('Share of cards').selectOption('100');
  await page.getByRole('button', { name: /^Set of/ }).click();

  // Each puzzle by hand; a reply is driven before the next move is asked.
  let replied = false;
  for (let n = 0; n < 3; n++) {
    await expect(stormCard(page)).toHaveAttribute('data-phase', 'solving', { timeout: 10_000 });
    const id = (await stormCard(page).getAttribute('data-card'))!.slice(2);
    let fen = (await stormCard(page).getAttribute('data-fen'))!;
    await expect.poll(b.position).toBe(boardOf(fen));
    const plies = SOLUTIONS[id]!;
    for (let i = 0; i < plies.length; i += 2) {
      await expect(stormCard(page)).toHaveAttribute('data-step', String(i));
      await expect(stormCard(page)).toHaveAttribute('data-phase', 'solving');
      fen = afterUci(fen, plies[i]!);
      await b.hand(boardOf(fen));
      if (plies[i + 1]) {
        fen = afterUci(fen, plies[i + 1]!);
        await expect.poll(async () => (await b.drives()).at(-1)).toBe(boardOf(fen));
        // Set up as a card is (part (f)): not asked while the robot drives the reply.
        expect(await stormCard(page).getAttribute('data-phase')).toBe('setup');
        await expect.poll(b.position).toBe(boardOf(fen));
        replied = true;
      }
    }
    await expect(page.getByTestId('storm-verdict')).toContainText('Solved');
    await expect.poll(() => spoken(page)).toContain('Solved.');
    if (n < 2) await expect(stormCard(page)).not.toHaveAttribute('data-card', `z|${id}`, { timeout: 5000 });
  }
  expect(replied).toBe(true);
});

/* ------------------------------------------------------------------ the timed storm and the review (part (f)) */

/** The clock's text and whether it runs, sampled every 200 ms while the card is set up. */
async function clockThroughSetup(page: Page): Promise<{ text: string; running: boolean }[]> {
  await expect(stormCard(page)).toHaveAttribute('data-phase', 'setup');
  const out: { text: string; running: boolean }[] = [];
  // The phase and the clock read together: read apart, the clock could be read just after the setup
  // ended and the clock started (a flaky test).
  for (;;) {
    const r = await page.evaluate(() => {
      const card = document.querySelector('.storm-card');
      const clock = document.querySelector('[data-testid="storm-clock"]');
      return { phase: card?.getAttribute('data-phase'), text: clock?.textContent ?? '', running: !clock?.classList.contains('stopped') };
    });
    if (r.phase !== 'setup') return out;
    out.push({ text: r.text, running: r.running });
    await page.waitForTimeout(200);
  }
}

test('a timed storm on the board: the clock stands still through each setup, runs while the card is asked', async ({ page }) => {
  test.setTimeout(60_000);
  await setUp(page, { board: { driveMs: 2000 } });
  const b = move(page);
  const cards = [NAJDORF, QGD];
  await seed(page, cards);
  await page.getByRole('button', { name: 'Start storm' }).click();
  const clock = page.getByTestId('storm-clock');

  // The first card's 2 s setup: 3:00 throughout, stopped.
  const first = await clockThroughSetup(page);
  expect(first.length).toBeGreaterThanOrEqual(4);
  expect(first.every((c) => c.text === '3:00' && !c.running)).toBe(true);
  const one = await cardOf(page, cards);
  await asked(page, one);
  // Asked: the clock runs.
  await expect(clock).not.toHaveClass(/stopped/);
  await expect(clock).not.toHaveText('3:00', { timeout: 3000 });

  // The top move by hand: the verdict stops it, and it stays where it stopped through the next setup.
  await b.hand(boardOf(afterUci(one.fen, one.list[0]!)));
  // Stopped once the move is read (grading, the verdict, the next setup: the same reading throughout).
  await expect(clock).toHaveClass(/stopped/);
  const stopped = (await clock.textContent())!;
  expect(stopped).not.toBe('3:00');
  const two = cards.find((c) => c !== one)!;
  await expect(stormCard(page)).toHaveAttribute('data-card', two.card, { timeout: 5000 });
  const second = await clockThroughSetup(page);
  expect(second.length).toBeGreaterThanOrEqual(4);
  expect(second.every((c) => c.text === stopped && !c.running)).toBe(true);
  await asked(page, two);
  await expect(clock).not.toHaveClass(/stopped/);
});

test('the review on the board: stepped quickly, only the row stayed on is driven, its arrows lit; a retry by hand graded, lit and said', async ({ page }) => {
  test.setTimeout(90_000);
  await setUp(page);
  const b = move(page);
  const cards = [NAJDORF, QGD, ITALIAN];
  await seed(page, cards);
  await page.getByRole('button', { name: 'Start storm' }).click();

  // Three cards answered by hand, the second with its worst move; the storm ends when they're dealt.
  const order: Card[] = [];
  for (let n = 0; n < 3; n++) {
    if (n) await expect(stormCard(page)).not.toHaveAttribute('data-card', order[n - 1]!.card, { timeout: 5000 });
    await expect(stormCard(page)).toHaveAttribute('data-phase', 'solving', { timeout: 10_000 });
    const c = await cardOf(page, cards);
    await expect.poll(b.position).toBe(boardOf(c.fen));
    order.push(c);
    await b.hand(boardOf(afterUci(c.fen, n === 1 ? c.list[LADDER.length - 1]! : c.list[0]!)));
  }
  await expect(page.getByTestId('storm-summary')).toBeVisible({ timeout: 10_000 });

  // The review opens on the first row: driven after its second.
  await expect.poll(b.position, { timeout: 5000 }).toBe(boardOf(order[0]!.fen));
  const before = (await b.drives()).length;
  // Stepped twice at once: only the third row is driven.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.storm-nav-count')).toContainText('Position 3 of 3');
  await expect.poll(b.position, { timeout: 5000 }).toBe(boardOf(order[2]!.fen));
  await page.waitForTimeout(1500);
  expect((await b.drives()).slice(before)).toEqual([boardOf(order[2]!.fen)]);

  // Back to the second row: the move played lit red, the arrival blue; the best green once shown.
  await page.keyboard.press('ArrowLeft');
  const row = order[1]!;
  const worst = row.list[LADDER.length - 1]!;
  const best = row.list[0]!;
  await expect.poll(b.position, { timeout: 5000 }).toBe(boardOf(row.fen));
  await expect.poll(() => litOn(page, worst)).toEqual([LIGHT.red, LIGHT.red]);
  await page.keyboard.press('b');
  await expect.poll(() => litOn(page, best)).toEqual([LIGHT.green, LIGHT.green]);

  // Try again: the card on the board already; the best by hand, graded, lit bright green and said.
  await page.keyboard.press('t');
  await expect(page.locator('.storm-review .storm-title')).toContainText('Try this one again');
  await expect.poll(() => litOn(page, worst)).toEqual([LIGHT.off, LIGHT.off]);
  const said = (await spoken(page)).length;
  await b.hand(boardOf(afterUci(row.fen, best)));
  await expect(page.locator('.storm-review .storm-title')).toContainText('Great move');
  await expect.poll(() => litOn(page, best)).toEqual([LIGHT.brightGreen, LIGHT.brightGreen]);
  await expect.poll(async () => (await spoken(page)).slice(said)).toContain('Best move.');
  expect(await b.position()).toBe(boardOf(afterUci(row.fen, best)));
});
