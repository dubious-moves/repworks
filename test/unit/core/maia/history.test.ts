// The positions before a position Maia is asked about (PLAN.md §5.190): the helpers, the batch's
// use of them, and that a study's path gives the 23M model the tokens a game's own moves would.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { createMaiaBatch } from '../../../../src/core/maia/batch.ts';
import { MAIA_HISTORY, MAIA_MOVES, maiaHistoryTokens } from '../../../../src/core/maia/encode.ts';
import { beforeChild, beforeOf, gameBefore, historyKey, MAIA_BEFORE, trailBefore } from '../../../../src/core/maia/history.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { positionsTo } from '../../../../src/core/study/tree.ts';

const SANS = 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5'.split(' ');
/** The FEN of the start and after each move. */
function fens(sans: readonly string[]): string[] {
  const pos = Chess.default();
  const out = [makeFen(pos.toSetup())];
  for (const san of sans) {
    pos.play(parseSan(pos, san)!);
    out.push(makeFen(pos.toSetup()));
  }
  return out;
}
const ALL = fens(SANS);
const pos = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();

test('beforeOf: the positions before the last, at most seven', () => {
  assert.deepEqual(beforeOf([ALL[0]!]), []);
  assert.deepEqual(beforeOf(ALL.slice(0, 3)), ALL.slice(0, 2));
  assert.equal(MAIA_BEFORE, MAIA_HISTORY - 1);
  assert.deepEqual(beforeOf(ALL), ALL.slice(5, 12), 'the seven nearest');
  assert.deepEqual(beforeOf(ALL, 3), ALL.slice(9, 12));
  assert.deepEqual(beforeOf(ALL.map(pos)), ALL.slice(5, 12), 'positions as well as FENs');
});

test('beforeChild: the positions before a move\'s position are the before and the position', () => {
  assert.deepEqual(beforeChild(undefined, ALL[0]!), [ALL[0]]);
  assert.deepEqual(beforeChild(ALL.slice(0, 2), ALL[2]!), ALL.slice(0, 3));
  assert.equal(beforeChild(ALL.slice(0, 7), ALL[7]!).length, 7, 'trimmed to seven');
});

test('gameBefore: the line a game was started from, the start, and the moves played', () => {
  // Position 0 is the start, k the position after the k-th move.
  const start = ALL[4]!;
  const afters = ALL.slice(5, 9);
  assert.deepEqual(gameBefore(undefined, start, afters, 0), []);
  assert.deepEqual(gameBefore(undefined, start, afters, 1), [start]);
  assert.deepEqual(gameBefore(undefined, start, afters, 3), [start, afters[0], afters[1]]);
  assert.deepEqual(gameBefore(ALL.slice(0, 4), start, afters, 2), [...ALL.slice(0, 4), start, afters[0]]);
  assert.deepEqual(gameBefore(ALL.slice(0, 4), start, afters, 0), ALL.slice(0, 4), 'the start has its lead before it');
  assert.equal(gameBefore(ALL.slice(0, 4), start, afters, 4).length, 7);
});

test('trailBefore: the root\'s before, the root and the moves down to the node, the node itself left out', () => {
  const play = (fen: string, san: string) => {
    const p = pos(fen);
    p.play(parseSan(p, san)!);
    return makeFen(p.toSetup());
  };
  const root = ALL[4]!;
  // The node reached by Bb5 a6 from the root (after Nf3 Nc6): moves are [Bb5, a6], the node is after a6.
  assert.deepEqual(trailBefore(ALL.slice(0, 4), root, ['Bb5', 'a6'], play), [...ALL.slice(0, 4), root, ALL[5]]);
  assert.deepEqual(trailBefore([], root, ['Bb5'], play), [root], 'the row\'s own position: only the root before it');
  assert.equal(trailBefore(ALL.slice(0, 4), root, ['Bb5', 'a6', 'Ba4', 'Nf6'], play)!.length, 7);
  assert.equal(trailBefore([], root, undefined, play), undefined);
  assert.throws(() => trailBefore([], root, ['Qh5', 'a6'], () => { throw new Error('illegal'); }));
});

test('the history key reads the board and the side to move of each position, nothing else', () => {
  assert.equal(historyKey([ALL[0]!.replace(' 0 1', ' 7 9')]), historyKey([ALL[0]!]));
  assert.notEqual(historyKey([ALL[1]!]), historyKey([ALL[2]!]));
});

/** A batch over a fake model: the tokens it was run on and how often. */
function world(o: { history?: boolean; before?: number } = {}) {
  const runs: Float32Array[] = [];
  const batch = createMaiaBatch({
    ...o,
    run: async (tokens, _elos, n) => {
      runs.push(tokens);
      return { moves: new Float32Array(n * MAIA_MOVES), values: new Float32Array(n * 3) };
    },
    defer: (fn) => setTimeout(fn, 0),
  });
  return { runs, batch };
}

test('the 23M model asked with a line reads it; asked alone it reads the position eight times', async () => {
  const w = world({ history: true });
  const here = pos(ALL[6]!);
  await w.batch.ask(here, 1500, ALL.slice(0, 6));
  await w.batch.ask(here, 1500);
  assert.deepEqual(w.runs[0], maiaHistoryTokens(ALL.slice(0, 7)));
  assert.deepEqual(w.runs[1], maiaHistoryTokens([ALL[6]!]));
  assert.notDeepEqual(w.runs[0], w.runs[1]);
});

test('the memo keeps a position asked by another line apart (23M) and together (the first model)', async () => {
  const here = pos(ALL[6]!);
  // The same position and rating, two histories: two runs with the 23M, one with the first model.
  const m23 = world({ history: true });
  await m23.batch.ask(here, 1500, ALL.slice(0, 6));
  await m23.batch.ask(here, 1500, ALL.slice(0, 6));
  await m23.batch.ask(here, 1500, [ALL[2]!, ALL[3]!, ALL[4]!, ALL[5]!]);
  assert.equal(m23.runs.length, 2, 'the same line is one run, another line a second');
  const first = world();
  await first.batch.ask(here, 1500, ALL.slice(0, 6));
  await first.batch.ask(here, 1500, [ALL[2]!]);
  assert.equal(first.runs.length, 1, 'the first model ignores the line');
  assert.equal(first.runs[0]!.length, 64 * 12);
});

test('`before` limits how many positions are read, and what the memo tells apart', async () => {
  const here = pos(ALL[6]!);
  const w = world({ history: true, before: 2 });
  await w.batch.ask(here, 1500, ALL.slice(0, 6));
  // Another line that agrees with it in the last two positions is the same question.
  await w.batch.ask(here, 1500, [ALL[1]!, ALL[3]!, ALL[4]!, ALL[5]!]);
  assert.equal(w.runs.length, 1);
  assert.deepEqual(w.runs[0], maiaHistoryTokens(ALL.slice(4, 7)));
  const none = world({ history: true, before: 0 });
  await none.batch.ask(here, 1500, ALL.slice(0, 6));
  assert.deepEqual(none.runs[0], maiaHistoryTokens([ALL[6]!]));
});

test('a study\'s path gives the 23M model the tokens the game\'s own moves would (§5.190)', () => {
  const text = `[Event "A line"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 *\n`;
  const parsed = parseChapterFile(text, 'Chap0001');
  assert.ok(parsed.ok);
  // Any point of the line: what the explorer's path gives, against what the game gave.
  for (let n = 1; n <= SANS.length; n++) {
    const line = positionsTo(parsed.chapter, SANS.slice(0, n));
    const before = beforeOf(line);
    assert.deepEqual(before, beforeOf(ALL.slice(0, n + 1)), `after ${n} moves`);
    assert.deepEqual(maiaHistoryTokens([...before, ALL[n]!]), maiaHistoryTokens(ALL.slice(Math.max(0, n - 7), n + 1)));
  }
});
