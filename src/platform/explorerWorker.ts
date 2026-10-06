// The explorer worker (PLAN.md §5.22): a module worker per tab, owning every Lichess explorer and
// ChessDB request of the tab. Its logic is core's (src/core/explorer/service.ts); this wires it to
// fetch, the IndexedDB cache, the clock and the page.
import { createExplorerService, type ToWorker } from '../core/explorer/service.ts';
import { createExplorerCache } from './explorerCache.ts';

const scope = self as unknown as { postMessage(m: unknown): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null };

const service = createExplorerService({
  http: (url, init) => fetch(url, init),
  cache: createExplorerCache(),
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  post: (m) => scope.postMessage(m),
});

scope.onmessage = (e) => service.handle(e.data);
