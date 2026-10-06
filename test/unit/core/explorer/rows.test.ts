// The Practical column's rows (PLAN.md §5.24): q_extension's `peAutoRows` and `peBestOf`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoRows, bestOf, PE_MAX_AUTO } from '../../../../src/core/explorer/rows.ts';
import type { RowResult } from '../../../../src/core/explorer/search.ts';
import type { TableRow } from '../../../../src/core/explorer/table.ts';

const row = (san: string, share: number, cp?: number, novelty = false): TableRow => ({
  san,
  games: Math.round(share * 1000),
  share,
  white: 0,
  draws: 0,
  black: 0,
  novelty,
  covered: false,
  repertoire: 0,
  ...(cp === undefined ? {} : { eval: { cp } }),
});
const O = { margin: 5, maxCandidates: 3, minShare: 0.02 };

test('the engine’s near-best moves first, then the moves people play, 8 at most', () => {
  // White to move: e4 +30, d4 +25, Nf3 +20 (a novelty), c4 −40 is over 5 win% behind; then by
  // games: e4, d4 already in, c4 (10%), g3 (3%); b3 (1%) is under 2%.
  const rows = [row('e4', 0.6, 30), row('d4', 0.26, 25), row('c4', 0.1, -40), row('g3', 0.03), row('b3', 0.01), row('Nf3', 0, 20, true)];
  assert.deepEqual(autoRows(rows, 'w', new Set(), O), ['e4', 'd4', 'Nf3', 'c4', 'g3']);
  // Black to move: the table's evals are White's, so the best for Black is the lowest.
  assert.deepEqual(autoRows([row('c5', 0.5, 20), row('e5', 0.4, -10), row('a6', 0.1, 300)], 'b', new Set(), O), ['e5', 'c5', 'a6']);
  // At most `maxCandidates` by eval, and 8 rows in all.
  const many = Array.from({ length: 12 }, (_, i) => row(`m${i}`, 0.08, 0));
  assert.equal(autoRows(many, 'w', new Set(), O).length, PE_MAX_AUTO);
  assert.deepEqual(autoRows(many, 'w', new Set(), { ...O, maxCandidates: 1 }).slice(0, 1), ['m0']);
});

test('equal evals go to the more played move; an excluded move lets the next one in', () => {
  const rows = [row('a3', 0.02, 0), row('d4', 0.5, 0), row('e4', 0.4, 0), row('Nf3', 0.05, 0)];
  assert.deepEqual(autoRows(rows, 'w', new Set(), { ...O, maxCandidates: 2 }), ['d4', 'e4', 'Nf3', 'a3']);
  assert.deepEqual(autoRows(rows, 'w', new Set(['d4']), { ...O, maxCandidates: 2 }), ['e4', 'Nf3', 'a3']);
});

test('green: the best as displayed among rows at one depth, complete ones always in, two at least', () => {
  const r = (value: number, depth: number, complete = false): RowResult => ({ state: 'value', value, depth, complete });
  const a = r(54.4, 3);
  const b = r(53.6, 3);
  const c = r(70, 1); // caught up to depth 1 only: sits out
  const d = r(54.2, 1, true); // complete: always compared
  const best = bestOf([a, b, c, d]);
  assert.equal(best.best, 54);
  assert.deepEqual([...best.cmp], [a, b, d]);
  assert.equal(bestOf([a]).best, null);
});
