// What a Practical cell and a prepared bar say (PLAN.md §5.24): q_extension's tooltips.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterLabel, practicalDetails, preparedDetails } from '../../../../src/core/explorer/details.ts';
import type { RowResult } from '../../../../src/core/explorer/search.ts';

const O = { replyThreshold: 3, minGames: 50, filter: 'blitz/rapid, 1600–2500', analyse: false };

test('the filter as the column names it', () => {
  assert.equal(filterLabel(['blitz', 'rapid'], [2500, 1600, 2000]), 'blitz/rapid, 1600–2500');
  assert.equal(filterLabel(['blitz'], [2000]), 'blitz, 2000');
  assert.equal(filterLabel(['blitz'], []), 'blitz, all');
});

test('a value: the mean and engine, the games, the replies with the Practical choice, the switches, the depth', () => {
  const r: RowResult = {
    state: 'value',
    value: 54.4,
    mean: 56.2,
    engine: 51,
    games: 12345,
    depth: 3,
    positions: 7,
    final: false,
    tailShare: 0.012,
    unexplained: 0,
    analysing: 0,
    replies: [
      { san: 'Nf3', share: 0.8, v: 55, expanded: true, move: 'd6', maiaOnly: false },
      { san: 'a3', share: 0.01, v: 60, expanded: false, move: null, maiaOnly: false },
    ],
    switches: [{ path: ['Nf3'], from: 'Nc6', to: 'd6', gain: 1.6, reach: 0.8 }],
  };
  assert.deepEqual(practicalDetails(r, O), [
    'Practical 54% (mean 56%) · engine 51% (+3)',
    '12,345 games · Lichess blitz/rapid, 1600–2500',
    '  Nf3  80% → 55%  (d6)',
    '  others under 3%: 1.2% (engine eval)',
    'Your move after Nf3: d6, not ChessDB’s Nc6 (+1.6)',
    'Depth 3 · 7 positions searched · searching deeper…',
  ]);
  assert.deepEqual(practicalDetails({ state: 'few', games: 12, engine: 48.6 }, O), ['Only 12 games here with the current filter (minimum 50).', 'Engine: 49%']);
});

test('a prepared bar: the split against the same games, and what it rests on', () => {
  const r: RowResult = { state: 'value', value: 55, depth: 3, prep: { w: 0.4, d: 0.3, b: 0.3 }, raw: { w: 0.35, d: 0.3, b: 0.35, n: 900 }, prior: 0.2, leafGames: 4000, replies: [] };
  assert.deepEqual(preparedDetails(r, 'w', O).slice(0, 3), ['Prepared 40 / 30 / 30 (these games 35 / 30 / 35)', 'Your expected score 55% (50% in these games, +5)', 'Rests on Practical value: 20% · depth 3 · 4,000 games at the leaves']);
});
