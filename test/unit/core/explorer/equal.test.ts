// Scores at equal ratings (PLAN.md §5.126): the opponents' average from the replies after a move,
// Elo's expected score, and the split with the gap taken out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eloExpected, equalDetails, equalPrepared, equalScore, moverRating, shiftSplit } from '../../../../src/core/explorer/equal.ts';
import type { CompactExplorer } from '../../../../src/core/explorer/providers.ts';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

const answer = (moves: { san: string; games: number; rating?: number }[]): CompactExplorer => ({
  total: moves.reduce((n, m) => n + m.games, 0),
  white: 0,
  draws: 0,
  black: 0,
  moves: moves.map((m) => ({ uci: m.san, san: m.san, games: m.games, white: m.games, draws: 0, black: 0, ...(m.rating !== undefined ? { rating: m.rating } : {}) })),
});

test('Elo’s expected score: ½ at no gap, 10/11 at +400, symmetric', () => {
  close(eloExpected(0), 0.5);
  close(eloExpected(400), 10 / 11);
  close(eloExpected(-150) + eloExpected(150), 1);
  assert.ok(eloExpected(20) > 0.528 && eloExpected(20) < 0.529);
});

test('the side to move’s rating: the moves’ ratings weighted by games; unrated or empty moves left out', () => {
  const r = moverRating(answer([{ san: 'a', games: 300, rating: 2000 }, { san: 'b', games: 100, rating: 1900 }, { san: 'c', games: 50 }, { san: 'd', games: 0, rating: 1000 }]));
  assert.deepEqual(r, { rating: 1975, games: 400 });
  assert.equal(moverRating(answer([{ san: 'a', games: 10 }])), undefined);
  assert.equal(moverRating(undefined), undefined);
});

test('a split shifted: from the mover’s wins to its losses, draws kept, clamped', () => {
  const s = { w: 0.5, d: 0.2, b: 0.3 };
  const w = shiftSplit(s, 'w', 0.1);
  close(w.w, 0.4);
  close(w.d, 0.2);
  close(w.b, 0.4);
  const b = shiftSplit(s, 'b', -0.1);
  close(b.b, 0.4);
  close(b.w, 0.4);
  assert.deepEqual(shiftSplit(s, 'w', 0.9), { w: 0, d: 0.2, b: 0.8 });
  assert.deepEqual(shiftSplit(s, 'b', -0.9), { w: 0, d: 0.2, b: 0.8 });
});

test('a move’s score at equal ratings: 1.e4 Nf6 at 1800–2000, as measured on 2026-10-18', () => {
  // 51.7% for Black from players averaging 1992 against 1973.
  const row = { white: 4500, draws: 660, black: 4840, rating: 1992 };
  const child = answer([{ san: 'e5', games: 7000, rating: 1980 }, { san: 'Nc3', games: 3000, rating: 1957 }]);
  const eq = equalScore(row, child, 'b')!;
  close(eq.opponent, 1973.1);
  close(eq.gap, 18.9);
  close(eq.raw, 0.517);
  close(eq.score, eq.raw - (eloExpected(18.9) - 0.5));
  assert.equal(Math.round(eq.score * 1000), 490);
  // The split keeps the draws; Black's wins give up the difference.
  close(eq.split.d, 0.066);
  close(eq.split.b + eq.split.d / 2, eq.score);
  close(eq.split.w + eq.split.d + eq.split.b, 1);
  assert.equal(eq.games, 10000);
});

test('players weaker than their opponents: the score goes up; no gap: unchanged', () => {
  const row = { white: 482, draws: 0, black: 518, rating: 1935 };
  const eq = equalScore(row, answer([{ san: 'x', games: 900, rating: 1965 }]), 'w')!;
  assert.ok(eq.score > eq.raw);
  assert.equal(Math.round(eq.score * 1000), 525);
  const even = equalScore({ white: 3, draws: 2, black: 5, rating: 1800 }, answer([{ san: 'x', games: 9, rating: 1800 }]), 'b')!;
  close(even.score, even.raw);
  assert.deepEqual(even.split, { w: 0.3, d: 0.2, b: 0.5 });
});

test('nothing to say without games, without a rating, or without rated replies after the move', () => {
  const child = answer([{ san: 'x', games: 9, rating: 1800 }]);
  assert.equal(equalScore({ white: 0, draws: 0, black: 0, rating: 1800 }, child, 'w'), undefined);
  assert.equal(equalScore({ white: 1, draws: 0, black: 0 }, child, 'w'), undefined);
  assert.equal(equalScore({ white: 1, draws: 0, black: 0, rating: 1800 }, answer([{ san: 'x', games: 9 }]), 'w'), undefined);
  assert.equal(equalScore({ white: 1, draws: 0, black: 0, rating: 1800 }, undefined, 'w'), undefined);
});

test('the prepared split: only its games’ part moves; resting wholly on the Practical value, none', () => {
  const eq = equalScore({ white: 50, draws: 0, black: 50, rating: 2100 }, answer([{ san: 'x', games: 9, rating: 2000 }]), 'w')!;
  const delta = eq.expected - 0.5;
  const prep = { w: 0.5, d: 0.2, b: 0.3 };
  const half = equalPrepared(prep, 0.5, eq, 'w');
  close(half.w, 0.5 - delta / 2);
  close(half.b, 0.3 + delta / 2);
  assert.deepEqual(equalPrepared(prep, 1, eq, 'w'), prep);
  close(equalPrepared(prep, 0, eq, 'w').w, 0.5 - delta);
});

test('the details: the score, the games’, the averages and the gap, the split and the games', () => {
  const eq = equalScore({ white: 4500, draws: 660, black: 4840, rating: 1992 }, answer([{ san: 'e5', games: 10, rating: 1973 }]), 'b')!;
  assert.deepEqual(equalDetails(eq, 'b'), [
    'At equal ratings: 49% for Black (the games: 52%)',
    'Its players averaged 1992, their opponents 1973 (+19), which predicts 53%.',
    '48 / 7 / 46 after taking that out of the wins and losses · 10,000 games',
  ]);
});
