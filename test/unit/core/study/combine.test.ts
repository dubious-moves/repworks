// Several chapters of a study at once (PLAN.md §5.140): chapters merged into one tree, and the
// files that deleting, turning and merging chosen chapters write.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { chapterFileText } from '../../../../src/core/pgn/write.ts';
import { combineChapters } from '../../../../src/core/study/combine.ts';
import { deleteChapters, mergeChapters, setChaptersSide } from '../../../../src/core/study/manage.ts';
import type { Chapter, StudyMeta } from '../../../../src/core/study/model.ts';
import { writeStudyMeta } from '../../../../src/core/study/studyMeta.ts';

const S = 'studies/Study001/';
const pgn = (name: string, movetext: string, more = '', side = 'black') => `[Event "Rep: ${name}"]\n[Result "*"]\n[StudyName "Rep"]\n[ChapterName "${name}"]\n[Orientation "${side}"]\n${more}\n${movetext}\n`;
const read = (text: string, id: string): Chapter => {
  const parsed = parseChapterFile(text, id);
  assert.ok(parsed.ok);
  return parsed.chapter;
};
const meta = (chapters: string[]): StudyMeta => ({ format: 1, id: 'Study001', name: 'Rep', kind: 'repertoire', chapters });
const movetext = (text: string) => text.slice(text.indexOf('\n\n') + 2);

test('merged: every line once, the first chapter’s main line first, its headers kept', () => {
  const a = read(pgn('Najdorf', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *'), 'Chapter1');
  const b = read(pgn('Game 2', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5 e6 *'), 'Chapter2');
  const c = read(pgn('Game 3', '1. e4 c5 2. c3 Nf6 *'), 'Chapter3');
  const merged = combineChapters([a, b, c]);
  assert.ok(merged.ok);
  assert.equal(merged.value.id, 'Chapter1');
  assert.deepEqual(merged.value.headers, a.headers);
  assert.equal(movetext(chapterFileText(merged.value)), '1. e4 c5 2. Nf3 (2. c3 Nf6) 2... d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5 e6 *\n');
});

test('merged: comments, shapes and glyphs of a move both have are joined, none twice', () => {
  const a = read(pgn('A', '1. e4 { Best by test } c5! { [%cal Gg8f6] } *'), 'Chapter1');
  const b = read(pgn('B', '1. e4 { Best by test } { Played most } c5!? { [%cal Gg8f6,Rb8c6] } 2. Nf3 *'), 'Chapter2');
  const merged = combineChapters([a, b]);
  assert.ok(merged.ok);
  const e4 = merged.value.root.children[0]!;
  assert.deepEqual(e4.comments, ['Best by test', 'Played most']);
  const c5 = e4.children[0]!;
  assert.deepEqual(c5.nags, [1]);
  assert.deepEqual(c5.shapes, [
    { brush: 'green', orig: 'g8', dest: 'f6' },
    { brush: 'red', orig: 'b8', dest: 'c6' },
  ]);
  assert.deepEqual(c5.children.map((n) => n.san), ['Nf3']);
  // As written, and read back the same.
  const text = chapterFileText(merged.value);
  assert.deepEqual(read(text, 'Chapter1'), merged.value);
});

test('merged: refused for one chapter, another start or another side', () => {
  const a = read(pgn('A', '1. e4 c5 *'), 'Chapter1');
  assert.deepEqual(combineChapters([a]), { ok: false, error: 'choose at least two chapters to merge' });
  const fen = read(pgn('Ending', '1. e4 *', '[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n[SetUp "1"]\n'), 'Chapter2');
  assert.deepEqual(combineChapters([a, fen]), { ok: false, error: '“Ending” starts from another position than “A”' });
  const white = read(pgn('W', '1. e4 c5 2. Nf3 *', '', 'white'), 'Chapter3');
  assert.deepEqual(combineChapters([a, white]), { ok: false, error: '“W” is for White and “A” for Black: give them the same side first' });
});

test('deleting chapters: their files, and study.json without them, in one change', () => {
  const change = deleteChapters(meta(['Chapter1', 'Chapter2', 'Chapter3']), ['Chapter3', 'Chapter1']);
  assert.deepEqual([...change], [
    [`${S}Chapter3.pgn`, null],
    [`${S}Chapter1.pgn`, null],
    [`${S}study.json`, writeStudyMeta(meta(['Chapter2']))],
  ]);
});

test('chapters given a side: only those not already for it written; an unreadable one named and left', () => {
  const texts = new Map([
    ['Chapter1', pgn('A', '1. e4 c5 *')],
    ['Chapter2', pgn('B', '1. e4 c5 2. c3 *', '', 'white')],
    ['Chapter3', pgn('Broken', '1. e4 e5 2. Ke3 *')],
    ['Chapter4', pgn('Gone', '1. d4 *')],
  ]);
  const { change, unreadable } = setChaptersSide(meta(['Chapter1', 'Chapter2', 'Chapter3', 'Chapter4']), texts, ['Chapter1', 'Chapter2', 'Chapter3'], 'white');
  assert.deepEqual([...change.keys()], [`${S}Chapter1.pgn`]);
  assert.equal(change.get(`${S}Chapter1.pgn`), pgn('A', '1. e4 c5 *', '', 'white'));
  assert.deepEqual(unreadable, ['Broken']);
});

test('chapters merged: into the first in the study’s order, the others deleted, in one change', () => {
  const texts = new Map([
    ['Chapter1', pgn('A', '1. e4 c5 2. Nf3 *')],
    ['Chapter2', pgn('B', '1. e4 c5 2. c3 *')],
    ['Chapter3', pgn('C', '1. e4 e6 *')],
    ['Chapter4', pgn('Kept', '1. d4 *')],
  ]);
  const merged = mergeChapters(meta(['Chapter2', 'Chapter1', 'Chapter3', 'Chapter4']), texts, ['Chapter3', 'Chapter1', 'Chapter2']);
  assert.ok(merged.ok);
  assert.equal(merged.value.into, 'Chapter2');
  assert.deepEqual([...merged.value.change], [
    [`${S}Chapter1.pgn`, null],
    [`${S}Chapter3.pgn`, null],
    [`${S}study.json`, writeStudyMeta(meta(['Chapter2', 'Chapter4']))],
    [`${S}Chapter2.pgn`, pgn('B', '1. e4 c5 (1... e6) 2. c3 (2. Nf3) *')],
  ]);
  // One that can't be read refuses the merge: nothing written.
  texts.set('Chapter3', pgn('C', '1. e4 e5 2. Ke3 *'));
  assert.deepEqual(mergeChapters(meta(['Chapter1', 'Chapter2', 'Chapter3']), texts, ['Chapter1', 'Chapter3']), { ok: false, error: '“C” can’t be read, so it is left as it is' });
});
