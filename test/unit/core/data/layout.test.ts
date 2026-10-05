import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPath } from '../../../../src/core/data/layout.ts';

test('data repo paths are classified', () => {
  assert.deepEqual(classifyPath('repworks.json'), { kind: 'format' });
  assert.deepEqual(classifyPath('studies/Rep0Najd/study.json'), { kind: 'study', sid: 'Rep0Najd' });
  assert.deepEqual(classifyPath('studies/Rep0Najd/Ch1Najdf.pgn'), { kind: 'chapter', sid: 'Rep0Najd', cid: 'Ch1Najdf' });
  assert.deepEqual(classifyPath('studies/Rep0Najd/Ch1Najdf.conflict-Phone001.pgn'), { kind: 'conflict-copy', sid: 'Rep0Najd', cid: 'Ch1Najdf', dev: 'Phone001' });
  assert.deepEqual(classifyPath('progress/Phone001/2026-10-05.jsonl'), { kind: 'progress-day', dev: 'Phone001', day: '2026-10-05' });
  assert.deepEqual(classifyPath('progress/Phone001/2026-10.jsonl'), { kind: 'progress-month', dev: 'Phone001', month: '2026-10' });
  assert.deepEqual(classifyPath('devices/Phone001.json'), { kind: 'device', dev: 'Phone001' });
  for (const other of ['README.md', 'studies/short/study.json', 'studies/Rep0Najd/notes.txt', 'progress/Phone001/2026-13-01.jsonl', 'progress/Phone001/today.jsonl', 'devices/x.json', 'studies/Rep0Najd/a/b.pgn']) {
    assert.deepEqual(classifyPath(other), { kind: 'other' }, other);
  }
});
