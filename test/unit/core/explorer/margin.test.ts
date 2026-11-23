// Which differences are real (PLAN.md §5.126): each bar's 95% margin, and the rows the best can't be
// told from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctionSe, equalMargin, ESTIMATE_SE, gamesMargin, marginText, preparedMargin, RANKED, resultVariance, topLine, topOf, Z95 } from '../../../../src/core/explorer/margin.ts';
import { eloExpected, equalScore, isEqual, LICHESS_SLOPE_SE, type EqualScore } from '../../../../src/core/explorer/equal.ts';
import type { CompactExplorer } from '../../../../src/core/explorer/providers.ts';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const after = (games: number, rating: number): CompactExplorer => ({ total: games, white: 0, draws: 0, black: 0, moves: [{ uci: 'x', san: 'x', games, white: games, draws: 0, black: 0, rating }] });
const must = (x: ReturnType<typeof equalScore>): EqualScore => {
  assert.ok(isEqual(x));
  return x;
};

test('one result’s variance: wins, draws as halves, from either side; a split of counts or shares alike', () => {
  // No draws, an even score: ¼, the most there is.
  close(resultVariance({ w: 1, d: 0, b: 1 }, 'w'), 0.25);
  // All draws: none.
  close(resultVariance({ w: 0, d: 1, b: 0 }, 'b'), 0);
  // 45 / 10 / 45: 0.45 + 0.025 − 0.25.
  close(resultVariance({ w: 45, d: 10, b: 45 }, 'w'), 0.225);
  close(resultVariance({ w: 0.45, d: 0.1, b: 0.45 }, 'b'), 0.225);
  // Lopsided: 60 / 20 / 20, 0.7 for White on average.
  close(resultVariance({ w: 60, d: 20, b: 20 }, 'w'), 0.6 + 0.05 - 0.7 ** 2);
  close(resultVariance({ w: 60, d: 20, b: 20 }, 'b'), resultVariance({ w: 60, d: 20, b: 20 }, 'w'));
});

test('the games’ margin: ±3 points at 1,000 games, ±1 at 10,000; none without games', () => {
  const split = { w: 45, d: 10, b: 45 };
  close(gamesMargin(split, 'w', 1000), Z95 * Math.sqrt(0.225 / 1000));
  assert.equal(Math.round(gamesMargin(split, 'w', 1000) * 100), 3);
  assert.equal(Math.round(gamesMargin(split, 'w', 10000) * 1000), 9);
  assert.equal(gamesMargin(split, 'w', 0), Infinity);
  assert.equal(marginText(gamesMargin(split, 'w', 1000)), '±3 points (95%)');
  assert.equal(marginText(0.001), '±1 points (95%)');
  assert.equal(marginText(Infinity), 'no margin: no games');
});

test('at equal ratings: the games’ chance with the correction’s, the slope’s error growing with the gap, the estimate’s when estimated', () => {
  const row = { white: 450, draws: 100, black: 450, rating: 2000 };
  const even = must(equalScore(row, after(1000, 2000), 'w'));
  // No gap, opponents from the replies: the games' margin alone.
  close(correctionSe(even), 0);
  close(equalMargin(even, 'w'), gamesMargin(even.split, 'w', 1000));
  // A gap of 100 at 0.72 of Elo's slope: the slope's error moves the prediction by about 0.03 × 0.144 × 4 E(1−E)/4.
  const gap = must(equalScore(row, after(1000, 1900), 'w'));
  const e = eloExpected(gap.slope * 100);
  close(correctionSe(gap), 100 * (Math.LN10 / 400) * e * (1 - e) * LICHESS_SLOPE_SE);
  assert.ok(equalMargin(gap, 'w') > gamesMargin(gap.split, 'w', 1000));
  // Elo's curve (not measured) is less sure of its slope.
  const elo = must(equalScore(row, after(1000, 1900), 'w', undefined, 'elo'));
  assert.ok(correctionSe(elo) > 5 * correctionSe(gap));
  // Estimated opponents: ESTIMATE_SE points of rating, at the slope.
  const est: EqualScore = { ...even, from: 'before' };
  close(correctionSe(est), even.slope * (Math.LN10 / 400) * 0.25 * ESTIMATE_SE);
});

test('a prepared split: only its games’ part, over the leaves’ games; resting on the Practical value alone, none', () => {
  const prep = { w: 0.5, d: 0.1, b: 0.4 };
  close(preparedMargin(prep, 0, 500, 'w'), gamesMargin(prep, 'w', 500));
  close(preparedMargin(prep, 0.6, 500, 'w'), 0.4 * gamesMargin(prep, 'w', 500));
  assert.equal(preparedMargin(prep, 1, 500, 'w'), 0);
  assert.equal(preparedMargin(prep, 0.5, 0, 'w'), Infinity);
});

test('the best and those within chance of it: ranked rows only, two at least', () => {
  const rows = [
    { key: 'e4', score: 0.55, margin: 0.02 },
    { key: 'd4', score: 0.53, margin: 0.02 }, // 2 behind, within √(2² + 2²) ≈ 2.8
    { key: 'c4', score: 0.5, margin: 0.02 }, // 5 behind: below by more than chance
    { key: 'b3', score: 0.7, margin: 0.2 }, // 30 games: not ranked, though highest
  ];
  const top = topOf(rows);
  assert.equal(top.best?.key, 'e4');
  assert.deepEqual([...top.tied].sort(), ['d4', 'e4']);
  assert.deepEqual([...top.ranked].sort(), ['c4', 'd4', 'e4']);
  assert.equal(topLine('e4', top), 'Green: the best score here, but 1 other move can’t be told from it.');
  assert.equal(topLine('d4', top), 'Green: can’t be told from the best here (e4, 55%): the difference is within chance.');
  assert.equal(topLine('c4', top), 'Below the best here (e4, 55%) by more than chance.');
  assert.equal(topLine('b3', top), `Too few games to rank against the others (its margin is over ±${RANKED * 100}).`);
  // A clear best alone.
  const clear = topOf([{ key: 'e4', score: 0.6, margin: 0.01 }, { key: 'd4', score: 0.5, margin: 0.01 }]);
  assert.deepEqual([...clear.tied], ['e4']);
  assert.equal(topLine('e4', clear), 'Green: the best score here, by more than chance.');
  // Fewer than two ranked: nothing is marked or said.
  const one = topOf([{ key: 'e4', score: 0.6, margin: 0.01 }, { key: 'd4', score: 0.5, margin: 0.3 }]);
  assert.equal(one.best, undefined);
  assert.equal(one.tied.size, 0);
  assert.equal(topLine('e4', one), undefined);
});
