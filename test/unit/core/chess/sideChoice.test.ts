// The colour a drill is played with (PLAN.md §5.195).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSideChoice, countBySide, onSide } from '../../../../src/core/chess/sideChoice.ts';

test('a stored choice: White and Black kept, anything else is both', () => {
  assert.equal(cleanSideChoice('white'), 'white');
  assert.equal(cleanSideChoice('black'), 'black');
  for (const v of [undefined, null, '', 'both', 'White', 1, {}]) assert.equal(cleanSideChoice(v), 'both');
});

test('both deals either colour; a colour only its own', () => {
  assert.ok(onSide('both', 'white') && onSide('both', 'black'));
  assert.ok(onSide('white', 'white') && !onSide('white', 'black'));
  assert.ok(onSide('black', 'black') && !onSide('black', 'white'));
});

test('counted by colour', () => {
  assert.deepEqual(countBySide(['white', 'black', 'black'] as const, (s) => s), { white: 1, black: 2 });
  assert.deepEqual(countBySide([], () => 'white'), { white: 0, black: 0 });
});
