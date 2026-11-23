// Scores at equal ratings (PLAN.md §5.126): the opponents' average from the replies after a move,
// the score the gap predicts on Lichess's curve, and the split with the gap taken out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eloExpected, equalDetails, expectedOn, LICHESS_SLOPES, slopeAt, equalPrepared, equalPreparedLine, equalScore, FOLLOW, followAt, followPrior, isEqual, moverRating, opponentsBefore, shiftSplit, type EqualBefore, type EqualScore } from '../../../../src/core/explorer/equal.ts';
import type { CompactExplorer } from '../../../../src/core/explorer/providers.ts';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

/** A score at equal ratings, failing the test when there is none. */
const must = (x: ReturnType<typeof equalScore>): EqualScore => {
  assert.ok(isEqual(x), `no score: ${String(x)}`);
  return x;
};

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

test('Lichess’s curve: Elo’s slope times the band’s, by the two ratings’ midpoint; Elo’s own where asked', () => {
  // The bands as measured (scripts/elo-curve.ts, October 2026): flatter than Elo’s everywhere, least so at the top.
  assert.deepEqual(LICHESS_SLOPES.map(([b]) => b), [0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]);
  assert.ok(LICHESS_SLOPES.every(([, k]) => k > 0.4 && k < 1));
  assert.deepEqual([500, 1000, 1499, 1600, 1799, 1800, 2000, 2250, 2700].map((r) => slopeAt(r)), [0.73, 0.53, 0.49, 0.6, 0.6, 0.66, 0.72, 0.76, 0.85]);
  assert.equal(slopeAt(1800, 'elo'), 1);
  // A player 100 above at 2000–2100: 0.72 of Elo’s slope, about 60% where Elo’s curve says 64%.
  close(expectedOn(2100, 2000), eloExpected(72));
  assert.equal(Math.round(expectedOn(2100, 2000) * 100), 60);
  assert.equal(Math.round(expectedOn(2100, 2000, 'elo') * 100), 64);
  close(expectedOn(1850, 1850), 0.5);
  close(expectedOn(1700, 1800) + expectedOn(1800, 1700), 1);
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
  const eq = must(equalScore(row, child, 'b'));
  close(eq.opponent, 1973.1);
  close(eq.gap, 18.9);
  close(eq.raw, 0.517);
  // On Lichess's curve at a midpoint of 1983 (0.66 of Elo's slope): 49.9%. Elo's own took it to 49.0%.
  assert.equal(eq.curve, 'lichess');
  assert.equal(eq.slope, 0.66);
  close(eq.score, eq.raw - (eloExpected(0.66 * 18.9) - 0.5));
  assert.equal(Math.round(eq.score * 1000), 499);
  assert.equal(Math.round(must(equalScore(row, child, 'b', undefined, 'elo')).score * 1000), 490);
  // The split keeps the draws; Black's wins give up the difference.
  close(eq.split.d, 0.066);
  close(eq.split.b + eq.split.d / 2, eq.score);
  close(eq.split.w + eq.split.d + eq.split.b, 1);
  assert.equal(eq.games, 10000);
});

test('players weaker than their opponents: the score goes up; no gap: unchanged', () => {
  const row = { white: 482, draws: 0, black: 518, rating: 1935 };
  const eq = must(equalScore(row, answer([{ san: 'x', games: 900, rating: 1965 }]), 'w'));
  assert.ok(eq.score > eq.raw);
  assert.equal(Math.round(eq.score * 1000), 510);
  const even = must(equalScore({ white: 3, draws: 2, black: 5, rating: 1800 }, answer([{ san: 'x', games: 9, rating: 1800 }]), 'b'));
  close(even.score, even.raw);
  assert.deepEqual(even.split, { w: 0.3, d: 0.2, b: 0.5 });
});

test('nothing to say without games, without a rating, or without rated replies after the move', () => {
  const child = answer([{ san: 'x', games: 1, rating: 1800 }]);
  assert.equal(equalScore({ white: 0, draws: 0, black: 0, rating: 1800 }, child, 'w'), 'unrated');
  assert.equal(equalScore({ white: 1, draws: 0, black: 0 }, child, 'w'), 'unrated');
  assert.equal(equalScore({ white: 1, draws: 0, black: 0, rating: 1800 }, answer([{ san: 'x', games: 9 }]), 'w'), 'none');
  assert.equal(equalScore({ white: 1, draws: 0, black: 0, rating: 1800 }, undefined, 'w'), 'none');
});

// Measured on 2026-11-23 (Lichess, blitz, rapid and classical, 1600–2200): 1. Nc3 d5 2. d4 c5 3. Bf4
// Nc6, White to move. The position came only through 3...Nc6 (86,098 games, 86,093 of them by it),
// but the one after 4.e3 (48,682 games) has 136,261, most from the London's 1. d4 d5 2. Bf4 c5 3. e3
// Nc6 4. Nc3, whose Black players average about 2000.
const at = (moves: [string, number, number][], total?: number): CompactExplorer => {
  const a = answer(moves.map(([san, games, rating]) => ({ san, games, rating })));
  return total === undefined ? a : { ...a, total };
};
const here = at([
  ['e3', 48682, 1875], ['Nb5', 14127, 1776], ['dxc5', 12879, 1783], ['Nf3', 5323, 1812], ['e4', 3616, 2049], ['Qd2', 674, 1747], ['a3', 213, 1710],
  ['f3', 174, 1747], ['Nxd5', 113, 1727], ['Qd3', 110, 1786], ['a4', 77, 1745], ['g3', 34, 1718], ['h3', 16, 1725], ['b3', 15, 1697], ['h4', 14, 1831],
  ['Be3', 7, 1624], ['Bg3', 4, 1738], ['Bb8', 3, 1794], ['b4', 3, 1433], ['Nb1', 2, 1834], ['Bc7', 2, 1732], ['Na4', 2, 1603], ['g4', 2, 1651],
  ['Qc1', 2, 1711], ['Bh6', 1, 1795], ['Be5', 1, 1716], ['Kd2', 1, 1681], ['Qb1', 1, 1673],
]);
// 4.Nb5's position after has no other way in (14,149 games for its 14,127): its opponents, 1801, are
// known. The filter has four bands.
const before: EqualBefore = { here, led: { san: '3…Nc6', games: 86093, rating: 1858 }, known: [{ rating: 1776, opponent: 1801 }], prior: followPrior(4) };
const e3 = { white: 25885, draws: 1748, black: 21049, rating: 1875 };
const afterE3 = at([['Bd6', 136261, 1973]], 136261);

test('the position after 4.e3 reached mostly by the London: the opponents from 3…Nc6’s players, not the replies after it', () => {
  assert.equal(here.total, 86098);
  close(moverRating(here)!.rating, 1846.11, 0.01);
  // The replies after 4.e3 (1973) are mostly the London's Black players: 4.e3 at −98, 69%.
  const raw = (e3.white + e3.draws / 2) / 48682;
  const wasGap = 1875 - moverRating(afterE3)!.rating;
  assert.equal(Math.round(wasGap), -98);
  assert.equal(Math.round((raw - (eloExpected(wasGap) - 0.5)) * 100), 69);
  // From the position itself: 1858 + 0.81 × (1875 − 1846) = 1881, a gap of −6, and 55% → 55.6%. The
  // slope: 4.Nb5's players 70 below the average, their opponents 57 below 3…Nc6's, with the prior 0.8.
  const eq = must(equalScore(e3, afterE3, 'w', before));
  assert.equal(eq.from, 'before');
  close(eq.inflow, 136261 / 48682);
  const x = 1776 - moverRating(here)!.rating;
  close(eq.follow!, (2000 * FOLLOW + x * (1801 - 1858)) / (2000 + x * x));
  assert.equal(Math.round(eq.follow! * 100), 81);
  assert.equal(eq.fitted, 1);
  close(eq.opponent, 1858 + eq.follow! * (1875 - moverRating(here)!.rating));
  assert.equal(Math.round(eq.opponent), 1881);
  assert.equal(Math.round(eq.gap), -6);
  assert.equal(Math.round(eq.raw * 1000), 550);
  assert.equal(Math.round(eq.score * 1000), 556);
  assert.deepEqual(eq.led, { san: '3…Nc6', rating: 1858 });
  // Without the position before: no score, rather than a wrong one; while it is asked, wait.
  assert.equal(equalScore(e3, afterE3, 'w'), 'inflow');
  assert.equal(equalScore(e3, afterE3, 'w', 'asking'), 'asking');
});

test('the estimate matches the moves whose position after has no other way in', () => {
  // 4.Nb5: 14,127 games, 14,149 after it; Black's replies there average 1801. Estimated without
  // it, from the prior alone: 1802.
  const nb5 = { white: 6000, draws: 500, black: 7627, rating: 1776 };
  const after = at([['x', 14149, 1801]], 14149);
  const eq = must(equalScore(nb5, after, 'w', before));
  assert.equal(eq.from, 'after');
  assert.equal(eq.opponent, 1801);
  assert.equal(Math.round(opponentsBefore(1776, { ...before, known: [] })!.rating), 1802);
});

test('how far opponents follow their players: the filter’s prior, pulled by the known moves, between 0 and 1', () => {
  assert.deepEqual([1, 2, 4, 5].map(followPrior), [0, 0.7, 0.8, 0.8]);
  // No known moves: the prior.
  assert.equal(followAt([], 1850, 1860, 0.8), 0.8);
  // One band: moves 15 points apart from the average with opponents unmoved stay near 0; a move far
  // out whose opponents follow it pulls the slope up.
  close(followAt([{ rating: 1865, opponent: 1860 }, { rating: 1835, opponent: 1860 }], 1850, 1860, 0), 0);
  close(followAt([{ rating: 1950, opponent: 1940 }], 1850, 1860, 0), (100 * 80) / (2000 + 100 * 100));
  // Clamped: opponents moving against their players, or more than them.
  assert.equal(followAt([{ rating: 1950, opponent: 1700 }], 1850, 1860, 0.8), 0);
  assert.equal(followAt([{ rating: 1950, opponent: 2100 }], 1850, 1860, 0.8), 1);
});

test('a little inflow: the estimate where the position before is known, the replies after the move without it', () => {
  // 4.e4: 3,616 games, 4,215 after it (1.17×), Black there 2031.
  const e4 = { white: 2153, draws: 150, black: 1313, rating: 2049 };
  const after = at([['x', 4215, 2031]], 4215);
  const est = must(equalScore(e4, after, 'w', before));
  assert.equal(est.from, 'before');
  assert.equal(Math.round(est.opponent), 2022);
  assert.equal(Math.round(est.score * 100), 59);
  const replies = must(equalScore(e4, after, 'w'));
  assert.equal(replies.from, 'after');
  assert.equal(replies.opponent, 2031);
  assert.equal(Math.round(replies.score * 100), 60);
  // Over 1.25× with nothing before: none.
  assert.equal(equalScore(e4, at([['x', 4600, 2031]], 4600), 'w'), 'inflow');
});

test('the position before can’t stand in when this position is reached by other orders too, or lacks a rating', () => {
  assert.equal(opponentsBefore(1875, { ...before, led: { san: '3…Nc6', games: 60000, rating: 1858 } }), undefined);
  assert.equal(opponentsBefore(1875, { ...before, led: { san: '3…Nc6', games: 86093 } }), undefined);
  assert.equal(opponentsBefore(1875, { ...before, here: at([]) }), undefined);
  assert.equal(equalScore(e3, afterE3, 'w', { ...before, led: { san: '3…Nc6', games: 60000, rating: 1858 } }), 'inflow');
});

test('the details say where the opponents’ rating came from', () => {
  const eq = must(equalScore(e3, afterE3, 'w', before));
  assert.deepEqual(equalDetails(eq, 'w'), [
    'At equal ratings: 56% for White (the games: 55%)',
    'Its players averaged 1875, their opponents 1881 (−6), which predicts 49% on Lichess’s curve (0.66 of Elo’s slope at these ratings).',
    'The opponents’ rating is estimated: only 36% of the games after this move came through it, the rest by another move order. Taken as 3…Nc6’s players’ rating here (1858), plus 81% of these players’ +29 against this position’s average (1846): how far opponents follow their players here, fitted to 1 move here whose opponents are known, and the filter.',
    '54 / 4 / 43 after taking that out of the wins and losses · 48,682 games',
  ]);
  const line = equalPreparedLine({ w: 0.5, d: 0.1, b: 0.4 }, equalPrepared({ w: 0.5, d: 0.1, b: 0.4 }, 0.5, eq, 'w'), 0.5, eq, 'w');
  assert.match(line, /^At equal ratings: 55% \(55% before\)\. The move’s players averaged 1875, their opponents 1881 \(−6\); 50% of it rests on games\. The opponents’ rating is estimated: only 36% /);
  const plain = must(equalScore({ white: 5, draws: 0, black: 5, rating: 1800 }, at([['x', 12, 1800]], 12), 'w'));
  assert.equal(equalDetails(plain, 'w')[2], 'The opponents’ rating: the replies after this move (83% of the games there came through it).');
});

test('the prepared split: only its games’ part moves; resting wholly on the Practical value, none', () => {
  const eq = must(equalScore({ white: 50, draws: 0, black: 50, rating: 2100 }, answer([{ san: 'x', games: 9, rating: 2000 }]), 'w'));
  const delta = eq.expected - 0.5;
  const prep = { w: 0.5, d: 0.2, b: 0.3 };
  const half = equalPrepared(prep, 0.5, eq, 'w');
  close(half.w, 0.5 - delta / 2);
  close(half.b, 0.3 + delta / 2);
  assert.deepEqual(equalPrepared(prep, 1, eq, 'w'), prep);
  close(equalPrepared(prep, 0, eq, 'w').w, 0.5 - delta);
});

test('the details: the score, the games’, the averages and the gap, the split and the games', () => {
  const eq = must(equalScore({ white: 4500, draws: 660, black: 4840, rating: 1992 }, answer([{ san: 'e5', games: 10000, rating: 1973 }]), 'b'));
  assert.deepEqual(equalDetails(eq, 'b'), [
    'At equal ratings: 50% for Black (the games: 52%)',
    'Its players averaged 1992, their opponents 1973 (+19), which predicts 52% on Lichess’s curve (0.66 of Elo’s slope at these ratings).',
    'The opponents’ rating: the replies after this move.',
    '47 / 7 / 47 after taking that out of the wins and losses · 10,000 games',
  ]);
  // The Masters tab’s FIDE ratings: Elo’s own curve.
  const masters = must(equalScore({ white: 4500, draws: 660, black: 4840, rating: 1992 }, answer([{ san: 'e5', games: 10000, rating: 1973 }]), 'b', undefined, 'elo'));
  assert.equal(equalDetails(masters, 'b')[1], 'Its players averaged 1992, their opponents 1973 (+19), which predicts 53% on Elo’s curve.');
});
