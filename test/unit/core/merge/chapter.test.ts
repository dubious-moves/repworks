// The three-way merge (PLAN.md §4.7): each table row and attribute rule by hand, the start
// position rule, the identity laws, and the properties over random concurrent edits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeChapter, type MergeLabels } from '../../../../src/core/merge/chapter.ts';
import { openConflicts } from '../../../../src/core/merge/markers.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { writeChapter } from '../../../../src/core/pgn/write.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { chapterProblems, nodeAt, type TreeNode } from '../../../../src/core/study/tree.ts';
import { mulberry32 } from '../../../support/random.ts';
import { randomChapter } from '../../../support/randomTree.ts';
import { randomEdit } from '../../../support/randomEdit.ts';

const labels: MergeLabels = { ours: 'phone 2026-10-05', theirs: 'desktop 2026-10-05' };
const HEAD = '[Event "Test"]\n[Result "*"]\n\n';
const chapter = (movetext: string, head = HEAD): Chapter => {
  const parsed = parseChapterFile(head + movetext, 'Chapter1');
  if (!parsed.ok) assert.fail(parsed.reason);
  return parsed.chapter;
};
const movetext = (c: Chapter) => writeChapter(c).split('\n\n').slice(1).join('\n\n');
const merge = (b: string, o: string, t: string) => mergeChapter(chapter(b), chapter(o), chapter(t), labels);

test('presence: added on either side is kept; deleted on either side, untouched elsewhere, goes', () => {
  const b = '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *';
  assert.equal(movetext(merge(b, '1. e4 e5 (1... c5 2. Nf3) (1... e6) 2. Nf3 *', b).chapter), '1. e4 e5 (1... c5 2. Nf3) (1... e6) 2. Nf3 *');
  assert.equal(movetext(merge(b, b, '1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 *').chapter), '1. e4 e5 (1... c5 2. Nf3 d6) 2. Nf3 *');
  assert.equal(movetext(merge(b, '1. e4 e5 2. Nf3 *', b).chapter), '1. e4 e5 2. Nf3 *');
  assert.equal(movetext(merge(b, b, '1. e4 e5 2. Nf3 *').chapter), '1. e4 e5 2. Nf3 *');
  assert.equal(movetext(merge(b, '1. e4 e5 2. Nf3 *', '1. e4 e5 2. Nf3 *').chapter), '1. e4 e5 2. Nf3 *');
  // The same move added on both sides is one node.
  const both = merge(b, '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *', '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *');
  assert.equal(movetext(both.chapter), '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 *');
  assert.deepEqual(both.conflicts, []);
});

test('edit beats delete: the edited node and the path to it stay, marked at the highest', () => {
  const b = '1. e4 e5 (1... c5 2. Nf3 d6 3. d4) 2. Nf3 *';
  // Ours deleted the Sicilian; theirs commented on 2...d6 and added 3...cxd4.
  const r = merge(b, '1. e4 e5 2. Nf3 *', '1. e4 e5 (1... c5 2. Nf3 d6 { the Najdorf next } 3. d4 cxd4) 2. Nf3 *');
  assert.equal(
    movetext(r.chapter),
    '1. e4 e5 (1... c5 { <<<<<<< kept: deleted on phone 2026-10-05 } 2. Nf3 d6 { the Najdorf next } 3. d4 cxd4) 2. Nf3 *',
  );
  assert.deepEqual(r.conflicts, [{ path: ['e4', 'c5'], kind: 'kept' }]);
  // Mirror: theirs deleted, ours edited. Only the edited branch and its path stay.
  const m = merge('1. e4 e5 (1... c5 2. Nf3 (2. c3) 2... d6) 2. Nf3 *', '1. e4 e5 (1... c5 2. c3 { Alapin }) 2. Nf3 *', '1. e4 e5 2. Nf3 *');
  assert.equal(movetext(m.chapter), '1. e4 e5 (1... c5 { <<<<<<< kept: deleted on desktop 2026-10-05 } 2. c3 { Alapin }) 2. Nf3 *');
  assert.deepEqual(openConflicts(m.chapter).map((c) => [c.path, c.kind]), [[['e4', 'c5'], 'kept']]);
});

test('comments: one side changed takes that side; both changed keeps both between markers', () => {
  const b = '1. e4 { old } e5 *';
  assert.equal(movetext(merge(b, '1. e4 { new } e5 *', b).chapter), '1. e4 { new } 1... e5 *');
  assert.equal(movetext(merge(b, b, '1. e4 e5 *').chapter), '1. e4 e5 *');
  assert.equal(movetext(merge(b, '1. e4 { same } e5 *', '1. e4 { same } e5 *').chapter), '1. e4 { same } 1... e5 *');
  const both = merge(b, '1. e4 { the phone } e5 *', '1. e4 { the desktop } e5 *');
  assert.equal(nodeAt(both.chapter, ['e4'])!.comments[0], '<<<<<<< phone 2026-10-05\nthe phone\n=======\nthe desktop\n>>>>>>> desktop 2026-10-05');
  assert.deepEqual(both.conflicts, [{ path: ['e4'], kind: 'text' }]);
  // Another author's comment both sides kept unchanged stays outside the markers.
  const anno = merge('1. e4 { [%anno "A", a] theirs } { mine } *', '1. e4 { [%anno "A", a] theirs } { phone } *', '1. e4 { [%anno "A", a] theirs } { desktop } *');
  assert.deepEqual(nodeAt(anno.chapter, ['e4'])!.comments, ['[%anno "A", a] theirs', '<<<<<<< phone 2026-10-05\nphone\n=======\ndesktop\n>>>>>>> desktop 2026-10-05']);
  // The merged text writes and reads back unchanged.
  const back = parseChapterFile(writeChapter(anno.chapter), 'Chapter1');
  assert.ok(back.ok);
  assert.deepEqual(back.chapter, anno.chapter);
});

test('shapes merge as a set: added on either side stays, removed on either side goes', () => {
  const r = merge('1. e4 { [%csl Gd4][%cal Ge2e4] } *', '1. e4 { [%csl Gd4,Rf5][%cal Ge2e4] } *', '1. e4 { [%csl Gd4][%cal Gd2d4] } *');
  assert.deepEqual(nodeAt(r.chapter, ['e4'])!.shapes, [
    { brush: 'green', orig: 'd4' },
    { brush: 'red', orig: 'f5' },
    { brush: 'green', orig: 'd2', dest: 'd4' },
  ]);
  assert.deepEqual(r.conflicts, []);
});

test('glyphs: the move and position glyphs are single-valued, observations a set', () => {
  const r = merge('1. e4! $146 *', '1. e4? $14 $146 $32 *', '1. e4!! $146 $40 *');
  // ? and $14 are ours (both sides changed the move glyph: ours wins); $146 stays on every side.
  assert.deepEqual(nodeAt(r.chapter, ['e4'])!.nags, [2, 14, 146, 32, 40]);
  // One side only: its list as it was.
  assert.deepEqual(nodeAt(merge('1. e4! *', '1. e4 $146 $1 *', '1. e4! *').chapter, ['e4'])!.nags, [146, 1]);
});

test('child order: ours if it reordered the common children, else theirs; new ones after their sibling', () => {
  const b = '1. e4 e5 (1... c5) (1... e6) *';
  // Ours promoted c5; theirs added c6 after e6.
  assert.equal(movetext(merge(b, '1. e4 c5 (1... e5) (1... e6) *', '1. e4 e5 (1... c5) (1... e6) (1... c6) *').chapter), '1. e4 c5 (1... e5) (1... e6) (1... c6) *');
  // Theirs reordered, ours added d5 after e5.
  assert.equal(movetext(merge(b, '1. e4 e5 (1... d5) (1... c5) (1... e6) *', '1. e4 e5 (1... e6) (1... c5) *').chapter), '1. e4 e5 (1... d5) (1... e6) (1... c5) *');
});

test('headers merge per key; a clock removed on one side stays removed', () => {
  const head = (extra: string) => `[Event "Test"]\n[Result "*"]\n${extra}\n`;
  const r = mergeChapter(
    chapter('1. e4 { [%clk 0:03:00] } *', head('[ChapterName "A"]\n[Orientation "white"]\n')),
    chapter('1. e4 { [%clk 0:03:00] } *', head('[ChapterName "B"]\n[Orientation "white"]\n')),
    chapter('1. e4 *', head('[ChapterName "A"]\n[Orientation "black"]\n[White "Me"]\n')),
    labels,
  );
  // Theirs' order, with each key's three-way value.
  assert.deepEqual(r.chapter.headers, [['Event', 'Test'], ['Result', '*'], ['ChapterName', 'B'], ['Orientation', 'black'], ['White', 'Me']]);
  assert.equal(nodeAt(r.chapter, ['e4'])!.clock, undefined);
  assert.ok(!('clock' in nodeAt(r.chapter, ['e4'])!));
});

test('a changed start position: that side wins, the other side kept as a conflict copy', () => {
  const fen = (f: string) => `[Event "Test"]\n[Result "*"]\n[FEN "${f}"]\n[SetUp "1"]\n\n`;
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const other = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const b = chapter('1. e4 e5 *', fen(start));
  const theirsNewStart = chapter('1... c5 *', fen(other));
  const oursEdited = chapter('1. e4 e5 2. Nf3 *', fen(start));
  const r = mergeChapter(b, oursEdited, theirsNewStart, labels);
  assert.equal(r.chapter, theirsNewStart);
  assert.equal(r.copy?.side, 'ours');
  assert.equal(r.copy?.chapter, oursEdited);
  assert.deepEqual(r.conflicts, [{ path: [], kind: 'start-position' }]);
  // The other side unchanged since base: no copy needed.
  assert.deepEqual(mergeChapter(b, b, theirsNewStart, labels), { chapter: theirsNewStart, conflicts: [] });
  // Both changed it: ours, and theirs as the copy.
  const third = chapter('1. d4 *', fen('rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1'));
  assert.equal(mergeChapter(b, third, theirsNewStart, labels).copy?.side, 'theirs');
});

type Index = Map<string, TreeNode>;
function indexOf(c: Chapter): Index {
  const out: Index = new Map();
  const walk = (node: TreeNode, path: string[]) => {
    out.set(path.join(' '), node);
    for (const child of node.children) walk(child, [...path, child.san]);
  };
  walk(c.root, []);
  return out;
}
const sameAttrs = (a: TreeNode, b: TreeNode) =>
  JSON.stringify([a.comments, a.startingComments, a.nags, a.shapes]) === JSON.stringify([b.comments, b.startingComments, b.nags, b.shapes]);

test('properties over random concurrent edits (the planning prototype ran 20,000)', () => {
  const random = mulberry32(47);
  let textConflicts = 0;
  let kept = 0;
  const runs = Number(process.env['REPWORKS_MERGE_RUNS'] ?? 2500);
  for (let run = 0; run < runs; run++) {
    const B = randomChapter(random, 'Chapter1', { maxDepth: 6 });
    let O = B;
    let T = B;
    for (let k = Math.floor(random() * 7); k > 0; k--) O = randomEdit(random, O);
    for (let k = Math.floor(random() * 7); k > 0; k--) T = randomEdit(random, T);
    const { chapter: R, conflicts } = mergeChapter(B, O, T, labels);
    textConflicts += conflicts.filter((c) => c.kind === 'text').length;
    kept += conflicts.filter((c) => c.kind === 'kept').length;
    const [iB, iO, iT, iR] = [indexOf(B), indexOf(O), indexOf(T), indexOf(R)];
    const where = `run ${run}`;
    for (const [S, other] of [[iO, iT], [iT, iO]] as const) {
      // Edited nodes on this side, with their ancestors.
      const touched = new Set<string>();
      for (const [k, n] of S) {
        const before = iB.get(k);
        if (before && sameAttrs(n, before)) continue;
        const parts = k ? k.split(' ') : [];
        for (let i = 0; i <= parts.length; i++) touched.add(parts.slice(0, i).join(' '));
      }
      for (const [k, n] of S) {
        // No added node is lost.
        if (!iB.has(k)) assert.ok(iR.has(k), `${where}: lost addition ${k}`);
        // Every comment written on this side appears in the result.
        const before = iB.get(k);
        const r = iR.get(k);
        if (r) {
          const all = [...r.comments, ...r.startingComments].join('\n');
          for (const c of [...n.comments, ...n.startingComments]) {
            if (!before || ![...before.comments, ...before.startingComments].includes(c)) assert.ok(all.includes(c), `${where}: lost text at ${k}`);
          }
        }
      }
      for (const k of iB.keys()) {
        if (k === '' || other.has(k) || !S.has(k)) continue;
        // Deleted by the other side: it holds unless this side touched the subtree; if it did,
        // the node stays and a marker sits on the highest kept node of its path.
        if (!touched.has(k)) assert.ok(!iR.has(k), `${where}: delete not honoured ${k}`);
        else {
          assert.ok(iR.has(k), `${where}: edit inside a deleted subtree lost at ${k}`);
          const parts = k.split(' ');
          const marked = parts.some((_, i) => iR.get(parts.slice(0, i + 1).join(' '))!.comments.some((c) => c.startsWith('<<<<<<< kept: deleted on ')));
          assert.ok(marked, `${where}: no kept marker above ${k}`);
        }
      }
    }
    // The result is a valid chapter, survives write then read, and the merge is deterministic.
    assert.deepEqual(chapterProblems(R), [], where);
    const back = parseChapterFile(writeChapter(R), R.id);
    assert.ok(back.ok, where);
    assert.deepEqual(back.chapter, R, where);
    assert.deepEqual(mergeChapter(B, O, T, labels).chapter, R, `${where}: not deterministic`);
    // The identity laws.
    assert.deepEqual(mergeChapter(B, B, T, labels).chapter, T, `${where}: merge(B, B, T) = T`);
    assert.deepEqual(mergeChapter(B, O, B, labels).chapter, O, `${where}: merge(B, O, B) = O`);
    assert.deepEqual(mergeChapter(B, O, O, labels).chapter, O, `${where}: merge(B, O, O) = O`);
  }
  if (runs >= 2500) assert.ok(textConflicts > 20 && kept > 200, `exercised ${textConflicts} text conflicts and ${kept} kept-after-delete`);
});
