// Lc0's pick among Stockfish's close lines (PLAN.md §5.143).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOSE_CP, lc0Pick, shareOf } from '../../../../src/core/lc0/pick.ts';

const policy = [
  { san: 'd4', uci: 'd2d4', prob: 0.4 },
  { san: 'e4', uci: 'e2e4', prob: 0.3 },
  { san: 'Nf3', uci: 'g1f3', prob: 0.1 },
];
const l = (cp: number, uci: string) => ({ score: { cp }, pv: [uci] });

test('the close line Lc0 likes most, not Stockfish’s first', () => {
  assert.equal(lc0Pick([l(30, 'e2e4'), l(25, 'd2d4'), l(20, 'g1f3')], policy, 'white'), 'd2d4');
  // Exactly CLOSE_CP behind still counts; one more does not.
  assert.equal(lc0Pick([l(30, 'e2e4'), l(30 - CLOSE_CP, 'd2d4')], policy, 'white'), 'd2d4');
  assert.equal(lc0Pick([l(30, 'e2e4'), l(29 - CLOSE_CP, 'd2d4'), l(28 - CLOSE_CP, 'g1f3')], policy, 'white'), undefined);
});

test('Black’s side: the scores are White’s, so lower is better', () => {
  const black = [
    { san: 'e5', uci: 'e7e5', prob: 0.2 },
    { san: 'c5', uci: 'c7c5', prob: 0.5 },
  ];
  assert.equal(lc0Pick([l(-30, 'e7e5'), l(-10, 'c7c5')], black, 'black'), 'c7c5');
  assert.equal(lc0Pick([l(-30, 'e7e5'), l(5, 'c7c5')], black, 'black'), undefined);
});

test('nothing to choose: one line, none close, or no lines; mates', () => {
  assert.equal(lc0Pick([l(30, 'e2e4')], policy, 'white'), undefined);
  assert.equal(lc0Pick([], policy, 'white'), undefined);
  // A mate is far from any eval; two mates are close only when equally quick.
  assert.equal(lc0Pick([{ score: { mate: 2 }, pv: ['e2e4'] }, l(900, 'd2d4')], policy, 'white'), undefined);
  assert.equal(lc0Pick([{ score: { mate: 2 }, pv: ['e2e4'] }, { score: { mate: 2 }, pv: ['d2d4'] }], policy, 'white'), 'd2d4');
  // A move under Lc0's floor has no share, and loses ties to the line first given.
  assert.equal(shareOf(policy, 'a2a3'), 0);
  assert.equal(lc0Pick([l(30, 'a2a3'), l(29, 'h2h3')], policy, 'white'), 'a2a3');
});
