// The 23M Maia 3 on onnxruntime-web, under Node (PLAN.md §5.188): this site's history encoding on
// the vendored export (weights at half precision) against test/fixtures/maia/reference-23m.json,
// made by the official code on the official PyTorch checkpoint (scripts/maia3-reference.py): 24
// positions, half with the positions that led to them, half alone, and the starting position. The same top move, the top
// five's probabilities within 0.005 (the export alone differed by 0.00015 at most under
// onnxruntime in Python), the score within 0.005. And the batch: a position asked with and
// without what led to it is two questions, answered differently.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import * as ort from 'onnxruntime-web';
import { createMaiaBatch } from '../../../src/core/maia/batch.ts';
import { expectedScore, MAIA_HISTORY, MAIA_TOKENS, maiaHistoryTokens, maiaTokens, policyFrom } from '../../../src/core/maia/encode.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
interface Ref {
  fens: string[];
  elo: number;
  top5: { uci: string; prob: number }[];
  value: number[];
}
const refs = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/maia/reference-23m.json'), 'utf8')) as Ref[];
let session: ort.InferenceSession;
const position = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
const run = async (tokens: Float32Array, elos: Float32Array, n: number) => {
  const out = await session.run({
    tokens: new ort.Tensor('float32', tokens, [n, 64, 12 * MAIA_HISTORY]),
    elo_self: new ort.Tensor('float32', elos, [n]),
    elo_oppo: new ort.Tensor('float32', Float32Array.from(elos), [n]),
  });
  return { moves: out.logits_move!.data as Float32Array, values: out.logits_value!.data as Float32Array };
};

before(async () => {
  ort.env.wasm.numThreads = 1;
  session = await ort.InferenceSession.create(readFileSync(join(ROOT, 'vendor/maia/maia3-23m.onnx')));
});

test('the history’s tokens: eight positions oldest first, each from its own side to move, the earliest repeated in front', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const e4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
  const plane = (t: Float32Array, h: number) => Float32Array.from({ length: MAIA_TOKENS }, (_, i) => t[Math.floor(i / 12) * 12 * MAIA_HISTORY + h * 12 + (i % 12)]!);
  const alone = maiaHistoryTokens([e4]);
  assert.equal(alone.length, MAIA_TOKENS * MAIA_HISTORY);
  for (let h = 0; h < MAIA_HISTORY; h++) assert.deepEqual(plane(alone, h), maiaTokens(e4));
  const two = maiaHistoryTokens([start, e4]);
  for (let h = 0; h < MAIA_HISTORY - 1; h++) assert.deepEqual(plane(two, h), maiaTokens(start));
  assert.deepEqual(plane(two, MAIA_HISTORY - 1), maiaTokens(e4));
  // More than eight: the last eight.
  const many = maiaHistoryTokens([e4, ...Array.from({ length: 7 }, () => start), e4]);
  assert.deepEqual(plane(many, 0), maiaTokens(start));
  assert.deepEqual(plane(many, MAIA_HISTORY - 1), maiaTokens(e4));
});

test('the model’s inputs and outputs', () => {
  assert.deepEqual(session.inputNames, ['tokens', 'elo_self', 'elo_oppo']);
  assert.deepEqual(session.outputNames, ['logits_move', 'logits_value']);
});

test('25 positions: the official code’s top five on the official checkpoint', async () => {
  assert.equal(refs.length, 25);
  assert.equal(refs.filter((r) => r.fens.length > 1).length, 12);
  assert.ok(refs.some((r) => r.fens.at(-1)!.split(' ')[1] === 'b') && refs.some((r) => r.fens.at(-1)!.split(' ')[1] === 'w'));
  let worst = 0;
  for (const r of refs) {
    const fen = r.fens.at(-1)!;
    const out = await run(maiaHistoryTokens(r.fens), Float32Array.from([r.elo]), 1);
    const policy = policyFrom(position(fen), out.moves);
    assert.equal(policy[0]!.uci, r.top5[0]!.uci, `${fen} at ${r.elo}`);
    for (const m of r.top5) {
      const p = policy.find((x) => x.uci === m.uci)?.prob ?? 0;
      worst = Math.max(worst, Math.abs(p - m.prob));
      assert.ok(Math.abs(p - m.prob) < 0.005, `${fen}: ${m.uci} ${p} against ${m.prob}`);
    }
    assert.ok(Math.abs(expectedScore(out.values) - expectedScore(r.value)) < 0.005, `${fen}: the score`);
  }
  assert.ok(worst < 0.002, `the largest difference, ${worst}`);
});

test('the batch: with what led to a position and without it are two questions; the history’s answer is the reference’s', async () => {
  const batch = createMaiaBatch({ history: true, run, defer: (fn) => setTimeout(fn, 0) });
  const r = refs.find((x) => x.fens.length === MAIA_HISTORY)!;
  const pos = position(r.fens.at(-1)!);
  const [led, alone, again] = await Promise.all([batch.ask(pos, r.elo, r.fens.slice(0, -1)), batch.ask(pos, r.elo), batch.ask(pos, r.elo, r.fens.slice(0, -1))]);
  assert.equal(batch.counts().positions, 2);
  assert.equal(batch.counts().batches, 1);
  assert.equal(again, led);
  assert.ok(Math.abs(led.policy.find((m) => m.uci === r.top5[0]!.uci)!.prob - r.top5[0]!.prob) < 0.005);
  assert.ok(led.policy.some((m, i) => Math.abs(m.prob - (alone.policy.find((x) => x.uci === m.uci)?.prob ?? 0)) > 0.001 || alone.policy[i]?.uci !== m.uci));
});
