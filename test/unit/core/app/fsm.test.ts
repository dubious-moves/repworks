// The app's modes and their addresses (PLAN.md §4.11), undo and redo, and moving through a
// chapter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { modeHash, parseHash, transition, type Mode } from '../../../../src/core/app/fsm.ts';
import { record, redo, startHistory, undo, UNDO_LIMIT } from '../../../../src/core/app/history.ts';
import { nearest, step } from '../../../../src/core/study/navigate.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';

test('hashes parse to modes, and modes write back to the same hash', () => {
  const cases: [string, Mode][] = [
    ['', { name: 'list' }],
    ['#/', { name: 'list' }],
    ['#/import', { name: 'import' }],
    ['#/conflicts', { name: 'conflicts' }],
    ['#/train', { name: 'train' }],
    ['#/train/Rep0Najd', { name: 'train', sid: 'Rep0Najd' }],
    ['#/show', { name: 'show' }],
    ['#/show/Rep0Najd', { name: 'show', sid: 'Rep0Najd' }],
    ['#/mistakes', { name: 'mistakes' }],
    ['#/mistakes/retry', { name: 'practice', run: 'retry' }],
    ['#/mistakes/drill', { name: 'practice', run: 'drill' }],
    ['#/pinned', { name: 'practice', run: 'pinned' }],
    ['#/pinned/all', { name: 'practice', run: 'pins' }],
    ['#/study/Rep0Najd', { name: 'chapter', sid: 'Rep0Najd' }],
    ['#/study/Rep0Najd/Ch1Najdf', { name: 'chapter', sid: 'Rep0Najd', cid: 'Ch1Najdf' }],
    ['#/study/Rep0Najd/Ch1Najdf?at=e4,c5,Nf3', { name: 'chapter', sid: 'Rep0Najd', cid: 'Ch1Najdf', at: ['e4', 'c5', 'Nf3'] }],
    ['#/study/Rep0Najd/Ch1Najdf?at=O-O,exd8%3DQ%2B', { name: 'chapter', sid: 'Rep0Najd', cid: 'Ch1Najdf', at: ['O-O', 'exd8=Q+'] }],
    ['#/read/Rep0Najd/Ch1Najdf', { name: 'read', sid: 'Rep0Najd', cid: 'Ch1Najdf', at: [] }],
    ['#/read/Rep0Najd/Ch1Najdf?at=e4,c5', { name: 'read', sid: 'Rep0Najd', cid: 'Ch1Najdf', at: ['e4', 'c5'] }],
    ['#/play/Rep0Najd/Ch1Najdf?at=e4', { name: 'play', sid: 'Rep0Najd', cid: 'Ch1Najdf', at: ['e4'] }],
    ['#/play/Rep0Najd/Ch1Najdf?at=e4,c5&from=1', { name: 'play', sid: 'Rep0Najd', cid: 'Ch1Najdf', at: ['e4', 'c5'], from: 1 }],
    ['#/read/Rep0Najd/Ch1Najdf?from=0', { name: 'read', sid: 'Rep0Najd', cid: 'Ch1Najdf', at: [] }],
  ];
  for (const [hash, mode] of cases) {
    assert.deepEqual(parseHash(hash), mode, hash);
    assert.deepEqual(parseHash(modeHash(mode)), mode);
  }
  assert.equal(modeHash({ name: 'chapter', sid: 'Rep0Najd', cid: 'Ch1Najdf', at: [] }), '#/study/Rep0Najd/Ch1Najdf');
  // Anything else is the list: unknown pages, malformed IDs, a path with a stray character.
  for (const hash of ['#/mistakes/other', '#/pinned/x', '#/train/short', '#/train/Rep0Najd/x', '#/nope', '#/study/short', '#/study/Rep0Najd/bad', '#/study/Rep0Najd/Ch1Najdf/x', '#/read/Rep0Najd', '#/play/Rep0Najd/bad']) assert.deepEqual(parseHash(hash), { name: 'list' }, hash);
  assert.deepEqual(parseHash('#/study/Rep0Najd/Ch1Najdf?at=e4,<script>'), { name: 'chapter', sid: 'Rep0Najd', cid: 'Ch1Najdf' });
});

test('transitions: open, back, a missing chapter, the move shown', () => {
  const chapter: Mode = { name: 'chapter', sid: 'Rep0Najd', cid: 'Ch1Najdf', at: ['e4'] };
  assert.deepEqual(transition({ name: 'list' }, { type: 'open', mode: chapter }), chapter);
  assert.deepEqual(transition(chapter, { type: 'back' }), { name: 'list' });
  assert.deepEqual(transition({ name: 'conflicts' }, { type: 'back' }), { name: 'list' });
  assert.deepEqual(transition({ name: 'train', sid: 'Rep0Najd' }, { type: 'back' }), { name: 'list' });
  assert.deepEqual(transition({ name: 'train' }, { type: 'at', path: ['e4'] }), { name: 'train' });
  assert.equal(transition(chapter, { type: 'missing', chapters: ['Ch2Alapn', 'Ch1Najdf'] }), chapter);
  assert.deepEqual(transition(chapter, { type: 'missing', chapters: ['Ch2Alapn'] }), { name: 'chapter', sid: 'Rep0Najd', cid: 'Ch2Alapn' });
  assert.deepEqual(transition({ name: 'chapter', sid: 'Rep0Najd' }, { type: 'missing', chapters: ['Ch2Alapn'] }), { name: 'chapter', sid: 'Rep0Najd', cid: 'Ch2Alapn' });
  assert.deepEqual(transition(chapter, { type: 'missing', chapters: [] }), { name: 'list' });
  assert.deepEqual(transition({ name: 'list' }, { type: 'missing', chapters: [] }), { name: 'list' });
  assert.deepEqual(transition(chapter, { type: 'at', path: ['e4', 'c5'] }), { ...chapter, at: ['e4', 'c5'] });
  assert.deepEqual(transition({ name: 'import' }, { type: 'at', path: ['e4'] }), { name: 'import' });
});

test('undo and redo walk the history; a new edit drops what was undone', () => {
  let h = startHistory('a');
  h = record(h, 'b');
  h = record(h, 'c');
  h = undo(h);
  assert.equal(h.present, 'b');
  h = undo(h);
  assert.equal(h.present, 'a');
  assert.equal(undo(h), h);
  h = redo(h);
  assert.equal(h.present, 'b');
  h = record(h, 'd');
  assert.deepEqual(h, { past: ['a', 'b'], present: 'd', future: [] });
  assert.equal(redo(h), h);
  let long = startHistory(0);
  for (let i = 1; i <= UNDO_LIMIT + 10; i++) long = record(long, i);
  assert.equal(long.past.length, UNDO_LIMIT);
  assert.equal(long.past[0], 10);
});

test('the notation keys move along lines and between variations', () => {
  const parsed = parseChapterFile('[Event "x"]\n\n1. e4 e5 (1... c5 2. Nf3) (1... e6) 2. Nf3 Nc6 *', 'Chapter1');
  assert.ok(parsed.ok);
  const c = parsed.chapter;
  assert.deepEqual(step(c, [], 'next'), ['e4']);
  assert.deepEqual(step(c, ['e4'], 'next'), ['e4', 'e5']);
  assert.deepEqual(step(c, ['e4', 'e5'], 'down'), ['e4', 'c5']);
  assert.deepEqual(step(c, ['e4', 'c5'], 'down'), ['e4', 'e6']);
  assert.deepEqual(step(c, ['e4', 'e6'], 'down'), ['e4', 'e6']);
  assert.deepEqual(step(c, ['e4', 'e6'], 'up'), ['e4', 'c5']);
  assert.deepEqual(step(c, ['e4', 'c5'], 'end'), ['e4', 'c5', 'Nf3']);
  assert.deepEqual(step(c, ['e4', 'c5', 'Nf3'], 'prev'), ['e4', 'c5']);
  assert.deepEqual(step(c, ['e4', 'c5', 'Nf3'], 'next'), ['e4', 'c5', 'Nf3']);
  assert.deepEqual(step(c, ['e4'], 'end'), ['e4', 'e5', 'Nf3', 'Nc6']);
  assert.deepEqual(step(c, ['e4', 'e5'], 'start'), []);
  assert.deepEqual(step(c, [], 'prev'), []);
  assert.deepEqual(step(c, [], 'up'), []);
  // A path that is gone (a sync deleted it) falls back to what remains of it.
  assert.deepEqual(nearest(c, ['e4', 'd5', 'exd5']), ['e4']);
  assert.deepEqual(step(c, ['e4', 'd5'], 'next'), ['e4']);
});
