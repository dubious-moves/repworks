// The studies of a data repo's files (studiesFromFiles), for the index.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { studiesFromFiles } from '../../../../src/core/repertoire/files.ts';
import { readTree } from '../../../../scripts/read-tree.ts';

const meta = (id: string, name: string, kind: string, chapters: string[]) => JSON.stringify({ format: 1, id, name, kind, chapters });

test('the public fixture: one repertoire study, chapters in its order', () => {
  const { studies, unreadable } = studiesFromFiles(readTree(new URL('../../../fixtures/data-repo', import.meta.url).pathname));
  assert.deepEqual(unreadable, []);
  assert.deepEqual(studies.map((s) => [s.sid, s.kind, s.chapters.map((c) => c.id)]), [['Rep0Najd', 'repertoire', ['Ch1Najdf', 'Ch2Alapn']]]);
});

test('studies by name; unreadable files listed, not guessed at', () => {
  const files = new Map([
    ['studies/StudyBBB/study.json', meta('StudyBBB', 'Alpha', 'reference', ['Chapter2', 'Chapter1'])],
    ['studies/StudyBBB/Chapter1.pgn', '[Orientation "white"]\n\n1. e4 *\n'],
    ['studies/StudyBBB/Chapter2.pgn', '[Orientation "white"]\n\n1. d4 *\n'],
    ['studies/StudyBBB/Chapter3.pgn', '1. e4 *\n\n1. d4 *\n'],
    ['studies/StudyAAA/study.json', meta('StudyAAA', 'Beta', 'repertoire', [])],
    ['studies/StudyCCC/study.json', '{'],
    ['studies/StudyCCC/Chapter1.pgn', '1. e4 *\n'],
    ['progress/Desktop1/2026-10-05.jsonl', ''],
  ]);
  const { studies, unreadable } = studiesFromFiles(files);
  assert.deepEqual(studies.map((s) => [s.name, s.chapters.map((c) => c.id)]), [['Alpha', ['Chapter2', 'Chapter1']], ['Beta', []]]);
  assert.deepEqual(unreadable.map((u) => u.path), ['studies/StudyBBB/Chapter3.pgn', 'studies/StudyCCC/Chapter1.pgn', 'studies/StudyCCC/study.json']);
});
