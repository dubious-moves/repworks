// Builds test/fixtures/maia/reference.json (PLAN.md §5.32): Maia 3's top five moves and value
// logits for 50 fixed positions at five ratings, as q_extension's `tools/repgen/maia.mjs`
// (`c26242f`) computes them on onnxruntime-node, which is the reference; and beside them the
// top five this site's encoding (src/core/maia/encode.ts) gets from onnxruntime-web, the
// runtime the site runs, so a change of either shows in the tests.
//
// The positions: 12 chosen (openings, en passant, promotions with and without a capture,
// castling both ways, endgames), then seeded random games, sampled at varied plies.
//
// Usage, once, with both at hand (not in CI):
//   npm install --prefix <dir> onnxruntime-node@1.30.0
//   node scripts/maia-reference.mjs <q_extension checkout at c26242f> <dir>/node_modules/onnxruntime-node \
//     > test/fixtures/maia/reference.json
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import * as web from 'onnxruntime-web';
import { maiaTokens, policyFrom } from '../src/core/maia/encode.ts';

const [qext, ortNode] = process.argv.slice(2);
if (!qext || !ortNode) throw new Error('usage: node scripts/maia-reference.mjs <q_extension> <onnxruntime-node>');
const q = await import(pathToFileURL(join(resolve(qext), 'tools/repgen/maia.mjs')).href);
const node = (await import(pathToFileURL(join(resolve(ortNode), 'dist/index.js')).href)).default;
const MODEL = readFileSync(new URL('../vendor/maia/maia3_simplified.onnx', import.meta.url));
const ELOS = [1100, 1500, 1900, 2300, 2600];

const CHOSEN = [
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
  'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 1 5',
  'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3',
  '8/P7/8/8/8/8/5k1p/K7 w - - 0 1',
  '8/P7/8/8/8/8/5k1p/K7 b - - 0 1',
  'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 4 8',
  'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R b KQkq - 4 8',
  '1r4k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 30',
  '6k1/5ppp/8/8/8/8/1q3PPP/3R2K1 b - - 0 30',
  '3r2k1/1P3ppp/8/8/8/8/5PPP/6K1 w - - 0 40',
];

let seed = 12345;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const fens = [...CHOSEN];
while (fens.length < 50) {
  const pos = Chess.default();
  const plies = 2 + Math.floor(rnd() * 60);
  let ok = true;
  for (let i = 0; i < plies; i++) {
    const moves = [];
    for (const [from, dests] of pos.allDests()) for (const to of dests) moves.push({ from, to });
    if (!moves.length) {
      ok = false;
      break;
    }
    const m = moves[Math.floor(rnd() * moves.length)];
    if (pos.board.get(m.from).role === 'pawn' && (m.to >> 3 === 7 || m.to >> 3 === 0)) m.promotion = ['queen', 'knight', 'rook', 'bishop'][Math.floor(rnd() * 4)];
    pos.play(m);
  }
  if (ok && !pos.isEnd()) fens.push(makeFen(pos.toSetup()));
}

const feeds = (ort, tokens, elo) => ({
  tokens: new ort.Tensor('float32', tokens, [1, 64, 12]),
  elo_self: new ort.Tensor('float32', Float32Array.from([elo]), [1]),
  elo_oppo: new ort.Tensor('float32', Float32Array.from([elo]), [1]),
});
const nodeSession = await node.InferenceSession.create(MODEL, { graphOptimizationLevel: 'extended' });
web.env.wasm.numThreads = 1;
const webSession = await web.InferenceSession.create(MODEL);
const out = [];
for (let i = 0; i < fens.length; i++) {
  const fen = fens[i];
  const elo = ELOS[i % ELOS.length];
  const r = await nodeSession.run(feeds(node, q.maiaTokens(fen), elo));
  const w = await webSession.run(feeds(web, maiaTokens(fen), elo));
  const pos = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
  out.push({
    fen,
    elo,
    top5: q.policyFrom(fen, r.logits_move.data, 0).slice(0, 5),
    value: Array.from(r.logits_value.data),
    web: policyFrom(pos, w.logits_move.data, 0).slice(0, 5).map((m) => ({ san: m.san, prob: m.prob })),
    webValue: Array.from(w.logits_value.data),
  });
}
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
