// The storm's positions shared between devices through the data repo (PLAN.md §5.102). Each
// device writes the positions it gathered itself to its own files (`storm/<dev>/…`, core/storm/
// shared.ts), as working copies the ordinary sync pushes; the other devices' files come down with
// the ordinary pull and are merged into this device's store when the storm's page is open. A file
// is read again only when its blob changed, so a page opened twice costs nothing the second time.
import { classifyPath, stormDir } from '../core/data/layout.ts';
import { parseSharedFile, sharedFiles } from '../core/storm/shared.ts';
import type { StoredPosition } from '../core/storm/harvest.ts';
import type { StormStore } from '../platform/stormStore.ts';
import { device, localStore, saveFiles, settings } from './state.ts';

/** How long changes to the positions (a deepening, Maia's ratings) wait before they are written out. */
const SOON_MS = 10 * 60 * 1000;

let importing: Promise<{ added: number; updated: number }> | undefined;

/**
 * The other devices' files whose blob changed since they were last read, merged into `store`.
 * `max` and `spare` are the store's cap and the cards to drop first (the done ones).
 */
export function importShared(store: StormStore, max: number, spare: ReadonlySet<string>): Promise<{ added: number; updated: number }> {
  return (importing ??= run().finally(() => (importing = undefined)));
  async function run() {
    const none = { added: 0, updated: 0 };
    const ls = localStore();
    const me = device.value?.id;
    if (!ls || !me) return none;
    const theirs = (path: string) => {
      const where = classifyPath(path);
      return where.kind === 'storm' && where.dev !== me;
    };
    const shas = await ls.baseShas(theirs);
    const seen = (await store.get<Record<string, string>>('meta', 'shared')) ?? {};
    const changed = new Set([...shas].filter(([path, sha]) => seen[path] !== sha).map(([path]) => path));
    const gone = Object.keys(seen).filter((path) => !shas.has(path));
    if (!changed.size && !gone.length) return none;
    const texts = await ls.read((path) => changed.has(path));
    const from: { dev: string; positions: StoredPosition[] }[] = [];
    for (const [path, text] of texts) {
      const where = classifyPath(path);
      if (where.kind === 'storm') from.push({ dev: where.dev, positions: parseSharedFile(text).positions });
    }
    const out = from.length ? await store.mergePositions(from, max, spare) : none;
    await store.put('meta', 'shared', Object.fromEntries([...shas].filter(([path]) => texts.has(path) || seen[path] === shas.get(path))));
    return out;
  }
}

let writing: Promise<boolean> | undefined;
let again = false;
let soon: ReturnType<typeof setTimeout> | undefined;

/**
 * This device's files written from what it gathered (positions with no `from`), those that
 * changed only; a file this version can't read in full is never rewritten (nor removed). True
 * when something was written. Nothing without a data repo.
 */
export function shareOwn(store: StormStore): Promise<boolean> {
  if (soon !== undefined) clearTimeout(soon);
  soon = undefined;
  if (writing) {
    again = true;
    return writing;
  }
  return (writing = run().finally(() => {
    writing = undefined;
    if (again) {
      again = false;
      void shareOwn(store);
    }
  }));
  async function run(): Promise<boolean> {
    const ls = localStore();
    const me = device.value?.id;
    if (!ls || !me || !settings.value) return false;
    const files = sharedFiles(await store.positions(), me);
    const current = await ls.read((path) => path.startsWith(stormDir(me)));
    const changes = new Map<string, string | null>();
    const readable = (path: string) => {
      const text = current.get(path);
      return text === undefined || parseSharedFile(text).unread === 0;
    };
    for (const [path, text] of files) if (current.get(path) !== text && readable(path)) changes.set(path, text);
    for (const path of current.keys()) if (!files.has(path) && classifyPath(path).kind === 'storm' && readable(path)) changes.set(path, null);
    if (!changes.size) return false;
    await saveFiles(changes);
    return true;
  }
}

/** The files written within `SOON_MS`, once: for changes that come many at a time (a deepening). */
export function shareSoon(store: StormStore): void {
  soon ??= setTimeout(() => {
    soon = undefined;
    void shareOwn(store);
  }, SOON_MS);
}
