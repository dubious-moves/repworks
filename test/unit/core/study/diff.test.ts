// What changed between two versions of a chapter (PLAN.md §5.214): a part added or removed with
// every line below it, a line that only moved to another order told from a new one, my move
// changed (swapped with a side line, or replaced), comments with and without their line wraps,
// arrows and glyphs as sets, headers, and a line written in full with its new part marked.
//
// Controls run on this file (2026-11-27):
// - a main change reported only when both moves are in both versions → "my move replaced";
// - `elsewhere` left empty → "a line that moved to another order";
// - comments compared as written (no flattening) → "a comment's line wraps are no change";
// - shapes compared in order → "arrows and glyphs are compared as sets".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { chapterFileText } from '../../../../src/core/pgn/write.ts';
import { countChanges, diffChapters, markedLine, type Change } from '../../../../src/core/study/diff.ts';
import { startPosition } from '../../../../src/core/study/tree.ts';

function chapter(movetext: string, headers = '[ChapterName "Jobava"]\n[Orientation "white"]\n') {
  const parsed = parseChapterFile(`[Event "Test"]\n${headers}\n${movetext} *\n`, 'c');
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.chapter;
}
const kinds = (changes: Change[]) => changes.map((c) => c.kind);
const only = <K extends Change['kind']>(changes: Change[], kind: K) => changes.filter((c): c is Extract<Change, { kind: K }> => c.kind === kind);

const BASE = '1. Nc3 d5 2. d4 Nf6 (2... Bf5 3. f3 e6 4. e4 Bg6 5. h4) 3. Bf4 e6 4. e3 Bd6 5. Qf3';

test('the same chapter, and a chapter written and read again: no change', () => {
  const c = chapter(BASE);
  assert.deepEqual(diffChapters(c, c).changes, []);
  const again = parseChapterFile(chapterFileText(c), 'c');
  assert.ok(again.ok);
  assert.deepEqual(diffChapters(c, again.chapter).changes, []);
});

test('an added part: its first move, its moves, every line in full, its comments, whose move it is', () => {
  const now = chapter('1. Nc3 d5 2. d4 Nf6 (2... Bf5 3. f3 e6 4. e4 Bg6 5. h4 h5 (5... h6 6. exd5 exd5 7. Qe2+) 6. Bg5 { Invites f6. [%csl Re6] } 6... Be7 (6... f6 7. Be3) 7. Qd2 { Castle long next. }) 3. Bf4 e6 4. e3 Bd6 5. Qf3');
  const d = diffChapters(chapter(BASE), now);
  assert.deepEqual(kinds(d.changes), ['added', 'added']);
  const [h5, h6] = only(d.changes, 'added');
  assert.deepEqual(h5!.path, ['Nc3', 'd5', 'd4', 'Bf5', 'f3', 'e6', 'e4', 'Bg6', 'h4', 'h5']);
  assert.equal(h5!.side, 'black');
  assert.equal(h5!.moves, 6);
  assert.deepEqual(h5!.lines.map((l) => l.slice(10).join(' ')), ['Bg5 Be7 Qd2', 'Bg5 f6 Be3'], 'the main line first');
  assert.deepEqual(h5!.comments.map((c) => [c.path[c.path.length - 1], c.text]), [['Bg5', 'Invites f6.'], ['Qd2', 'Castle long next.']]);
  assert.equal(h5!.shapes, 1);
  assert.deepEqual(h5!.elsewhere, []);
  assert.equal(h6!.moves, 4);
  assert.deepEqual(countChanges(d), { added: 2, addedMoves: 10, removed: 0, removedMoves: 0, myMoves: 0, replies: 0, comments: 0, shapes: 0, glyphs: 0, order: 0, headers: 0 });
});

test('a removed part, where the old version had it', () => {
  const d = diffChapters(chapter(BASE), chapter('1. Nc3 d5 2. d4 Nf6 (2... Bf5 3. f3) 3. Bf4 e6 4. e3 Bd6 5. Qf3'));
  const [gone] = only(d.changes, 'removed');
  assert.deepEqual(kinds(d.changes), ['removed']);
  assert.deepEqual(gone!.path, ['Nc3', 'd5', 'd4', 'Bf5', 'f3', 'e6']);
  assert.equal(gone!.moves, 4);
  assert.deepEqual(gone!.lines, [['Nc3', 'd5', 'd4', 'Bf5', 'f3', 'e6', 'e4', 'Bg6', 'h4']]);
});

test('a line that moved to another order: the added part says where the old version reached its position, the removed one where the new still does', () => {
  const old = chapter('1. Nc3 d5 2. d4 Nf6 3. Bf4 e6 4. e3 c5 5. Nb5');
  const now = chapter('1. Nc3 d5 2. d4 e6 (2... Nf6 3. Bf4) 3. Bf4 Nf6 4. e3 c5 5. Nb5');
  const d = diffChapters(old, now);
  const [added] = only(d.changes, 'added');
  const [removed] = only(d.changes, 'removed');
  // 2...e6 itself is a new position; 3...Nf6 below it is the old 3...e6's.
  assert.deepEqual(added!.path, ['Nc3', 'd5', 'd4', 'e6']);
  assert.deepEqual(added!.elsewhere, []);
  assert.deepEqual(removed!.path, ['Nc3', 'd5', 'd4', 'Nf6', 'Bf4', 'e6']);
  assert.deepEqual(removed!.elsewhere, [['Nc3', 'd5', 'd4', 'e6', 'Bf4', 'Nf6']]);
  // The other way round, the part that comes back was reached before.
  const back = only(diffChapters(now, old).changes, 'added')[0]!;
  assert.deepEqual(back.path, ['Nc3', 'd5', 'd4', 'Nf6', 'Bf4', 'e6']);
  assert.deepEqual(back.elsewhere, [['Nc3', 'd5', 'd4', 'e6', 'Bf4', 'Nf6']]);
});

test('my move replaced: a main change with both moves, beside the parts that came and went', () => {
  const old = chapter('1. Nc3 d5 2. d4 Nf6 3. Bf4 e6 4. e3 Bd6 5. Qf3 Bxf4 6. Qxf4');
  const now = chapter('1. Nc3 d5 2. d4 Nf6 3. Bf4 e6 4. e3 Bd6 5. Qg4 O-O 6. Bh6');
  const d = diffChapters(old, now);
  assert.deepEqual(kinds(d.changes), ['main', 'added', 'removed']);
  assert.deepEqual(only(d.changes, 'main')[0], { kind: 'main', path: ['Nc3', 'd5', 'd4', 'Nf6', 'Bf4', 'e6', 'e3', 'Bd6'], side: 'white', from: 'Qf3', to: 'Qg4', fromKept: false, toKnown: false });
  assert.equal(countChanges(d).myMoves, 1);
  assert.equal(countChanges(d).replies, 0);
});

test('my move swapped with a side line; the opponent\'s main reply counted apart; for Black by the Orientation', () => {
  const old = chapter('1. Nc3 d5 2. d4 (2. e4 d4) 2... Nf6 (2... e6 3. Bf4) 3. Bf4');
  const now = chapter('1. Nc3 d5 2. e4 (2. d4 e6 (2... Nf6 3. Bf4) 3. Bf4) 2... d4');
  const d = diffChapters(old, now);
  assert.deepEqual(only(d.changes, 'main').map((c) => [c.side, c.from, c.to, c.fromKept, c.toKnown]), [['white', 'd4', 'e4', true, true], ['black', 'Nf6', 'e6', true, true]]);
  assert.deepEqual([countChanges(d).myMoves, countChanges(d).replies], [1, 1]);
  const black = diffChapters({ ...old, headers: [['Orientation', 'black']] }, { ...now, headers: [['Orientation', 'black']] });
  assert.equal(black.mine, 'black');
  assert.deepEqual([countChanges(black).myMoves, countChanges(black).replies], [1, 1]);
});

test('side lines in another order below the same first move', () => {
  const d = diffChapters(chapter('1. Nc3 d5 (1... e5 2. Nf3) (1... c5 2. e4) 2. d4'), chapter('1. Nc3 d5 (1... c5 2. e4) (1... e5 2. Nf3) 2. d4'));
  assert.deepEqual(d.changes, [{ kind: 'order', path: ['Nc3'], side: 'black', from: ['d5', 'e5', 'c5'], to: ['d5', 'c5', 'e5'] }]);
  // A side line added among them is an added part, not a reordering.
  assert.deepEqual(kinds(diffChapters(chapter('1. Nc3 d5 (1... e5 2. Nf3) 2. d4'), chapter('1. Nc3 d5 (1... c5 2. e4) (1... e5 2. Nf3) 2. d4')).changes), ['added']);
});

test('a comment changed, added and removed; a comment\'s line wraps are no change unless asked for', () => {
  const old = chapter('1. Nc3 { First move. } 1... d5 2. d4 { The Jobava: Bf4 next,\nthen e3. } 2... Nf6 { Most played. }');
  const now = chapter('1. Nc3 { First move. } 1... d5 { Black takes the centre. } 2. d4 { The Jobava: Bf4\nnext, then e3. } 2... Nf6');
  const d = diffChapters(old, now);
  assert.deepEqual(only(d.changes, 'comment').map((c) => [c.path.join(' '), c.from, c.to]), [
    ['Nc3 d5', [], ['Black takes the centre.']],
    ['Nc3 d5 d4 Nf6', ['Most played.'], []],
  ]);
  const kept = only(diffChapters(old, now, { wraps: 'keep' }).changes, 'comment');
  assert.deepEqual(kept.map((c) => c.path.join(' ')), ['Nc3 d5', 'Nc3 d5 d4', 'Nc3 d5 d4 Nf6']);
});

test('arrows and glyphs are compared as sets; a comment before a side line\'s first move counts as its comment', () => {
  const old = chapter('1. Nc3 { [%csl Ge4][%cal Gd2d4,Rb1c3] } 1... d5 $1 2. d4 (2. e4 { Also. }) 2... Nf6');
  const same = chapter('1. Nc3 { [%cal Rb1c3,Gd2d4][%csl Ge4] } 1... d5 $1 2. d4 ({ Also. } 2. e4) 2... Nf6');
  assert.deepEqual(diffChapters(old, same).changes, []);
  const now = chapter('1. Nc3 { [%csl Ge4][%cal Gd2d4,Bg1f3] } 1... d5 $5 2. d4 (2. e4 { Also. }) 2... Nf6');
  const d = diffChapters(old, now);
  assert.deepEqual(kinds(d.changes), ['shapes', 'glyphs']);
  assert.deepEqual(only(d.changes, 'glyphs')[0], { kind: 'glyphs', path: ['Nc3', 'd5'], from: [1], to: [5] });
});

test('headers: the chapter\'s name, side and start, not a writer\'s own tags', () => {
  const old = chapter('1. Nc3 d5', '[ChapterName "Jobava"]\n[Orientation "white"]\n[Annotator "deeprep"]\n');
  const now = chapter('1. Nc3 d5', '[ChapterName "Jobava simplified"]\n[Orientation "white"]\n[Annotator "the owner"]\n');
  assert.deepEqual(diffChapters(old, now).changes, [{ kind: 'header', name: 'ChapterName', from: 'Jobava', to: 'Jobava simplified' }]);
});

test('a line in full with its new part marked: from White\'s move, from Black\'s, the whole line, a chapter that starts with Black to move', () => {
  const start = startPosition(chapter(BASE))!;
  const line = ['Nc3', 'd5', 'd4', 'Bf5', 'f3'];
  assert.equal(markedLine(start, line, 4), '1. Nc3 d5 2. d4 Bf5 **3. f3**');
  assert.equal(markedLine(start, line, 3), '1. Nc3 d5 2. d4 **Bf5 3. f3**');
  assert.equal(markedLine(start, line, 0), '**1. Nc3 d5 2. d4 Bf5 3. f3**');
  assert.equal(markedLine(start, line, 5), '1. Nc3 d5 2. d4 Bf5 3. f3');
  const fromBlack = startPosition(chapter('1... d5 2. d4 Nf6', '[FEN "rnbqkbnr/pppppppp/8/8/8/2N5/PPPPPPPP/R1BQKBNR b KQkq - 1 1"]\n[SetUp "1"]\n'))!;
  assert.equal(markedLine(fromBlack, ['d5', 'd4', 'Nf6'], 1), '1... d5 **2. d4 Nf6**');
  assert.equal(markedLine(fromBlack, ['d5', 'd4', 'Nf6'], 2), '1... d5 2. d4 **Nf6**');
});
