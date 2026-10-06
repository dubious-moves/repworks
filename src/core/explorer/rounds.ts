// Practical eval: deepening a root position's rows in lockstep rounds (PLAN.md §5.21).
//
// Ported from q_extension `src/pe/rounds.js` at c26242f (github.com/skAeglund/q_extension, by the
// same owner), behaviour unchanged, under this repo's GPL-3.0-or-later.
//
// Deeper values drift upwards (search.ts, myNode), so the table only compares rows at one depth.
// Every row finishes a round before any row starts the next: round 1 is each row's direct replies,
// and each later round adds a full move (depth 1, 3, 5 below the row). A round's values are
// published together when the last row finishes it; only round 1 is published row by row, so the
// first values appear fast.
//
// Pure like search.ts: the provider comes from `makeProvider`, so Node tests can drive it.
//
// o = {
//   rootFen, opts,                          opts as for evaluateRow, plus maxPly
//   makeProvider(san, isAborted, counts)    a provider for one row; its requests must be dropped
//                                           once isAborted() is true, and each explorer call must
//                                           bump counts.hits (cache) or counts.misses (a request)
//   budget: { limit, spent }                the root's explorer budget, if any
//   onResult(san, res), onError(san, e)     res as from evaluateRow, plus `final`, `complete` and
//                                           `stopped`
//   isStale()                               true once the root is no longer wanted
// }
//
// A row is `complete` when a deeper search could not change it (nothing was cut off by depth). The
// table stops when every row is complete, at maxPly, or on the budget:
//   - before a round, if the remaining budget can't roughly pay for it. The estimate is the lines
//     the last round cut off by depth, scaled by that round's cache-miss rate, so a revisit whose
//     positions are cached still goes deeper.
//   - during a round, if a request is refused. The round is abandoned and every row stays at the
//     last round they all completed; the abandoned round's responses are cached, so coming back
//     finishes it cheaply.
// Either way the last completed round is re-sent as final, with `stopped` saying why.
//
// A row added later (a click) catches up round by round to the table's depth, published as it
// goes, and then joins the round in progress. A row removed (a right-click) stops at once, and the
// round no longer waits for it.

import { evaluateRow, PE_DEFAULTS, type PeError, type RowResult, type SearchOptions, type SearchProvider } from './search.ts';

export interface CacheCounts {
  hits?: number;
  misses?: number;
}

export interface Budget {
  limit: number;
  spent: number;
}

export interface RootSearchOptions {
  rootFen: string;
  opts?: Partial<SearchOptions>;
  makeProvider(san: string, isAborted: () => boolean, counts: CacheCounts): SearchProvider;
  budget?: Budget;
  onResult(san: string, res: RowResult): void;
  onError(san: string, e: unknown): void;
  isStale?: () => boolean;
}

export interface RootSearch {
  add(sans: readonly string[] | undefined): void;
  /** Returns whether the row was still running. */
  remove(san: string): boolean;
  /** Resolves once the rounds, and any rows added after they stopped, have settled. */
  done(): Promise<void>;
}

interface Row {
  san: string;
  results: Record<number, RowResult>;
  depth: number;
  chain: Promise<void>;
  complete?: boolean;
  removed?: boolean;
  failed?: unknown;
  roundErr?: PeError;
  shownFinal?: boolean;
}

export function createRootSearch(o: RootSearchOptions): RootSearch {
  const opts: SearchOptions = { ...PE_DEFAULTS, ...(o.opts || {}) };
  const maxDepth = Math.max(1, (opts.maxPly || 2) - 1);
  const isStale = o.isStale || (() => false);
  const order: Row[] = []; // rows in the order they were asked for
  const bySan = new Map<string, Row>();
  let common = 0; // the last round every row completed
  let finished: string | null = null; // once stopped: the reason ('' when every row is complete)
  let abort = { aborted: false };
  let counts: CacheCounts = { hits: 0, misses: 0 };
  let loop: Promise<void> | null = null;
  const tails: Promise<void>[] = [];

  const NEVER = { aborted: false }; // round 1 is never abandoned: every row gets a value

  function publish(row: Row, d: number, extra: Partial<RowResult>) {
    const res = row.results[d];
    if (!res || isStale() || row.removed) return;
    const out = { ...res, ...extra };
    row.shownFinal = !!out.final;
    o.onResult(row.san, out);
  }

  // What to say about a row published at depth d while the table is running or stopped.
  function status(row: Row, d: number): Partial<RowResult> {
    if (row.complete && d === row.depth) return { final: true, complete: true };
    if (finished !== null && d >= common) return finished ? { final: true, stopped: finished } : { final: true };
    return { final: false };
  }

  function iterate(row: Row, d: number): Promise<void> {
    const ab = d === 1 ? NEVER : abort;
    const provider = o.makeProvider(row.san, () => ab.aborted || !!row.removed, counts);
    return evaluateRow(provider, o.rootFen, row.san, d, opts).then((res) => {
      row.results[d] = res;
      row.depth = d;
      if (res.state !== 'value' || res.frontier === 0) row.complete = true;
      // Round 1, and catching up to a depth the table already shows, go out at once. A deeper
      // value waits for its round, so rows are only ever compared like with like.
      if (d === 1 || d <= common) publish(row, d, status(row, d));
    });
  }

  function upTo(row: Row, D: number): Promise<void> {
    row.chain = row.chain.then(function step(): Promise<void> | void {
      if (isStale() || row.removed || row.failed || row.roundErr || row.complete || row.depth >= D) return;
      const d = row.depth ? row.depth + 2 : 1;
      return iterate(row, d).then(step, (e: PeError) => {
        if (row.removed) return; // taken out by the user; not an error
        if (!row.depth) {
          // No value at all: an error for this row only.
          row.failed = e;
          if (!isStale() && !(e && e.cancelled)) o.onError(row.san, e);
          return;
        }
        // Later rounds: the rest of this round is pointless now.
        row.roundErr = e;
        abort.aborted = true;
      });
    });
    return row.chain;
  }

  // Waits for every row, including ones added while it waits.
  let added = 0;
  function settle(D: number): Promise<void> {
    const list = order.slice();
    const seen = added;
    return Promise.all(list.map((r) => upTo(r, D))).then(() => {
      if (added > seen) return settle(D);
    });
  }

  function lastAtOrBelow(row: Row, d: number): number {
    for (let x = Math.min(d, row.depth); x >= 1; x -= 2) if (row.results[x]) return x;
    return 0;
  }

  function stop(reason: string) {
    finished = reason;
    for (const r of order) {
      if (r.failed) continue;
      const d = lastAtOrBelow(r, common);
      if (!d || (r.shownFinal && r.complete)) continue;
      if (r.complete && d === r.depth) publish(r, d, { final: true, complete: true });
      else publish(r, d, reason ? { final: true, stopped: reason } : { final: true });
    }
  }

  function round(D: number): Promise<void> {
    if (isStale()) return Promise.resolve();
    abort = { aborted: false };
    counts = { hits: 0, misses: 0 };
    return settle(D).then(() => {
      if (isStale()) return;
      const errs = order.map((r) => r.roundErr).filter((e): e is PeError => !!e);
      if (errs.length) return stop(errs.some((e) => e.budget) ? 'budget' : 'error');
      common = D;
      const live = order.filter((r) => !r.complete && !r.failed);
      if (!live.length) return stop('');
      if (D + 2 > maxDepth) return stop('maxPly');
      if (o.budget) {
        const frontier = live.reduce((s, r) => s + ((r.results[D] && r.results[D].frontier) || 0), 0);
        const seen = (counts.hits || 0) + (counts.misses || 0);
        const est = seen ? Math.ceil((frontier * (counts.misses || 0)) / seen) : frontier;
        if (est > o.budget.limit - o.budget.spent) return stop('budget');
      }
      // The round's values, held back until now. Round 1 went out row by row.
      if (D > 1) for (const r of order) if (r.depth === D) publish(r, D, status(r, D));
      return round(D + 2);
    });
  }

  function add(sans: readonly string[] | undefined) {
    for (const san of sans || []) {
      // A row asked for again is left alone, unless it failed: then this is the cell's "Click to
      // retry", and it starts afresh.
      const old = bySan.get(san);
      if (old && !old.failed) continue;
      if (old) remove(san);
      const row: Row = { san, results: {}, depth: 0, chain: Promise.resolve() };
      bySan.set(san, row);
      order.push(row);
      added++;
      if (finished === '' && loop) {
        // Stopped only because every row was complete: a newcomer can still go deeper, so the
        // rounds start again from the table's depth, which it catches up to.
        finished = null;
        const from = Math.max(common, 1);
        loop = loop.then(() => round(from));
      } else if (finished !== null) {
        // The table has stopped: bring the newcomer to the table's depth, then finish it.
        tails.push(
          upTo(row, Math.max(common, 1)).then(() => {
            const d = lastAtOrBelow(row, common || 1);
            if (!d || row.shownFinal) return;
            // Short of the table's depth only if a request failed or the budget ran out.
            const short = d < common && !(row.complete && d === row.depth);
            publish(row, d, short ? { final: true, stopped: row.roundErr && !row.roundErr.budget ? 'error' : 'budget' } : status(row, d));
          }),
        );
      }
    }
    // Not before there is a row: rounds over no rows would "finish" at once, and every row added
    // after that would stop at depth 1. A new position's first request is empty when its table has
    // no evals or games yet (a rare line), and the rows follow with the next render.
    if (!loop && order.length) loop = round(1);
  }

  /*
   * The user took a row out. Its waiting requests are dropped (isAborted), the round no longer
   * waits for it, and it is left out of the budget estimate. Adding it again starts it afresh.
   * Returns whether it was still running.
   */
  function remove(san: string): boolean {
    const row = bySan.get(san);
    if (!row) return false;
    bySan.delete(san);
    order.splice(order.indexOf(row), 1);
    row.removed = true;
    return !row.shownFinal && !row.failed;
  }

  return {
    add,
    remove,
    // As the original: no extra step after the tails, so the preview's gate sees the same order.
    done: () => (loop || Promise.resolve()).then(() => Promise.all(tails)) as unknown as Promise<void>,
  };
}

export interface PreviewedSearchOptions extends RootSearchOptions {
  preview?: {
    makeProvider: RootSearchOptions['makeProvider'];
    onResult: RootSearchOptions['onResult'];
    onError: RootSearchOptions['onError'];
  } | null;
  previewAfter?: boolean;
}

/*
 * The Lichess search with a Maia preview beside it: a second search of the same rows with Maia's
 * predictions in place of games (opts.maiaOnly). It asks ChessDB and Maia only, so it deepens in
 * seconds where the explorer's rate limit takes minutes. The table shows one of the two, and the
 * user switches between them (the Prac header), so both run to their own end: neither stops
 * because the other got somewhere.
 *
 * The two share rows: a row added goes to both, a row removed (right-click) leaves both, and adding
 * it back starts both afresh.
 *
 * o = as for createRootSearch, plus
 *   preview: { makeProvider, onResult, onError } or null for no preview
 *   previewAfter: start the preview's rows only once the Lichess search has settled. For a local
 *     explorer: the preview was there because Lichess's rate limit is slow, and with the explorer
 *     free both searches wait on the same ChessDB lane. A preview lookup that has started holds a
 *     lane slot for its ~340 ms, so running both at once slows the real search down.
 */
export function createPreviewedSearch(o: PreviewedSearchOptions): RootSearch {
  const real = createRootSearch(o);
  const preview = !o.preview
    ? null
    : createRootSearch({
        rootFen: o.rootFen,
        // No prepared split: it is measured by game results, and the preview has none.
        opts: { ...o.opts, maiaOnly: true, prep: false },
        makeProvider: o.preview.makeProvider,
        ...(o.isStale ? { isStale: o.isStale } : {}),
        onResult: o.preview.onResult,
        onError: o.preview.onError,
      });

  const later = !!(preview && o.previewAfter);
  let held: string[] = []; // rows for the preview, waiting for the Lichess search
  let adds = 0;
  let gate: Promise<void> | null = null;

  // real.done() covers the rows it has at the time, so wait again if more came meanwhile.
  function settled(): Promise<void> {
    const seen = adds;
    return real.done().then(() => (adds !== seen ? settled() : undefined));
  }

  function hold(sans: readonly string[] | undefined) {
    for (const san of sans || []) if (held.indexOf(san) < 0) held.push(san);
    if (gate) return;
    gate = settled().then(() => {
      gate = null;
      const sans = held;
      held = [];
      if (sans.length) preview!.add(sans);
    });
  }

  return {
    add(sans) {
      adds++;
      real.add(sans);
      if (!preview) return;
      if (later) hold(sans);
      else preview.add(sans);
    },
    remove(san) {
      const i = held.indexOf(san);
      if (i >= 0) held.splice(i, 1);
      if (preview) preview.remove(san);
      return real.remove(san);
    },
    done() {
      return Promise.all([real.done(), gate])
        .then(() => (preview ? preview.done() : undefined))
        .then(() => {});
    },
  };
}
