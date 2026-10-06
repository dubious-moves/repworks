// Studies made and deleted on the site (PLAN.md §5.15): the files each change writes, and a study
// deleted here while another device edits it, through the merge (§4.7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeAuthoredFiles, type FileMergeContext } from '../../../../src/core/merge/files.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { createStudy, deleteChapter, deleteStudy, type FileChange } from '../../../../src/core/study/manage.ts';
import { parseStudyMeta, writeStudyMeta } from '../../../../src/core/study/studyMeta.ts';

const S = 'studies/Study001/';
const pgn = (name: string, movetext: string) => `[Event "Rep: ${name}"]\n[Result "*"]\n[StudyName "Rep"]\n[ChapterName "${name}"]\n[Orientation "black"]\n\n${movetext}\n`;
const meta = (chapters: string[]) => writeStudyMeta({ format: 1, id: 'Study001', name: 'Rep', kind: 'repertoire', chapters });
const base = () =>
  new Map<string, string>([
    ['repworks.json', '{ "format": 1 }\n'],
    [`${S}study.json`, meta(['Chapter1', 'Chapter2'])],
    [`${S}Chapter1.pgn`, pgn('A', '1. e4 c5 2. Nf3 *')],
    [`${S}Chapter2.pgn`, pgn('B', '1. e4 c5 2. c3 *')],
    [`${S}Chapter1.conflict-Phone001.pgn`, pgn('A', '1. e4 c5 *')],
    ['studies/Other001/study.json', '{}\n'],
    ['progress/Phone001/2026-10-06.jsonl', ''],
  ]);
/** The working copies after a change. */
function apply(files: Map<string, string>, change: FileChange): Map<string, string> {
  const out = new Map(files);
  for (const [path, text] of change) {
    if (text === null) out.delete(path);
    else out.set(path, text);
  }
  return out;
}

test('a new study: study.json and one empty chapter for its side', () => {
  const made = createStudy({ sid: 'NewStudy', cid: 'NewChap1', name: '  Caro-Kann  ', kind: 'repertoire', chapterName: 'Main line', side: 'black' });
  assert.ok(made.ok);
  assert.deepEqual([...made.value.keys()], ['studies/NewStudy/study.json', 'studies/NewStudy/NewChap1.pgn']);
  assert.equal(made.value.get('studies/NewStudy/study.json'), '{\n  "format": 1,\n  "id": "NewStudy",\n  "name": "Caro-Kann",\n  "kind": "repertoire",\n  "chapters": [\n    "NewChap1"\n  ]\n}\n');
  assert.equal(made.value.get('studies/NewStudy/NewChap1.pgn'), '[Event "Caro-Kann: Main line"]\n[Result "*"]\n[StudyName "Caro-Kann"]\n[ChapterName "Main line"]\n[Orientation "black"]\n\n *\n');
  // Both files read back as the app writes them.
  assert.ok(parseStudyMeta(made.value.get('studies/NewStudy/study.json')!, 'NewStudy').ok);
  assert.ok(parseChapterFile(made.value.get('studies/NewStudy/NewChap1.pgn')!, 'NewChap1').ok);
});

test('a new study needs a name; its chapter is "Chapter 1" when not named', () => {
  assert.deepEqual(createStudy({ sid: 'NewStudy', cid: 'NewChap1', name: ' ', kind: 'reference', chapterName: '', side: 'white' }), { ok: false, error: 'a study needs a name' });
  const made = createStudy({ sid: 'NewStudy', cid: 'NewChap1', name: 'Ideas', kind: 'reference', chapterName: ' ', side: 'white' });
  assert.ok(made.ok);
  assert.match(made.value.get('studies/NewStudy/NewChap1.pgn')!, /\[ChapterName "Chapter 1"\]\n\[Orientation "white"\]/);
  assert.match(made.value.get('studies/NewStudy/study.json')!, /"kind": "reference"/);
});

test('deleting a study removes every file of its folder, and nothing else', () => {
  const change = deleteStudy('Study001', base().keys());
  assert.deepEqual([...change], [
    [`${S}study.json`, null],
    [`${S}Chapter1.pgn`, null],
    [`${S}Chapter2.pgn`, null],
    [`${S}Chapter1.conflict-Phone001.pgn`, null],
  ]);
  assert.deepEqual([...apply(base(), change).keys()], ['repworks.json', 'studies/Other001/study.json', 'progress/Phone001/2026-10-06.jsonl']);
});

test('deleting a chapter: its file, and study.json without it', () => {
  const m = parseStudyMeta(meta(['Chapter1', 'Chapter2']), 'Study001');
  assert.ok(m.ok);
  const change = deleteChapter(m.value, 'Chapter1');
  assert.deepEqual([...change], [
    [`${S}Chapter1.pgn`, null],
    [`${S}study.json`, meta(['Chapter2'])],
  ]);
});

test('a study deleted here and edited on another device comes back, the edited chapter marked', () => {
  const ctx: FileMergeContext = { labels: { ours: 'phone 2026-10-06', theirs: 'desktop 2026-10-06' }, device: 'Phone001', newId: () => 'CopyId01' };
  const b = base();
  const ours = apply(b, deleteStudy('Study001', b.keys()));
  const theirs = base();
  theirs.set(`${S}Chapter2.pgn`, pgn('B', '1. e4 c5 2. c3 Nf6 *'));
  const r = mergeAuthoredFiles(b, ours, theirs, ctx);
  assert.equal(r.files.get(`${S}Chapter2.pgn`), pgn('B', '{ <<<<<<< kept: deleted on phone 2026-10-06 }\n1. e4 c5 2. c3 Nf6 *'));
  assert.equal(r.files.has(`${S}Chapter1.pgn`), false);
  assert.equal(r.files.get(`${S}study.json`), meta(['Chapter2']));
  // Untouched on the other side, the deletion holds.
  assert.equal([...mergeAuthoredFiles(b, ours, base(), ctx).files.keys()].some((p) => p.startsWith(S)), false);
});
