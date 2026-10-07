// Practical eval: the Lichess explorer and ChessDB clients (PLAN.md §5.21).
//
// Ported from q_extension `src/pe/providers.js` and `src/pe/cache.js` (createMemoryCache) at
// c26242f (github.com/skAeglund/q_extension, by the same owner), behaviour unchanged, under this
// repo's GPL-3.0-or-later. Changes: HTTP, the clock and `sleep` are inputs with no default (core
// reads no clock and does no fetch), and the explorer also takes Lichess's masters database
// (§5.23), which has no speed or rating filter and is never the local explorer's.
//
// Politeness rules:
//   - Lichess explorer: one request in flight, a token bucket of `ratePerMin` (burst `burst`),
//     and a 60 s pause of every queued call on HTTP 429.
//   - ChessDB: at most CDB_IN_FLIGHT requests in flight, lookups and analysis requests together,
//     the Lichess search's lookups first, and a CDB_PAUSE_MS pause of the lane on HTTP 429. A
//     position or move is asked to be analysed at most once a day.
//   - Waiting explorer calls go highest priority first (the search's reach), and each root
//     position has a request budget (see explorer()).
//   - A cache hit costs nothing: no token, no budget, no queue slot.

import { BudgetOut, Cancelled, createLimiter, createRateLimiter, HttpError, type LimiterSnapshot, type Now, type Sleep } from './limiter.ts';
import { fenKey, type ChessdbAnswer, type ExplorerAnswer, type PeError } from './search.ts';
import type { Budget, CacheCounts } from './rounds.ts';

export const EXPLORER_BASE = 'https://explorer.lichess.org';
export const EXPLORER_URL = EXPLORER_BASE + '/lichess';
export const CHESSDB_URL = 'https://www.chessdb.cn/cdb.php';
/**
 * Games by id, as PGN (§5.42): a simple request only. Lichess answers it with
 * `Access-Control-Allow-Origin: *`, but `/game/export`'s preflight answers 404, so no token or
 * non-safelisted header may go with these (checked live, 2026-10-06; PLAN.md §5.42).
 */
export const GAMES_EXPORT_URL = 'https://lichess.org/api/games/export/_ids?moves=true&tags=true&clocks=false&evals=false&opening=false&literate=false';
export const MASTERS_PGN_URL = EXPLORER_BASE + '/masters/pgn/';
/** At most this many ids in one export (Lichess's limit is 300). */
export const GAMES_EXPORT_MAX = 300;
const GAMES_PAUSE_MS = 60000;
const CDB_RETRIES = 2; // a lookup that fails on the network is tried twice more,
const CDB_RETRY_MS = 1500; // after 1.5 s and then 3 s

/*
 * With a local explorer, ChessDB is what a search waits on: one lookup per position, about 340 ms
 * each. Two in flight managed about 210 a minute. 150 lookups at 3 in flight (450 a minute) went
 * through without an error on 2026-09-28, so 3. ChessDB is a free service, so not more: if it ever
 * answers 429, the whole lane waits CDB_PAUSE_MS before its next request, and the refused lookup
 * is tried again after that.
 */
export const CDB_IN_FLIGHT = 3;
export const CDB_PAUSE_MS = 30000;

const DAY = 24 * 3600 * 1000;
export const TTL = {
  explorer: 30 * DAY,
  chessdb: 7 * DAY,
  chessdbUnknown: 1 * DAY, // ChessDB learns positions; ask again sooner
  analyse: 1 * DAY, // don't ask ChessDB to analyse the same thing twice a day
  // After asking, look the position up again once this has passed: a queued position had evals
  // about 65 s later when measured (2026-09-25). Still unknown then, it is looked up again at this
  // interval for `recheckFor`, whenever a search needs it.
  recheck: 2 * 60 * 1000,
  recheckFor: 60 * 60 * 1000,
};

/** The response the clients read: what `fetch`'s Response has, and a fake's. */
export interface HttpResponse {
  status: number;
  ok: boolean;
  json(): Promise<unknown>;
  /** The body as text (the game exports' PGN). */
  text?(): Promise<string>;
  headers?: { forEach(callback: (value: string, key: string) => void): void };
}

export type Http = (url: string, init?: { headers?: Record<string, string>; cache?: 'no-store'; method?: 'GET' | 'POST'; body?: string }) => Promise<HttpResponse>;

/** Records are kept with the time they were stored; expiry is checked on read (the TTL is the caller's). */
export interface ExplorerCache {
  get(store: 'explorer' | 'chessdb', key: string, ttl: number): Promise<unknown>;
  put(store: 'explorer' | 'chessdb', key: string, value: unknown): Promise<void>;
  count?(): Promise<Record<string, number>>;
}

/** Which of Lichess's databases: its players' games (the filter applies) or the masters'. */
export type ExplorerDb = 'lichess' | 'masters';

export interface ExplorerFilter {
  speeds?: string[];
  ratings?: number[];
  /** `YYYY-MM`: games from then on. */
  since?: string;
  db?: ExplorerDb;
  /** Also name this many top and recent games (the storm's walks, §5.42); never the local explorer's. */
  games?: number;
}

export function filterHash(f: ExplorerFilter | undefined): string {
  const g = f || {};
  const parts = [
    (g.speeds || []).slice().sort().join(','),
    (g.ratings || [])
      .slice()
      .sort((a, b) => a - b)
      .join(','),
    g.since || '',
  ];
  // Masters answers are another database's: their own key. Lichess's keep q_extension's.
  const games = g.games ? '|g' + g.games : '';
  if (g.db === 'masters') return 'masters' + games;
  return parts.join('|') + games;
}

// `base` is the explorer to ask: Lichess's unless a local one (localExplorerUrl) is given.
export function explorerUrl(fen: string, f: ExplorerFilter, base?: string): string {
  if (f.db === 'masters' && !base) {
    return EXPLORER_BASE + '/masters?fen=' + encodeURIComponent(fenKey(fen)) + '&moves=30&topGames=' + (f.games || 0);
  }
  const n = f.games || 0;
  let q = 'variant=standard&fen=' + encodeURIComponent(fenKey(fen)) + '&speeds=' + (f.speeds || []).join(',') + '&ratings=' + (f.ratings || []).join(',') + '&moves=30&topGames=' + n + '&recentGames=' + n;
  if (f.since) q += '&since=' + f.since;
  return (base || EXPLORER_URL) + '?' + q;
}

/*
 * A local explorer (q_extension's tools/explorerdb.mjs serve) answers the same queries at
 * <address>/lichess and says which index it serves at <address>/info. The address is what the
 * user typed, e.g. "http://localhost:9337"; '' means none.
 */
export function localAddress(a: string | undefined): string {
  let s = String(a || '')
    .trim()
    .replace(/\/+$/, '');
  if (s && !/^https?:\/\//i.test(s)) s = 'http://' + s;
  return s;
}
export function localExplorerUrl(fen: string, f: ExplorerFilter, address: string): string {
  return explorerUrl(fen, f, localAddress(address) + '/lichess');
}

export interface LocalInfo {
  id: string;
  filter: unknown;
  [key: string]: unknown;
}

// What the local explorer at `address` serves (its /info), or an error saying why not.
export function localInfo(http: Http, address: string): Promise<LocalInfo> {
  const at = localAddress(address);
  if (!at) return Promise.reject(HttpError(0, 'no address'));
  return Promise.resolve()
    .then(() => http(at + '/info', { cache: 'no-store' }))
    .catch((e: unknown) => {
      throw HttpError(0, 'nothing answers at ' + at + ' (' + ((e as Error)?.message || e) + ')');
    })
    .then((res) => {
      if (!res.ok) throw HttpError(res.status, at + ' answered HTTP ' + res.status);
      return res.json().catch(() => null);
    })
    .then((j) => {
      const info = j as LocalInfo | null;
      if (!info || !info.id || !info.filter) throw HttpError(0, at + ' is not a local explorer (tools/explorerdb.mjs serve)');
      return info;
    });
}

interface RawExplorer {
  white?: number;
  draws?: number;
  black?: number;
  moves?: { uci: string; san: string; white?: number; draws?: number; black?: number; averageRating?: number }[];
}

export type CompactExplorer = Required<Pick<ExplorerAnswer, 'total' | 'white' | 'draws' | 'black'>> & {
  moves: (ExplorerAnswer['moves'][number] & { rating?: number })[];
  /** The ids of the games named (top games, then recent ones), when asked for. */
  gameIds?: string[];
};

// Only what the search needs: the counts per move and for the position also feed the prepared
// score (search.ts). The panel also shows a move's average rating (§5.23), so it is kept when the
// answer has one.
export function compactExplorer(json: unknown): CompactExplorer {
  const j = (json || {}) as RawExplorer & { topGames?: { id?: unknown }[]; recentGames?: { id?: unknown }[] };
  const total = (j.white || 0) + (j.draws || 0) + (j.black || 0);
  const named = [...(j.topGames || []), ...(j.recentGames || [])].map((g) => g?.id).filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9]{8}$/.test(id));
  const out: CompactExplorer = {
    total,
    white: j.white || 0,
    draws: j.draws || 0,
    black: j.black || 0,
    moves: (j.moves || []).map((m) => {
      const out: CompactExplorer['moves'][number] = {
        uci: m.uci,
        san: m.san,
        white: m.white || 0,
        draws: m.draws || 0,
        black: m.black || 0,
        games: (m.white || 0) + (m.draws || 0) + (m.black || 0),
      };
      if (typeof m.averageRating === 'number') out.rating = m.averageRating;
      return out;
    }),
  };
  if (j.topGames || j.recentGames) out.gameIds = [...new Set(named)];
  return out;
}

export function compactChessdb(json: unknown): ChessdbAnswer & { moves: NonNullable<ChessdbAnswer['moves']> } {
  const j = (json || {}) as { status?: string; moves?: { uci: string; san: string; score: unknown }[] };
  return {
    status: j.status || 'unknown',
    moves: (j.moves || []).map((m) => ({ uci: m.uci, san: m.san, score: Number(m.score) })),
  };
}

export interface ProviderStats {
  explorerRequests?: number;
  explorer429?: number;
  chessdbRequests?: number;
  chessdb429?: number;
  chessdbAnalyse?: number;
  localRequests?: number;
  rateHeaders?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * ctx (optional) = { priority, budget: { limit, spent }, exempt, counts }
 *   priority  higher is fetched first (the search passes the mass a node explains)
 *   budget    uncached requests allowed for one root position, shared by its rows; charged when
 *             a request is queued, refunded if it is dropped as stale
 *   exempt    charged but never refused - the first iteration, so every row gets a value
 *   counts    { hits, misses }, bumped per call, so the caller can tell how much of its work the
 *             cache is carrying
 * A cache hit, or joining a request already in flight, costs nothing.
 */
export interface ExplorerContext {
  priority?: number;
  budget?: Budget;
  exempt?: boolean;
  counts?: CacheCounts;
}

export interface ProvidersOptions {
  http: Http;
  cache: ExplorerCache;
  /** The token, or '' for none. */
  getToken(): Promise<string>;
  now: Now;
  sleep: Sleep;
  stats?: ProviderStats;
  ratePerMin?: number;
  burst?: number;
  /** The address of a local explorer, or a function returning it (it can change); '' for Lichess. */
  localExplorer?: string | (() => string);
}

export interface Providers {
  explorer(fen: string, filter: ExplorerFilter, isStale?: () => boolean, ctx?: ExplorerContext): Promise<CompactExplorer>;
  /** Games by Lichess id as one PGN text: one export at a time, no token (§5.42). */
  games(ids: readonly string[]): Promise<string>;
  /** A masters game's PGN. */
  mastersGame(id: string): Promise<string>;
  chessdb(fen: string, isStale?: () => boolean, priority?: number): Promise<ChessdbAnswer>;
  analyse(fen: string, uci?: string | null): Promise<boolean>;
  testToken(token: string): Promise<{ ok: boolean; status: number }>;
  localInfo(address: string): Promise<LocalInfo>;
  pausedFor(): number;
  sweep(): void;
  queued(): number;
  setRate(r: number): void;
  setBurst(b: number): void;
  limiterSnapshot(): LimiterSnapshot;
  limiterRestore(s: Partial<LimiterSnapshot> | null | undefined): void;
}

type Joined<T> = Promise<T> & { job?: { priority: number } | null };

export function createProviders(o: ProvidersOptions): Providers {
  const stats = o.stats || {};
  const lichess = createRateLimiter({ now: o.now, sleep: o.sleep, ratePerMin: o.ratePerMin, burst: o.burst });
  const cdbLane = createLimiter(CDB_IN_FLIGHT);
  const sleep = o.sleep;
  let cdbPausedUntil = 0;
  const bump = (k: keyof ProviderStats) => {
    stats[k] = ((stats[k] as number | undefined) || 0) + 1;
  };

  // A ChessDB request waits out a 429 pause in its lane slot, so nothing else goes out either until
  // the pause is over.
  function cdbFetch(url: string): Promise<HttpResponse> {
    const wait = cdbPausedUntil - now();
    return (wait > 0 ? sleep(wait) : Promise.resolve())
      .then(() => o.http(url))
      .then((res) => {
        if (res.status === 429) {
          bump('chessdb429');
          cdbPausedUntil = now() + CDB_PAUSE_MS;
        }
        return res;
      });
  }
  const inflight = new Map<string, Joined<unknown>>(); // identical concurrent requests share one fetch
  const asking = new Map<string, Promise<boolean>>(); // analysis requests on their way

  function once<T>(key: string, make: () => Joined<T>): Joined<T> {
    const hit = inflight.get(key);
    if (hit) return hit as Joined<T>;
    const p = make();
    inflight.set(key, p);
    const clear = () => {
      inflight.delete(key);
    };
    p.then(clear, clear);
    return p;
  }

  function explorer(fen: string, filter: ExplorerFilter, isStale?: () => boolean, context?: ExplorerContext): Promise<CompactExplorer> {
    const ctx = context || {};
    // Masters is Lichess's even with a local explorer: the local index is a month of Lichess games.
    const local = filter.db === 'masters' || filter.games ? '' : localAddress(typeof o.localExplorer === 'function' ? o.localExplorer() : o.localExplorer);
    if (local) return localExplorer(local, fen, filter, ctx);
    const key = fenKey(fen) + '#' + filterHash(filter);
    const counts = ctx.counts || {};
    return o.cache.get('explorer', key, TTL.explorer).then((hit) => {
      if (hit || inflight.has('x' + key)) {
        counts.hits = (counts.hits || 0) + 1;
        return (hit as CompactExplorer) || (inflight.get('x' + key) as Promise<CompactExplorer>);
      }
      counts.misses = (counts.misses || 0) + 1;
      const budget = ctx.budget;
      if (budget) {
        if (!ctx.exempt && budget.spent >= budget.limit) throw BudgetOut();
        budget.spent++;
      }
      const p = once<CompactExplorer>('x' + key, function attempt(): Promise<CompactExplorer> {
        return lichess
          .schedule(
            () =>
              o
                .getToken()
                .then((token) => {
                  if (!token) throw HttpError(0, 'no-token');
                  bump('explorerRequests');
                  return o.http(explorerUrl(fen, filter), { headers: { Authorization: 'Bearer ' + token } });
                })
                .then((res) => {
                  noteRateHeaders(res);
                  if (res.status === 429) {
                    bump('explorer429');
                    lichess.pause(60000);
                    const e = HttpError(429);
                    e.retry = true;
                    throw e;
                  }
                  if (!res.ok) throw HttpError(res.status);
                  return res.json().then((j) => {
                    const v = compactExplorer(j);
                    return o.cache.put('explorer', key, v).then(() => v);
                  });
                }),
            isStale,
            ctx.priority,
          )
          .catch((e: PeError) => {
            // Re-queued only after this job has left the lane, so the retry waits out the pause
            // like everything else instead of deadlocking on itself.
            if (e && e.retry) return attempt();
            throw e;
          });
      });
      if (budget) {
        p.catch((e: PeError) => {
          if (e && e.cancelled) budget.spent--;
        });
      }
      return p;
    });
  }

  /*
   * The local explorer is asked directly: no token, no rate limit, no budget, since none of them
   * protect anything on your own machine. Its answers aren't cached either. The server answers in a
   * millisecond or two, and a cache would mix one index's counts with Lichess's under the same
   * key. For the budget estimate in rounds.ts an answer counts as a cache hit, since it costs no
   * Lichess request.
   */
  function localExplorer(address: string, fen: string, filter: ExplorerFilter, ctx: ExplorerContext): Promise<CompactExplorer> {
    const counts = ctx.counts || {};
    counts.hits = (counts.hits || 0) + 1;
    const url = localExplorerUrl(fen, filter, address);
    return once<CompactExplorer>('l' + url, () => {
      bump('localRequests');
      return Promise.resolve()
        .then(() => o.http(url))
        .catch((e: unknown) => {
          throw HttpError(0, 'local explorer not answering at ' + address + ' (' + ((e as Error)?.message || e) + ')');
        })
        .then((res) => {
          if (!res.ok) throw HttpError(res.status, 'local explorer');
          return res.json();
        })
        .then(compactExplorer);
    });
  }

  // Recorded so the settings can show what Lichess says about its limit.
  function noteRateHeaders(res: HttpResponse) {
    if (!res || !res.headers || !res.headers.forEach) return;
    const seen: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      if (/rate|retry/i.test(k)) seen[k] = v;
    });
    if (Object.keys(seen).length) stats.rateHeaders = seen;
  }

  function now() {
    return o.now();
  }

  // priority: among lookups waiting for the lane, higher goes first (createLimiter).
  function chessdb(fen: string, isStale?: () => boolean, priority?: number): Promise<ChessdbAnswer> {
    const key = fenKey(fen);
    return Promise.all([o.cache.get('chessdb', key, TTL.chessdb), o.cache.get('chessdb', 'ask|' + key, TTL.analyse)]).then((r) => {
      const hit = r[0] as (ChessdbAnswer & { t: number }) | undefined;
      const ask = r[1] as { t: number } | undefined;
      // Asked to analyse it: look again once ChessDB has had time to, so a later round or search
      // sees the new evals. A known position (a move was asked for) is looked up once more; an
      // unknown one until it is known, for a while.
      const asked = hit && ask && now() - Math.max(hit.t || 0, ask.t) >= TTL.recheck && (hit.status === 'ok' ? ask.t >= (hit.t || 0) : now() - ask.t < TTL.recheckFor);
      if (hit && !asked && (hit.status === 'ok' || now() - hit.t < TTL.chessdbUnknown)) return hit;
      const joined = inflight.get('c' + key);
      if (joined && joined.job && (priority || 0) > joined.job.priority) joined.job.priority = priority!;
      return once<ChessdbAnswer>('c' + key, () => {
        const out: { job: { priority: number } | null } = { job: null };
        function attempt(tries: number): Promise<ChessdbAnswer> {
          const p = cdbLane(
            () => {
              bump('chessdbRequests');
              const url = CHESSDB_URL + '?action=queryall&json=1&board=' + encodeURIComponent(fen);
              return cdbFetch(url)
                .then((res) => {
                  if (!res.ok) throw HttpError(res.status);
                  return res.json();
                })
                .then((j) => {
                  const v: ChessdbAnswer = compactChessdb(j);
                  v.t = now();
                  return o.cache.put('chessdb', key, v).then(() => v);
                });
            },
            isStale,
            out.job ? out.job.priority : priority,
          );
          out.job = p.job;
          return p.catch((e: PeError) => {
            if (!cdbRetryable(e) || tries >= CDB_RETRIES || (isStale && isStale())) throw e;
            return sleep(CDB_RETRY_MS * (tries + 1)).then(() => attempt(tries + 1));
          });
        }
        const p = attempt(0) as Joined<ChessdbAnswer>;
        // chessdb() raises a joined request's priority through p.job: the one waiting now.
        Object.defineProperty(p, 'job', { get: () => out.job });
        return p;
      });
    });
  }

  /*
   * A dropped connection is retried, not passed on: one failed lookup in a deeper round stops the
   * whole table ('error'). Seen live on 2026-09-28, the page's own ChessDB fetch failing with
   * ERR_CONNECTION_CLOSED once, while 150 lookups at 3 in flight (450 a minute) all went through: a
   * passing network fault, not a limit. A 429 is tried again too, once the lane's pause is over.
   * Other HTTP errors under 500 are ChessDB's answer and final.
   */
  function cdbRetryable(e: PeError | undefined): boolean {
    return !!e && !e.cancelled && (!e.status || e.status === 429 || e.status >= 500);
  }

  /*
   * Ask ChessDB to analyse a position it doesn't know (`queue`), or one move from a position it
   * does know (`store`, uci in ChessDB's spelling: castling is e1g1). It analyses in the
   * background; the answer is 'ok', or nothing for a position it finds trivial. Resolves true when
   * a request was sent, false when it was asked already today. Not dropped when the search moves
   * on: the analysis is worth having anyway. Off unless the owner switches it on (D9).
   */
  function analyse(fen: string, uci?: string | null): Promise<boolean> {
    const key = fenKey(fen);
    const what = key + (uci ? '|' + uci : '');
    const going = asking.get(what);
    if (going) return going;
    const p = o.cache.get('chessdb', 'ask|' + what, TTL.analyse).then((done) => {
      if (done) return false;
      return cdbLane(() => {
        bump('chessdbAnalyse');
        const url = CHESSDB_URL + '?action=' + (uci ? 'store' : 'queue') + '&json=1&board=' + encodeURIComponent(fen) + (uci ? '&move=move:' + uci : '');
        return cdbFetch(url).then((res) => {
          if (!res.ok) throw HttpError(res.status);
          const t = { t: now() };
          // The position-level record is what chessdb() checks to know it should look again.
          return Promise.all([o.cache.put('chessdb', 'ask|' + what, t), uci ? o.cache.put('chessdb', 'ask|' + key, t) : null]).then(() => true);
        });
      });
    });
    asking.set(what, p);
    const clear = () => {
      asking.delete(what);
    };
    p.then(clear, clear);
    return p;
  }

  // A token check that bypasses the cache: one request for the start position.
  function testToken(token: string): Promise<{ ok: boolean; status: number }> {
    return lichess
      .schedule(() => {
        bump('explorerRequests');
        const f = { speeds: ['blitz'], ratings: [2000] };
        return o.http(explorerUrl('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -', f), { headers: { Authorization: 'Bearer ' + token } });
      })
      .then((res) => {
        noteRateHeaders(res);
        if (res.status === 429) {
          bump('explorer429');
          lichess.pause(60000);
        }
        return { ok: res.ok, status: res.status };
      });
  }

  // The game exports: one at a time; a 429 pauses them a minute and the export is tried once more.
  const gameLane = createLimiter(1);
  let gamesPausedUntil = 0;
  function gameText(url: string, init?: Parameters<Http>[1], tried = 0): Promise<string> {
    return gameLane(() => {
      const wait = gamesPausedUntil - now();
      return (wait > 0 ? sleep(wait) : Promise.resolve()).then(() => {
        bump('gameRequests');
        return o.http(url, init);
      });
    }).then((res) => {
      if (res.status === 429) {
        gamesPausedUntil = now() + GAMES_PAUSE_MS;
        if (tried < 1) return gameText(url, init, tried + 1);
      }
      if (!res.ok || !res.text) throw HttpError(res.status);
      return res.text();
    });
  }
  function games(ids: readonly string[]): Promise<string> {
    const list = [...new Set(ids.filter((id) => /^[A-Za-z0-9]{8}$/.test(id)))].slice(0, GAMES_EXPORT_MAX);
    if (!list.length) return Promise.resolve('');
    // text/plain keeps it a simple request: no preflight, which this endpoint's sibling refuses.
    return gameText(GAMES_EXPORT_URL, { method: 'POST', body: list.join(','), headers: { 'Content-Type': 'text/plain' } });
  }
  function mastersGame(id: string): Promise<string> {
    if (!/^[A-Za-z0-9]{8}$/.test(id)) return Promise.reject(HttpError(0, 'not a game id'));
    return gameText(MASTERS_PGN_URL + id);
  }

  return {
    explorer,
    games,
    mastersGame,
    chessdb,
    analyse,
    testToken,
    localInfo: (address) => localInfo(o.http, address),
    pausedFor: lichess.pausedFor,
    sweep: lichess.sweep,
    queued: lichess.queued,
    setRate: lichess.setRate,
    setBurst: lichess.setBurst,
    limiterSnapshot: lichess.snapshot,
    limiterRestore: lichess.restore,
  };
}

// Kept for the worker: a cancelled job's error.
export { Cancelled };

/** A memory-only cache with the same interface, for tests (q_extension's createMemoryCache). */
export function createMemoryCache(now: Now): ExplorerCache & { map: Map<string, { t: number; v: unknown }> } {
  const m = new Map<string, { t: number; v: unknown }>();
  return {
    get: (store, key, ttl) => {
      const rec = m.get(store + '|' + key);
      return Promise.resolve(rec && now() - rec.t < ttl ? rec.v : undefined);
    },
    put: (store, key, v) => {
      m.set(store + '|' + key, { t: now(), v });
      return Promise.resolve();
    },
    count: () => Promise.resolve({ size: m.size }),
    map: m,
  };
}
