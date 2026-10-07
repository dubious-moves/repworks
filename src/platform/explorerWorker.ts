// The explorer worker (PLAN.md §5.22): a module worker per tab, owning every Lichess explorer and
// ChessDB request of the tab. Its logic is core's (src/core/explorer/service.ts); this wires it to
// fetch, the IndexedDB cache, the clock and the page, and (§5.34) to Maia's worker through a port
// the page hands over (`maiaPort`), as q_extension's background asked the tab for Maia.
import { createExplorerService, type ToWorker } from '../core/explorer/service.ts';
import type { MaiaMove } from '../core/explorer/search.ts';
import { CHESSDB_URL, EXPLORER_BASE } from '../core/explorer/providers.ts';
import type { FromMaia } from '../core/maia/protocol.ts';
import { createExplorerCache } from './explorerCache.ts';

type FromPage = ToWorker | { type: 'maiaPort'; port: MessagePort | null };
const scope = self as unknown as { postMessage(m: unknown): void; onmessage: ((e: MessageEvent<FromPage>) => void) | null };

// q_extension's MAIA_TIMEOUT_MS: the first answer may include loading the model.
const MAIA_TIMEOUT_MS = 30_000;
let port: MessagePort | null = null;
let nextId = 1;
const waiting = new Map<number, (moves: MaiaMove[] | null) => void>();

function setPort(p: MessagePort | null): void {
  for (const w of waiting.values()) w(null);
  waiting.clear();
  port?.close();
  port = p;
  if (!p) return;
  p.onmessage = (e: MessageEvent<FromMaia>) => {
    const m = e.data;
    if (m.type !== 'answer' && m.type !== 'error') return;
    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    w(m.type === 'answer' ? m.policy.map((x) => ({ san: x.san, prob: x.prob })) : null);
  };
}

function askMaia(fen: string, elo: number): Promise<MaiaMove[] | null> {
  const p = port;
  if (!p) return Promise.resolve(null);
  const id = nextId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiting.delete(id);
      resolve(null);
    }, MAIA_TIMEOUT_MS);
    waiting.set(id, (moves) => {
      clearTimeout(timer);
      resolve(moves);
    });
    p.postMessage({ type: 'ask', id, fen, elo });
  });
}

// A request that never settles would hold the explorer's single lane for good, and the panel would
// say "Asking…" from then on: an explorer or ChessDB answer not come in 30 s is given up (the panel
// then offers Retry). The game exports are left alone: a long one takes its time.
const TIMEOUT_MS = 30_000;
const timed = (url: string) => url.startsWith(EXPLORER_BASE) || url.startsWith(CHESSDB_URL);

const service = createExplorerService({
  http: (url, init) => fetch(url, timed(url) ? { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) } : init),
  cache: createExplorerCache(),
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  post: (m) => scope.postMessage(m),
  maia: askMaia,
});

scope.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'maiaPort') return setPort(m.port);
  service.handle(m);
};
