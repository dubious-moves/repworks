// Show and grade in the storm (PLAN.md §5.152): which lists are shown, each move's band and
// arrow, the self-graded bands and the two keys.
//
// Controls run (2026-11-06), each failing its test and only it: `showable` without the depth
// check → "a list below judgeDepth, or ChessDB's, is not shown"; `top` as `i === 0` only → "a move
// level with the best is a top move"; `showPress`'s answered branch removed → "once answered,
// either key goes on".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORM as C } from '../../../../src/core/storm/config.ts';
import type { ScoredList, ScoredMove } from '../../../../src/core/storm/grade.ts';
import { arrowTier, drawingOrder, selfBand, showable, showPress, shownMoves } from '../../../../src/core/storm/show.ts';

const list = (scores: number[], source: 'sf' | 'cdb' = 'sf', depth = 24): ScoredList => {
  const moves: ScoredMove[] = scores.map((score, i) => ({ uci: `a${i + 1}a${i + 2}`, score }));
  return Object.assign(moves, { source, depth });
};

test('a list below judgeDepth, or ChessDB\'s, is not shown', () => {
  assert.equal(showable(list([20, 5]), C), true);
  assert.equal(showable(list([20, 5], 'sf', C.judgeDepth), C), true);
  assert.equal(showable(list([20, 5], 'sf', C.judgeDepth - 1), C), false);
  assert.equal(showable(list([20, 5], 'cdb'), C), false);
  assert.equal(showable(list([]), C), false);
  assert.deepEqual(shownMoves(list([20, 5], 'sf', 14), C), []);
});

test('every move with its rank and band, best first, from the mover\'s scores', () => {
  // At +0.20: 15 cp behind is within 3% (great), then good, inaccuracy, mistake, blunder.
  const m = shownMoves(list([20, 5, -40, -80, -150, -400]), C);
  assert.deepEqual(m.map((x) => x.rank), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(m.map((x) => x.band), ['great', 'great', 'good', 'ok', 'bad', 'blunder']);
  assert.equal(m[0]!.wp, 0);
  assert.ok(m[2]!.wp! >= C.greatWp && m[2]!.wp! < C.goodWp);
  assert.deepEqual(m.map(arrowTier), ['best', 'great', 'good', 'ok', 'bad', 'blunder']);
});

test('a move level with the best is a top move', () => {
  const m = shownMoves(list([30, 30, 10]), C);
  assert.deepEqual(m.map((x) => x.top), [true, true, false]);
  assert.deepEqual(m.map(arrowTier), ['best', 'best', 'great']);
});

test('the arrows are drawn worst first, so the best lies on top', () => {
  const m = shownMoves(list([20, 5, -400]), C);
  assert.deepEqual(drawingOrder(m).map((x) => x.rank), [3, 2, 1]);
  // The list itself is left as it was.
  assert.deepEqual(m.map((x) => x.rank), [1, 2, 3]);
});

test('found counts as Good, missed as a Mistake', () => {
  assert.equal(selfBand(true), 'good');
  assert.equal(selfBand(false), 'bad');
  assert.ok(C.setCleanOn.includes(selfBand(true)));
  assert.ok(!C.setCleanOn.includes(selfBand(false)));
});

test('the two keys: next shows, then grades found; wrong grades missed, shown or not', () => {
  assert.equal(showPress('hidden', 'next'), 'show');
  assert.equal(showPress('shown', 'next'), 'found');
  assert.equal(showPress('hidden', 'wrong'), 'missed');
  assert.equal(showPress('shown', 'wrong'), 'missed');
});

test('once answered, either key goes on; nothing while a move is graded', () => {
  assert.equal(showPress('answered', 'next'), 'next');
  assert.equal(showPress('answered', 'wrong'), 'next');
  assert.equal(showPress('busy', 'next'), null);
  assert.equal(showPress('busy', 'wrong'), null);
});
