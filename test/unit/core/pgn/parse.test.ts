// Reading PGN into the model (PLAN.md §4.5): illegal moves, canonical SAN, merged siblings,
// refused chapters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChapterFile, parseGames, type ChapterParse } from '../../../../src/core/pgn/parse.ts';
import { writeChapter } from '../../../../src/core/pgn/write.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';

const ok = (p: ChapterParse): Chapter & { notes: unknown } => {
  if (!p.ok) assert.fail(p.reason);
  return { ...p.chapter, notes: p.notes };
};
const sans = (chapter: Chapter) => {
  const out: string[] = [];
  for (let n = chapter.root.children[0]; n; n = n.children[0]) out.push(n.san);
  return out.join(' ');
};

test('an illegal move is cut with everything after it, and reported with its path', () => {
  const parsed = ok(parseChapterFile('[Event "x"]\n\n1. e4 e5 2. Ke3 Nc6 (2... d5 3. Bb5) 3. Nf3 *', 'Chapter1'));
  assert.equal(sans(parsed), 'e4 e5');
  assert.deepEqual(parsed.notes, [{ kind: 'illegal', path: ['e4', 'e5'], san: 'Ke3' }]);
  // An illegal move inside a variation cuts the variation there, and the main line stays.
  const inside = ok(parseChapterFile('[Event "x"]\n\n1. e4 e5 (1... c5 2. Nf3 Qxa8) 2. Nf3 *', 'Chapter1'));
  assert.equal(sans(inside), 'e4 e5 Nf3');
  assert.equal(inside.root.children[0]!.children[1]!.children[0]!.children.length, 0);
  assert.deepEqual(inside.notes, [{ kind: 'illegal', path: ['e4', 'c5', 'Nf3'], san: 'Qxa8' }]);
});

test("Chessable's Ndb5 becomes Nb5, and two siblings that both become Nb5 are merged", () => {
  const text = '[Event "x"]\n\n1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Qh4 5. Nc3 Bb4 6. Ndb5 { first } (6. Nb5 { second } a6 { [%csl Ga6] }) 6... Qxe4+ $1 *';
  const parsed = ok(parseChapterFile(text, 'Chapter1'));
  const nb5 = parsed.root.children[0]!.children[0]!.children[0]!.children[0]!.children[0]!.children[0]!.children[0]!.children[0]!.children[0]!.children[0]!.children[0]!;
  assert.equal(nb5.san, 'Nb5');
  assert.deepEqual(nb5.comments, ['first', 'second']);
  assert.deepEqual(nb5.children.map((c) => c.san), ['Qxe4+', 'a6']);
  assert.deepEqual(nb5.children[1]!.shapes, [{ brush: 'green', orig: 'a6' }]);
  const path = ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Qh4', 'Nc3', 'Bb4', 'Nb5'];
  assert.deepEqual(parsed.notes, [{ kind: 'canonical', path, from: 'Ndb5' }, { kind: 'merged', path }]);
  // No Result header, so nothing follows the moves (as scalachess writes it).
  assert.match(writeChapter(parsed), / 6\. Nb5 \{ first \} \{ second \} 6\.\.\. Qxe4\+! \(6\.\.\. a6 \{ \[%csl Ga6\] \}\)$/);
});

test('merging keeps the first glyph of each group and adds the rest', () => {
  const parsed = ok(parseChapterFile('[Event "x"]\n\n1. e4! $14 (1. e4? $16 $146) *', 'Chapter1'));
  assert.deepEqual(parsed.root.children.map((c) => [c.san, c.nags]), [['e4', [1, 14, 146]]]);
});

test('missing check marks and other spellings are not worth a note', () => {
  const parsed = ok(parseChapterFile('[Event "x"]\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7 0-1', 'Chapter1'));
  assert.equal(sans(parsed), 'e4 e5 Qh5 Nc6 Bc4 Nf6 Qxf7#');
  assert.deepEqual(parsed.notes, []);
  const castles = ok(parseChapterFile('[Event "x"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. 0-0 *', 'Chapter1'));
  assert.equal(sans(castles), 'e4 e5 Nf3 Nc6 Bc4 Bc5 O-O');
});

test("Black's moves need no number after a comment, as Qchess writes them", () => {
  const parsed = ok(parseChapterFile('[Event "x"]\n\n1. e4 { a comment } c5 2. Nf3 d6 *', 'Chapter1'));
  assert.equal(sans(parsed), 'e4 c5 Nf3 d6');
});

test('a chapter is refused when its start position or variant is not usable, or the file holds no single game', () => {
  const badFen = parseChapterFile('[Event "x"]\n[FEN "8/8/8/8/8/8/8/8 w - - 0 1"]\n\n*', 'Chapter1');
  assert.ok(!badFen.ok && /start position is invalid/.test(badFen.reason));
  const variant = parseChapterFile('[Event "x"]\n[Variant "Crazyhouse"]\n\n1. e4 *', 'Chapter1');
  assert.ok(!variant.ok && /only standard chess/.test(variant.reason));
  const two = parseChapterFile('[Event "a"]\n\n1. e4 *\n\n[Event "b"]\n\n1. d4 *', 'Chapter1');
  assert.ok(!two.ok && /2 games/.test(two.reason));
  const none = parseChapterFile('', 'Chapter1');
  assert.ok(!none.ok && /no game/.test(none.reason));
  // A file of several games is several chapters; a refused one doesn't stop the others.
  const games = parseGames('[Event "a"]\n\n1. e4 *\n\n[Event "b"]\n[Variant "Atomic"]\n\n1. d4 *\n\n[Event "c"]\n\n1. c4 *', ((n) => () => `Chapter${++n}`)(0));
  assert.deepEqual(games.map((g) => g.ok), [true, false, true]);
});

test('headers are kept exactly as read, in order', () => {
  const parsed = ok(parseChapterFile('[ChapterName "B"]\n[Event "A"]\n[Custom_Tag "x:y"]\n[White "W"]\n\n1. e4 *', 'Chapter1'));
  assert.deepEqual(parsed.headers, [['ChapterName', 'B'], ['Event', 'A'], ['Custom_Tag', 'x:y'], ['White', 'W']]);
});

test("a duplicate variation's before-move comment, merged into the main line, joins its comments", () => {
  const parsed = ok(parseChapterFile('[Event "x"]\n\n1. e4 e5 ( { also } 1... e5 { same } 2. Nf3) 2. Nc3 *', 'Chapter1'));
  const e5 = parsed.root.children[0]!.children[0]!;
  assert.deepEqual([e5.startingComments, e5.comments], [[], ['also', 'same']]);
  assert.deepEqual(e5.children.map((c) => c.san), ['Nc3', 'Nf3']);
});
