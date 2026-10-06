// Maia's runs, batched (PLAN.md §5.32): q_extension's createMaia.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { createMaiaBatch } from '../../../../src/core/maia/batch.ts';
import { MAIA_MOVES } from '../../../../src/core/maia/encode.ts';

const pos = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
const START = pos('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
const E4 = pos('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');

function world(fail = false) {
  const runs: number[][] = [];
  const pending: (() => void)[] = [];
  const batch = createMaiaBatch({
    run: async (_tokens, elos, n) => {
      runs.push([...elos]);
      if (fail) throw new Error('no model');
      return { moves: new Float32Array(n * MAIA_MOVES), values: new Float32Array(n * 3) };
    },
    defer: (fn) => pending.push(fn),
    maxBatch: 2,
  });
  const turn = () => pending.splice(0).forEach((f) => f());
  return { runs, batch, turn };
}

test('requests of one turn share a run, up to the batch size; the rest run next', async () => {
  const w = world();
  const a = w.batch.ask(START, 1500);
  const b = w.batch.ask(E4, 1500);
  const c = w.batch.ask(START, 2000);
  w.turn();
  const [ra, rb, rc] = await Promise.all([a, b, c]);
  assert.deepEqual(w.runs, [[1500, 1500], [2000]]);
  assert.equal(ra.policy.length, 20);
  assert.equal(rb.policy.length, 20);
  assert.ok(Math.abs(ra.value - 0.5) < 1e-9);
  assert.equal(rc.policy.length, 20);
  assert.deepEqual(w.batch.counts(), { positions: 3, batches: 2 });
});

test('an answer is kept; the same position asked in flight runs once', async () => {
  const w = world();
  const a = w.batch.ask(START, 1500);
  const b = w.batch.ask(START, 1500);
  assert.equal(a, b);
  w.turn();
  await a;
  const again = await w.batch.ask(START, 1500);
  assert.equal(again, await a);
  assert.equal(w.runs.length, 1);
});

test('a failed run rejects its batch, and later asks run again', async () => {
  const w = world(true);
  const a = w.batch.ask(START, 1500);
  w.turn();
  await assert.rejects(a, /no model/);
  const b = w.batch.ask(START, 1500);
  w.turn();
  await assert.rejects(b, /no model/);
  assert.equal(w.runs.length, 2);
});
