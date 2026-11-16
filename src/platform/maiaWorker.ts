// Maia's worker (PLAN.md §5.32): onnxruntime-web (wasm, one thread; or WebGPU where the page
// asks for it and it serves, §5.184) on the vendored model, its files from the engines' cache
// (the page downloads them first, src/platform/blobs.ts). Runs are batched (core/maia/batch.ts).
// Asked by the page and, over a port, by the explorer worker.
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { GpuInit } from '../core/engine/gpu.ts';
import { createMaiaBatch } from '../core/maia/batch.ts';
import { beforeChild } from '../core/maia/history.ts';
import { MAIA_HISTORY, maiaHistoryTokens, maiaTokens } from '../core/maia/encode.ts';
import type { FromMaia, MaiaModel, ToMaia } from '../core/maia/protocol.ts';
import { ENGINES, stored } from './blobs.ts';
import { openSession, type Opened } from './ortSession.ts';

const scope = self as unknown as {
  postMessage(m: FromMaia): void;
  onmessage: ((e: MessageEvent<ToMaia>) => void) | null;
};

let opened: Opened | undefined;
let loading: Promise<void> | undefined;
/** The model this worker runs, told at `init` (a worker runs one: the page starts another for another). */
let model: MaiaModel = 'maia3';
const history = () => model === 'maia3-23m';
const modelFile = () => (history() ? ENGINES.maia23Model : ENGINES.maiaModel);
const planes = () => (history() ? 12 * MAIA_HISTORY : 12);
let batch = newBatch();

function newBatch() {
  return createMaiaBatch({
    history: history(),
    run: async (tokens, elos, n) => {
      if (!opened) throw new Error('Maia is not loaded');
      const { ort, session } = opened;
      const out = await session.run({
        tokens: new ort.Tensor('float32', tokens, [n, 64, planes()]),
        elo_self: new ort.Tensor('float32', elos, [n]),
        elo_oppo: new ort.Tensor('float32', Float32Array.from(elos), [n]),
      });
      return {
        moves: out.logits_move!.data as Float32Array,
        values: out.logits_value!.data as Float32Array,
      };
    },
    defer: (fn) => setTimeout(fn, 0),
  });
}

/** The positions the graphics processor is checked on (§5.184): an opening, a middlegame, an ending, at three ratings, as one batch. */
const PROBE: readonly [fen: string, elo: number][] = [
  ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1100],
  ['rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6', 1500],
  ['r1bq1rk1/pp2ppbp/2np1np1/8/3NP3/2N1BP2/PPPQ2PP/R3KB1R w KQ - 3 9', 1900],
  ['8/5pk1/6p1/8/3R4/6P1/r4PK1/8 b - - 0 40', 2300],
];

function load(gpu?: GpuInit): Promise<void> {
  loading ??= (async () => {
    opened = await openSession(modelFile().url, 'the model', gpu, {
      outputs: ['logits_move', 'logits_value'],
      feeds: (ort) => {
        const n = PROBE.length;
        const width = 64 * planes();
        const tokens = new Float32Array(n * width);
        PROBE.forEach(([fen], i) => tokens.set(history() ? maiaHistoryTokens([fen]) : maiaTokens(fen), i * width));
        const elos = Float32Array.from(PROBE, ([, elo]) => elo);
        return {
          tokens: new ort.Tensor('float32', tokens, [n, 64, planes()]),
          elo_self: new ort.Tensor('float32', elos, [n]),
          elo_oppo: new ort.Tensor('float32', Float32Array.from(elos), [n]),
        };
      },
    });
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
      if (!loading && m.model && m.model !== model) {
        model = m.model;
        batch = newBatch();
      }
      if (!(await stored([modelFile(), ENGINES.ortWasm, ENGINES.ortMjs]))) return reply({ type: 'status', status: 'missing' });
      await load(m.gpu);
      reply({
        type: 'status',
        status: 'ready',
        ...(opened?.gpu ? { gpu: opened.gpu } : {}),
      });
    } catch (e) {
      loading = undefined;
      reply({
        type: 'failed',
        reason: e instanceof Error ? e.message : String(e),
      });
    }
    return;
  }
  if (m.type === 'port') {
    const port = m.port;
    let told = 0;
    port.onmessage = (e) => {
      // At most every 10 s: the page's idle timer only sees its own asks.
      if (Date.now() - told > 10_000) {
        told = Date.now();
        scope.postMessage({ type: 'busy' });
      }
      void handle(e.data, (r) => port.postMessage(r));
    };
    return;
  }
  try {
    await load();
    const pos = position(m.fen);
    if (m.type === 'ask') {
      const a = await batch.ask(pos, m.elo, m.before);
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
        else scores[san] = 1 - (await batch.ask(after, m.elo, beforeChild(m.before, m.fen))).value;
      }),
    );
    reply({ type: 'scores', id: m.id, scores });
  } catch (e) {
    reply({
      type: 'error',
      id: m.id,
      reason: e instanceof Error ? e.message : String(e),
    });
  }
}

scope.onmessage = (e) => void handle(e.data, (r) => scope.postMessage(r));
