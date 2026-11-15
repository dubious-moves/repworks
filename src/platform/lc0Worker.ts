// Lc0's worker (PLAN.md §5.143): onnxruntime-web (wasm, one thread; or WebGPU where the page asks
// for it and it serves, §5.184) on the vendored network, its files from the engines' cache (the
// page downloads them first, src/platform/blobs.ts). One position a run, one run at a time: a
// batch costs the same per position on wasm (measured). Its search (§5.144) runs here too, one
// network run a playout, so no position crosses to the page.
import { Chess, type Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { LC0_INPUT, lc0Planes, lc0Policy, wdlFrom } from '../core/lc0/encode.ts';
import type { GpuInit } from '../core/engine/gpu.ts';
import type { FromLc0, ToLc0 } from '../core/lc0/protocol.ts';
import { lc0Search, type NetAnswer } from '../core/lc0/search.ts';
import { ENGINES, stored } from './blobs.ts';
import { openSession, type Opened } from './ortSession.ts';

const scope = self as unknown as { postMessage(m: FromLc0): void; onmessage: ((e: MessageEvent<ToLc0>) => void) | null };

const FILES = [ENGINES.lc0Model, ENGINES.ortWasm, ENGINES.ortMjs];
let opened: Opened | undefined;
let loading: Promise<void> | undefined;
let queue: Promise<unknown> = Promise.resolve();

function load(gpu?: GpuInit): Promise<void> {
  loading ??= (async () => {
    opened = await openSession(ENGINES.lc0Model.url, 'the network', gpu, {
      outputs: ['policy', 'wdl'],
      // The start position: what the graphics processor is checked on (§5.184).
      feeds: (ort) => ({ input: new ort.Tensor('float32', lc0Planes([Chess.default()], new Float32Array(LC0_INPUT)), [1, 112, 8, 8]) }),
    });
  })();
  return loading;
}

/** One position through the network. */
async function infer(planes: Float32Array): Promise<{ policy: Float32Array; wdl: Float32Array }> {
  const { ort, session } = opened!;
  const out = await session.run({ input: new ort.Tensor('float32', planes, [1, 112, 8, 8]) });
  return { policy: out.policy!.data as Float32Array, wdl: out.wdl!.data as Float32Array };
}

const position = (fen: string): Position => {
  const setup = parseFen(fen);
  if (setup.isErr) throw new Error(`not a FEN: ${fen}`);
  return Chess.fromSetup(setup.value).unwrap();
};

async function run(fens: string[]): Promise<Extract<FromLc0, { type: 'answer' }>> {
  const history = fens.map(position);
  const out = await infer(lc0Planes(history, new Float32Array(LC0_INPUT)));
  const pos = history[history.length - 1]!;
  return { type: 'answer', id: 0, policy: lc0Policy(pos, out.policy), wdl: wdlFrom(out.wdl) };
}

const input = new Float32Array(LC0_INPUT);

/** The network for the search: every legal move's prior (no floor). */
async function net(history: readonly Position[]): Promise<NetAnswer> {
  const out = await infer(lc0Planes(history, input));
  return { policy: lc0Policy(history[history.length - 1]!, out.policy, 0, undefined, 0), wdl: wdlFrom(out.wdl) };
}

const stopped = new Set<number>();
const PROGRESS_EVERY = 10;

async function search(id: number, fens: string[], nodes: number): Promise<Extract<FromLc0, { type: 'searched' }>> {
  const result = await lc0Search({
    history: fens.map(position),
    nodes,
    net,
    progress: (n, best) => {
      if (n % PROGRESS_EVERY === 0) scope.postMessage({ type: 'progress', id, nodes: n, best: best() });
      return !stopped.has(id);
    },
  });
  stopped.delete(id);
  return { type: 'searched', id, result };
}

async function handle(m: ToLc0): Promise<void> {
  if (m.type === 'stop') {
    stopped.add(m.id);
    return;
  }
  if (m.type === 'init') {
    try {
      if (!(await stored(FILES))) return scope.postMessage({ type: 'status', status: 'missing' });
      await load(m.gpu);
      scope.postMessage({ type: 'status', status: 'ready', ...(opened?.gpu ? { gpu: opened.gpu } : {}) });
    } catch (e) {
      loading = undefined;
      scope.postMessage({ type: 'failed', reason: e instanceof Error ? e.message : String(e) });
    }
    return;
  }
  try {
    await load();
    const next = queue.then((): Promise<Extract<FromLc0, { type: 'answer' | 'searched' }>> => (m.type === 'search' ? search(m.id, m.fens, m.nodes) : run(m.fens)));
    queue = next.catch(() => undefined);
    scope.postMessage({ ...(await next), id: m.id });
  } catch (e) {
    scope.postMessage({ type: 'error', id: m.id, reason: e instanceof Error ? e.message : String(e) });
  }
}

scope.onmessage = (e) => void handle(e.data);
