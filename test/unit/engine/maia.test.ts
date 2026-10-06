// Maia 3 on onnxruntime-web, under Node (PLAN.md §5.32): this site's encoding on the vendored
// model against test/fixtures/maia/reference.json, whose top fives were computed by
// q_extension's maia.mjs on onnxruntime-node (scripts/maia-reference.mjs). The two runtimes
// differ by up to 0.0043 in probability (the model's weights are float16, the kernels differ),
// so the check is: the same moves in the same order wherever the reference's neighbours are more
// than 0.01 apart, probabilities and scores within 0.01; and onnxruntime-web's own values, kept in
// the fixture, to 1e-6.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import * as ort from 'onnxruntime-web';
import { expectedScore, maiaTokens, policyFrom } from '../../../src/core/maia/encode.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
interface Ref {
  fen: string;
  elo: number;
  top5: { san: string; prob: number }[];
  value: number[];
  web: { san: string; prob: number }[];
  webValue: number[];
}
const refs = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/maia/reference.json'), 'utf8')) as Ref[];
let session: ort.InferenceSession;

before(async () => {
  ort.env.wasm.numThreads = 1;
  session = await ort.InferenceSession.create(readFileSync(join(ROOT, 'vendor/maia/maia3_simplified.onnx')));
});

test('the model’s inputs and outputs', () => {
  assert.deepEqual(session.inputNames, ['tokens', 'elo_self', 'elo_oppo']);
  assert.deepEqual(session.outputNames, ['logits_move', 'logits_value']);
});

test('50 positions: q_extension’s top five within 0.01, and onnxruntime-web’s own values exactly', async () => {
  assert.equal(refs.length, 50);
  assert.equal(refs.filter((r) => r.fen.split(' ')[1] === 'b').length, 22);
  let worst = 0;
  for (const r of refs) {
    const out = await session.run({
      tokens: new ort.Tensor('float32', maiaTokens(r.fen), [1, 64, 12]),
      elo_self: new ort.Tensor('float32', Float32Array.from([r.elo]), [1]),
      elo_oppo: new ort.Tensor('float32', Float32Array.from([r.elo]), [1]),
    });
    const pos = Chess.fromSetup(parseFen(r.fen).unwrap()).unwrap();
    const top = policyFrom(pos, out.logits_move!.data as Float32Array).slice(0, 5);
    const values = Array.from(out.logits_value!.data as Float32Array);
    // Against the reference: the order where it is clear, the probabilities and the score close.
    const bySan = new Map(top.map((m) => [m.san, m.prob]));
    r.top5.forEach((m, i) => {
      const prev = r.top5[i - 1];
      const next = r.top5[i + 1];
      const clear = (!prev || prev.prob - m.prob > 0.01) && (!next || m.prob - next.prob > 0.01);
      if (clear) assert.equal(top[i]!.san, m.san, `${r.fen} at ${r.elo}: move ${i + 1}`);
      const p = bySan.get(m.san);
      if (p !== undefined) {
        worst = Math.max(worst, Math.abs(p - m.prob));
        assert.ok(Math.abs(p - m.prob) < 0.01, `${r.fen}: ${m.san} ${p} against ${m.prob}`);
      } else assert.ok(m.prob < 0.02, `${r.fen}: ${m.san} missing from the top five`);
    });
    assert.ok(Math.abs(expectedScore(values) - expectedScore(r.value)) < 0.01, `${r.fen}: the score`);
    // Against this runtime's own values when the fixture was made.
    assert.deepEqual(top.map((m) => m.san), r.web.map((m) => m.san));
    top.forEach((m, i) => assert.ok(Math.abs(m.prob - r.web[i]!.prob) < 1e-6, `${r.fen}: ${m.san} moved since the fixture`));
    values.forEach((v, i) => assert.ok(Math.abs(v - r.webValue[i]!) < 1e-5));
  }
  assert.ok(worst > 0 && worst < 0.005, `the largest difference, ${worst}`);
});
