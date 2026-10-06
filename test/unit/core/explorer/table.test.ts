// The explorer panel's table (PLAN.md §5.23): Qchess's rows, novelties, Σ and sort orders.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barLabel, buildTable, evalTone, formatEval, formatShare } from '../../../../src/core/explorer/table.ts';
import type { CompactExplorer } from '../../../../src/core/explorer/providers.ts';
import type { ChessdbAnswer } from '../../../../src/core/explorer/search.ts';

// After 1. d4, Black to move: three moves with games, ChessDB knowing two of them and two others.
const games: CompactExplorer = {
  total: 1000,
  white: 400,
  draws: 350,
  black: 250,
  moves: [
    { uci: 'g8f6', san: 'Nf6', games: 600, white: 200, draws: 250, black: 150, rating: 2210 },
    { uci: 'd7d5', san: 'd5', games: 300, white: 120, draws: 90, black: 90 },
    { uci: 'f7f5', san: 'f5', games: 100, white: 80, draws: 10, black: 10 },
  ],
};
// Scores from the side to move (Black): Nf6 +0 for Black, d5 −1, e5 −154, g5 −253; f5 unknown.
const evals: ChessdbAnswer = {
  status: 'ok',
  moves: [
    { uci: 'g8f6', san: 'Nf6', score: 0 },
    { uci: 'd7d5', san: 'd5', score: -1 },
    { uci: 'e7e5', san: 'e5', score: -154 },
    { uci: 'g7g5', san: 'g5', score: -253 },
  ],
};

const sans = (t: ReturnType<typeof buildTable>) => t.rows.map((r) => r.san);

test('rows: shares, results, ratings, ChessDB’s evals from White’s side, novelties and Σ', () => {
  const t = buildTable({ turn: 'b', games, evals, sort: 'popularity', side: 'w', covered: new Set(['d5']), repertoire: new Map([['d5', 2]]) });
  assert.deepEqual(sans(t), ['Nf6', 'd5', 'f5', 'e5', 'g5']);
  const [nf6, d5, f5, e5] = t.rows;
  assert.deepEqual([nf6!.share, nf6!.rating, nf6!.eval, nf6!.novelty], [0.6, 2210, { cp: -0 }, false]);
  assert.deepEqual([d5!.eval, d5!.covered, d5!.repertoire], [{ cp: 1 }, true, 2]);
  assert.equal(f5!.eval, undefined);
  assert.deepEqual([e5!.novelty, e5!.games, e5!.eval], [true, 0, { cp: 154 }]);
  assert.deepEqual(t.total, { games: 1000, white: 400, draws: 350, black: 250 });
});

test('Qchess’s formats: evals, shares, and bar labels from 15%', () => {
  assert.equal(formatEval({ cp: 18 }), '+0.18');
  assert.equal(formatEval({ cp: 0 }), '0.00');
  assert.equal(formatEval({ cp: -0 }), '0.00');
  assert.equal(formatEval({ cp: -120 }), '-1.20');
  assert.equal(formatEval({ cp: 29995 }), '#3');
  assert.equal(formatEval({ cp: -29998 }), '-#1');
  assert.deepEqual([evalTone({ cp: 1 }), evalTone({ cp: -1 }), evalTone({ cp: 0 })], ['plus', 'minus', 'even']);
  assert.deepEqual([formatShare(0.6), formatShare(0.004), formatShare(0.0004), formatShare(0)], ['60%', '0.4%', '0.0%', '0%']);
  assert.deepEqual([barLabel(0.336), barLabel(0.149), barLabel(0.15)], ['34%', '', '15%']);
});

test('sorts: eval for the side to move (no eval last), score, and the mixed orders', () => {
  // By eval, Black to move: the best for Black first: Nf6 (0), d5 (+0.01 White), e5, g5; f5 has none.
  assert.deepEqual(sans(buildTable({ turn: 'b', games, evals, sort: 'eval', side: 'w' })), ['Nf6', 'd5', 'e5', 'g5', 'f5']);
  // By score: the mover's score. Black's: Nf6 .458, d5 .45, f5 .15; White's (were White to move):
  // f5 .85, d5 .55, Nf6 .542. Novelties after, by eval.
  assert.deepEqual(sans(buildTable({ turn: 'b', games, evals, sort: 'score', side: 'w' })), ['Nf6', 'd5', 'f5', 'e5', 'g5']);
  assert.deepEqual(sans(buildTable({ turn: 'w', games, sort: 'score', side: 'w' })), ['f5', 'd5', 'Nf6']);
  // White's moves by eval: Black is to move, so popularity here.
  assert.deepEqual(sans(buildTable({ turn: 'b', games, evals, sort: 'white-eval', side: 'w' })), ['Nf6', 'd5', 'f5', 'e5', 'g5']);
  assert.deepEqual(sans(buildTable({ turn: 'b', games, evals, sort: 'black-eval', side: 'w' })), ['Nf6', 'd5', 'e5', 'g5', 'f5']);
  // Your moves by eval: the chapter is Black's, Black to move.
  assert.deepEqual(sans(buildTable({ turn: 'b', games, evals, sort: 'mine-eval', side: 'b' })), ['Nf6', 'd5', 'e5', 'g5', 'f5']);
  assert.deepEqual(sans(buildTable({ turn: 'b', games, evals, sort: 'mine-eval', side: 'w' })), ['Nf6', 'd5', 'f5', 'e5', 'g5']);
  // Only the repertoire's moves: covered by the chapter, or played by another chapter.
  assert.deepEqual(sans(buildTable({ turn: 'b', games, evals, sort: 'only-rep', side: 'b', covered: new Set(['f5']), repertoire: new Map([['e5', 1]]) })), ['f5', 'e5']);
});

test('ChessDB’s tab: its moves alone, by eval, with no Σ; White to move keeps the sign', () => {
  const white: ChessdbAnswer = { status: 'ok', moves: [{ uci: 'e2e4', san: 'e4', score: 20 }, { uci: 'd2d4', san: 'd4', score: 25 }, { uci: 'g1f3', san: 'Nf3', score: 18 }] };
  const t = buildTable({ turn: 'w', evals: white, sort: 'popularity', side: 'w' });
  assert.deepEqual(sans(t), ['d4', 'e4', 'Nf3']);
  assert.equal(t.total, undefined);
  assert.deepEqual(t.rows[0]!.eval, { cp: 25 });
  // An unknown position: nothing.
  assert.deepEqual(buildTable({ turn: 'w', evals: { status: 'unknown' }, sort: 'eval', side: 'w' }).rows, []);
});

test('check marks don’t split a move between the two sources', () => {
  const g: CompactExplorer = { total: 10, white: 10, draws: 0, black: 0, moves: [{ uci: 'f1b5', san: 'Bb5+', games: 10, white: 10, draws: 0, black: 0 }] };
  const e: ChessdbAnswer = { status: 'ok', moves: [{ uci: 'f1b5', san: 'Bb5+', score: 40 }] };
  const t = buildTable({ turn: 'w', games: g, evals: e, sort: 'eval', side: 'w' });
  assert.equal(t.rows.length, 1);
  assert.deepEqual(t.rows[0]!.eval, { cp: 40 });
});
