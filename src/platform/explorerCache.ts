// The explorer's response cache (PLAN.md §5.22): IndexedDB with an in-memory LRU in front, apart
// from the study store so it can be cleared alone (D5: a cache, local only).
//
// Ported from q_extension `src/pe/cache.js` (createCache) at c26242f (github.com/skAeglund/
// q_extension, by the same owner), under this repo's GPL-3.0-or-later. Records are { k, t, v }:
// key, time stored, compact API response. Expiry is checked on read (the TTL belongs to the
// caller), so nothing needs sweeping. Database `repworks-explorer` instead of `qx-pe`.
import type { ExplorerCache } from '../core/explorer/providers.ts';

const DB_NAME = 'repworks-explorer';
const STORES = ['explorer', 'chessdb'] as const;
type Store = (typeof STORES)[number];
const LRU_MAX = 3000;

interface Record_ {
  k: string;
  t: number;
  v: unknown;
}

export function createExplorerCache(idb: IDBFactory | null = typeof indexedDB !== 'undefined' ? indexedDB : null, now: () => number = Date.now, name = DB_NAME): ExplorerCache {
  const lru = new Map<string, Record_>();
  let dbp: Promise<IDBDatabase | null> | null = null;

  function open(): Promise<IDBDatabase | null> {
    if (!idb) return Promise.resolve(null);
    if (dbp) return dbp;
    dbp = new Promise((resolve) => {
      let req: IDBOpenDBRequest;
      try {
        req = idb.open(name, 1);
      } catch {
        return resolve(null);
      }
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s, { keyPath: 'k' });
      };
      req.onsuccess = () => resolve(req.result);
      // A broken IndexedDB degrades to memory-only rather than failing searches.
      req.onerror = () => resolve(null);
    });
    return dbp;
  }

  function remember(id: string, rec: Record_) {
    lru.delete(id);
    lru.set(id, rec);
    if (lru.size > LRU_MAX) lru.delete(lru.keys().next().value!);
  }

  function get(store: Store, key: string, ttl: number): Promise<unknown> {
    const id = store + '|' + key;
    const t = now();
    const m = lru.get(id);
    if (m) {
      if (t - m.t < ttl) {
        remember(id, m);
        return Promise.resolve(m.v);
      }
      lru.delete(id);
    }
    return open().then((db) => {
      if (!db) return undefined;
      return new Promise((resolve) => {
        try {
          const r = db.transaction(store, 'readonly').objectStore(store).get(key);
          r.onsuccess = () => {
            const rec = r.result as Record_ | undefined;
            if (!rec || t - rec.t >= ttl) return resolve(undefined);
            remember(id, rec);
            resolve(rec.v);
          };
          r.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      });
    });
  }

  function put(store: Store, key: string, v: unknown): Promise<void> {
    const rec: Record_ = { k: key, t: now(), v };
    remember(store + '|' + key, rec);
    return open().then((db) => {
      if (!db) return;
      return new Promise<void>((resolve) => {
        try {
          const tx = db.transaction(store, 'readwrite');
          tx.objectStore(store).put(rec);
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
          tx.onabort = () => resolve();
        } catch {
          resolve();
        }
      });
    });
  }

  function count(): Promise<Record<string, number>> {
    return open().then((db) => {
      if (!db) return { explorer: 0, chessdb: 0 };
      return Promise.all(
        STORES.map(
          (s) =>
            new Promise<number>((resolve) => {
              const r = db.transaction(s, 'readonly').objectStore(s).count();
              r.onsuccess = () => resolve(r.result);
              r.onerror = () => resolve(0);
            }),
        ),
      ).then((n) => ({ explorer: n[0]!, chessdb: n[1]! }));
    });
  }

  return { get, put, count };
}
