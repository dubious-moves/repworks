// The explorer's and ChessDB's answers kept between sessions (PLAN.md §5.219). A session's cache
// folder (scripts/practical.ts's: explorer.jsonl and chessdb.jsonl, one `{k, t, v}` record a line,
// appended as answers come in) is gone with its container, and a cold cache costs hours of explorer
// requests at 16 a minute. So the records live in a store in a repo for sessions (the testing data
// repo, the owner's choice of 2026-11-28): `audit-cache/<explorer|chessdb>/<0-f>.jsonl`, one record
// a key (the newest), sorted by key in sixteen files by the key's hash, so two sessions' additions
// merge as a union, a file stays far under GitHub's size limit, and a commit holds only what is
// new. `pull` adds the store's records to a cache folder; `push` adds a folder's to the store and
// drops what is too old to be read again.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const STORES = ['explorer', 'chessdb'] as const;
export type Store = (typeof STORES)[number];

/**
 * How long a record is kept: an explorer answer 90 days (the audit's own tools read one that old;
 * Practical asks again after 30), a ChessDB answer 7 (its clients ask again after that).
 */
export const KEEP_DAYS: Record<Store, number> = { explorer: 90, chessdb: 7 };
const DAY = 24 * 3600 * 1000;

export interface Rec {
  k: string;
  t: number;
  /** The record as written. */
  line: string;
}

/** The records of a file's text; a line that is no record (cut short by a stopped run) is skipped. */
export function records(text: string): Rec[] {
  const out: Rec[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    try {
      const r = JSON.parse(line) as { k?: unknown; t?: unknown };
      if (typeof r.k === 'string' && typeof r.t === 'number') out.push({ k: r.k, t: r.t, line });
    } catch {
      // not a record
    }
  }
  return out;
}

/** One record a key: the newest. */
export function newest(recs: Iterable<Rec>): Map<string, Rec> {
  const out = new Map<string, Rec>();
  for (const r of recs) {
    const had = out.get(r.k);
    if (!had || had.t < r.t) out.set(r.k, r);
  }
  return out;
}

export const shardOf = (key: string): string => createHash('sha1').update(key).digest('hex')[0]!;

function readStore(storeDir: string, store: Store): Rec[] {
  const dir = join(storeDir, store);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /^[0-9a-f]\.jsonl$/.test(f)).flatMap((f) => records(readFileSync(join(dir, f), 'utf8')));
}

function readCache(cacheDir: string, store: Store): Rec[] {
  const file = join(cacheDir, `${store}.jsonl`);
  return existsSync(file) ? records(readFileSync(file, 'utf8')) : [];
}

/** The store's records a cache folder lacks, or has older, appended to it. Returns how many, by store. */
export function pull(storeDir: string, cacheDir: string): Record<Store, number> {
  const added: Record<Store, number> = { explorer: 0, chessdb: 0 };
  mkdirSync(cacheDir, { recursive: true });
  for (const store of STORES) {
    const local = newest(readCache(cacheDir, store));
    const fresh = [...newest(readStore(storeDir, store)).values()].filter((r) => (local.get(r.k)?.t ?? -Infinity) < r.t);
    if (fresh.length) appendFileSync(join(cacheDir, `${store}.jsonl`), fresh.map((r) => `${r.line}\n`).join(''));
    added[store] = fresh.length;
  }
  return added;
}

export interface Pushed {
  /** Records in the store after the push. */
  kept: number;
  /** New keys, and keys with a newer answer. */
  added: number;
  /** Dropped as too old. */
  dropped: number;
}

/**
 * The store with the cache folders' records added: one record a key, the newest; records older
 * than the store keeps are dropped; every shard written sorted by key. Returns the counts by store.
 */
export function push(storeDir: string, cacheDirs: readonly string[], now: number): Record<Store, Pushed> {
  const out = {} as Record<Store, Pushed>;
  for (const store of STORES) {
    const before = newest(readStore(storeDir, store));
    const all = newest([...before.values(), ...cacheDirs.flatMap((d) => readCache(d, store))]);
    const keep = [...all.values()].filter((r) => now - r.t < KEEP_DAYS[store] * DAY);
    const dir = join(storeDir, store);
    mkdirSync(dir, { recursive: true });
    const shards = new Map<string, Rec[]>();
    for (const r of keep) shards.set(shardOf(r.k), [...(shards.get(shardOf(r.k)) ?? []), r]);
    for (const hex of '0123456789abcdef') {
      const file = join(dir, `${hex}.jsonl`);
      const recs = (shards.get(hex) ?? []).sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
      if (recs.length) writeFileSync(file, recs.map((r) => `${r.line}\n`).join(''));
      else rmSync(file, { force: true });
    }
    out[store] = { kept: keep.length, added: keep.filter((r) => (before.get(r.k)?.t ?? -Infinity) < r.t).length, dropped: all.size - keep.length };
  }
  return out;
}
