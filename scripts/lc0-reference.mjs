// Builds test/fixtures/lc0/reference.json (PLAN.md §5.143): Lc0's top five moves and W/D/L on the
// vendored network, through this site's encoding (src/core/lc0/encode.ts) on onnxruntime-web, the
// runtime the site runs, for 16 lines: openings (from the start, so with their history), a FEN
// without history, en passant, promotions, castling both ways, mates in one, a hanging queen, a
// won endgame. Lc0 itself can't run in a cloud container, so these are this port's own values:
// a change of the encoding, the network or the runtime shows in the tests.
//
// Usage, once: node scripts/lc0-reference.mjs > test/fixtures/lc0/reference.json
import { readFileSync } from 'node:fs';
import * as ort from 'onnxruntime-web';
import { lc0Planes, lc0Policy, wdlFrom } from '../src/core/lc0/encode.ts';
import { history, LINES } from '../test/fixtures/lc0/lines.ts';

ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(readFileSync(new URL('../vendor/lc0/791556.onnx', import.meta.url)));
const out = [];
for (const line of LINES) {
  const h = history(line);
  const r = await session.run({ input: new ort.Tensor('float32', lc0Planes(h), [1, 112, 8, 8]) });
  const top5 = lc0Policy(h[h.length - 1], r.policy.data).slice(0, 5).map((m) => ({ san: m.san, prob: Number(m.prob.toFixed(6)) }));
  const w = wdlFrom(r.wdl.data);
  out.push({ ...line, top5, wdl: [w.win, w.draw, w.loss].map((x) => Number(x.toFixed(6))) });
}
console.log(JSON.stringify(out, null, 1));
