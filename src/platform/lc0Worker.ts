// Lc0's worker (PLAN.md §5.143): onnxruntime-web (wasm, one thread) on the vendored network, its
// files from the engines' cache (the page downloads them first, src/platform/blobs.ts). One
// position a run, one run at a time: a batch costs the same per position on wasm (measured).
import * as ort from 'onnxruntime-web/wasm';
import { Chess, type Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { LC0_INPUT, lc0Planes, lc0Policy, wdlFrom } from '../core/lc0/encode.ts';
import type { FromLc0, ToLc0 } from '../core/lc0/protocol.ts';
import { ENGINES, stored } from './blobs.ts';

const scope = self as unknown as { postMessage(m: FromLc0): void; onmessage: ((e: MessageEvent<ToLc0>) => void) | null };

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = { wasm: new URL(ENGINES.ortWasm.url, location.href).href, mjs: new URL(ENGINES.ortMjs.url, location.href).href };

const FILES = [ENGINES.lc0Model, ENGINES.ortWasm, ENGINES.ortMjs];
let session: ort.InferenceSession | undefined;
let loading: Promise<void> | undefined;
let queue: Promise<unknown> = Promise.resolve();

function load(): Promise<void> {
  loading ??= (async () => {
    const response = await fetch(ENGINES.lc0Model.url);
    if (!response.ok) throw new Error(`the network: HTTP ${response.status}`);
    session = await ort.InferenceSession.create(new Uint8Array(await response.arrayBuffer()));
  })();
  return loading;
}

const position = (fen: string): Position => {
  const setup = parseFen(fen);
  if (setup.isErr) throw new Error(`not a FEN: ${fen}`);
  return Chess.fromSetup(setup.value).unwrap();
};

async function run(fens: string[]): Promise<Extract<FromLc0, { type: 'answer' }>> {
  const history = fens.map(position);
  const input = lc0Planes(history, new Float32Array(LC0_INPUT));
  const out = await session!.run({ input: new ort.Tensor('float32', input, [1, 112, 8, 8]) });
  const pos = history[history.length - 1]!;
  return { type: 'answer', id: 0, policy: lc0Policy(pos, out.policy!.data as Float32Array), wdl: wdlFrom(out.wdl!.data as Float32Array) };
}

async function handle(m: ToLc0): Promise<void> {
  if (m.type === 'init') {
    try {
      if (!(await stored(FILES))) return scope.postMessage({ type: 'status', status: 'missing' });
      await load();
      scope.postMessage({ type: 'status', status: 'ready' });
    } catch (e) {
      loading = undefined;
      scope.postMessage({ type: 'failed', reason: e instanceof Error ? e.message : String(e) });
    }
    return;
  }
  try {
    await load();
    const next = queue.then(() => run(m.fens));
    queue = next.catch(() => undefined);
    scope.postMessage({ ...(await next), id: m.id });
  } catch (e) {
    scope.postMessage({ type: 'error', id: m.id, reason: e instanceof Error ? e.message : String(e) });
  }
}

scope.onmessage = (e) => void handle(e.data);
