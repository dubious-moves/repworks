import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyPath, gamesPath } from '../../../../src/core/data/layout.ts';

test('data repo paths are classified', () => {
  assert.deepEqual(classifyPath('repworks.json'), { kind: 'format' });
  assert.deepEqual(classifyPath('studies/Rep0Najd/study.json'), { kind: 'study', sid: 'Rep0Najd' });
  assert.deepEqual(classifyPath('studies/Rep0Najd/Ch1Najdf.pgn'), { kind: 'chapter', sid: 'Rep0Najd', cid: 'Ch1Najdf' });
  assert.deepEqual(classifyPath('studies/Rep0Najd/Ch1Najdf.conflict-Phone001.pgn'), { kind: 'conflict-copy', sid: 'Rep0Najd', cid: 'Ch1Najdf', dev: 'Phone001' });
  assert.deepEqual(classifyPath('progress/Phone001/2026-10-05.jsonl'), { kind: 'progress-day', dev: 'Phone001', day: '2026-10-05' });
  assert.deepEqual(classifyPath('progress/Phone001/2026-10.jsonl'), { kind: 'progress-month', dev: 'Phone001', month: '2026-10' });
  assert.deepEqual(classifyPath('devices/Phone001.json'), { kind: 'device', dev: 'Phone001' });
  assert.deepEqual(classifyPath('storm/Phone001/2026-10-05.1.jsonl'), { kind: 'storm', dev: 'Phone001', day: '2026-10-05', k: 1 });
  assert.deepEqual(classifyPath('storm/Phone001/2026-10-05.12.jsonl'), { kind: 'storm', dev: 'Phone001', day: '2026-10-05', k: 12 });
  assert.deepEqual(classifyPath('games/2026-10.jsonl'), { kind: 'games', month: '2026-10' });
  assert.equal(gamesPath('2026-10'), 'games/2026-10.jsonl');
  for (const other of ['games/2026-13.jsonl', 'games/2026-10-01.jsonl', 'games/x/2026-10.jsonl', 'games/2026-10.json']) assert.deepEqual(classifyPath(other), { kind: 'other' });
  for (const other of ['README.md', 'studies/short/study.json', 'studies/Rep0Najd/notes.txt', 'progress/Phone001/2026-13-01.jsonl', 'progress/Phone001/today.jsonl', 'devices/x.json', 'studies/Rep0Najd/a/b.pgn', 'storm/Phone001/2026-10-05.jsonl', 'storm/Phone001/2026-10-05.0.jsonl', 'storm/Phone001/2026-13-05.1.jsonl', 'storm/short/2026-10-05.1.jsonl']) {
    assert.deepEqual(classifyPath(other), { kind: 'other' }, other);
  }
});
