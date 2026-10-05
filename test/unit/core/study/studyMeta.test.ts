import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseStudyMeta, reconcileChapterOrder, writeStudyMeta } from '../../../../src/core/study/studyMeta.ts';
import { freshId, isId, newId } from '../../../../src/core/study/ids.ts';
import { mulberry32 } from '../../../support/random.ts';
import type { StudyMeta } from '../../../../src/core/study/model.ts';

const meta: StudyMeta = {
  format: 1,
  id: 'Rep0Najd',
  name: 'Najdorf "6.Bg5"',
  kind: 'repertoire',
  chapters: ['Ch1Najdf', 'Ch2Alapn'],
  source: { kind: 'qchess', id: 'b1e8a2c4-0000-4000-8000-000000000000', name: 'Najdorf', imported: '2026-10-05T12:00:00.000Z' },
};

test('study.json round-trips, in one stable form', () => {
  const text = writeStudyMeta(meta);
  const parsed = parseStudyMeta(text, 'Rep0Najd');
  assert.deepEqual(parsed, { ok: true, value: meta });
  // Key order doesn't matter on reading; writing always gives the same bytes.
  const shuffled = JSON.stringify({ chapters: meta.chapters, kind: meta.kind, source: meta.source, name: meta.name, id: meta.id, format: 1 });
  const again = parseStudyMeta(shuffled);
  assert.ok(again.ok);
  assert.equal(writeStudyMeta(again.value), text);
  assert.ok(text.endsWith('}\n'));
});

test('a chapter file missing from the list is appended; a listed chapter without a file is dropped', () => {
  assert.deepEqual(reconcileChapterOrder(['b0000000', 'a0000000', 'gone0000'], ['a0000000', 'zz000000', 'b0000000', 'cc000000']), ['b0000000', 'a0000000', 'cc000000', 'zz000000']);
});

test('IDs are 8 letters or digits, and fresh ones avoid those taken', () => {
  const random = mulberry32(1);
  const ids = new Set<string>();
  for (let i = 0; i < 1000; i++) ids.add(newId(random));
  assert.equal(ids.size, 1000);
  for (const id of ids) assert.ok(isId(id), id);
  assert.ok(!isId('short') && !isId('has-dash') && !isId('toolong123') && !isId(12345678));
  // A source whose first eight draws spell an ID already taken: the next ID is drawn instead.
  let calls = 0;
  const firstTaken = () => (calls++ < 8 ? 0 : 0.5);
  const id = freshId(firstTaken, new Set(['AAAAAAAA']));
  assert.equal(id, newId(() => 0.5));
  assert.notEqual(id, 'AAAAAAAA');
});
