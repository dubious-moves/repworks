// Maia on the storm's positions (PLAN.md §5.82): a move judged by the list alone, Maia's share of
// good moves, the difficulty where that share crosses a half, and the unintuitive position.
//
// Controls run on this file (2026-10-10), each failing exactly the named assertions:
// - a move outside Stockfish's list judged unknown (no lower bound) → "a move judged by the list",
//   "unintuitive";
// - ChessDB's list allowed to judge (2026-10-10, §5.84) → "a move judged by the list", "Maia's
//   share", "difficulty", "unintuitive", "Maia's line";
// - the shallow list allowed to judge → "a move judged by the list", "difficulty", "unintuitive";
// - `unintuitive` true on an unjudged top move → "unintuitive".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORM as C } from '../../../../src/core/storm/config.ts';
import type { ScoredList, ScoredMove } from '../../../../src/core/storm/grade.ts';
import { deepenedPosition, type StoredPosition } from '../../../../src/core/storm/harvest.ts';
import { difficulty, difficultyWords, foundShare, judgeMove, keptPolicy, MAIA_LADDER, maiaChoice, maiaLine, missingRatings, unintuitive, type MaiaRating } from '../../../../src/core/storm/maia.ts';

// Win% lost against the best (0): 30 cp ≈ 2.7 (great), 60 ≈ 5.5 (good), 100 ≈ 9.1 (inaccuracy),
// 200 ≈ 17.6 (mistake), 400 a blunder.
const MOVES: ScoredMove[] = [
  { uci: 'e2e4', score: 0 },
  { uci: 'd2d4', score: -30 },
  { uci: 'g1f3', score: -60 },
  { uci: 'c2c4', score: -100 },
  { uci: 'b2b3', score: -200 },
  { uci: 'h2h4', score: -400 },
];
const cdb = (moves = MOVES): ScoredList => Object.assign(moves.slice(), { source: 'cdb' as const });
const sf = (depth: number, moves = MOVES): ScoredList => Object.assign(moves.slice(), { source: 'sf' as const, depth });
const rating = (elo: number, moves: [string, number][]): MaiaRating => ({ elo, moves });

test('a move judged by the list: its band, a lower bound outside Stockfish’s, nothing by ChessDB’s or below depth 20', () => {
  assert.deepEqual(judgeMove(sf(20), 'd2d4', C), { clean: true, band: 'great' });
  assert.deepEqual(judgeMove(sf(20), 'g1f3', C), { clean: true, band: 'good' });
  assert.deepEqual(judgeMove(sf(20), 'c2c4', C), { clean: false, band: 'ok' });
  assert.deepEqual(judgeMove(sf(20), 'b2b3', C), { clean: false, band: 'bad' });
  // ChessDB's list judges nothing (§5.84): it gives no depth.
  assert.deepEqual(judgeMove(cdb(), 'd2d4', C), { clean: null });
  assert.deepEqual(judgeMove(cdb(), 'b2b3', C), { clean: null });
  // Stockfish's list is its best lines: a move outside it is no better than the last.
  assert.deepEqual(judgeMove(sf(20), 'a2a3', C), { clean: false });
  assert.deepEqual(judgeMove(sf(20, MOVES.slice(0, 3)), 'a2a3', C), { clean: null });
  // The walk's depth-14 list judges nothing (§5.80).
  assert.deepEqual(judgeMove(sf(14), 'd2d4', C), { clean: null });
  assert.deepEqual(judgeMove(sf(14), 'b2b3', C), { clean: null });
});

test('Maia’s share of good moves: over the moves the list can judge, none when too few can', () => {
  assert.equal(foundShare(rating(1500, [['e2e4', 0.3], ['c2c4', 0.5], ['g1f3', 0.2]]), sf(20), C), 0.5);
  // 0.3 on a move outside a list of good moves only (so unjudged): judged over the other 0.7.
  const top = sf(20, MOVES.slice(0, 3));
  assert.equal(foundShare(rating(1500, [['a2a3', 0.3], ['e2e4', 0.35], ['d2d4', 0.35]]), top, C), 1);
  assert.equal(foundShare(rating(1500, [['a2a3', 0.5], ['e2e4', 0.5]]), top, C), null);
  assert.equal(foundShare(rating(1500, [['e2e4', 0.3], ['c2c4', 0.5], ['g1f3', 0.2]]), cdb(), C), null);
});

/** A ladder whose shares of good moves are `shares` (e2e4 good, c2c4 not). */
const ladder = (shares: number[]): MaiaRating[] => MAIA_LADDER.map((elo, i) => rating(elo, [['e2e4', shares[i]!], ['c2c4', 1 - shares[i]!]].sort((a, b) => (b[1] as number) - (a[1] as number)) as [string, number][]));

test('difficulty: the rating where the share crosses a half, the ladder’s ends, none without a judging list', () => {
  assert.deepEqual(difficulty(ladder([0.2, 0.3, 0.4, 0.6, 0.8]), sf(20), C), { elo: 2000 });
  // 0.25 → 0.75 between 1000 and 1400: a half at 1200.
  assert.deepEqual(difficulty(ladder([0.25, 0.75, 0.8, 0.9, 0.95]), sf(20), C), { elo: 1200 });
  assert.deepEqual(difficulty(ladder([0.6, 0.7, 0.8, 0.9, 0.95]), sf(20), C), { elo: 1000, edge: 'below' });
  assert.deepEqual(difficulty(ladder([0.1, 0.1, 0.2, 0.3, 0.4]), sf(20), C), { elo: 2600, edge: 'above' });
  // To the nearest 50.
  assert.deepEqual(difficulty(ladder([0.2, 0.3, 0.45, 0.6, 0.8]), sf(20), C), { elo: 1950 });
  // The user's own rating, off the ladder, doesn't move it.
  assert.deepEqual(difficulty([...ladder([0.2, 0.3, 0.4, 0.6, 0.8]), rating(1900, [['e2e4', 0.99]])], sf(20), C), { elo: 2000 });
  assert.equal(difficulty(ladder([0.2, 0.3, 0.4, 0.6, 0.8]), sf(14), C), null);
  assert.equal(difficulty(ladder([0.2, 0.3, 0.4, 0.6, 0.8]), cdb(), C), null);
  assert.equal(difficulty(undefined, sf(20), C), null);
  assert.equal(difficulty(ladder([0.2, 0.3, 0.4, 0.6, 0.8]).slice(0, 1), sf(20), C), null);
});

test('unintuitive: Maia’s most likely move at the rating is judged and isn’t a good move', () => {
  const r = [rating(1800, [['c2c4', 0.4], ['e2e4', 0.35]]), rating(2200, [['e2e4', 0.5], ['c2c4', 0.3]]), rating(1600, [['a2a3', 0.6], ['e2e4', 0.4]])];
  assert.equal(unintuitive(r, 1800, sf(20), C), true);
  assert.equal(unintuitive(r, 2200, sf(20), C), false);
  // Not rated there, or its move unjudged (outside a list of good moves), or the list ChessDB's or below depth 20.
  assert.equal(unintuitive(r, 2000, sf(20), C), false);
  assert.equal(unintuitive(r, 1600, sf(20, MOVES.slice(0, 3)), C), false);
  assert.equal(unintuitive(r, 1800, cdb(), C), false);
  assert.equal(unintuitive(r, 1600, sf(20), C), true);
  assert.equal(unintuitive(r, 1800, sf(14), C), false);
  assert.deepEqual(maiaChoice(r, 1800), { uci: 'c2c4', prob: 0.4 });
  assert.equal(maiaChoice(r, 2000), null);
});

test('a policy as kept, the ratings still wanted, and a deepened list keeping them', () => {
  assert.deepEqual(
    keptPolicy(1800, [
      { uci: 'g1f3', prob: 0.2 },
      { uci: 'e2e4', prob: 0.61234 },
      { uci: 'a2a3', prob: 0.004 },
    ]),
    { elo: 1800, moves: [['e2e4', 0.612], ['g1f3', 0.2]] },
  );
  assert.deepEqual(missingRatings(undefined, 1800), [...MAIA_LADDER]);
  assert.deepEqual(missingRatings(undefined, 2150), [...MAIA_LADDER, 2150]);
  assert.deepEqual(missingRatings([rating(1000, []), rating(2150, [])], 2150), [1400, 1800, 2200, 2600]);
  const p = { card: 's|x', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', scored: [{ u: 'e2e4', s: 0 }], src: 'cdb', depth: 0, maia: [rating(1800, [['e2e4', 1]])] } as unknown as StoredPosition;
  const d = deepenedPosition(p, sf(20), C)!;
  assert.deepEqual(d.maia, p.maia);
});

test('Maia’s line on an answered card', () => {
  const r = [...ladder([0.2, 0.3, 0.4, 0.6, 0.8]), rating(1500, [['c2c4', 0.41], ['e2e4', 0.38], ['a2a3', 0.21]])];
  const san = (u: string) => ({ c2c4: 'c4', e2e4: 'e4' })[u] ?? '';
  assert.equal(maiaLine(r, 1500, sf(20), san, C), 'Difficulty ≈2000. Maia at 1500 finds a good move 38% of the time; its likeliest, c4 (41%), is an inaccuracy.');
  assert.equal(maiaLine(r, 2200, sf(20), san, C), 'Difficulty ≈2000. Maia at 2200 finds a good move 60% of the time; its likeliest, e4 (60%), is a great move.');
  // Not rated at the user's rating: the difficulty alone.
  assert.equal(maiaLine(r, 1700, sf(20), san, C), 'Difficulty ≈2000.');
  assert.equal(maiaLine(r, 1500, sf(14), san, C), '');
  assert.equal(maiaLine(r, 1500, cdb(), san, C), '');
  assert.equal(maiaLine(undefined, 1500, sf(20), san, C), '');
  assert.equal(difficultyWords({ elo: 1000, edge: 'below' }), '1000 or less');
  assert.equal(difficultyWords({ elo: 2600, edge: 'above' }), 'over 2600');
});
