// The games on this device (PLAN.md §5.51): IndexedDB `repworks-games`, apart from the study store,
// since games are D5's derived tier, rebuilt from their source (the Gist, Lichess). What crosses
// devices is what is done with them, as progress events.
import type { GameRecord } from '../core/games/record.ts';

const DB_NAME = 'repworks-games';

/** A game kept, and where it came from: the analyzer's record replaces the page's own export. */
export interface StoredGame {
  game: GameRecord;
  source: 'gist' | 'lichess' | 'chesscom';
}

export interface GamesStore {
  games(): Promise<StoredGame[]>;
  /** Stores games, an analyzer's (`gist`) record never replaced by a page's export. Returns how many were new or changed. */
  putGames(list: readonly StoredGame[]): Promise<number>;
  clear(): Promise<void>;
  meta<T>(key: string): Promise<T | undefined>;
  setMeta<T>(key: string, value: T): Promise<void>;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const req = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export function openGamesStore(idb: IDBFactory = indexedDB, name = DB_NAME): GamesStore {
  let dbp: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> =>
    (dbp ??= new Promise((resolve, reject) => {
      const r = idb.open(name, 1);
      r.onupgradeneeded = () => {
        for (const s of ['games', 'meta']) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s);
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }));
  return {
    async games() {
      const db = await open();
      return req(db.transaction('games').objectStore('games').getAll() as IDBRequest<StoredGame[]>);
    },
    async putGames(list) {
      const db = await open();
      const tx = db.transaction('games', 'readwrite');
      const store = tx.objectStore('games');
      let changed = 0;
      for (const g of list) {
        const before = (await req(store.get(g.game.id))) as StoredGame | undefined;
        if (before && before.source === 'gist' && g.source !== 'gist') continue;
        if (before && JSON.stringify(before) === JSON.stringify(g)) continue;
        store.put(g, g.game.id);
        changed++;
      }
      await done(tx);
      return changed;
    },
    async clear() {
      const db = await open();
      const tx = db.transaction(['games', 'meta'], 'readwrite');
      tx.objectStore('games').clear();
      tx.objectStore('meta').clear();
      await done(tx);
    },
    async meta<T>(key: string) {
      const db = await open();
      return req(db.transaction('meta').objectStore('meta').get(key)) as Promise<T | undefined>;
    },
    async setMeta<T>(key: string, value: T) {
      const db = await open();
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put(value, key);
      await done(tx);
    },
  };
}
