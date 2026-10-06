// Tree edits (PLAN.md §4.6): each operation against an expected tree, written here as the PGN
// it gives; every result stays valid; promote then demote gives back the original.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { writeChapter } from '../../../../src/core/pgn/write.ts';
import type { Chapter, StudyMeta } from '../../../../src/core/study/model.ts';
import * as ops from '../../../../src/core/study/ops.ts';
import { chapterProblems, nodeAt, type Path } from '../../../../src/core/study/tree.ts';
import { mulberry32 } from '../../../support/random.ts';
import { pick, randomChapter } from '../../../support/randomTree.ts';
import { makeSan } from 'chessops/san';
import { positionAt } from '../../../../src/core/study/tree.ts';

const HEAD = '[Event "Test"]\n[Result "*"]\n\n';
function chapter(movetext: string, head = HEAD): Chapter {
  const parsed = parseChapterFile(head + movetext, 'Chapter1');
  if (!parsed.ok) assert.fail(parsed.reason);
  return parsed.chapter;
}
function value<T>(edit: ops.Edit<T>): T {
  if (!edit.ok) assert.fail(edit.error);
  assert.ok(edit.ok);
  return edit.value;
}
const movetext = (c: Chapter) => writeChapter(c).split('\n\n').slice(1).join('\n\n');
const valid = (c: Chapter) => assert.deepEqual(chapterProblems(c), []);

const base = () => chapter('1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *');

test('addMove: an existing move is navigated to, a new one becomes the last variation', () => {
  const c = base();
  const same = value(ops.addMove(c, ['e4'], 'e5'));
  assert.equal(same.chapter, c);
  assert.deepEqual(same.path, ['e4', 'e5']);
  const added = value(ops.addMove(c, ['e4'], 'e6'));
  assert.deepEqual(added.path, ['e4', 'e6']);
  assert.equal(movetext(added.chapter), '1. e4 e5 (1... c5 2. Nf3) (1... e6) 2. Nf3 Nc6 *');
  const extended = value(ops.addMove(c, ['e4', 'e5', 'Nf3', 'Nc6'], 'Bb5'));
  assert.equal(movetext(extended.chapter), '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 3. Bb5 *');
  valid(added.chapter);
  valid(extended.chapter);
});

test('addMove writes SAN canonically and refuses illegal moves and missing paths', () => {
  const c = chapter('1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Qh4 5. Nc3 Bb4 *');
  const knight = value(ops.addMove(c, ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Qh4', 'Nc3', 'Bb4'], 'Ndb5'));
  assert.equal(knight.path.at(-1), 'Nb5');
  assert.deepEqual(ops.addMove(c, ['e4'], 'e4'), { ok: false, error: 'e4 is not a legal move here' });
  assert.equal(ops.addMove(c, ['d4'], 'd5').ok, false);
  const fen = chapter('*', '[Event "T"]\n[Result "*"]\n[FEN "8/8/4k3/8/3PK3/8/8/8 b - - 0 40"]\n[SetUp "1"]\n\n');
  assert.equal(movetext(value(ops.addMove(fen, [], 'Kd6')).chapter), '40... Kd6 *');
});

test('deletePath removes a move and all after it; the start stays', () => {
  const c = base();
  assert.equal(movetext(value(ops.deletePath(c, ['e4', 'c5']))), '1. e4 e5 2. Nf3 Nc6 *');
  assert.equal(movetext(value(ops.deletePath(c, ['e4', 'e5']))), '1. e4 c5 2. Nf3 *');
  // With no moves left, scalachess writes the result after a space.
  assert.equal(movetext(value(ops.deletePath(c, ['e4']))), ' *');
  assert.equal(ops.deletePath(c, []).ok, false);
  assert.equal(ops.deletePath(c, ['d4']).ok, false);
});

test('promote moves one step up among siblings; demote undoes it', () => {
  const c = chapter('1. e4 e5 (1... c5) (1... e6) (1... c6) 2. Nf3 *');
  const promoted = value(ops.promote(c, ['e4', 'e6']));
  assert.equal(movetext(promoted), '1. e4 e5 (1... e6) (1... c5) (1... c6) 2. Nf3 *');
  assert.deepEqual(value(ops.demote(promoted, ['e4', 'e6'])), c);
  const toMain = value(ops.promote(c, ['e4', 'c5']));
  assert.equal(movetext(toMain), '1. e4 c5 (1... e5 2. Nf3) (1... e6) (1... c6) *');
  assert.deepEqual(value(ops.demote(toMain, ['e4', 'c5'])), c);
  // The first sibling has nowhere to go.
  assert.deepEqual(value(ops.promote(c, ['e4', 'e5'])), c);
  assert.deepEqual(value(ops.demote(c, ['e4', 'c6'])), c);
});

test("a variation's before-move comment joins its comments when it becomes the main line", () => {
  const c = chapter('1. e4 e5 ( { Also } 1... c5 { Sicilian } 2. Nf3) 2. Nf3 *');
  assert.deepEqual(nodeAt(c, ['e4', 'c5'])!.startingComments, ['Also']);
  const promoted = value(ops.promote(c, ['e4', 'c5']));
  assert.deepEqual(nodeAt(promoted, ['e4', 'c5'])!.comments, ['Also', 'Sicilian']);
  assert.equal(movetext(promoted), '1. e4 c5 { Also } { Sicilian } (1... e5 2. Nf3) 2. Nf3 *');
  assert.equal(movetext(value(ops.deletePath(c, ['e4', 'e5']))), '1. e4 c5 { Also } { Sicilian } 2. Nf3 *');
  assert.equal(movetext(value(ops.makeMainline(c, ['e4', 'c5', 'Nf3']))), '1. e4 c5 { Also } { Sicilian } (1... e5 2. Nf3) 2. Nf3 *');
});

test('variationStart finds the move a variation begins with; makeMainline lifts a whole path', () => {
  const c = chapter('1. e4 e5 (1... c5 2. Nf3 d6 (2... Nc6 3. d4) 3. d4) 2. Nf3 *');
  assert.deepEqual(ops.variationStart(c, ['e4', 'c5', 'Nf3', 'd6', 'd4']), ['e4', 'c5']);
  assert.deepEqual(ops.variationStart(c, ['e4', 'c5', 'Nf3', 'Nc6', 'd4']), ['e4', 'c5', 'Nf3', 'Nc6']);
  assert.equal(ops.variationStart(c, ['e4', 'e5', 'Nf3']), undefined);
  const main = value(ops.makeMainline(c, ['e4', 'c5', 'Nf3', 'Nc6', 'd4']));
  assert.equal(movetext(main), '1. e4 c5 (1... e5 2. Nf3) 2. Nf3 Nc6 (2... d6 3. d4) 3. d4 *');
  valid(main);
});

test("setComment edits the owner's comment only, sanitized; an empty text removes it", () => {
  const c = chapter('1. e4 { [%anno "Other", other] theirs } { mine } e5 *');
  const edited = value(ops.setComment(c, ['e4'], '  new {text}  '));
  assert.deepEqual(nodeAt(edited, ['e4'])!.comments, ['[%anno "Other", other] theirs', 'new text']);
  const removed = value(ops.setComment(edited, ['e4'], ''));
  assert.deepEqual(nodeAt(removed, ['e4'])!.comments, ['[%anno "Other", other] theirs']);
  const added = value(ops.setComment(removed, ['e4'], 'back'));
  assert.equal(movetext(added), '1. e4 { [%anno "Other", other] theirs } { back } 1... e5 *');
  assert.equal(movetext(value(ops.setComment(base(), [], 'Before the first move'))), '{ Before the first move }\n1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *');
});

test('glyphs: one move and one position assessment, in the order Lichess writes them', () => {
  const c = base();
  const set = value(ops.setNags(c, ['e4'], [146, 14, 1, 2]));
  assert.deepEqual(nodeAt(set, ['e4'])!.nags, [2, 14, 146]);
  // Glyphs alone don't number Black's next move; comments and variations do.
  assert.equal(movetext(set), '1. e4? $14 $146 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *');
  let t = value(ops.toggleGlyph(c, ['e4'], 1));
  t = value(ops.toggleGlyph(t, ['e4'], 3)); // replaces !, same group
  t = value(ops.toggleGlyph(t, ['e4'], 16));
  t = value(ops.toggleGlyph(t, ['e4'], 146));
  t = value(ops.toggleGlyph(t, ['e4'], 40)); // a new observation goes first
  assert.deepEqual(nodeAt(t, ['e4'])!.nags, [3, 16, 40, 146]);
  t = value(ops.toggleGlyph(t, ['e4'], 16)); // the same glyph again removes it
  assert.deepEqual(nodeAt(t, ['e4'])!.nags, [3, 40, 146]);
  assert.equal(ops.setNags(c, [], [1]).ok, false);
});

test('setShapes keeps circles before arrows and drops duplicates', () => {
  const s = value(ops.setShapes(base(), ['e4'], [
    { brush: 'green', orig: 'e2', dest: 'e4' },
    { brush: 'red', orig: 'd5' },
    { brush: 'green', orig: 'e2', dest: 'e4' },
  ]));
  assert.equal(movetext(s), '1. e4 { [%csl Rd5][%cal Ge2e4] } 1... e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *');
});

test('headers: changed in place, added where Lichess sorts them; the start position is fixed', () => {
  const c = chapter('1. e4 *', '[Event "E"]\n[Result "*"]\n[StudyName "S"]\n\n');
  const white = value(ops.setHeader(c, 'White', 'Me'));
  assert.deepEqual(white.headers.map(([k]) => k), ['Event', 'White', 'Result', 'StudyName']);
  const custom = value(ops.setHeader(white, 'Opening', 'King pawn'));
  assert.deepEqual(custom.headers.at(-1), ['Opening', 'King pawn']);
  assert.deepEqual(value(ops.setHeader(custom, 'Event', 'F')).headers[0], ['Event', 'F']);
  assert.equal(ops.setHeader(c, 'FEN', '8/8/8/8/8/8/8/8 w - - 0 1').ok, false);
  assert.equal(ops.setHeader(c, 'bad name', 'x').ok, false);
  assert.deepEqual(value(ops.removeHeader(custom, 'White')).headers.map(([k]) => k), ['Event', 'Result', 'StudyName', 'Opening']);
  assert.deepEqual(value(ops.setOrientation(c, 'black')).headers.at(-1), ['Orientation', 'black']);
});

test('chapters: created with the headers an export carries, renamed with their Event', () => {
  const created = value(ops.newChapter('Chapter9', 'My study', 'Endgames', 'white', '8/8/4k3/8/3PK3/8/8/8 b - - 0 40'));
  assert.equal(writeChapter(created), '[Event "My study: Endgames"]\n[Result "*"]\n[StudyName "My study"]\n[ChapterName "Endgames"]\n[FEN "8/8/4k3/8/3PK3/8/8/8 b - - 0 40"]\n[SetUp "1"]\n[Orientation "white"]\n\n *');
  assert.equal(ops.newChapter('Chapter9', 'S', 'X', 'white', '8/8/8/8/8/8/8/8 w - - 0 1').ok, false);
  const renamed = value(ops.renameChapter(created, 'My study', 'Rook endings'));
  assert.deepEqual(renamed.headers.slice(0, 4), [['Event', 'My study: Rook endings'], ['Result', '*'], ['StudyName', 'My study'], ['ChapterName', 'Rook endings']]);
  // An Event that isn't "Study: Chapter" is left alone.
  const custom = value(ops.renameChapter(value(ops.setHeader(created, 'Event', 'Mine')), 'My study', 'Other'));
  assert.equal(custom.headers[0]![1], 'Mine');
});

test('studies: renaming rewrites StudyName in every chapter; kind and order', () => {
  const meta: StudyMeta = { format: 1, id: 'Study001', name: 'Old', kind: 'repertoire', chapters: ['Chapter1', 'Chapter2'] };
  const a = value(ops.newChapter('Chapter1', 'Old', 'A', 'white'));
  const b = value(ops.setHeader(value(ops.newChapter('Chapter2', 'Old', 'B', 'black')), 'Event', 'Kept'));
  const renamed = value(ops.renameStudy(meta, [a, b], 'New'));
  assert.equal(renamed.meta.name, 'New');
  assert.deepEqual(renamed.chapters.map((c) => [c.headers.find(([k]) => k === 'StudyName')![1], c.headers[0]![1]]), [['New', 'New: A'], ['New', 'Kept']]);
  assert.equal(ops.setKind(meta, 'reference').kind, 'reference');
  assert.deepEqual(value(ops.reorderChapters(meta, ['Chapter2', 'Chapter1'])).chapters, ['Chapter2', 'Chapter1']);
  assert.equal(ops.reorderChapters(meta, ['Chapter2']).ok, false);
  assert.deepEqual(ops.removeChapterFromStudy(ops.addChapterToStudy(meta, 'Chapter3'), 'Chapter1').chapters, ['Chapter2', 'Chapter3']);
});

test('linePgn copies the line to a move', () => {
  const c = base();
  assert.equal(ops.linePgn(c, ['e4', 'c5', 'Nf3']), '1. e4 c5 2. Nf3');
  const fen = chapter('40... Kd6 41. Kf5 *', '[Event "T"]\n[Result "*"]\n[FEN "8/8/4k3/8/3PK3/8/8/8 b - - 0 40"]\n[SetUp "1"]\n\n');
  assert.equal(ops.linePgn(fen, ['Kd6', 'Kf5']), '40... Kd6 41. Kf5');
});

test('edits share what they did not touch and leave their input alone', () => {
  const c = base();
  const before = writeChapter(c);
  const edited = value(ops.setComment(c, ['e4', 'e5', 'Nf3'], 'x'));
  assert.equal(writeChapter(c), before);
  assert.equal(nodeAt(edited, ['e4', 'c5']), nodeAt(c, ['e4', 'c5']));
  assert.notEqual(nodeAt(edited, ['e4']), nodeAt(c, ['e4']));
});

test('random edits on random chapters always leave a valid chapter', () => {
  const random = mulberry32(46);
  const paths = (c: Chapter): Path[] => {
    const out: Path[] = [[]];
    const walk = (node: Chapter['root'], path: string[]) => {
      for (const child of node.children) {
        out.push([...path, child.san]);
        walk(child, [...path, child.san]);
      }
    };
    walk(c.root, []);
    return out;
  };
  for (let i = 0; i < 150; i++) {
    let c = randomChapter(random, 'Rand0001', { maxDepth: 8 });
    for (let k = 0; k < 12; k++) {
      const path = pick(random, paths(c));
      const r = random();
      let next: ops.Edit<Chapter>;
      if (r < 0.3) {
        const pos = positionAt(c, path)!;
        const moves = [...pos.allDests()].flatMap(([from, dests]) => [...dests].map((to) => ({ from, to })));
        if (!moves.length) continue;
        const added = ops.addMove(c, path, makeSan(pos, pick(random, moves)));
        next = added.ok ? { ok: true, value: added.value.chapter } : added;
      } else if (r < 0.45) next = ops.deletePath(c, path);
      else if (r < 0.55) next = ops.promote(c, path);
      else if (r < 0.65) next = ops.makeMainline(c, path);
      else if (r < 0.8) next = ops.setComment(c, path, pick(random, ['a', '', 'b {c}', 'x\n\ny']));
      else if (r < 0.9) next = ops.toggleGlyph(c, path, pick(random, [1, 2, 5, 14, 146, 40]));
      else next = ops.setShapes(c, path, [{ brush: 'red', orig: 'e4' }]);
      if (next.ok) c = next.value;
      assert.deepEqual(chapterProblems(c), [], `case ${i} step ${k}`);
      // And the chapter still survives a write and a read unchanged.
      const back = parseChapterFile(writeChapter(c), c.id);
      assert.ok(back.ok);
      assert.deepEqual(back.chapter, c, `case ${i} step ${k}`);
    }
  }
});

test('toggleShape draws as chessground does: the same shape goes, another colour replaces it', () => {
  const arrow = { brush: 'green' as const, orig: 'e2' as const, dest: 'e4' as const };
  const circle = { brush: 'red' as const, orig: 'd4' as const };
  assert.deepEqual(ops.toggleShape([], arrow), [arrow]);
  assert.deepEqual(ops.toggleShape([arrow, circle], arrow), [circle]);
  assert.deepEqual(ops.toggleShape([arrow, circle], { ...arrow, brush: 'blue' }), [circle, { ...arrow, brush: 'blue' }]);
  assert.deepEqual(ops.toggleShape([arrow], { brush: 'green', orig: 'e2' }), [arrow, { brush: 'green', orig: 'e2' }]);
});
