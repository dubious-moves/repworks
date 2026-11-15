// Stockfish in a worker (PLAN.md §5.30): the vendored lite single-threaded build, which reads
// its wasm's URL from the hash of its own (the URLs carry content hashes, so the default of
// "the same name, .wasm" can't be used). The handshake (`uci`, the hash size, `isready`) is
// mistake-lab's, with its 10 s timeouts; commands sent before it ends wait for it.
import { ENGINES } from './blobs.ts';

export interface EngineProcess {
  send(command: string): void;
  terminate(): void;
}

export interface EngineEvents {
  line(line: string): void;
  /** The worker died (an error event, or a handshake that never ended). */
  crashed(reason: string): void;
}

const HANDSHAKE_MS = 10_000;
/** The full net's 99 MB of wasm take longer to compile and to read than the lite builds'. */
const HANDSHAKE_FULL_MS = 60_000;

/**
 * The versions (§5.75): 18, proven on the owner's phone; 19, an option; and 19 with its full net
 * (§5.186), stronger at the same depth and 99 MB to download, for a desktop.
 */
export const STOCKFISH_VERSIONS = [18, 19, '19 full'] as const;
export type StockfishVersion = (typeof STOCKFISH_VERSIONS)[number];

/** "Stockfish 19, full net". */
export const stockfishName = (version: StockfishVersion): string => (version === '19 full' ? 'Stockfish 19, full net' : `Stockfish ${version}`);
/** The engine bar's "SF19F". */
export const stockfishShort = (version: StockfishVersion): string => (version === '19 full' ? 'SF19F' : `SF${version}`);

/** The build's files: the single-threaded one, or the threaded one (§5.36, isolated pages only). */
export function stockfishFiles(threads: number, version: StockfishVersion = 18) {
  if (version === '19 full') return threads > 1 ? [ENGINES.stockfish19FullMtJs, ENGINES.stockfish19FullMtWasm] : [ENGINES.stockfish19FullJs, ENGINES.stockfish19FullWasm];
  if (version === 19) return threads > 1 ? [ENGINES.stockfish19MtJs, ENGINES.stockfish19MtWasm] : [ENGINES.stockfish19Js, ENGINES.stockfish19Wasm];
  return threads > 1 ? [ENGINES.stockfishMtJs, ENGINES.stockfishMtWasm] : [ENGINES.stockfishJs, ENGINES.stockfishWasm];
}

export function startStockfish(events: EngineEvents, hashMb: number, threads = 1, version: StockfishVersion = 18): EngineProcess {
  const [js, wasm] = stockfishFiles(threads, version);
  const url = `${js!.url}#${encodeURIComponent(new URL(wasm!.url, location.href).href)}`;
  const worker = new Worker(url);
  const queue: string[] = [];
  let ready = false;
  let dead = false;
  const handshakeMs = version === '19 full' ? HANDSHAKE_FULL_MS : HANDSHAKE_MS;
  let expect: 'uciok' | 'readyok' | undefined = 'uciok';
  const fail = (reason: string) => {
    if (dead) return;
    dead = true;
    clearTimeout(timer);
    worker.terminate();
    events.crashed(reason);
  };
  let timer = setTimeout(() => fail('Stockfish did not start (no uciok)'), handshakeMs);
  worker.addEventListener('error', (e) => fail(e.message || 'Stockfish stopped working'));
  worker.addEventListener('message', (e: MessageEvent<unknown>) => {
    if (dead || typeof e.data !== 'string') return;
    const line = e.data;
    if (expect === 'uciok' && line === 'uciok') {
      expect = 'readyok';
      clearTimeout(timer);
      timer = setTimeout(() => fail('Stockfish did not start (no readyok)'), handshakeMs);
      worker.postMessage(`setoption name Hash value ${hashMb}`);
      if (threads > 1) worker.postMessage(`setoption name Threads value ${threads}`);
      worker.postMessage('isready');
      return;
    }
    if (expect === 'readyok' && line === 'readyok') {
      expect = undefined;
      clearTimeout(timer);
      ready = true;
      for (const c of queue.splice(0)) worker.postMessage(c);
      return;
    }
    if (expect) return;
    events.line(line);
  });
  worker.postMessage('uci');
  return {
    send(command) {
      if (dead) return;
      if (ready) worker.postMessage(command);
      else queue.push(command);
    },
    terminate() {
      if (dead) return;
      dead = true;
      clearTimeout(timer);
      worker.terminate();
    },
  };
}
