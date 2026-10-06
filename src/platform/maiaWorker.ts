// Maia's worker (PLAN.md §5.32): onnxruntime-web (wasm, one thread) on the vendored model, its
// files from the engines' cache (the page downloads them first, src/platform/blobs.ts). Runs are
// batched (core/maia/batch.ts). Asked by the page and, over a port, by the explorer worker.
import * as ort from 'onnxruntime-web/wasm';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { createMaiaBatch } from '../core/maia/batch.ts';
import type { FromMaia, ToMaia } from '../core/maia/protocol.ts';
import { ENGINES, stored } from './blobs.ts';

const scope = self as unknown as { postMessage(m: FromMaia): void; onmessage: ((e: MessageEvent<ToMaia>) => void) | null };

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = { wasm: new URL(ENGINES.ortWasm.url, location.href).href, mjs: new URL(ENGINES.ortMjs.url, location.href).href };

let session: ort.InferenceSession | undefined;
let loading: Promise<void> | undefined;

const batch = createMaiaBatch({
  run: async (tokens, elos, n) => {
    if (!session) throw new Error('Maia is not loaded');
    const out = await session.run({
      tokens: new ort.Tensor('float32', tokens, [n, 64, 12]),
      elo_self: new ort.Tensor('float32', elos, [n]),
      elo_oppo: new ort.Tensor('float32', Float32Array.from(elos), [n]),
    });
    return { moves: out.logits_move!.data as Float32Array, values: out.logits_value!.data as Float32Array };
  },
  defer: (fn) => setTimeout(fn, 0),
});

function load(): Promise<void> {
  loading ??= (async () => {
    const response = await fetch(ENGINES.maiaModel.url);
    if (!response.ok) throw new Error(`the model: HTTP ${response.status}`);
    session = await ort.InferenceSession.create(new Uint8Array(await response.arrayBuffer()));
  })();
  return loading;
}

const position = (fen: string) => {
  const setup = parseFen(fen);
  if (setup.isErr) throw new Error(`not a FEN: ${fen}`);
  return Chess.fromSetup(setup.value).unwrap();
};

async function handle(m: ToMaia, reply: (r: FromMaia) => void): Promise<void> {
  if (m.type === 'init') {
    try {
      if (!(await stored([ENGINES.maiaModel, ENGINES.ortWasm, ENGINES.ortMjs]))) return reply({ type: 'status', status: 'missing' });
      await load();
      reply({ type: 'status', status: 'ready' });
    } catch (e) {
      loading = undefined;
      reply({ type: 'failed', reason: e instanceof Error ? e.message : String(e) });
    }
    return;
  }
  if (m.type === 'port') {
    const port = m.port;
    port.onmessage = (e) => void handle(e.data, (r) => port.postMessage(r));
    return;
  }
  try {
    await load();
    const pos = position(m.fen);
    if (m.type === 'ask') {
      const a = await batch.ask(pos, m.elo);
      reply({ type: 'answer', id: m.id, policy: a.policy, value: a.value });
      return;
    }
    // Qchess's Ms: the mover's score after the move is one less the score of the side then to move.
    const scores: Record<string, number> = {};
    await Promise.all(
      m.sans.map(async (san) => {
        const move = parseSan(pos, san);
        if (!move) return;
        const after = pos.clone();
        after.play(move);
        if (after.isCheckmate()) scores[san] = 1;
        else if (after.isEnd()) scores[san] = 0.5;
        else scores[san] = 1 - (await batch.ask(after, m.elo)).value;
      }),
    );
    reply({ type: 'scores', id: m.id, scores });
  } catch (e) {
    reply({ type: 'error', id: m.id, reason: e instanceof Error ? e.message : String(e) });
  }
}

scope.onmessage = (e) => void handle(e.data, (r) => scope.postMessage(r));
