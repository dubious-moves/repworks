// The explorer worker's logic (PLAN.md §5.22): every explorer and ChessDB request of a tab goes
// through here, the panel's lookups and the Practical search's alike, so one limiter governs the
// Lichess token's bucket. The worker (src/platform/explorerWorker.ts) only wires it to fetch,
// IndexedDB, the clock and postMessage; Node tests drive it with fakes.
//
// The search side is q_extension's `src/background.js` (`startRoot`, the port's message handling)
// at c26242f, by the same owner, under this repo's GPL-3.0-or-later, with the site's token in
// place of the popup's and Qchess's. Maia (§5.34) is asked through `maia`, which the worker wires
// to Maia's own worker; with it, thin positions are filled in with its predictions, and its
// preview (the same rows with Maia in place of games) runs beside the Lichess search.
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { standardUci } from '../chess/uci.ts';
import { STORM } from '../storm/config.ts';
import { LICHESS_RATE, OWN_BURST, type LimiterSnapshot, type Now, type Sleep } from './limiter.ts';
import { createProviders, localAddress, type CompactExplorer, type ExplorerCache, type ExplorerFilter, type Http, type ProviderStats } from './providers.ts';
import { createPreviewedSearch, type Budget, type RootSearch } from './rounds.ts';
import { fenKey, type ChessdbAnswer, type MaiaMove, type PeError, type RowResult, type SearchOptions, type SearchProvider } from './search.ts';

export const DEFAULT_BUDGET = 60; // uncached explorer requests per root position
export const ANALYSE_MAX = 30; // ChessDB analysis requests per root position

export interface ExplorerConfig {
  /** The Lichess token, or '' when not logged in. */
  token: string;
  /** The Lichess database's filter (speeds, ratings, since). */
  filter: ExplorerFilter;
  /** A local explorer's address, or ''. */
  local: string;
  /** Ask ChessDB to analyse positions it doesn't know (D9: off unless switched on). */
  analyse: boolean;
  /** The Practical search's options (search.ts's PE_DEFAULTS, overridden). */
  options: Partial<SearchOptions>;
  /** Uncached explorer requests per root position. */
  budget: number;
  /** With `options.maia`: the Maia preview beside the Lichess search (q_extension's peMaiaPreview). */
  maiaPreview?: boolean;
}

/** What a lookup asks: a database's games, or ChessDB's moves alone. */
export type ExplorerTab = 'lichess' | 'masters' | 'chessdb';

export type ToWorker =
  | { type: 'config'; config: ExplorerConfig }
  | { type: 'restore'; limiter: LimiterSnapshot }
  /** The panel: the tab's games (none for ChessDB) and ChessDB's evals, for one position. */
  | { type: 'lookup'; id: number; tab: ExplorerTab; fen: string }
  /** A lookup no longer wanted: its queued requests are dropped. */
  | { type: 'drop'; id: number }
  /**
   * Repertoire coverage (§5.26): the Lichess tab's games at a position (the panel's filter, or the
   * local explorer), answered as `games`, below the panel's priority and above the search's.
   */
  | { type: 'counts'; id: number; fen: string }
  /**
   * The Practical rows of a root position. A higher `gen` is a new root: the old one's queued
   * requests go at once. `shares` (the rows' shares of the games) order the requests.
   */
  | { type: 'search'; gen: number; rootFen: string; rows: string[]; remove?: string[]; shares: Record<string, number> }
  | { type: 'stats' }
  /**
   * The storm's gather (§5.42): a position's games at the storm's relaxed filter (every speed,
   * ratings 1000–2500) with the games it names; Lichess's explorer always, under the panel.
   */
  | { type: 'stormGames'; id: number; fen: string }
  /** The storm's games as PGN: Lichess ids in one export, or one masters game. */
  | { type: 'gamePgns'; id: number; ids: string[]; masters?: boolean }
  /** ChessDB's scored moves for the storm's walk, under every other lookup. */
  | { type: 'scores'; id: number; fen: string };

export interface LookupError {
  message: string;
  /** A Lichess login would answer it (no token, or a refused one). */
  login?: boolean;
}

export type FromWorker =
  | { type: 'games'; id: number; games: CompactExplorer }
  | { type: 'games'; id: number; error: LookupError }
  | { type: 'evals'; id: number; evals: ChessdbAnswer }
  | { type: 'evals'; id: number; error: LookupError }
  /** A row's value; `pass: 'maia'` for the Maia preview's (§5.34). */
  | { type: 'update'; gen: number; root: string; san: string; result: RowResult; pass?: 'maia' }
  /** Lichess asked to slow down: every queued explorer request waits this long. */
  | { type: 'paused'; ms: number }
  | { type: 'stats'; stats: ProviderStats; pausedFor: number; cache: Record<string, number> | null }
  | { type: 'limiter'; snapshot: LimiterSnapshot }
  | { type: 'stormGames'; id: number; games: CompactExplorer }
  | { type: 'stormGames'; id: number; error: LookupError }
  | { type: 'gamePgns'; id: number; text: string }
  | { type: 'gamePgns'; id: number; error: LookupError }
  | { type: 'scores'; id: number; evals: ChessdbAnswer }
  | { type: 'scores'; id: number; error: LookupError };

export interface ServiceOptions {
  http: Http;
  cache: ExplorerCache;
  now: Now;
  sleep: Sleep;
  post(message: FromWorker): void;
  /** Maia's policy at a position and rating, or null when Maia can't answer (§5.34). */
  maia?(fen: string, elo: number): Promise<MaiaMove[] | null>;
}

export interface ExplorerService {
  handle(message: ToWorker): void;
}

const DEFAULT_CONFIG: ExplorerConfig = { token: '', filter: {}, local: '', analyse: false, options: {}, budget: DEFAULT_BUDGET };

/** The FEN after `san`, played with chessops; throws on an illegal move (the search reports it). */
function play(fen: string, san: string): { fen: string; uci: string } {
  const setup = parseFen(fen);
  if (setup.isErr) throw new Error('not a position: ' + fen);
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) throw new Error('not a legal position: ' + fen);
  const move = parseSan(pos.value, san);
  if (!move || !('from' in move)) throw new Error('not a legal move here: ' + san);
  const uci = standardUci(pos.value, move);
  pos.value.play(move);
  return { fen: makeFen(pos.value.toSetup()), uci };
}

export function createExplorerService(o: ServiceOptions): ExplorerService {
  let config = DEFAULT_CONFIG;
  const stats: ProviderStats = {};

  // A 429 is told to the panel, which then says why nothing comes (the providers wait it out).
  const http: Http = (url, init) =>
    o.http(url, init).then((res) => {
      if (res.status === 429 && url.startsWith('https://explorer.lichess.org')) o.post({ type: 'paused', ms: 60000 });
      if (url.startsWith('https://explorer.lichess.org')) saveLimiter();
      return res;
    });

  const providers = createProviders({
    http,
    cache: o.cache,
    getToken: () => Promise.resolve(config.token),
    stats,
    now: o.now,
    sleep: o.sleep,
    ratePerMin: LICHESS_RATE,
    burst: OWN_BURST,
    localExplorer: () => config.local,
  });

  // The bucket after explorer requests, for the page to keep across reloads (a worker has no
  // sessionStorage); at most once a second.
  let saving = false;
  function saveLimiter() {
    if (saving) return;
    saving = true;
    void o.sleep(1000).then(() => {
      saving = false;
      o.post({ type: 'limiter', snapshot: providers.limiterSnapshot() });
    });
  }

  // Neither API returns child positions, so chessops plays the moves.
  const childMemo = new Map<string, { fen: string; uci: string }>();
  function child(fen: string, san: string): { fen: string; uci: string } {
    const k = fen + '|' + san;
    const hit = childMemo.get(k);
    if (hit) return hit;
    const out = play(fen, san);
    childMemo.set(k, out);
    if (childMemo.size > 5000) childMemo.delete(childMemo.keys().next().value!);
    return out;
  }

  /* ---------------------------------------------------------------- lookups (the panel) */

  const dropped = new Set<number>();
  const live = new Set<number>();

  function reasonOf(e: PeError | undefined, source: string): LookupError {
    if (!e) return { message: 'Unknown error' };
    if (e.message === 'no-token') return { message: 'Lichess’s explorer needs a Lichess login (any account; no permission is asked for).', login: true };
    if (e.status === 401) return { message: 'Lichess refused the login (401): log in again.', login: true };
    if (e.status) return { message: `${source} answered HTTP ${e.status}.` };
    return { message: `${source} didn’t answer: ${e.message || String(e)}` };
  }

  function lookup(id: number, tab: ExplorerTab, fen: string) {
    live.add(id);
    const isStale = () => dropped.has(id);
    const settle = () => {
      if (!pending.size) {
        live.delete(id);
        dropped.delete(id);
      }
    };
    const pending = new Set<string>();
    if (tab !== 'chessdb') {
      pending.add('games');
      const filter: ExplorerFilter = tab === 'masters' ? { db: 'masters' } : { ...config.filter, db: 'lichess' };
      const source = tab === 'masters' || !localAddress(config.local) ? 'Lichess' : 'The local explorer';
      providers
        .explorer(fen, filter, isStale, { priority: 1000 })
        .then(
          (games) => !isStale() && o.post({ type: 'games', id, games }),
          (e: PeError) => !isStale() && !e?.cancelled && o.post({ type: 'games', id, error: reasonOf(e, source) }),
        )
        .finally(() => (pending.delete('games'), settle()));
    }
    pending.add('evals');
    providers
      .chessdb(fen, isStale, 2)
      .then(
        (evals) => !isStale() && o.post({ type: 'evals', id, evals }),
        (e: PeError) => !isStale() && !e?.cancelled && o.post({ type: 'evals', id, error: reasonOf(e, 'ChessDB') }),
      )
      .finally(() => (pending.delete('evals'), settle()));
  }

  function counts(id: number, fen: string) {
    live.add(id);
    const isStale = () => dropped.has(id);
    const source = localAddress(config.local) ? 'The local explorer' : 'Lichess';
    providers
      .explorer(fen, { ...config.filter, db: 'lichess' }, isStale, { priority: 500 })
      .then(
        (games) => !isStale() && o.post({ type: 'games', id, games }),
        (e: PeError) => !isStale() && !e?.cancelled && o.post({ type: 'games', id, error: reasonOf(e, source) }),
      )
      .finally(() => {
        live.delete(id);
        dropped.delete(id);
      });
  }

  /* ---------------------------------------------------------------- the storm's gather (§5.42) */

  function stormGames(id: number, fen: string) {
    const filter: ExplorerFilter = { speeds: [...STORM.speeds], ratings: [...STORM.ratings], db: 'lichess', games: STORM.gatherGamesPerFrontier };
    providers.explorer(fen, filter, undefined, { priority: 300 }).then(
      (games) => o.post({ type: 'stormGames', id, games }),
      (e: PeError) => o.post({ type: 'stormGames', id, error: reasonOf(e, 'Lichess') }),
    );
  }

  function gamePgns(id: number, ids: string[], masters: boolean) {
    const text = masters ? Promise.all(ids.map((g) => providers.mastersGame(g).catch(() => ''))).then((t) => t.filter(Boolean).join('\n\n')) : providers.games(ids);
    text.then(
      (t) => o.post({ type: 'gamePgns', id, text: t }),
      (e: PeError) => o.post({ type: 'gamePgns', id, error: reasonOf(e, 'Lichess') }),
    );
  }

  function scores(id: number, fen: string) {
    providers.chessdb(fen, undefined, 1).then(
      (evals) => o.post({ type: 'scores', id, evals }),
      (e: PeError) => o.post({ type: 'scores', id, error: reasonOf(e, 'ChessDB') }),
    );
  }

  function drop(id: number) {
    if (!live.has(id)) return;
    dropped.add(id);
    providers.sweep();
  }

  /* ---------------------------------------------------------------- the search (Practical) */

  // gen: the current root generation. search: that root's rounds, shared by all its rows,
  // including ones added later by a click.
  const st: { gen: number; search: { add(sans: string[]): void; remove(san: string): boolean } | null; root: string } = { gen: 0, search: null, root: '' };

  function startRoot(gen: number, rootFen: string, shares: Record<string, number>) {
    const rootStale = () => gen < st.gen;
    const filter: ExplorerFilter = { ...config.filter, db: 'lichess' };
    const budget: Budget = { limit: Number(config.budget) || DEFAULT_BUDGET, spent: 0 };
    let analysed = 0;
    const analyseOn = config.analyse;
    const local = !!localAddress(config.local);
    const tokenless = !config.token;
    // Maia: on when asked for and wired; the preview beside the search when that is on too.
    const ask = o.maia;
    const maiaOn = !!config.options.maia && !!ask;
    const maiaElo = Number(config.options.maiaElo) || 1900;
    const wantPreview = maiaOn && !!config.maiaPreview;

    const providerFor = (pass: 'lichess' | 'maia') => (san: string, isAborted: () => boolean, counts: { hits?: number; misses?: number }) => makeProvider(san, isAborted, counts, pass);

    function makeProvider(san: string, isAborted: () => boolean, counts: { hits?: number; misses?: number }, pass: 'lichess' | 'maia'): SearchProvider {
      const isStale = () => rootStale() || isAborted();
      const share = shares[san] || 0.01;
      // Identical requests from different rows share one fetch. If the row that queued it goes
      // stale, the others get a cancellation they didn't ask for: ask again.
      function retrying<T>(call: () => Promise<T>): Promise<T> {
        let tries = 0;
        const go = (): Promise<T> =>
          call().catch((e: PeError) => {
            if (e && e.cancelled && !isStale() && tries++ < 3) return go();
            throw e;
          });
        return go();
      }
      const tag = (source: string) => (e: PeError) => {
        if (e && !e.source) e.source = source;
        throw e;
      };
      const provider: SearchProvider = {
        explorer(fen, info) {
          // The preview never asks (maiaOnly); this only makes sure it can't spend requests.
          if (pass === 'maia') return Promise.resolve(null);
          // Within a round, work goes in descending mass: the row's share of games times the
          // node's reach. Round 1 jumps the queue and is never refused.
          const first = !info || info.plies === 1;
          const ctx = { budget, exempt: first, counts, priority: (first ? 10 : 0) + share * (info ? info.reach : 1) };
          return retrying(() => providers.explorer(fen, filter, isStale, ctx)).catch(tag(local ? 'The local explorer' : 'Lichess'));
        },
        chessdb(fen) {
          // The preview's lookups wait behind the Lichess search's.
          return retrying(() => providers.chessdb(fen, isStale, pass === 'maia' ? 0 : 1)).catch(tag('ChessDB'));
        },
        child: (fen, s) => child(fen, s).fen,
      };
      // Positions the search needed and ChessDB didn't know: ask it to analyse them, so coming back
      // later finds evals there. Capped per root position, and only when switched on (D9).
      if (analyseOn) {
        provider.analyse = (fen: string, s?: string) => {
          if (analysed >= ANALYSE_MAX) return Promise.resolve(false);
          analysed++;
          return providers.analyse(fen, s ? child(fen, s).uci : null).then(
            (sent) => {
              if (!sent) analysed--; // asked already today: costs nothing
              return sent;
            },
            () => false,
          );
        };
      }
      if (maiaOn) provider.maia = (fen: string) => (isStale() ? Promise.resolve(null) : ask!(fen, maiaElo).catch(() => null));
      return provider;
    }

    function reasonText(e: PeError): string {
      if (!e) return 'Unknown error';
      if (e.message === 'no-token') return 'No Lichess login: log in with Lichess for the Practical column.';
      if (e.status === 401) return 'Lichess refused the login (401): log in again.';
      if (e.status) return (e.source || 'Request') + ' failed: HTTP ' + e.status + '.';
      return (e.source || 'Network') + ' unreachable: ' + (e.message || String(e));
    }

    const post = (san: string, result: RowResult, pass?: 'maia') => {
      if (rootStale()) return;
      o.post({ type: 'update', gen, root: fenKey(rootFen), san, result, ...(pass ? { pass } : {}) });
    };

    let search: RootSearch | null = null;
    return {
      add(sans: string[]) {
        // With no token and no local explorer, every row would fail on its first request.
        if (tokenless && !local) {
          for (const san of sans) post(san, { state: 'error', reason: reasonText(new Error('no-token')), final: true });
          return;
        }
        // With a local explorer, explorer calls cost nothing and ChessDB is what the search waits
        // on: the explorer is asked everywhere (explorerFree). Decided once per position.
        // With a local explorer the preview, which would take ChessDB's slots from the real search,
        // waits until that has settled (q_extension's previewAfter).
        search ??= createPreviewedSearch({
          rootFen,
          opts: local ? { ...config.options, explorerFree: true, maia: maiaOn } : { ...config.options, maia: maiaOn },
          budget,
          previewAfter: local,
          makeProvider: providerFor('lichess'),
          isStale: rootStale,
          onResult: (san, res) => post(san, res),
          onError: (san, e) => post(san, { state: 'error', reason: reasonText(e as PeError), final: true }),
          preview: wantPreview
            ? {
                makeProvider: providerFor('maia'),
                onResult: (san, res) => post(san, res, 'maia'),
                onError: (san, e) => post(san, { state: 'error', reason: reasonText(e as PeError), final: true }, 'maia'),
              }
            : null,
        });
        search.add(sans);
      },
      remove: (san: string) => (search ? search.remove(san) : false),
    };
  }

  function searchRows(msg: Extract<ToWorker, { type: 'search' }>) {
    if (msg.gen < st.gen) return;
    if (msg.gen > st.gen || !st.search) {
      // A new root: older rows are now stale, and their queued requests go at once.
      st.gen = msg.gen;
      st.root = fenKey(msg.rootFen);
      st.search = startRoot(msg.gen, msg.rootFen, msg.shares || {});
      providers.sweep();
    }
    const search = st.search;
    // A right-click on a Practical cell: stop that row now. If it was still running, say so, so the
    // page stops counting it as pending.
    for (const san of msg.remove || []) {
      if (search.remove(san)) o.post({ type: 'update', gen: msg.gen, root: fenKey(msg.rootFen), san, result: { state: 'excluded' } });
    }
    if (msg.remove && msg.remove.length) providers.sweep();
    search.add(msg.rows || []);
  }

  return {
    handle(msg) {
      switch (msg.type) {
        case 'config':
          config = { ...DEFAULT_CONFIG, ...msg.config };
          return;
        case 'restore':
          providers.limiterRestore(msg.limiter);
          return;
        case 'lookup':
          return lookup(msg.id, msg.tab, msg.fen);
        case 'drop':
          return drop(msg.id);
        case 'counts':
          return counts(msg.id, msg.fen);
        case 'search':
          return searchRows(msg);
        case 'stormGames':
          return stormGames(msg.id, msg.fen);
        case 'gamePgns':
          return gamePgns(msg.id, msg.ids, !!msg.masters);
        case 'scores':
          return scores(msg.id, msg.fen);
        case 'stats':
          void (o.cache.count ? o.cache.count() : Promise.resolve(null)).then((cache) => o.post({ type: 'stats', stats: { ...stats }, pausedFor: providers.pausedFor(), cache }));
          return;
      }
    },
  };
}
