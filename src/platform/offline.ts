// Offline mode (PLAN.md §5.203): a per-device switch under which the app sends nothing over the
// network. The page's fetch refuses every request that would leave the site, the service worker
// answers the site's own files from its caches only (a file it lacks fails, as with no network), the
// explorer's worker is told, and the sync loop pauses with its changes kept for later.
//
// Kept in localStorage, read once at the start before any request, and copied into the service
// worker's flags cache (`repworks-flags`, beside `isolate`), which the worker reads.

const KEY = 'repworks-offline';
const FLAGS = 'repworks-flags';

/** What a request refused by offline mode throws: a TypeError, as fetch throws with no network. */
export class OfflineModeError extends TypeError {
  constructor() {
    super('Offline mode is on: nothing is sent over the network');
    this.name = 'OfflineModeError';
  }
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let on = typeof localStorage === 'undefined' ? false : read();
const listeners = new Set<(on: boolean) => void>();

// Switched in another tab: this one follows.
if (typeof addEventListener === 'function' && typeof localStorage !== 'undefined') {
  addEventListener('storage', (e: StorageEvent) => {
    if (e.key !== KEY && e.key !== null) return;
    const next = read();
    if (next === on) return;
    on = next;
    for (const l of [...listeners]) l(on);
  });
}

export const offlineMode = (): boolean => on;

/** Whether a request may go out: offline mode off and the browser not offline. */
export const networkUp = (): boolean => !on && (typeof navigator === 'undefined' || navigator.onLine !== false);

/** Called with the new value whenever offline mode is switched; returns the unsubscribe. */
export function onOfflineMode(listener: (on: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function setOfflineMode(next: boolean): Promise<void> {
  if (next === on) return;
  on = next;
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // Storage refused: the switch holds for this page.
  }
  // The service worker is told before anything else may ask it for a file.
  await tellServiceWorker();
  for (const l of [...listeners]) l(on);
}

/** Copies the switch into the service worker's flags cache, and tells the worker to read it again. */
export async function tellServiceWorker(): Promise<void> {
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(FLAGS);
      if (on) await cache.put('offline', new Response('1'));
      else await cache.delete('offline');
    }
  } catch {
    // No Cache Storage (an insecure origin): there is no service worker either.
  }
  navigator.serviceWorker?.controller?.postMessage('offline');
}

/** Whether `url` (as fetch takes it) leaves `origin`. */
export function leaves(input: RequestInfo | URL, origin: string): boolean {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  try {
    return new URL(href, origin).origin !== origin;
  } catch {
    return true;
  }
}

let guarded = false;

/**
 * Wraps the page's fetch, once: while offline mode is on, a request to another origin is refused at
 * once with an OfflineModeError. The site's own files go on to the service worker, which serves them
 * from its caches. Installed before anything else runs (src/app/main.ts), and every module calls
 * the global fetch when it asks, so none slips past.
 */
export function guardFetch(): void {
  if (guarded || typeof globalThis.fetch !== 'function') return;
  guarded = true;
  const original = globalThis.fetch.bind(globalThis);
  const origin = globalThis.location?.origin ?? '';
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => (on && leaves(input, origin) ? Promise.reject(new OfflineModeError()) : original(input, init));
}
