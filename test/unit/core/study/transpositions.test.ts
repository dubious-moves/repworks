// Transposition badges and copy continuation (PLAN.md §5.11). Hand-built cases, then
// q_extension's harness study (`test/harness.js` at c26242f, dumped from its live test study),
// ported in §5.20.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { indexStudies } from '../../../../src/core/repertoire/index.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { addMove, continuation, linePgn } from '../../../../src/core/study/ops.ts';
import { otherOrders, transpositions } from '../../../../src/core/study/transpositions.ts';
import { positionKeyOf } from '../../../../src/core/chess/positionKey.ts';
import { positionAt } from '../../../../src/core/study/tree.ts';

function chapter(movetext: string, headers = '', cid = 'Chapter1'): Chapter {
  const parsed = parseChapterFile(`[Event "Test"]\n${headers}\n${movetext} *\n`, cid);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.chapter;
}

test('transpositions: the other move orders to a position, within the chapter', () => {
  const c = chapter('1. e4 e5 (1... Nc6 2. Nf3 e5 3. Bc4) (1... d6 2. d4 e5 3. Nf3) 2. Nf3 Nc6 (2... d6 3. d4) 3. Bc4');
  const t = transpositions(c);
  assert.deepEqual(otherOrders(t, ['e4', 'e5', 'Nf3', 'Nc6']), [['e4', 'Nc6', 'Nf3', 'e5']]);
  assert.deepEqual(otherOrders(t, ['e4', 'Nc6', 'Nf3', 'e5']), [['e4', 'e5', 'Nf3', 'Nc6']]);
  // The Bc4 positions too, both ways, and a three-move order of the Philidor.
  assert.deepEqual(otherOrders(t, ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']), [['e4', 'Nc6', 'Nf3', 'e5', 'Bc4']]);
  assert.deepEqual(otherOrders(t, ['e4', 'd6', 'd4', 'e5', 'Nf3']), [['e4', 'e5', 'Nf3', 'd6', 'd4']]);
  // A move reaching a position no other path reaches has none.
  assert.deepEqual(otherOrders(t, ['e4']), []);
  assert.deepEqual(otherOrders(t, ['e4', 'e5']), []);
  assert.deepEqual(otherOrders(t, ['nowhere']), []);
  // Every position listed is reached at least twice.
  for (const paths of t.paths.values()) assert.ok(paths.length > 1);
});

test('q_extension’s harness study: 3 transposing positions, 8 marked moves', () => {
  // The 19 move paths of the live test study, as the harness rebuilds them; a path's prefixes are
  // the study's other paths. The last transposes nowhere.
  const lines = [
    'Nf3 d5 c4 d4 g3 c5 b4 cxb4',
    'Nf3 d5 c4 d4 b4 c5 g3 cxb4',
    'Nf3 d5 b4 c5 c4 d4 g3 cxb4',
    'Nf3 d5 b4 c5 c4 d4 d3',
    'Nf3 d5 c4 e6',
  ];
  let c = chapter('');
  for (const line of lines) {
    const sans = line.split(' ');
    sans.forEach((san, i) => {
      const e = addMove(c, sans.slice(0, i), san);
      assert.ok(e.ok);
      c = e.value.chapter;
    });
  }
  const t = transpositions(c);
  assert.equal(t.paths.size, 3);
  assert.equal([...t.paths.values()].flat().length, 8);
  const groups = [...t.paths.values()].map((paths) => paths.map((p) => p.join(' ')));
  assert.deepEqual(groups, [
    ['Nf3 d5 c4 d4 g3 c5 b4', 'Nf3 d5 c4 d4 b4 c5 g3', 'Nf3 d5 b4 c5 c4 d4 g3'],
    ['Nf3 d5 c4 d4 g3 c5 b4 cxb4', 'Nf3 d5 c4 d4 b4 c5 g3 cxb4', 'Nf3 d5 b4 c5 c4 d4 g3 cxb4'],
    ['Nf3 d5 c4 d4 b4 c5', 'Nf3 d5 b4 c5 c4 d4'],
  ]);
  // The harness's untouched move: 7. d3 reaches no other path's position.
  assert.deepEqual(otherOrders(t, 'Nf3 d5 b4 c5 c4 d4 d3'.split(' ')), []);
});

test('transpositions ignore move counters, and keep an en passant square only when the capture is legal', () => {
  // 1. Nf3 Nf6 2. Ng1 Ng8 comes back to the start with other clocks: the same key as the root,
  // which is no move, so nothing; then 3. e4 reaches 1. e4's position.
  const c = chapter('1. e4 (1. Nf3 Nf6 2. Ng1 Ng8 3. e4)');
  const t = transpositions(c);
  assert.deepEqual(otherOrders(t, ['e4']), [['Nf3', 'Nf6', 'Ng1', 'Ng8', 'e4']]);
  // 2. d4 leaves no capture en passant, so 1. Nf3 Nf6 2. d4 is 1. d4 Nf6 2. Nf3's position.
  const noCapture = transpositions(chapter('1. Nf3 (1. d4 Nf6 2. Nf3) 1... Nf6 2. d4'));
  assert.deepEqual(otherOrders(noCapture, ['Nf3', 'Nf6', 'd4']), [['d4', 'Nf6', 'Nf3']]);
  // After 2... d5, exd6 e.p. is legal: not the position of 1. e4 d5 2. e5 Nf6, pieces alike.
  const capture = transpositions(chapter('1. e4 Nf6 (1... d5 2. e5 Nf6) 2. e5 d5'));
  assert.deepEqual(otherOrders(capture, ['e4', 'Nf6', 'e5', 'd5']), []);
  assert.notEqual(capture.keyOf.get('e4 Nf6 e5 d5'), capture.keyOf.get('e4 d5 e5 Nf6'));
});

test('copy continuation: from the branch’s first move to the end of the line, numbered from its position', () => {
  const c = chapter('1. e4 c5 2. Nf3 d6 (2... Nc6 3. d4 cxd4 (3... e6 4. d5)) 3. d4 cxd4');
  // A main-line move with no sibling above it: the whole line from the start.
  assert.equal(continuation(c, ['e4', 'c5']), '1. e4 c5 2. Nf3 d6 3. d4 cxd4');
  // A main-line move after a fork: from the main line's own move at the fork, numbered from Black.
  assert.equal(continuation(c, ['e4', 'c5', 'Nf3', 'd6', 'd4']), '2... d6 3. d4 cxd4');
  // A variation's move: from the variation's first move.
  assert.equal(continuation(c, ['e4', 'c5', 'Nf3', 'Nc6', 'd4']), '2... Nc6 3. d4 cxd4');
  // A nested variation's move: from the nested branch.
  assert.equal(continuation(c, ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'e6', 'd5']), '3... e6 4. d5');
  assert.equal(continuation(c, ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4']), '3... cxd4');
  assert.equal(continuation(c, ['e5']), '');
  // linePgn still numbers from the start.
  assert.equal(linePgn(c, ['e4', 'c5', 'Nf3', 'Nc6', 'd4']), '1. e4 c5 2. Nf3 Nc6 3. d4');
});

test('copy continuation from a set-up position with Black to move', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 7';
  const c = chapter('7... c5 (7... e5 8. Nf3) 8. Nf3', `[SetUp "1"]\n[FEN "${fen}"]`);
  assert.equal(continuation(c, ['c5', 'Nf3']), '7... c5 8. Nf3');
  assert.equal(continuation(c, ['e5', 'Nf3']), '7... e5 8. Nf3');
});

test('the index lists every position reached, with the moves that reach it, across chapters', () => {
  const a = chapter('1. e4 e5 2. Nf3 Nc6', '[Orientation "white"]', 'ChapterA');
  const b = chapter('1. e4 Nc6 2. Nf3 e5', '[Orientation "white"]', 'ChapterB');
  const ix = indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters: [a, b] }]);
  const key = positionKeyOf(positionAt(a, ['e4', 'e5', 'Nf3', 'Nc6'])!);
  assert.deepEqual(
    ix.reached.get(key)!.map((o) => [o.cid, o.path.join(' ')]),
    [
      ['ChapterA', 'e4 e5 Nf3 Nc6'],
      ['ChapterB', 'e4 Nc6 Nf3 e5'],
    ],
  );
  assert.equal(ix.reached.get(positionKeyOf(positionAt(a, ['e4'])!))!.length, 2);
});
