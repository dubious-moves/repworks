// The service worker: the app shell, precached per build, so the site starts offline.
//
// The build (vite.config.ts) prepends __PRECACHE__, every file it wrote (from the bundle and
// from public/), and __VERSION__, a hash of all of them, so any change to the site makes a new
// worker. Lessons carried over from mistake-lab and puzzle-explorer:
// - caches are named `repworks-*`, and only those are ever deleted: this origin is meant for
//   Repworks alone (D17), but nothing here may wipe a cache it doesn't own;
// - a response is cloned before it is handed back, never after.
//
// Strategy: the shell is served cache first, current version first, then the version before it,
// which stays until the next update so a page still running it keeps its files. Everything else
// goes to the network untouched; data from GitHub, Lichess and the rest is cached by the app in
// IndexedDB, not here.
//
// An install fetches every file of the new version (retrying each a few times) or fails as a
// whole, so a worker never activates with half a shell; the old one keeps serving meanwhile.
// Files that aren't content-hashed are fetched with `?__rev=<hash>`, which a stale CDN edge
// can't answer from an older deploy.

declare const self: ServiceWorkerGlobalScope;
declare const __PRECACHE__: readonly { url: string; rev: string | null }[];
declare const __VERSION__: string;

const SHELL_PREFIX = 'repworks-shell-';
const SHELL = SHELL_PREFIX + __VERSION__;
const KEEP_SHELLS = 2;
const ATTEMPTS = 3;

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const shells = (await caches.keys()).filter((k) => k.startsWith(SHELL_PREFIX));
      const older = shells.filter((k) => k !== SHELL);
      const keep = new Set([SHELL, ...older.slice(-(KEEP_SHELLS - 1))]);
      await Promise.all(shells.filter((k) => !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source?.postMessage({ version: __VERSION__ });
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  event.respondWith(respond(request, url, scope));
});

async function precache(): Promise<void> {
  const cache = await caches.open(SHELL);
  const failures: string[] = [];
  await Promise.all(
    __PRECACHE__.map(async ({ url, rev }) => {
      if (await cache.match(url)) return;
      const source = rev ? `${url}?__rev=${rev}` : url;
      for (let attempt = 1; ; attempt++) {
        try {
          const response = await fetch(source, { cache: 'reload' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          await cache.put(url, response);
          return;
        } catch (error) {
          if (attempt >= ATTEMPTS) {
            failures.push(`${url}: ${String(error)}`);
            return;
          }
        }
      }
    }),
  );
  if (failures.length) {
    await caches.delete(SHELL);
    throw new Error(`precache failed for ${failures.length} file(s): ${failures.join('; ')}`);
  }
}

async function respond(request: Request, url: URL, scope: URL): Promise<Response> {
  // The query and hash don't select a different file: routes live in the hash, and the
  // OAuth callback arrives as a query on the page itself.
  let path = url.pathname;
  if (request.mode === 'navigate' && path === scope.pathname) path += 'index.html';
  const current = await caches.open(SHELL);
  const hit = (await current.match(path)) ?? (await matchOlderShell(path));
  if (hit) return hit;
  return fetch(request);
}

async function matchOlderShell(path: string): Promise<Response | undefined> {
  const shells = (await caches.keys()).filter((k) => k.startsWith(SHELL_PREFIX) && k !== SHELL);
  for (const name of shells.reverse()) {
    const hit = await (await caches.open(name)).match(path);
    if (hit) return hit;
  }
  return undefined;
}
