// Lc0's network on onnxruntime-web, under Node (PLAN.md §5.143): its inputs and outputs, and this
// site's encoding on the vendored network against test/fixtures/lc0/reference.json (the same
// runtime's values when the network was converted, scripts/lc0-reference.mjs): the same top five
// in the same order, to 1e-5. Lc0 itself can't run here, so beside them, checks that hold only
// for a correct port: mates in one found, the colours mirrored, the history read. And its search
// (§5.144) finding a move the policy alone misses.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web';
import type { Position } from 'chessops/chess';
import { lc0Planes, lc0Policy, wdlFrom, type Wdl } from '../../../src/core/lc0/encode.ts';
import { history, LINES } from '../../fixtures/lc0/lines.ts';
import { lc0Search } from '../../../src/core/lc0/search.ts';

const ROOT = join(import.meta.dirname, '..', '..', '..');
interface Ref {
  name: string;
  fen?: string;
  moves: string;
  top5: { san: string; prob: number }[];
  wdl: number[];
}
const refs = JSON.parse(readFileSync(join(ROOT, 'test/fixtures/lc0/reference.json'), 'utf8')) as Ref[];
let session: ort.InferenceSession;

before(async () => {
  ort.env.wasm.numThreads = 1;
  session = await ort.InferenceSession.create(readFileSync(join(ROOT, 'vendor/lc0/791556.onnx')));
});

async function ask(h: Position[]): Promise<{ policy: ReturnType<typeof lc0Policy>; wdl: Wdl }> {
  const r = await session.run({ input: new ort.Tensor('float32', lc0Planes(h), [1, 112, 8, 8]) });
  return { policy: lc0Policy(h[h.length - 1]!, r.policy!.data as Float32Array), wdl: wdlFrom(r.wdl!.data as Float32Array) };
}
const byName = (name: string) => history(LINES.find((l) => l.name === name)!);

test('the network’s inputs and outputs', () => {
  assert.deepEqual(session.inputNames, ['input']);
  assert.deepEqual(session.outputNames, ['policy', 'wdl']);
});

test('16 lines: the fixture’s top five and W/D/L', async () => {
  assert.equal(refs.length, LINES.length);
  for (const r of refs) {
    const a = await ask(history(r));
    assert.deepEqual(a.policy.slice(0, 5).map((m) => m.san), r.top5.map((m) => m.san), r.name);
    a.policy.slice(0, 5).forEach((m, i) => assert.ok(Math.abs(m.prob - r.top5[i]!.prob) < 1e-5, `${r.name}: ${m.san}`));
    [a.wdl.win, a.wdl.draw, a.wdl.loss].forEach((v, i) => assert.ok(Math.abs(v - r.wdl[i]!) < 1e-5, `${r.name}: W/D/L`));
  }
});

test('chess sense: mates in one, the free queen, the promotion; a won ending won', async () => {
  for (const [name, san] of [
    ['Qxf7 mates', 'Qxf7#'],
    ['back rank mate', 'Ra8#'],
    ['Bxg4 wins the queen', 'Bxg4'],
    ['a pawn promotes, Black', 'h1=Q+'],
  ] as const) {
    const a = await ask(byName(name));
    assert.equal(a.policy[0]!.san, san, name);
  }
  const kq = await ask(byName('king and queen'));
  assert.ok(kq.wdl.win > 0.99);
});

test('the colours mirrored give the same answer, and the history is read', async () => {
  const w = await ask(byName('both may castle'));
  const b = await ask(byName('both may castle, Black'));
  const mirror = (san: string) => san.replace(/[1-8]/g, (d) => String(9 - Number(d)));
  assert.deepEqual(b.policy.slice(0, 5).map((m) => m.san), w.policy.slice(0, 5).map((m) => mirror(m.san)));
  assert.ok(Math.abs(w.wdl.win - b.wdl.win) < 0.01);
  // The Ruy Lopez from its moves and from its FEN alone differ, a little.
  const h = byName('closed Ruy Lopez');
  const withHistory = await ask(h);
  const fenOnly = await ask(h.slice(-1));
  assert.notEqual(withHistory.policy[0]!.prob, fenOnly.policy[0]!.prob);
  assert.deepEqual(fenOnly.policy.slice(0, 2).map((m) => m.san).sort(), withHistory.policy.slice(0, 2).map((m) => m.san).sort());
});

test('the search (§5.144) on the real network: a move its policy alone misses', async () => {
  const net = async (h: readonly Position[]) => {
    const r = await session.run({ input: new ort.Tensor('float32', lc0Planes(h), [1, 112, 8, 8]) });
    return { policy: lc0Policy(h[h.length - 1]!, r.policy!.data as Float32Array, 0, undefined, 0), wdl: wdlFrom(r.wdl!.data as Float32Array) };
  };
  // From a Maia game (2026-10-31): the policy's a3 loses 0.24 by Stockfish 18 at depth 18, the
  // search's Bg4 nothing.
  const h = history({ name: 'a Maia game', fen: '2r2rk1/p3nppp/1p1q4/3p4/1p1P4/1Q2PB1P/PP3PP1/2R2RK1 w - - 2 18', moves: '' });
  assert.equal((await net(h)).policy[0]!.san, 'a3');
  const r = await lc0Search({ history: h, nodes: 100, net });
  assert.equal(r.san, 'Bg4');
  assert.ok(r.nodes <= 100 && r.evals <= r.nodes);
  assert.equal(r.moves.reduce((n, m) => n + m.visits, 0), r.nodes - 1);
});
