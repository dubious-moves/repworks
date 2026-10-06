// The device's copy in IndexedDB (PLAN.md §4.9): the LocalStore port for the sync step, and the
// app's side of it (setup, edits to working copies, recorded events, reading the working view).
//
// Database `repworks`, version 1:
// - meta: device, remote (repo, branch, token), base, etag, recent, pending, counters,
//   lastSynced;
// - blobs: sha → text, every file of the base and of pending commits;
// - files: path → { text | null, rev }, the working copies that differ from the base;
// - log: n → { n, t, raw }, the device's own events not yet uploaded.
//
// Every method is one transaction, so another tab's edit lands either before or after it.
import { formatEvent, type KnownEvent } from '../core/progress/events.ts';
import type { Device, Finish, LocalEvent, LocalState, LocalStore, Overlay, OverlayEntry, PendingCommit, Snapshot, SyncBase } from '../core/sync/ports.ts';

export interface RemoteSettings {
  /** owner/name */
  repo: string;
  branch: string;
  token: string;
  /** How commits are written: GraphQL (one request) or REST (three). */
  write: 'graphql' | 'rest';
  /** Whether GitHub said the repo is private, at setup. */
  private?: boolean;
}

export interface DeviceRecord extends Device {
  created: string;
}

interface Counters {
  /** Raised by every edit to a working copy. */
  rev: number;
  /** The next event's n. */
  nextN: number;
  /** The next commit's sequence number. */
  seq: number;
  /** Own events up to this n are in the base. */
  uploadedThrough: number;
}

const NAME = 'repworks';
const VERSION = 1;
const STORES = ['meta', 'blobs', 'files', 'log'] as const;
type StoreName = (typeof STORES)[number];

const request = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

export function openDatabase(factory: IDBFactory = indexedDB, name = NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = factory.open(name, VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      for (const store of STORES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('the local database is open in an older version of the app in another tab: close it and reload'));
  });
}

export class IdbStore implements LocalStore {
  private readonly db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.db = db;
    // A newer version of the app wants to upgrade the schema: let it.
    db.onversionchange = () => db.close();
  }

  static async open(factory?: IDBFactory, name?: string): Promise<IdbStore> {
    return new IdbStore(await openDatabase(factory, name));
  }

  /** Runs `body` in one transaction and resolves once it has committed. */
  private async tx<T>(stores: readonly StoreName[], mode: IDBTransactionMode, body: (s: (name: StoreName) => IDBObjectStore) => Promise<T>): Promise<T> {
    const tx = this.db.transaction(stores, mode);
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('the local database transaction was aborted'));
    });
    let result: T;
    try {
      result = await body((name) => tx.objectStore(name));
    } catch (error) {
      done.catch(() => undefined);
      try {
        tx.abort();
      } catch {
        // already finished
      }
      throw error;
    }
    await done;
    return result;
  }

  private static async get<T>(meta: IDBObjectStore, key: string): Promise<T | undefined> {
    return (await request(meta.get(key))) as T | undefined;
  }

  private static async counters(meta: IDBObjectStore): Promise<Counters> {
    const c = await IdbStore.get<Counters>(meta, 'counters');
    if (!c) throw new Error('this device is not set up');
    return c;
  }

  // ---- setup -------------------------------------------------------------------------------

  async device(): Promise<DeviceRecord | undefined> {
    return this.tx(['meta'], 'readonly', (s) => IdbStore.get<DeviceRecord>(s('meta'), 'device'));
  }

  async remote(): Promise<RemoteSettings | undefined> {
    return this.tx(['meta'], 'readonly', (s) => IdbStore.get<RemoteSettings>(s('meta'), 'remote'));
  }

  /** Sets up this device: a new device record unless one exists, and the remote it syncs with. */
  async setUp(remote: RemoteSettings, device: DeviceRecord): Promise<DeviceRecord> {
    return this.tx(['meta'], 'readwrite', async (s) => {
      const meta = s('meta');
      const existing = await IdbStore.get<DeviceRecord>(meta, 'device');
      meta.put(remote, 'remote');
      if (existing) return existing;
      meta.put(device, 'device');
      meta.put({ rev: 0, nextN: 1, seq: 1, uploadedThrough: 0 } satisfies Counters, 'counters');
      return device;
    });
  }

  async setRemote(remote: RemoteSettings): Promise<void> {
    await this.tx(['meta'], 'readwrite', async (s) => void s('meta').put(remote, 'remote'));
  }

  /** Deletes everything local: working copies and unsent events included. */
  async wipe(): Promise<void> {
    await this.tx(STORES, 'readwrite', async (s) => {
      for (const name of STORES) s(name).clear();
    });
  }

  // ---- the app's side ----------------------------------------------------------------------

  /** Writes a working copy (null deletes the file). */
  async edit(path: string, text: string | null): Promise<void> {
    await this.editMany(new Map([[path, text]]));
  }

  /** Writes several working copies at once (a study rename touches every chapter). */
  async editMany(changes: ReadonlyMap<string, string | null>): Promise<void> {
    await this.tx(['meta', 'files'], 'readwrite', async (s) => {
      const meta = s('meta');
      const counters = await IdbStore.counters(meta);
      counters.rev++;
      for (const [path, text] of changes) s('files').put({ text, rev: counters.rev } satisfies OverlayEntry, path);
      meta.put(counters, 'counters');
    });
  }

  /** Appends an event to the device's log, numbering it; returns it as it will be uploaded. */
  async record(event: DistributiveOmit<KnownEvent, 'n' | 'v'>): Promise<LocalEvent> {
    return this.tx(['meta', 'log'], 'readwrite', async (s) => {
      const meta = s('meta');
      const counters = await IdbStore.counters(meta);
      const n = counters.nextN++;
      const line: LocalEvent = { n, t: event.t, raw: formatEvent({ ...event, v: 1, n } as KnownEvent) };
      s('log').put(line, n);
      meta.put(counters, 'counters');
      return line;
    });
  }

  /** The working view of the files `want` selects: path → text. */
  async read(want: (path: string) => boolean = () => true): Promise<Map<string, string>> {
    return this.tx(['meta', 'files', 'blobs'], 'readonly', async (s) => {
      const base = await IdbStore.get<SyncBase>(s('meta'), 'base');
      const overlay = await this.overlayOf(s('files'));
      const out = new Map<string, string>();
      const reads: Promise<void>[] = [];
      for (const [path, sha] of base?.files ?? []) {
        if (!want(path) || overlay.has(path)) continue;
        reads.push(request(s('blobs').get(sha)).then((text) => void (typeof text === 'string' && out.set(path, text))));
      }
      await Promise.all(reads);
      for (const [path, entry] of overlay) if (want(path) && entry.text !== null) out.set(path, entry.text);
      return new Map([...out].sort(([a], [b]) => (a < b ? -1 : 1)));
    });
  }

  /** Every path in the working view, without reading contents. */
  async paths(): Promise<string[]> {
    return this.tx(['meta', 'files'], 'readonly', async (s) => {
      const base = await IdbStore.get<SyncBase>(s('meta'), 'base');
      const overlay = await this.overlayOf(s('files'));
      const out = new Set(base?.files.keys() ?? []);
      for (const [path, entry] of overlay) {
        if (entry.text === null) out.delete(path);
        else out.add(path);
      }
      return [...out].sort();
    });
  }

  /** The device's own events not yet uploaded. */
  async unsentEvents(): Promise<LocalEvent[]> {
    return this.tx(['meta', 'log'], 'readonly', async (s) => {
      const counters = await IdbStore.counters(s('meta'));
      return (await request(s('log').getAll(IDBKeyRange.lowerBound(counters.uploadedThrough, true)))) as LocalEvent[];
    });
  }

  /** What is waiting to be pushed: working copies and events. */
  async waiting(): Promise<{ files: number; events: number }> {
    return this.tx(['meta', 'files', 'log'], 'readonly', async (s) => {
      const counters = await IdbStore.counters(s('meta'));
      const files = await request(s('files').count());
      const events = await request(s('log').count(IDBKeyRange.lowerBound(counters.uploadedThrough, true)));
      return { files, events };
    });
  }

  async lastSynced(): Promise<number | undefined> {
    return this.tx(['meta'], 'readonly', (s) => IdbStore.get<number>(s('meta'), 'lastSynced'));
  }

  async setLastSynced(ms: number): Promise<void> {
    await this.tx(['meta'], 'readwrite', async (s) => void s('meta').put(ms, 'lastSynced'));
  }

  // ---- the port ----------------------------------------------------------------------------

  async state(): Promise<LocalState> {
    return this.tx(['meta'], 'readonly', async (s) => {
      const meta = s('meta');
      const [device, base, etag, recent, pending, counters] = await Promise.all([
        IdbStore.get<DeviceRecord>(meta, 'device'),
        IdbStore.get<SyncBase>(meta, 'base'),
        IdbStore.get<string>(meta, 'etag'),
        IdbStore.get<string[]>(meta, 'recent'),
        IdbStore.get<PendingCommit[]>(meta, 'pending'),
        IdbStore.counters(meta),
      ]);
      if (!device) throw new Error('this device is not set up');
      return { device: { id: device.id, name: device.name }, base, etag, recent: recent ?? [], pending: pending ?? [], seq: counters.seq, uploadedThrough: counters.uploadedThrough };
    });
  }

  private async overlayOf(files: IDBObjectStore): Promise<Overlay> {
    const [keys, values] = await Promise.all([request(files.getAllKeys()), request(files.getAll())]);
    return new Map(keys.map((k, i) => [k as string, values[i] as OverlayEntry]));
  }

  async snapshot(): Promise<Snapshot> {
    return this.tx(['meta', 'files', 'log'], 'readonly', async (s) => {
      const counters = await IdbStore.counters(s('meta'));
      const overlay = await this.overlayOf(s('files'));
      const events = (await request(s('log').getAll(IDBKeyRange.lowerBound(counters.uploadedThrough, true)))) as LocalEvent[];
      return { rev: counters.rev, overlay, events };
    });
  }

  async blobs(shas: Iterable<string>): Promise<Map<string, string>> {
    return this.tx(['blobs'], 'readonly', async (s) => {
      const out = new Map<string, string>();
      await Promise.all([...new Set(shas)].map((sha) => request(s('blobs').get(sha)).then((text) => void (typeof text === 'string' && out.set(sha, text)))));
      return out;
    });
  }

  async missing(shas: Iterable<string>): Promise<string[]> {
    return this.tx(['blobs'], 'readonly', async (s) => {
      const held = new Set((await request(s('blobs').getAllKeys())) as string[]);
      return [...new Set(shas)].filter((sha) => !held.has(sha));
    });
  }

  async putBlobs(texts: ReadonlyMap<string, string>): Promise<void> {
    if (texts.size === 0) return;
    await this.tx(['blobs'], 'readwrite', async (s) => {
      for (const [sha, text] of texts) s('blobs').put(text, sha);
    });
  }

  async setEtag(etag: string): Promise<void> {
    await this.tx(['meta'], 'readwrite', async (s) => void s('meta').put(etag, 'etag'));
  }

  async addPending(pending: PendingCommit): Promise<void> {
    await this.tx(['meta'], 'readwrite', async (s) => {
      const meta = s('meta');
      const list = (await IdbStore.get<PendingCommit[]>(meta, 'pending')) ?? [];
      const counters = await IdbStore.counters(meta);
      counters.seq = Math.max(counters.seq, pending.seq + 1);
      meta.put([...list, pending], 'pending');
      meta.put(counters, 'counters');
    });
  }

  async dropPending(seq: number): Promise<void> {
    await this.tx(['meta', 'blobs'], 'readwrite', async (s) => {
      const meta = s('meta');
      const list = ((await IdbStore.get<PendingCommit[]>(meta, 'pending')) ?? []).filter((p) => p.seq !== seq);
      meta.put(list, 'pending');
      await IdbStore.sweep(s('blobs'), await IdbStore.get<SyncBase>(meta, 'base'), list);
    });
  }

  async finish(update: Finish): Promise<boolean> {
    return this.tx(['meta', 'files', 'log', 'blobs'], 'readwrite', async (s) => {
      const meta = s('meta');
      const counters = await IdbStore.counters(meta);
      if (counters.rev !== update.expectRev) return false;
      const old = await IdbStore.get<SyncBase>(meta, 'base');
      if (old && old.commit !== update.base.commit) {
        const recent = (await IdbStore.get<string[]>(meta, 'recent')) ?? [];
        meta.put([old.commit, ...recent.filter((c) => c !== old.commit)].slice(0, 10), 'recent');
      }
      meta.put(update.base, 'base');
      if (update.etag === undefined) meta.delete('etag');
      else meta.put(update.etag, 'etag');
      s('files').clear();
      for (const [path, entry] of update.overlay) s('files').put(entry, path);
      if (update.uploadedThrough !== undefined && update.uploadedThrough > counters.uploadedThrough) {
        s('log').delete(IDBKeyRange.upperBound(update.uploadedThrough));
        counters.uploadedThrough = update.uploadedThrough;
      }
      meta.put(counters, 'counters');
      const pending = update.clearPending ? [] : ((await IdbStore.get<PendingCommit[]>(meta, 'pending')) ?? []);
      meta.put(pending, 'pending');
      await IdbStore.sweep(s('blobs'), update.base, pending);
      return true;
    });
  }

  /** Deletes the blobs neither the base nor a pending commit refers to. */
  private static async sweep(blobs: IDBObjectStore, base: SyncBase | undefined, pending: readonly PendingCommit[]): Promise<void> {
    const keep = new Set<string>([...(base?.files.values() ?? []), ...pending.flatMap((p) => [...p.files.values()])]);
    for (const sha of (await request(blobs.getAllKeys())) as string[]) if (!keep.has(sha)) blobs.delete(sha);
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
