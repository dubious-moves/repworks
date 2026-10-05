// The merge of a data repo's authored files (PLAN.md §4.7): per file, per chapter and per study.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeAuthoredFiles, type FileMergeContext } from '../../../../src/core/merge/files.ts';
import { parseStudyMeta, writeStudyMeta } from '../../../../src/core/study/studyMeta.ts';
import type { StudyMeta } from '../../../../src/core/study/model.ts';

const ctx: FileMergeContext = { labels: { ours: 'phone 2026-10-05', theirs: 'desktop 2026-10-05' }, device: 'Phone001', newId: () => 'CopyId01' };
const meta = (chapters: string[], extra: Partial<StudyMeta> = {}) =>
  writeStudyMeta({ format: 1, id: 'Study001', name: 'Rep', kind: 'repertoire', chapters, ...extra });
const pgn = (name: string, movetext: string, fen?: string) =>
  `[Event "Rep: ${name}"]\n[Result "*"]\n[StudyName "Rep"]\n[ChapterName "${name}"]\n${fen ? `[FEN "${fen}"]\n[SetUp "1"]\n` : ''}\n${movetext}\n`;
const S = 'studies/Study001/';
const files = (entries: Record<string, string>) => new Map(Object.entries(entries));
const base = () =>
  files({
    'repworks.json': '{ "format": 1 }\n',
    [`${S}study.json`]: meta(['Chapter1', 'Chapter2']),
    [`${S}Chapter1.pgn`]: pgn('A', '1. e4 e5 2. Nf3 *'),
    [`${S}Chapter2.pgn`]: pgn('B', '1. d4 d5 *'),
  });

test('a file changed on one side only, or the same on both, is taken as it is', () => {
  const b = base();
  const o = base();
  o.set(`${S}Chapter1.pgn`, pgn('A', '1. e4 e5 2. Nf3 Nc6 *'));
  const t = base();
  t.set(`${S}Chapter2.pgn`, pgn('B', '1. d4 d5 2. c4 *'));
  t.set('README.md', 'notes\n');
  const r = mergeAuthoredFiles(b, o, t, ctx);
  assert.equal(r.files.get(`${S}Chapter1.pgn`), o.get(`${S}Chapter1.pgn`));
  assert.equal(r.files.get(`${S}Chapter2.pgn`), t.get(`${S}Chapter2.pgn`));
  assert.equal(r.files.get('README.md'), 'notes\n');
  assert.deepEqual(r.conflicts, []);
});

test('a chapter both sides edited merges three-way', () => {
  const o = base();
  o.set(`${S}Chapter1.pgn`, pgn('A', '1. e4 e5 2. Nf3 Nc6 *'));
  const t = base();
  t.set(`${S}Chapter1.pgn`, pgn('A', '1. e4 e5 (1... c5) 2. Nf3 *'));
  const r = mergeAuthoredFiles(base(), o, t, ctx);
  assert.equal(r.files.get(`${S}Chapter1.pgn`), pgn('A', '1. e4 e5 (1... c5) 2. Nf3 Nc6 *'));
});

test('a chapter deleted on one side and edited on the other is kept, marked in its root comment', () => {
  const o = base();
  o.delete(`${S}Chapter2.pgn`);
  o.set(`${S}study.json`, meta(['Chapter1']));
  const t = base();
  t.set(`${S}Chapter2.pgn`, pgn('B', '1. d4 d5 2. c4 *'));
  const r = mergeAuthoredFiles(base(), o, t, ctx);
  assert.equal(r.files.get(`${S}Chapter2.pgn`), pgn('B', '{ <<<<<<< kept: deleted on phone 2026-10-05 }\n1. d4 d5 2. c4 *'));
  const study = parseStudyMeta(r.files.get(`${S}study.json`)!);
  assert.ok(study.ok);
  assert.deepEqual(study.value.chapters, ['Chapter1', 'Chapter2']);
  assert.deepEqual(r.conflicts, [{ path: `${S}Chapter2.pgn`, kind: 'kept' }]);
});

test('a study deleted on one side and edited on the other is restored, its chapters marked', () => {
  const o = base();
  o.set(`${S}Chapter1.pgn`, pgn('A', '1. e4 e5 2. Nf3 Nc6 *'));
  const t = files({ 'repworks.json': '{ "format": 1 }\n' });
  const r = mergeAuthoredFiles(base(), o, t, ctx);
  assert.equal(r.files.get(`${S}Chapter1.pgn`), pgn('A', '{ <<<<<<< kept: deleted on desktop 2026-10-05 }\n1. e4 e5 2. Nf3 Nc6 *'));
  // Chapter2 wasn't edited by the side that kept the study, so its deletion holds.
  assert.equal(r.files.has(`${S}Chapter2.pgn`), false);
  assert.equal(r.files.get(`${S}study.json`), meta(['Chapter1']));
  assert.deepEqual(r.conflicts.map((c) => c.kind).sort(), ['kept', 'study-restored']);
  // Deleted on one side and untouched on the other: it stays deleted.
  assert.deepEqual([...mergeAuthoredFiles(base(), base(), t, ctx).files.keys()], ['repworks.json']);
});

test("a file the app can't read is never rewritten: theirs stays, ours goes beside it", () => {
  const o = base();
  o.set(`${S}Chapter1.pgn`, '[Event "x"]\n[Variant "Atomic"]\n\n1. e4 *\n');
  const t = base();
  t.set(`${S}Chapter1.pgn`, pgn('A', '1. e4 e5 2. Nf3 Nc6 *'));
  const r = mergeAuthoredFiles(base(), o, t, ctx);
  assert.equal(r.files.get(`${S}Chapter1.pgn`), t.get(`${S}Chapter1.pgn`));
  assert.equal(r.files.get(`${S}Chapter1.conflict-Phone001.pgn`), o.get(`${S}Chapter1.pgn`));
  assert.deepEqual(r.conflicts, [{ path: `${S}Chapter1.pgn`, kind: 'unparsable' }]);
});

test('study.json merges per field, and its chapter list follows the files', () => {
  const o = base();
  o.set(`${S}study.json`, meta(['Chapter2', 'Chapter1', 'Chapter3'], { name: 'Renamed' }));
  o.set(`${S}Chapter3.pgn`, pgn('C', '1. c4 *'));
  const t = base();
  t.set(`${S}study.json`, meta(['Chapter1', 'Chapter4'], { kind: 'reference' }));
  t.set(`${S}Chapter4.pgn`, pgn('D', '1. Nf3 *'));
  t.delete(`${S}Chapter2.pgn`);
  const r = mergeAuthoredFiles(base(), o, t, ctx);
  // Ours renamed and reordered; theirs changed the kind, added Chapter4 and deleted Chapter2.
  assert.equal(r.files.get(`${S}study.json`), meta(['Chapter1', 'Chapter3', 'Chapter4'], { name: 'Renamed', kind: 'reference' }));
});

test('a start position changed on one side keeps the other side as a conflict copy, after it', () => {
  const o = base();
  o.set(`${S}Chapter1.pgn`, pgn('A', '1. e4 e5 2. Nf3 Nc6 *'));
  const t = base();
  t.set(`${S}Chapter1.pgn`, pgn('A', '1... c5 *', 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'));
  const r = mergeAuthoredFiles(base(), o, t, ctx);
  assert.equal(r.files.get(`${S}Chapter1.pgn`), t.get(`${S}Chapter1.pgn`));
  assert.equal(r.files.get(`${S}CopyId01.pgn`), pgn('A (conflict copy)', '1. e4 e5 2. Nf3 Nc6 *').replace('[Event "Rep: A"]', '[Event "Rep: A (conflict copy)"]'));
  assert.equal(r.files.get(`${S}study.json`), meta(['Chapter1', 'CopyId01', 'Chapter2']));
  assert.deepEqual(r.conflicts, [{ path: `${S}Chapter1.pgn`, kind: 'start-position' }]);
});
