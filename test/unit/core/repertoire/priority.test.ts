// Prioritizing a study (PLAN.md §5.70): reach, natural moves, the greedy order, must-learn and
// learned lines, FEN chapters, conflicts and gaps, on hand-built chapters and a fake explorer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess, type Position } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan, parseSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';
import { standardUci } from '../../../../src/core/chess/uci.ts';
import type { CardId } from '../../../../src/core/progress/cards.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { indexStudies, type Line, type RepertoireIndex } from '../../../../src/core/repertoire/index.ts';
import { coverageOf, keptLines, MISSING_PROB, orderLines, rankLines, scoreLines, type PriorityInput, type Shares } from '../../../../src/core/repertoire/priority.ts';
import { startPosition } from '../../../../src/core/study/tree.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';

function chapter(cid: string, side: string, moves: string, fen?: string): Chapter {
  const head = `[Orientation "${side}"]\n${fen ? `[FEN "${fen}"]\n[SetUp "1"]\n` : ''}`;
  const parsed = parseChapterFile(`${head}\n${moves} *\n`, cid);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.chapter;
}

const fenAfter = (sans: string, from?: string) => {
  const pos = from ? Chess.fromSetup(parseFen(from).unwrap()).unwrap() : Chess.default();
  for (const san of sans.split(' ').filter(Boolean)) pos.play(parseSan(pos, san)!);
  return makeFen(pos.toSetup());
};

/** A fake explorer: after `sans`, these SAN moves with these shares of `total` games. */
function explorerOf(table: Record<string, { total?: number; moves: Record<string, number> }>): { explorer: (fen: string) => Promise<Shares>; asked: string[] } {
  const byFen = new Map<string, Shares>();
  for (const [sans, { total = 1000, moves }] of Object.entries(table)) {
    const fen = fenAfter(sans);
    const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
    byFen.set(
      fen,
      {
        total,
        moves: Object.entries(moves).map(([san, share]) => {
          const move = parseSan(pos, san) as NormalMove;
          return { uci: standardUci(pos, move), san: makeSan(pos, move), share };
        }),
      },
    );
  }
  const asked: string[] = [];
  return {
    asked,
    explorer: async (fen) => {
      asked.push(fen);
      return byFen.get(fen) ?? { total: 0, moves: [] };
    },
  };
}

function setUp(chapters: Chapter[]): { ix: RepertoireIndex; startOf: (l: Line) => Position | undefined } {
  const ix = indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters }]);
  const byCid = new Map(chapters.map((c) => [c.id, c]));
  return { ix, startOf: (l) => startPosition(byCid.get(l.cid)!) };
}

const input = (ix: RepertoireIndex, startOf: (l: Line) => Position | undefined, explorer: PriorityInput['explorer'], extra: Partial<PriorityInput> = {}): PriorityInput => ({
  lines: ix.lines,
  startOf,
  learned: () => false,
  explorer,
  natural: false,
  ...extra,
});
const paths = (lines: readonly { line: Line }[]) => lines.map((r) => r.line.path.join(' '));
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≠ ${b}`);

// White: 1. e4 and three Black replies answered; 1... c6 (10%) not.
const white = () => chapter('Chapter1', 'white', '1. e4 e5 (1... c5 2. Nf3) (1... e6 2. d4) 2. Nf3');
const TABLE = { e4: { moves: { c5: 0.5, e5: 0.3, e6: 0.1, c6: 0.1 } } };

test('reach: each reply’s share among the replies covered; ranked by reach alone; the gap', async () => {
  const { ix, startOf } = setUp([white()]);
  const { explorer } = explorerOf(TABLE);
  const r = await rankLines(input(ix, startOf, explorer));
  assert.deepEqual(paths(r.lines), ['e4 c5 Nf3', 'e4 e5 Nf3', 'e4 e6 d4']);
  close(r.lines[0]!.reach, 0.5 / 0.9);
  close(r.lines[1]!.reach, 0.3 / 0.9);
  close(r.lines[2]!.reach, 0.1 / 0.9);
  close(r.totalReach, 1);
  assert.deepEqual(r.lines.map((l) => l.rank), [1, 2, 3]);
  assert.deepEqual(r.gaps.map((g) => [g.path.join(' '), g.san, g.share]), [['e4', 'c6', 0.1]]);
  close(r.gaps[0]!.reach, 0.1);
});

test('a covered reply the explorer lacks gets the floor; with no data at all, the covered replies share equally', async () => {
  const { ix, startOf } = setUp([white()]);
  const { explorer } = explorerOf({ e4: { moves: { c5: 0.5, e5: 0.3 } } });
  const r = await rankLines(input(ix, startOf, explorer));
  const e6 = r.lines.find((l) => l.line.path[1] === 'e6')!;
  close(e6.reach, MISSING_PROB / (0.8 + MISSING_PROB));
  const none = await rankLines(input(ix, startOf, explorerOf({}).explorer));
  for (const l of none.lines) close(l.reach, 1 / 3);
});

test('natural moves count less: a likely line whose moves come by themselves ranks under a harder one', async () => {
  // 1... c5 2. Nf3 (played 90% of the time there) against 1... e6 2. d4 (10%), 1... e5 2. Nf3 (50%).
  const { ix, startOf } = setUp([white()]);
  const { explorer } = explorerOf({
    '': { moves: { e4: 0.6, d4: 0.3 } },
    ...TABLE,
    'e4 c5': { moves: { Nf3: 0.9, Nc3: 0.1 } },
    'e4 e5': { moves: { Nf3: 0.5, Nc3: 0.2 } },
    'e4 e6': { moves: { d4: 0.1, d3: 0.5 } },
  });
  const plain = await rankLines(input(ix, startOf, explorer));
  assert.deepEqual(paths(plain.lines), ['e4 c5 Nf3', 'e4 e5 Nf3', 'e4 e6 d4']);
  const natural = await rankLines(input(ix, startOf, explorer, { natural: true }));
  // Values: c5 .556 × (1 − .6 × .9) = .256; e5 .333 × (1 − .6 × .5) = .233; e6 .111 × (1 − .6 × .1) = .104.
  // After the first, 1. e4 is taken: e5 .333 × .5 = .167; e6 .111 × .9 = .1.
  assert.deepEqual(paths(natural.lines), ['e4 c5 Nf3', 'e4 e5 Nf3', 'e4 e6 d4']);
  close(natural.lines[0]!.value, (0.5 / 0.9) * (1 - 0.6 * 0.9));
  close(natural.lines[1]!.value, (0.3 / 0.9) * 0.5);
  close(natural.lines[2]!.value, (0.1 / 0.9) * 0.9);
  assert.deepEqual(natural.lines.map((l) => l.hard), [0, 0, 1]);
  // 2. Nf3 against 1... c5 found 99% of the time: 1... e5 first (.333 × .7 over .556 × .406), and
  // once 1. e4 is taken, the Sicilian's 2. Nf3 is worth .556 × .01, under the French's .111 × .9.
  const easy = explorerOf({ '': { moves: { e4: 0.6 } }, ...TABLE, 'e4 c5': { moves: { Nf3: 0.99 } }, 'e4 e5': { moves: { Nf3: 0.5 } }, 'e4 e6': { moves: { d4: 0.1 } } });
  const swapped = await rankLines(input(ix, startOf, easy.explorer, { natural: true }));
  assert.deepEqual(paths(swapped.lines), ['e4 e5 Nf3', 'e4 e6 d4', 'e4 c5 Nf3']);
});

test('shared moves count once, learned moves cost nothing, and a line with nothing to learn goes last', async () => {
  const { ix, startOf } = setUp([white()]);
  const { explorer } = explorerOf(TABLE);
  // 1. e4 and 2. Nf3 after 1... c5 are learned: the Sicilian line has nothing left to learn.
  const [e4, sicilianNf3] = ix.lines[1]!.cards;
  const r = await rankLines(input(ix, startOf, explorer, { learned: (c: CardId) => c === e4 || c === sicilianNf3 }));
  assert.equal(r.lines.at(-1)!.line.path.join(' '), 'e4 c5 Nf3');
  assert.equal(r.lines.at(-1)!.value, 0);
  assert.equal(r.lines.at(-1)!.learned, true);
  // 1. e4 is taken by being learned, so the other two lines are worth their own move only.
  close(r.lines[0]!.value, 0.3 / 0.9);
  const all = await rankLines(input(ix, startOf, explorer, { learned: () => true }));
  assert.ok(all.lines.every((l) => l.learned && l.value === 0));
  assert.deepEqual(paths(all.lines), paths(ix.lines.map((line) => ({ line }))));
});

test('lines taken first keep the index order; kept lines and their coverage', async () => {
  const { ix, startOf } = setUp([white()]);
  const { explorer } = explorerOf(TABLE);
  const french = ix.lines.find((l) => l.path[1] === 'e6')!;
  const r = await rankLines(input(ix, startOf, explorer, { first: (l) => l === french }));
  assert.deepEqual(paths(r.lines), ['e4 e6 d4', 'e4 c5 Nf3', 'e4 e5 Nf3']);
  assert.deepEqual(r.lines.map((l) => l.first), [true, false, false]);
  // Two lines kept: the must-learn French and the best other.
  const kept = keptLines(r, 2, true);
  assert.deepEqual(paths([...kept].map((line) => ({ line }))).sort(), ['e4 c5 Nf3', 'e4 e6 d4']);
  close(coverageOf(r, kept), 0.6 / 0.9);
});

test('a learned line is kept outside the number when asked, and ranked like the others when not', async () => {
  const { ix, startOf } = setUp([white()]);
  const { explorer } = explorerOf(TABLE);
  const french = ix.lines.find((l) => l.path[1] === 'e6')!;
  const r = await rankLines(input(ix, startOf, explorer, { learned: (c) => french.cards.includes(c) }));
  const fr = r.lines.find((l) => l.line === french)!;
  assert.equal(fr.learned, true);
  assert.deepEqual(paths([...keptLines(r, 1, true)].map((line) => ({ line }))).sort(), ['e4 c5 Nf3', 'e4 e6 d4']);
  assert.deepEqual(paths([...keptLines(r, 1, false)].map((line) => ({ line }))), ['e4 c5 Nf3']);
});

test('learned lines not kept outside the number are ranked by their worth, not last', async () => {
  // The owner learned the best lines first: learned moves counted as free would put them last,
  // and keeping the top half would pause them.
  const { ix, startOf } = setUp([white()]);
  const { explorer } = explorerOf(TABLE);
  const sicilian = ix.lines.find((l) => l.path[1] === 'c5')!;
  const learned = (c: CardId) => sicilian.cards.includes(c);
  const scored = await scoreLines(input(ix, startOf, explorer));
  const kept = orderLines(scored, { learned, natural: false, keepLearned: true });
  assert.equal(kept.lines.at(-1)!.line, sicilian);
  const ranked = orderLines(scored, { learned, natural: false, keepLearned: false });
  assert.deepEqual(paths(ranked.lines), ['e4 c5 Nf3', 'e4 e5 Nf3', 'e4 e6 d4']);
  assert.equal(ranked.lines[0]!.learned, true);
  close(coverageOf(ranked, keptLines(ranked, 1, false)), 0.5 / 0.9);
  // One lookup run serves both orders.
  assert.equal(ranked.lookups, kept.lookups);
});

test('a transposition has the same shares wherever it is reached', async () => {
  // Black: 1. d4 Nf6 2. c4 e6 and 1. c4 e6 2. d4 Nf6 reach one position; 3. Nf3 and 3. Nc3 answered in each.
  const { ix, startOf } = setUp([chapter('Chapter1', 'black', '1. d4 Nf6 2. c4 e6 3. Nf3 b6'), chapter('Chapter2', 'black', '1. c4 e6 2. d4 Nf6 3. Nc3 Bb4')]);
  const { explorer } = explorerOf({
    '': { moves: { d4: 0.5, c4: 0.2 } },
    'd4 Nf6': { moves: { c4: 0.8 } },
    'c4 e6': { moves: { d4: 0.4, Nc3: 0.3 } },
    'd4 Nf6 c4 e6': { moves: { Nf3: 0.4, Nc3: 0.4, g3: 0.2 } },
  });
  const r = await rankLines(input(ix, startOf, explorer));
  const qid = r.lines.find((l) => l.line.cid === 'Chapter1')!;
  const nimzo = r.lines.find((l) => l.line.cid === 'Chapter2')!;
  // 1. d4 5/7 × 2. c4 1 × 3. Nf3 ½; 1. c4 2/7 × 2. d4 1 × 3. Nc3 ½.
  close(qid.reach, (5 / 7) * 0.5);
  close(nimzo.reach, (2 / 7) * 0.5);
  // 3. g3 is a gap, found once, at the position's better reach; so is 2. Nc3 after 1. c4 e6.
  assert.deepEqual(r.gaps.map((g) => [g.cid, g.path.join(' '), g.san]), [
    ['Chapter1', 'd4 Nf6 c4 e6', 'g3'],
    ['Chapter2', 'c4 e6', 'Nc3'],
  ]);
  close(r.gaps[0]!.reach, (5 / 7) * 0.2);
});

test('a conflict: two own moves in one position each keep the full reach', async () => {
  const { ix, startOf } = setUp([chapter('Chapter1', 'white', '1. e4 c5 2. Nf3'), chapter('Chapter2', 'white', '1. e4 c5 2. c3')]);
  const { explorer } = explorerOf({ e4: { moves: { c5: 0.5 } } });
  const r = await rankLines(input(ix, startOf, explorer));
  for (const l of r.lines) close(l.reach, 1);
});

test('a FEN chapter hangs where a line reaches its start, else starts at 1 as its own group', async () => {
  const afterE5 = fenAfter('e4 c5 Nf3 d6');
  const { ix, startOf } = setUp([
    chapter('Chapter1', 'white', '1. e4 c5 (1... e5 2. Nf3) 2. Nf3 d6'),
    chapter('Chapter2', 'white', '3. d4 cxd4 4. Nxd4', afterE5),
    chapter('Chapter3', 'white', '1. d4 d5', fenAfter('c4 e5')),
  ]);
  const { explorer } = explorerOf({ e4: { moves: { c5: 0.6, e5: 0.4 } }, 'e4 c5 Nf3': { moves: { d6: 0.5, Nc6: 0.5 } } });
  const r = await rankLines(input(ix, startOf, explorer));
  const open = r.lines.find((l) => l.line.cid === 'Chapter2')!;
  // Reached after 1. e4 c5 2. Nf3 d6: 0.6 × (d6 alone covered: 1).
  close(open.reach, 0.6);
  assert.equal(open.ownStart, undefined);
  const odd = r.lines.find((l) => l.line.cid === 'Chapter3')!;
  assert.equal(odd.ownStart, true);
  close(odd.reach, 1);
});

test('Maia fills in where the explorer is thin; each position is looked up once; the same ranking twice', async () => {
  const { ix, startOf } = setUp([white()]);
  const { explorer, asked } = explorerOf({ ...TABLE, 'e4 c5': { total: 5, moves: { Nf3: 1 } } });
  const sicilian = fenAfter('e4 c5');
  const maia = async (fen: string) => (fen === sicilian ? new Map([['g1f3', 0.2]]) : undefined);
  const progress: number[] = [];
  const r = await rankLines(input(ix, startOf, explorer, { natural: true, maia, onProgress: (done, total) => progress.push(done / total) }));
  // 2. Nf3 there: Maia's 0.2 (the explorer's 5 games say 1); hard to find. Other own moves: no data at all.
  const line = r.lines.find((l) => l.line.path[1] === 'c5')!;
  assert.equal(line.hard, 1);
  assert.equal(line.unknown, 1);
  assert.equal(new Set(asked).size, asked.length);
  assert.equal(r.lookups, asked.length);
  assert.equal(progress.at(-1), 1);
  const again = await rankLines(input(ix, startOf, explorer, { natural: true, maia }));
  assert.deepEqual(paths(again.lines), paths(r.lines));
});
