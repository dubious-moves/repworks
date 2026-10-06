// The explorer in the app (PLAN.md §5.22, §5.23): the device's explorer settings, the worker that
// makes every explorer and ChessDB request, and the panel's lookups. The worker starts on first
// use; its answers are kept for the session, so going back to a position is instant.
import { signal } from '@preact/signals';
import type { LimiterSnapshot } from '../core/explorer/limiter.ts';
import { localInfo, type CompactExplorer } from '../core/explorer/providers.ts';
import { fenKey, type ChessdbAnswer } from '../core/explorer/search.ts';
import type { ExplorerConfig, ExplorerTab, FromWorker, LookupError, ToWorker } from '../core/explorer/service.ts';
import type { SortMode } from '../core/explorer/table.ts';
import { lichessToken, lichessUser } from './lichess.ts';

/** Lichess's time controls and rating buckets, as its explorer (and Qchess's panel) offers them. */
export const SPEEDS = ['bullet', 'blitz', 'rapid', 'classical'] as const;
export const RATINGS = [400, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500] as const;

export interface ExplorerPrefs {
  /** The panel shown (Qchess's database button). */
  on: boolean;
  tab: ExplorerTab;
  sort: SortMode;
  speeds: string[];
  ratings: number[];
  /** Only games of the past 6 months (Qchess's "Only stats from past 6 months"). */
  recent: boolean;
  /** The Practical column (§5.24). */
  practical: boolean;
  /** The Score column's bars show the prepared split (§5.24). */
  prepared: boolean;
  riskAversion: number;
  budget: number;
  /** q_extension's advanced options; shares in percent, as its popup has them. */
  replyThreshold: number;
  minGames: number;
  reachFloor: number;
  maxPly: number;
  ownMargin: number;
  ownMaxCandidates: number;
  prepPriorGames: number;
  /** Ask ChessDB to analyse unknown positions (D9: off). */
  analyse: boolean;
  /** A local explorer's address (§5.25), or ''. */
  local: string;
  /** The panel's height in px, as dragged by its handle; 0 for the layout's default. */
  height: number;
}

// Qchess's defaults for the filter and the sort; q_extension's for the rest.
export const DEFAULT_PREFS: ExplorerPrefs = {
  on: true,
  tab: 'lichess',
  sort: 'eval',
  speeds: ['blitz', 'rapid', 'classical'],
  ratings: [1600, 1800, 2000, 2200, 2500],
  recent: false,
  practical: true,
  prepared: false,
  riskAversion: 0.05,
  budget: 60,
  replyThreshold: 3,
  minGames: 50,
  reachFloor: 2,
  maxPly: 6,
  ownMargin: 5,
  ownMaxCandidates: 3,
  prepPriorGames: 50,
  analyse: false,
  local: '',
  height: 0,
};

const PREFS_KEY = 'repworks-explorer';
const LIMITER_KEY = 'repworks-explorer-limiter';

function loadPrefs(): ExplorerPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<ExplorerPrefs>) : {};
    // ChessDB's own tab is gone: its evals are the games tabs' Eval column and novelties.
    if ((saved.tab as string | undefined) === 'chessdb') delete saved.tab;
    return { ...DEFAULT_PREFS, ...saved };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export const prefs = signal<ExplorerPrefs>(loadPrefs());

export function setPrefs(patch: Partial<ExplorerPrefs>): void {
  prefs.value = { ...prefs.peek(), ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs.peek()));
  } catch {
    // kept for this page only
  }
  if (worker) postConfig();
}

/** `YYYY-MM` six months before `now`: the page's `_sixMonthsAgoYYYYMM()`. */
export function sixMonthsAgo(now: Date): string {
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() - 6);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function configOf(p: ExplorerPrefs, token: string, now: Date): ExplorerConfig {
  return {
    token,
    filter: { speeds: [...p.speeds], ratings: [...p.ratings], ...(p.recent ? { since: sixMonthsAgo(now) } : {}) },
    local: p.local,
    analyse: p.analyse,
    budget: p.budget,
    options: {
      riskAversion: p.riskAversion,
      replyThreshold: p.replyThreshold / 100,
      minGames: p.minGames,
      reachFloor: p.reachFloor / 100,
      maxPly: p.maxPly,
      ownMargin: p.ownMargin,
      ownMaxCandidates: Math.max(1, p.ownMaxCandidates),
      prep: true,
      prepPriorGames: p.prepPriorGames,
    },
  };
}

/** What the filter is, for keys: answers under another filter are other answers. */
const filterKey = (p: ExplorerPrefs) => `${[...p.speeds].sort().join(',')}|${[...p.ratings].sort((a, b) => a - b).join(',')}|${p.recent ? 'recent' : ''}|${p.local}`;

/* ------------------------------------------------------------------ the worker */

let worker: Worker | undefined;
const listeners = new Set<(m: FromWorker) => void>();

function post(m: ToWorker): void {
  ensureWorker()?.postMessage(m);
}

function postConfig(): void {
  worker?.postMessage({ type: 'config', config: configOf(prefs.peek(), lichessToken(), new Date()) } satisfies ToWorker);
}

function ensureWorker(): Worker | undefined {
  if (worker) return worker;
  if (typeof Worker === 'undefined') return undefined;
  worker = new Worker(new URL('../platform/explorerWorker.ts', import.meta.url), { type: 'module', name: 'explorer' });
  worker.onmessage = (e: MessageEvent<FromWorker>) => receive(e.data);
  postConfig();
  // The bucket as the last page left it, so a reload doesn't start with a full one.
  try {
    const saved = sessionStorage.getItem(LIMITER_KEY);
    if (saved) worker.postMessage({ type: 'restore', limiter: JSON.parse(saved) as LimiterSnapshot } satisfies ToWorker);
  } catch {
    // none kept
  }
  return worker;
}

// A login or logout on this device reaches the worker at once.
lichessUser.subscribe(() => {
  if (worker) postConfig();
});

/** Messages from the worker, for the Practical column (§5.24). */
export function onWorker(listener: (m: FromWorker) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function postToWorker(m: ToWorker): void {
  post(m);
}

/* ------------------------------------------------------------------ the panel's lookups */

export interface Lookup {
  key: string;
  tab: ExplorerTab;
  fen: string;
  games?: CompactExplorer;
  gamesError?: LookupError;
  evals?: ChessdbAnswer;
  evalsError?: LookupError;
}

/** The panel's position, as far as it has come. */
export const lookup = signal<Lookup | undefined>(undefined);
/** Until when Lichess asked to slow down (ms since the epoch), or 0. */
export const pausedUntil = signal(0);

const DEBOUNCE_MS = 280; // Qchess's, before a position is asked
const KEEP = 300;
const answers = new Map<string, Lookup>();
let current: { id: number; key: string } | undefined;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;

const keyOf = (tab: ExplorerTab, fen: string, p: ExplorerPrefs) => `${tab}|${fenKey(fen)}|${tab === 'lichess' ? filterKey(p) : ''}`;

function remember(l: Lookup) {
  answers.delete(l.key);
  answers.set(l.key, l);
  if (answers.size > KEEP) answers.delete(answers.keys().next().value!);
}

const complete = (l: Lookup) => (l.tab === 'chessdb' || !!l.games) && !!l.evals;

/** The panel looks at `fen` (undefined: nothing, the panel is off). Asked after a short pause. */
export function lookAt(fen: string | undefined): void {
  clearTimeout(timer);
  const p = prefs.peek();
  const key = fen ? keyOf(p.tab, fen, p) : '';
  if (current && current.key !== key) {
    post({ type: 'drop', id: current.id });
    current = undefined;
  }
  if (!fen) {
    lookup.value = undefined;
    return;
  }
  const kept = answers.get(key);
  lookup.value = kept ?? { key, tab: p.tab, fen };
  if (kept && complete(kept)) return;
  if (current?.key === key) return;
  timer = setTimeout(() => ask(key, p.tab, fen), DEBOUNCE_MS);
}

function ask(key: string, tab: ExplorerTab, fen: string) {
  const id = nextId++;
  current = { id, key };
  // Errors aren't kept: asking again is the retry.
  const base = answers.get(key) ?? { key, tab, fen };
  const { gamesError: _g, evalsError: _e, ...rest } = base;
  lookup.value = rest;
  post({ type: 'lookup', id, tab, fen });
}

/** Asks the panel's position again (after an error, or a login). */
export function retryLookup(): void {
  const l = lookup.peek();
  if (!l) return;
  if (current) post({ type: 'drop', id: current.id });
  current = undefined;
  ask(l.key, l.tab, l.fen);
}

function receive(m: FromWorker) {
  for (const l of listeners) l(m);
  switch (m.type) {
    case 'games':
    case 'evals': {
      if (!current || m.id !== current.id) return;
      const was = lookup.peek();
      if (!was || was.key !== current.key) return;
      const next: Lookup = { ...was };
      if (m.type === 'games') {
        if ('games' in m) {
          next.games = m.games;
          delete next.gamesError;
        } else next.gamesError = m.error;
      } else if ('evals' in m) {
        next.evals = m.evals;
        delete next.evalsError;
      } else next.evalsError = m.error;
      lookup.value = next;
      const { gamesError: _g, evalsError: _e, ...kept } = next;
      remember(kept);
      return;
    }
    case 'paused':
      pausedUntil.value = Date.now() + m.ms;
      return;
    case 'limiter':
      try {
        sessionStorage.setItem(LIMITER_KEY, JSON.stringify(m.snapshot));
      } catch {
        // not kept
      }
      return;
  }
}

/* ------------------------------------------------------------- the local explorer (§5.25) */

/**
 * The settings' Test button: what the local explorer at `address` serves (q_extension's popup's
 * test, its /info), asked from the page. Chrome asks once for the local network the first time.
 */
export async function testLocalExplorer(address: string): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const info = await localInfo((url, init) => fetch(url, init), address);
    const f = (info.filter ?? {}) as { speeds?: string[]; ratings?: number[] };
    const n = (x: unknown) => (typeof x === 'number' ? x.toLocaleString('en-US') : undefined);
    const parts = [`Answers: ${String(info['source'] ?? info.id)}`];
    if (typeof info['created'] === 'string') parts[0] += ` (made ${info['created'].slice(0, 10)})`;
    if (f.speeds?.length || f.ratings?.length) parts.push(`its games: ${(f.speeds ?? []).join(', ') || 'any speed'}; ratings ${(f.ratings ?? []).join(', ') || 'any'}`);
    const sizes = [n(info['positions']) && `${n(info['positions'])} positions`, n(info['games']) && `${n(info['games'])} games`].filter(Boolean);
    if (sizes.length) parts.push(sizes.join(', '));
    return { ok: true, text: `${parts.join(' · ')}. Its filter is fixed: the time controls and ratings above don’t change its answers.` };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `${message}. Is explorerdb serve running, and does it allow this site (the change to q_extension is in Repworks’ TESTING.md)?` };
  }
}
