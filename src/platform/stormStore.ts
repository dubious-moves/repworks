// The storm's store on this device (PLAN.md §5.42, §5.47): gathered positions, and later the
// puzzles' candidates and bodies. IndexedDB `repworks-storm`, apart from the study store, since
// it is the cache tier of D5: third parties' answers, rebuilt anywhere, never synced. What crosses
// devices is the answers, as progress events (§5.41).
import type { StoredPosition } from '../core/storm/harvest.ts';

const DB_NAME = 'repworks-storm';
const STORES = ['positions', 'puzzleCandidates', 'puzzleBodies', 'meta'] as const;
export type StormStoreName = (typeof STORES)[number];

export interface StormStore {
  positions(): Promise<StoredPosition[]>;
  /** Adds positions not stored yet (by card); keeps at most `max`, the oldest out. Returns how many were new. */
  addPositions(list: readonly StoredPosition[], max: number): Promise<number>;
  putPosition(p: StoredPosition): Promise<void>;
  removePositions(cards: readonly string[]): Promise<void>;
  clearPositions(): Promise<void>;
  all<T>(store: StormStoreName): Promise<T[]>;
  put<T>(store: StormStoreName, key: string, value: T): Promise<void>;
  get<T>(store: StormStoreName, key: string): Promise<T | undefined>;
  remove(store: StormStoreName, keys: readonly string[]): Promise<void>;
  clear(store: StormStoreName): Promise<void>;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function openStormStore(idb: IDBFactory = indexedDB, name = DB_NAME): StormStore {
  let dbp: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> =>
    (dbp ??= new Promise((resolve, reject) => {
      const req = idb.open(name, 1);
      req.onupgradeneeded = () => {
        for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }));

  async function all<T>(store: StormStoreName): Promise<T[]> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store).objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  }
  async function get<T>(store: StormStoreName, key: string): Promise<T | undefined> {
    const db = await open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(store).objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result as T | undefined);
      req.onerror = () => reject(req.error);
    });
  }
  async function put<T>(store: StormStoreName, key: string, value: T): Promise<void> {
    const db = await open();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    return done(tx);
  }
  async function remove(store: StormStoreName, keys: readonly string[]): Promise<void> {
    if (!keys.length) return;
    const db = await open();
    const tx = db.transaction(store, 'readwrite');
    for (const k of keys) tx.objectStore(store).delete(k);
    return done(tx);
  }
  async function clear(store: StormStoreName): Promise<void> {
    const db = await open();
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    return done(tx);
  }

  return {
    positions: () => all<StoredPosition>('positions'),
    async addPositions(list, max) {
      const have = await all<StoredPosition>('positions');
      const known = new Set(have.map((p) => p.card));
      const fresh = list.filter((p, i) => !known.has(p.card) && list.findIndex((q) => q.card === p.card) === i);
      const db = await open();
      const tx = db.transaction('positions', 'readwrite');
      const os = tx.objectStore('positions');
      for (const p of fresh) os.put(p, p.card);
      const over = have.length + fresh.length - max;
      if (over > 0) for (const p of [...have].sort((a, b) => a.at - b.at).slice(0, over)) os.delete(p.card);
      await done(tx);
      return fresh.length;
    },
    putPosition: (p) => put('positions', p.card, p),
    removePositions: (cards) => remove('positions', cards),
    clearPositions: () => clear('positions'),
    all,
    put,
    get,
    remove,
    clear,
  };
}
