// The Practical column in the app (PLAN.md §5.24): which rows the worker searches, and their
// values as they come. After q_extension's `src/main-world.js` (`pe`, `peRequest`, `peSend`,
// `peClickRow`, `peToggleExclude`) at c26242f, by the same owner, under this repo's
// GPL-3.0-or-later: values are kept per position and move for the session, so coming back is
// instant, and a row left before it finished resumes.
import { signal } from '@preact/signals';
import { fenKey, type RowResult } from '../core/explorer/search.ts';
import type { FromWorker } from '../core/explorer/service.ts';
import { maiaSearchKey, onWorker, postToWorker, prefs } from './explorer.ts';

export type Cell = RowResult & { at?: number };

const KEEP = 3000;
const results = new Map<string, Cell>(); // `<root>|<san>`
/** The Maia preview's values (§5.34), keyed alike. */
const maiaResults = new Map<string, Cell>();
const queued = new Set<string>();
/** Moves taken out of the analysis at a position, for this session (q_extension's, per browser session). */
const excluded = new Set<string>();
let gen = 0;
let root: string | null = null;

/** Raised on every change, so the column redraws. */
export const practicalVersion = signal(0);
const changed = () => (practicalVersion.value = practicalVersion.peek() + 1);

function remember(key: string, value: Cell, into = results) {
  into.delete(key);
  into.set(key, value);
  if (into.size > KEEP) into.delete(into.keys().next().value!);
}

/** Whether the Maia preview runs: Maia ready, in the column, with its preview (§5.34). */
export const previewOn = (): boolean => !!maiaSearchKey.value && prefs.value.practicalMaia && prefs.value.maiaPreview;

/** Which values the column shows: Lichess's, or the Maia preview's (q_extension's peView). */
export const practicalView = signal<'lichess' | 'maia'>('lichess');
export const showsMaia = (): boolean => previewOn() && practicalView.value === 'maia';

// Deepening is worth resuming: a row whose search was cut short by navigating away.
const unfinished = (r: Cell | undefined) => !!r && r.state === 'value' && r.final === false;
const needs = (key: string) => !results.has(key) || unfinished(results.get(key));

export interface CellState {
  result?: Cell;
  /** The Maia preview's value of the row. */
  maia?: Cell;
  queued: boolean;
  excluded: boolean;
}

export function cellOf(fen: string, san: string): CellState {
  const key = `${fenKey(fen)}|${san}`;
  const result = results.get(key);
  const maia = maiaResults.get(key);
  return { ...(result ? { result } : {}), ...(maia ? { maia } : {}), queued: queued.has(key), excluded: excluded.has(key) };
}

export function excludedAt(fen: string): Set<string> {
  const prefix = `${fenKey(fen)}|`;
  return new Set([...excluded].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)));
}

function send(rootFen: string, rows: string[], shares: ReadonlyMap<string, number>, remove: string[] = []) {
  const r = fenKey(rootFen);
  const s: Record<string, number> = {};
  for (const san of rows) {
    s[san] = shares.get(san) ?? 0;
    // A row with a value keeps showing it while it resumes or is searched again.
    const key = `${r}|${san}`;
    if (results.get(key)?.state !== 'value') queued.add(key);
  }
  postToWorker({ type: 'search', gen, rootFen, rows, shares: s, ...(remove.length ? { remove } : {}) });
  changed();
}

/**
 * The column at a position: `auto` the rows to compute without a click (rows.ts). A new position
 * cancels the rows still running for the old one; rows already answered stay, so going back is
 * instant. On the same position (the table's second answer), only rows not yet asked are added.
 */
export function practicalAt(fen: string, mine: boolean, auto: readonly string[], shares: ReadonlyMap<string, number>): void {
  const r = fenKey(fen);
  if (r !== root) {
    gen++;
    root = r;
    for (const k of [...queued]) if (!k.startsWith(`${r}|`)) queued.delete(k);
    let need: string[] = [];
    if (mine) {
      need = auto.filter((san) => needs(`${r}|${san}`));
      // Rows computed by a click, and left before they finished, resume too.
      for (const [k, v] of results) {
        if (!k.startsWith(`${r}|`) || excluded.has(k) || !unfinished(v)) continue;
        const san = k.slice(r.length + 1);
        if (!need.includes(san)) need.push(san);
      }
    }
    send(fen, need, shares); // sent even when empty: it still cancels the old root
    return;
  }
  if (!mine) return;
  const more = auto.filter((san) => !results.has(`${r}|${san}`) && !queued.has(`${r}|${san}`));
  if (more.length) send(fen, more, shares);
}

/** Nothing is wanted (the panel or the column off): the running search stops. */
export function practicalOff(): void {
  if (root === null) return;
  gen++;
  root = null;
  queued.clear();
  postToWorker({ type: 'search', gen, rootFen: '8/8/8/8/8/8/8/8 w - - 0 1', rows: [], shares: {} });
  changed();
}

/** A click on an empty cell (or a failed one: the retry) computes that row without playing it. */
export function computeRow(fen: string, san: string, shares: ReadonlyMap<string, number>): void {
  if (fenKey(fen) !== root) practicalAt(fen, true, [], shares);
  const key = `${fenKey(fen)}|${san}`;
  if (results.get(key)?.state === 'error') results.delete(key);
  send(fen, [san], shares);
}

/**
 * A right-click (a long-press) on a cell: leave that move out of the analysis at this position, or
 * bring it back. Leaving it out stops its search, so its share of the request budget goes to the
 * other rows, and the depth rounds stop waiting for it.
 */
export function toggleExclude(fen: string, san: string, shares: ReadonlyMap<string, number>): void {
  if (fenKey(fen) !== root) practicalAt(fen, true, [], shares);
  const key = `${fenKey(fen)}|${san}`;
  const r = results.get(key);
  const on = !excluded.has(key);
  if (on) excluded.add(key);
  else excluded.delete(key);
  if (queued.has(key)) queued.delete(key); // it will never be answered
  if (on) send(fen, [], shares, [san]);
  else if (!r || unfinished(r)) send(fen, [san], shares);
  changed();
}

// The filter or the search's options changed: values found under the old ones no longer apply.
let lastConfig = '';
const configKey = () => {
  const p = prefs.peek();
  return JSON.stringify([p.speeds, p.ratings, p.recent, p.local, p.riskAversion, p.budget, p.replyThreshold, p.minGames, p.reachFloor, p.maxPly, p.ownMargin, p.ownMaxCandidates, p.prepPriorGames, p.practicalMaia, p.maiaPreview, maiaSearchKey.peek()]);
};
lastConfig = configKey();
const reconfigured = () => {
  const k = configKey();
  if (k === lastConfig) return;
  lastConfig = k;
  results.clear();
  maiaResults.clear();
  queued.clear();
  root = null;
  changed();
};
prefs.subscribe(reconfigured);
// Maia ready, gone or at another rating (§5.34): the values found without it, or with another, go.
maiaSearchKey.subscribe(reconfigured);

onWorker((m: FromWorker) => {
  if (m.type !== 'update') return;
  const key = `${m.root}|${m.san}`;
  if (m.pass === 'maia') {
    if (m.result.state !== 'excluded') remember(key, { ...m.result, at: Date.now() }, maiaResults);
    changed();
    return;
  }
  queued.delete(key);
  if (m.result.state === 'excluded') {
    changed();
    return;
  }
  remember(key, { ...m.result, at: Date.now() });
  changed();
});
