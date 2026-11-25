// The Practical search's `pickLast` (a measurement option, off by default): my last move in a line,
// which has no shallower depth to compare candidates at, picked on the human replies below each.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateRow, winFromCp, type ChessdbAnswer, type ExplorerAnswer, type SearchProvider } from '../../../../src/core/explorer/search.ts';

// Positions are `<path> <side> - -`: enough of a FEN for the search's side and key.
const pos = (path: string, side: 'w' | 'b') => `${path} ${side} - -`;
const mv = (san: string, games: number) => ({ uci: san, san, games, white: games / 2, draws: 0, black: games / 2 });

// After the row move a, Black plays x; White's ChessDB best is M1 (+20), M2 (0) is within the margin.
// After M1 Black's only reply y keeps +20; after M2 four in ten Black players blunder with z2 (+300).
const explorer: Record<string, ExplorerAnswer> = {
  'r.a': { total: 1000, moves: [mv('x', 1000)] },
  'r.a.x.M1': { total: 1000, moves: [mv('y', 1000)] },
  'r.a.x.M2': { total: 1000, moves: [mv('z1', 600), mv('z2', 400)] },
};
const chessdb: Record<string, ChessdbAnswer> = {
  'r.a': { status: 'ok', moves: [{ uci: 'x', san: 'x', score: -20 }] },
  'r.a.x': { status: 'ok', moves: [{ uci: 'M1', san: 'M1', score: 20 }, { uci: 'M2', san: 'M2', score: 0 }] },
  'r.a.x.M1': { status: 'ok', moves: [{ uci: 'y', san: 'y', score: -20 }] },
  'r.a.x.M2': { status: 'ok', moves: [{ uci: 'z1', san: 'z1', score: 0 }, { uci: 'z2', san: 'z2', score: -300 }] },
};
const path = (fen: string) => fen.split(' ')[0]!;
const provider: SearchProvider = {
  explorer: (fen) => explorer[path(fen)] ?? null,
  chessdb: (fen) => chessdb[path(fen)] ?? { status: 'unknown' },
  child: (fen, san) => pos(`${path(fen)}.${san}`, fen.split(' ')[1] === 'w' ? 'b' : 'w'),
};

test('off (the default): my last move in a line is ChessDB’s best', async () => {
  const r = await evaluateRow(provider, pos('r', 'w'), 'a', 3);
  assert.equal(r.state, 'value');
  assert.equal(r.replies![0]!.move, 'M1');
  assert.equal(r.replies![0]!.pick, 'last', 'labelled: not compared, the line’s last move');
  assert.ok(Math.abs(r.value! - winFromCp(20)) < 1e-9);
  assert.deepEqual(r.switches, []);
});

test('pickLast: my last move is picked on the human replies below each candidate', async () => {
  const r = await evaluateRow(provider, pos('r', 'w'), 'a', 3, { pickLast: true });
  assert.equal(r.replies![0]!.move, 'M2');
  assert.equal(r.replies![0]!.pick, 'switched');
  assert.ok(r.value! > winFromCp(20) + 1, `M2's value ${r.value} beats M1's by more than preferBestWithin`);
  assert.equal(r.switches!.length, 1);
  assert.deepEqual({ ...r.switches![0]!, gain: undefined }, { path: ['x'], from: 'M1', to: 'M2', gain: undefined, reach: 1 });
});

test('pickLast keeps ChessDB’s best without a clear gain, and on lines reached under compareReachMin', async () => {
  const close = await evaluateRow(provider, pos('r', 'w'), 'a', 3, { pickLast: true, preferBestWithin: 50 });
  assert.equal(close.replies![0]!.move, 'M1');
  assert.equal(close.replies![0]!.pick, 'kept');
  assert.deepEqual(close.switches, []);
  const rare = await evaluateRow(provider, pos('r', 'w'), 'a', 3, { pickLast: true, compareReachMin: 1.01 });
  assert.equal(rare.replies![0]!.move, 'M1');
  assert.equal(rare.replies![0]!.pick, 'rare');
});

test('the pick label: only, when no other move is within the own margin', async () => {
  // M2 (0) is about 1.8 win% behind M1 (+20): outside a margin of 1.
  const r = await evaluateRow(provider, pos('r', 'w'), 'a', 3, { pickLast: true, ownMargin: 1 });
  assert.equal(r.replies![0]!.move, 'M1');
  assert.equal(r.replies![0]!.pick, 'only');
  const deeper = await evaluateRow(provider, pos('r', 'w'), 'a', 3, { ownMargin: 1, compareReachMin: 1.01 });
  assert.equal(deeper.replies![0]!.pick, 'only', 'only before rare: there was nothing to compare anyway');
});
