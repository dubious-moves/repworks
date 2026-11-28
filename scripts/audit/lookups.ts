// The Lichess explorer and ChessDB for the audit's tools (PLAN.md §5.219): the app's own clients
// (core/explorer/providers.ts: 16 explorer requests a minute, three ChessDB lookups in flight),
// over the folder scripts/practical.ts keeps its cache in, so an inventory, a screen and a
// Practical run share every answer. Offline, a position the cache doesn't hold is reported as
// missing, never read as "no games": a tool that counts must say what it could not see.
import { DEFAULT_PREFS } from '../../src/core/explorer/prefs.ts';
import { CHESSDB_URL, createProviders, EXPLORER_BASE, filterHash, TTL, type CompactExplorer, type ExplorerFilter, type Http, type ProviderStats } from '../../src/core/explorer/providers.ts';
import { LICHESS_RATE, OWN_BURST } from '../../src/core/explorer/limiter.ts';
import { fenKey, type ChessdbAnswer, type ChessdbLine } from '../../src/core/explorer/search.ts';
import { createFileCache, limiterFile } from '../practical-lib.ts';

/** The owner's filter: the app's default (blitz, rapid and classical; ratings 1600 to 2500). */
export const FILTER: ExplorerFilter = { speeds: [...DEFAULT_PREFS.speeds], ratings: [...DEFAULT_PREFS.ratings] };

export interface Lookups {
  /** The games at a position; undefined when it is not in the cache and nothing may be asked. */
  explorer(fen: string): Promise<CompactExplorer | undefined>;
  /** ChessDB's moves at a position; undefined as for the explorer. `fresh`: asked again whatever the cache holds (after an exploration, §5.220). */
  chessdb(fen: string, fresh?: boolean): Promise<ChessdbAnswer | undefined>;
  /** ChessDB's stored line from a position: its length in plies is how deep the best move's score is backed up from. */
  chessdbLine(fen: string, fresh?: boolean): Promise<ChessdbLine | undefined>;
  /** The positions that could not be read, by lookup. */
  missing(): { explorer: string[]; chessdb: string[] };
  stats(): ProviderStats;
  /** Keeps the limiter's state for the next run. */
  close(): void;
}

const TIMEOUT_MS = 30_000;
const nodeHttp: Http = (url, init) => {
  const timed = url.startsWith(EXPLORER_BASE) || url.startsWith(CHESSDB_URL);
  return fetch(url, timed ? { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) } : init) as unknown as ReturnType<Http>;
};

const DAY = 24 * 3600 * 1000;

/**
 * `cacheDir`: a scripts/practical.ts cache folder. `token`: the Lichess token, '' for none.
 * `offline`: ask nothing, answer from the cache alone. `http`: a fake, in tests. `explorerDays`:
 * how old an explorer answer may be for the audit's counts (the clients' own 30 days when not
 * given). Only reading is stretched: an answer is stamped with the time it was fetched, so
 * Practical reads it by its own rule and a ChessDB answer is never older than its seven days.
 */
export function createLookups(o: { cacheDir: string; token: string; offline?: boolean; http?: Http; now?: () => number; sleep?: (ms: number) => Promise<void>; explorerDays?: number }): Lookups {
  const now = o.now ?? Date.now;
  const file = createFileCache(o.cacheDir, now);
  const stretch = Math.max(0, (o.explorerDays ?? 0) * DAY - TTL.explorer);
  const cache: typeof file = { ...file, get: (store, key, ttl) => file.get(store, key, store === 'explorer' ? ttl + stretch : ttl) };
  const limiter = limiterFile(o.cacheDir);
  const stats: ProviderStats = {};
  const providers = createProviders({
    http: o.http ?? nodeHttp,
    cache,
    getToken: () => Promise.resolve(o.offline ? '' : o.token),
    now,
    sleep: o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    stats,
    ratePerMin: LICHESS_RATE,
    burst: OWN_BURST,
  });
  const saved = limiter.read();
  if (saved) providers.limiterRestore(saved);
  const missing = { explorer: new Set<string>(), chessdb: new Set<string>() };
  return {
    async explorer(fen) {
      if (o.offline) {
        // Straight from the cache, under the clients' own keys: nothing is queued behind the rate limit.
        const hit = (await cache.get('explorer', `${fenKey(fen)}#${filterHash(FILTER)}`, TTL.explorer)) as CompactExplorer | undefined;
        if (!hit) missing.explorer.add(fen);
        return hit;
      }
      try {
        return await providers.explorer(fen, FILTER);
      } catch (e) {
        if (!o.token && /no-token/.test(String((e as Error)?.message))) {
          missing.explorer.add(fen);
          return undefined;
        }
        throw e;
      }
    },
    async chessdb(fen, fresh) {
      if (o.offline) {
        const hit = (await cache.get('chessdb', fenKey(fen), TTL.chessdb)) as ChessdbAnswer | undefined;
        if (!hit) missing.chessdb.add(fen);
        return hit;
      }
      // maxAge 0: no cached answer is young enough, and the new one takes its place.
      return providers.chessdb(fen, undefined, undefined, fresh ? 0 : undefined);
    },
    async chessdbLine(fen, fresh) {
      if (o.offline) {
        const hit = (await cache.get('chessdb', `pv|${fenKey(fen)}`, TTL.chessdb)) as ChessdbLine | undefined;
        if (!hit) missing.chessdb.add(fen);
        return hit;
      }
      return providers.chessdbLine(fen, undefined, undefined, fresh ? 0 : undefined);
    },
    missing: () => ({ explorer: [...missing.explorer], chessdb: [...missing.chessdb] }),
    stats: () => stats,
    close: () => limiter.write(providers.limiterSnapshot()),
  };
}
