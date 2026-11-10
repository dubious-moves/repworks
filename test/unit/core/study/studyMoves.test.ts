// The Study tab (PLAN.md §5.27, §5.162): a study's moves at a position, across its chapters and
// the move orders that reach it, with their chapters and their lines.
//
// Controls run on this file (2026-11-10), each failing exactly the named assertions:
// - positions keyed by the path instead of the position (no transpositions) → "across chapters",
//   "the lines";
// - each move counted one line (leaves not summed) → "across chapters";
// - a chapter listed once per place instead of once → "the lines".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { positionKeyOf } from '../../../../src/core/chess/positionKey.ts';
import { positionAt } from '../../../../src/core/study/tree.ts';
import { chapterMoves, studyMovesAt } from '../../../../src/core/study/studyMoves.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';

function chapter(movetext: string, cid: string, fen?: string): Chapter {
  const parsed = parseChapterFile(`[Event "Test"]\n[ChapterName "${cid}"]\n${fen ? `[FEN "${fen}"]\n[SetUp "1"]\n` : ''}\n${movetext} *\n`, cid);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.chapter;
}
const keyAt = (c: Chapter, path: string[]) => positionKeyOf(positionAt(c, path)!);

test('across chapters: every chapter and move order reaching the position, its moves merged, most lines first', () => {
  // A: the Open Sicilian with two lines after 2...d6; B: 2...Nc6 and 2...d6; C: reaches 1.e4 c5
  // 2.Nf3 d6 by the move order 1.Nf3 c5 2.e4 d6 (a transposition), then 3.Bb5+.
  const a = chapter('1. e4 c5 2. Nf3 d6 (2... e6 3. d4) 3. d4 cxd4 (3... Nf6 4. Nc3) 4. Nxd4', 'A');
  const b = chapter('1. e4 c5 2. Nf3 Nc6 (2... d6 3. d4) 3. d4', 'B');
  const c = chapter('1. Nf3 c5 2. e4 d6 3. Bb5+', 'C');
  const chapters = [a, b, c].map((ch) => ({ cid: ch.id, moves: chapterMoves(ch) }));
  const atNf3 = studyMovesAt(chapters, keyAt(a, ['e4', 'c5', 'Nf3']));
  assert.deepEqual(
    atNf3.map((m) => [m.san, m.lines, m.chapters.map((x) => x.cid)]),
    [
      ['d6', 4, ['A', 'B', 'C']],
      // Equals in the study's order: A's side line before B's main line.
      ['e6', 1, ['A']],
      ['Nc6', 1, ['B']],
    ],
  );
  // Each chapter at its own path: C by its own move order.
  assert.deepEqual(atNf3[0]!.chapters.find((x) => x.cid === 'C')!.path, ['Nf3', 'c5', 'e4', 'd6']);
  const atD6 = studyMovesAt(chapters, keyAt(a, ['e4', 'c5', 'Nf3', 'd6']));
  assert.deepEqual(
    atD6.map((m) => [m.san, m.uci, m.lines, m.chapters.map((x) => x.cid)]),
    [
      ['d4', 'd2d4', 3, ['A', 'B']],
      ['Bb5+', 'f1b5', 1, ['C']],
    ],
  );
  // Nothing played there.
  assert.deepEqual(studyMovesAt(chapters, keyAt(a, ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4'])), []);
});

test('the lines: a move ending a line counts one; a chapter from a FEN; a move a chapter plays twice by two orders counts both', () => {
  const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3';
  const ruy = chapter('3. Bb5 a6 (3... Nf6) (3... f5 4. d3) 4. Ba4', 'R', fen);
  const twice = chapter('1. e4 e5 (1... Nc6 2. Nf3 e5 3. Bb5) 2. Nf3 Nc6 (2... d6 3. d4) 3. Bc4', 'T');
  const chapters = [ruy, twice].map((ch) => ({ cid: ch.id, moves: chapterMoves(ch) }));
  const atStart = studyMovesAt(chapters, positionKeyOf(positionAt(ruy, [])!));
  assert.deepEqual(
    atStart.map((m) => [m.san, m.lines, m.chapters.map((x) => x.cid)]),
    [
      ['Bb5', 4, ['R', 'T']],
      ['Bc4', 1, ['T']],
    ],
  );
  // T reaches the position twice: its first place in tree order is kept for opening it.
  assert.deepEqual(atStart[1]!.chapters[0]!.path, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
  assert.deepEqual(atStart[0]!.chapters[1]!.path, ['e4', 'Nc6', 'Nf3', 'e5', 'Bb5']);
  // One chapter playing the same move there by two orders: listed once, both its lines counted.
  const both = chapter('1. e4 e5 (1... Nc6 2. Nf3 e5 3. Bb5 a6) 2. Nf3 Nc6 3. Bb5', 'U');
  const once = studyMovesAt([{ cid: 'U', moves: chapterMoves(both) }], positionKeyOf(positionAt(ruy, [])!));
  assert.deepEqual(
    once.map((m) => [m.san, m.lines, m.chapters]),
    [['Bb5', 2, [{ cid: 'U', path: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] }]]],
  );
});
