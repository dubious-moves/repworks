// The storm's store on this device (PLAN.md §5.42, §5.47): gathered positions, and later the
// puzzles' candidates and bodies. IndexedDB `repworks-storm`, apart from the study store: the
// answers cross devices as progress events (§5.41), and the positions through each device's
// shared files (§5.102, app/stormShare.ts), merged in here.
import type { StoredPosition } from '../core/storm/harvest.ts';
import { mergeShared } from '../core/storm/shared.ts';

const DB_NAME = 'repworks-storm';
const STORES = ['positions', 'puzzleCandidates', 'puzzleBodies', 'meta'] as const;
export type StormStoreName = (typeof STORES)[number];

export interface StormStore {
  positions(): Promise<StoredPosition[]>;
  /**
   * Adds positions not stored yet (by card); keeps at most `max`, those in `spare` out first (the
   * done ones), then the oldest. Returns how many were new.
   */
  addPositions(list: readonly StoredPosition[], max: number, spare?: ReadonlySet<string>): Promise<number>;
  /**
   * Other devices' shared positions merged in, in one transaction (§5.102): one not kept comes in
   * unless it was cleared here since it was gathered (`cleared`: card → when); one kept takes a
   * better list and the Maia ratings it lacks. The cap as for `addPositions`.
   */
  mergePositions(from: readonly { dev: string; positions: readonly StoredPosition[] }[], max: number, spare?: ReadonlySet<string>): Promise<{ added: number; updated: number }>;
  putPosition(p: StoredPosition): Promise<void>;
  /**
   * Changes a stored position in one transaction, from what is stored now (the deepening and
   * Maia's ratings write different fields of the same positions); nothing when it is gone.
   */
  updatePosition(card: string, change: (p: StoredPosition) => StoredPosition): Promise<StoredPosition | undefined>;
  removePositions(cards: readonly string[]): Promise<void>;
  /** Cards cleared here at `at`: another device's copy gathered before then isn't merged back in. */
  noteCleared(cards: readonly string[], at: number): Promise<void>;
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

  /** The kept positions to drop for `over` too many: those in `spare` first, then the oldest. */
  const victims = (have: readonly StoredPosition[], over: number, spare: ReadonlySet<string> | undefined) =>
    over > 0 ? [...have].sort((a, b) => Number(!!spare?.has(b.card)) - Number(!!spare?.has(a.card)) || a.at - b.at).slice(0, over) : [];

  return {
    positions: () => all<StoredPosition>('positions'),
    async addPositions(list, max, spare) {
      const have = await all<StoredPosition>('positions');
      const known = new Set(have.map((p) => p.card));
      const fresh = list.filter((p, i) => !known.has(p.card) && list.findIndex((q) => q.card === p.card) === i);
      const db = await open();
      const tx = db.transaction('positions', 'readwrite');
      const os = tx.objectStore('positions');
      for (const p of fresh) os.put(p, p.card);
      for (const p of victims(have, have.length + fresh.length - max, spare)) os.delete(p.card);
      await done(tx);
      return fresh.length;
    },
    async mergePositions(from, max, spare) {
      const db = await open();
      const tx = db.transaction(['positions', 'meta'], 'readwrite');
      const os = tx.objectStore('positions');
      const read = <T>(req: IDBRequest): Promise<T> => new Promise((resolve, reject) => ((req.onsuccess = () => resolve(req.result as T)), (req.onerror = () => reject(req.error))));
      const [have, cleared] = await Promise.all([read<StoredPosition[]>(os.getAll()), read<Record<string, number> | undefined>(tx.objectStore('meta').get('cleared'))]);
      const byCard = new Map(have.map((p) => [p.card, p]));
      let added = 0;
      let updated = 0;
      for (const { dev, positions } of from) {
        for (const p of positions) {
          const local = byCard.get(p.card);
          if (!local && (cleared?.[p.card] ?? -1) >= p.at) continue;
          const next = mergeShared(local, p, dev);
          if (!next) continue;
          byCard.set(p.card, next);
          os.put(next, p.card);
          if (local) updated++;
          else added++;
        }
      }
      const before = new Set(have.map((p) => p.card));
      const fresh = new Set([...byCard.keys()].filter((c) => !before.has(c)));
      // What came in now is never what goes out to make room for it.
      const kept = [...byCard.values()];
      for (const p of victims(kept.filter((p) => !fresh.has(p.card)), kept.length - max, spare)) os.delete(p.card);
      await done(tx);
      return { added, updated };
    },
    putPosition: (p) => put('positions', p.card, p),
    async updatePosition(card, change) {
      const db = await open();
      const tx = db.transaction('positions', 'readwrite');
      const os = tx.objectStore('positions');
      let out: StoredPosition | undefined;
      const req = os.get(card);
      req.onsuccess = () => {
        const cur = req.result as StoredPosition | undefined;
        if (!cur) return;
        out = change(cur);
        os.put(out, card);
      };
      await done(tx);
      return out;
    },
    removePositions: (cards) => remove('positions', cards),
    async noteCleared(cards, at) {
      if (!cards.length) return;
      const db = await open();
      const tx = db.transaction('meta', 'readwrite');
      const os = tx.objectStore('meta');
      const req = os.get('cleared');
      req.onsuccess = () => {
        const cur = { ...((req.result as Record<string, number> | undefined) ?? {}) };
        for (const c of cards) cur[c] = at;
        // The newest 20,000 kept: an old tombstone only matters for a position gathered before it.
        const list = Object.entries(cur).sort((a, b) => b[1] - a[1]).slice(0, 20_000);
        os.put(Object.fromEntries(list), 'cleared');
      };
      await done(tx);
    },
    clearPositions: () => clear('positions'),
    all,
    put,
    get,
    remove,
    clear,
  };
}
