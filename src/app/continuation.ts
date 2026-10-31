// Lc0 against people from a move (PLAN.md §5.144): the move menu's continuation. Lc0 searches its
// side's moves in a worker of its own (the board's Lc0 row keeps its worker); people's moves come
// from the explorer's Lichess database at this device's filter, with Maia blended in under
// BLEND_GAMES games (src/core/lc0/continuation.ts). One run at a time; the result is shown in a
// dialog and goes into the chapter when asked.
import { signal } from '@preact/signals';
import { makeFen } from 'chessops/fen';
import { modelContinuation, type ContinuationPly, type DbMoves, type Side } from '../core/lc0/continuation.ts';
import type { FromLc0, ToLc0 } from '../core/lc0/protocol.ts';
import type { MoveStat, SearchResult } from '../core/lc0/search.ts';
import type { FromWorker, ToWorker } from '../core/explorer/service.ts';
import { addLine } from '../core/study/ops.ts';
import { nodeAt, positionsTo, type Path } from '../core/study/tree.ts';
import { ENGINES, ensure, stored } from '../platform/blobs.ts';
import { chapter, doc, edit, feedback, goTo } from './editor.ts';
import { onWorker, postToWorker, prefs as explorerPrefs } from './explorer.ts';
import { LC0_FILES } from './lc0.ts';
import { maiaElo, maiaPolicies } from './maia.ts';

export const NODE_CHOICES = [100, 400, 800, 1600] as const;
export const PLY_CHOICES = [2, 4, 6, 8, 10, 12] as const;

export interface ContinuationPrefs {
  plies: number;
  /** Lc0's search: the root's visits for each of its moves. */
  nodes: number;
}

export const DEFAULT_CONTINUATION_PREFS: ContinuationPrefs = { plies: 6, nodes: 800 };
const PREFS_KEY = 'repworks-continuation';
/** The database's answer is waited for this long (it queues behind the panel's asks). */
const DB_WAIT_MS = 60_000;
export const CONTINUATION_FILES = [...new Set([...LC0_FILES, ENGINES.maiaModel])];

function loadPrefs(): ContinuationPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return { ...DEFAULT_CONTINUATION_PREFS, ...(raw ? (JSON.parse(raw) as Partial<ContinuationPrefs>) : {}) };
  } catch {
    return { ...DEFAULT_CONTINUATION_PREFS };
  }
}

export const continuationPrefs = signal<ContinuationPrefs>(loadPrefs());

export function setContinuationPrefs(patch: Partial<ContinuationPrefs>): void {
  continuationPrefs.value = { ...continuationPrefs.peek(), ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(continuationPrefs.peek()));
  } catch {
    // This session only.
  }
}

export interface ContinuationRun {
  /** The chapter and move it starts from. */
  chapterId: string;
  from: Path;
  /** The move it starts after, as the notation writes it ("12...Rad8"), or "the start". */
  fromLabel: string;
  /** Whose move it is at the start: the first ply's number follows. */
  startPly: number;
  lc0: Side;
  plies: number;
  nodes: number;
  /** The database's filter and Maia's rating, as used. */
  filter: { speeds: string[]; ratings: number[] };
  maiaElo: number;
  phase: 'setup' | 'missing' | 'downloading' | 'running' | 'done' | 'failed';
  /** While downloading. */
  received?: number;
  total?: number;
  moves: ContinuationPly[];
  /** Lc0 searching: its visits so far and its move now. */
  thinking?: { nodes: number; best: MoveStat };
  /** People's move being looked up. */
  looking?: boolean;
  ended?: 'game over' | 'no move' | 'stopped';
  error?: string;
}

export const continuation = signal<ContinuationRun | undefined>(undefined);

let runId = 0;

const plyNumber = (ply: number) => `${Math.floor(ply / 2) + 1}${ply % 2 ? '...' : '.'}`;

/** The move menu's item: the dialog, set up for the move at `path` (Lc0 on the board's side). */
export function openContinuation(path: Path, boardSide: Side): void {
  const c = chapter.peek();
  if (!c || !nodeAt(c, path)) return;
  const history = positionsTo(c, path);
  const start = history[0]!;
  const startPly = (start.fullmoves - 1) * 2 + (start.turn === 'black' ? 1 : 0) + path.length;
  const p = continuationPrefs.peek();
  const e = explorerPrefs.peek();
  continuation.value = {
    chapterId: c.id,
    from: [...path],
    fromLabel: path.length ? `${plyNumber(startPly - 1)}${path[path.length - 1]}` : 'the start',
    startPly,
    lc0: boardSide,
    plies: p.plies,
    nodes: p.nodes,
    filter: { speeds: [...e.speeds], ratings: [...e.ratings] },
    maiaElo: maiaElo.peek(),
    phase: 'setup',
    moves: [],
  };
}

const patch = (id: number, fn: (r: ContinuationRun) => Partial<ContinuationRun>): void => {
  const r = continuation.peek();
  if (r && id === runId) continuation.value = { ...r, ...fn(r) };
};

/** The dialog's settings before a run. */
export function setRunOptions(o: Partial<Pick<ContinuationRun, 'lc0' | 'plies' | 'nodes'>>): void {
  const r = continuation.peek();
  if (!r || r.phase === 'running' || r.phase === 'downloading') return;
  continuation.value = { ...r, ...o };
  const keep: Partial<ContinuationPrefs> = {};
  if (o.plies) keep.plies = o.plies;
  if (o.nodes) keep.nodes = o.nodes;
  if (o.plies || o.nodes) setContinuationPrefs(keep);
}

export function closeContinuation(): void {
  stopContinuation();
  continuation.value = undefined;
}

/** Stops a run: Lc0's search ends at once with its move so far, and nothing more is played. */
export function stopContinuation(): void {
  const r = continuation.peek();
  runId++;
  if (searching !== undefined) worker?.postMessage({ type: 'stop', id: searching } satisfies ToLc0);
  if (r?.phase === 'running') continuation.value = { ...r, phase: 'done', ended: 'stopped' };
  else if (r?.phase === 'downloading') continuation.value = { ...r, phase: 'missing' };
}

/* ------------------------------------------------------------------ Lc0's search worker */

let worker: Worker | undefined;
let ready: Promise<void> | undefined;
let nextId = 1;
let searching: number | undefined;
const waiting = new Map<number, { resolve(r: SearchResult): void; reject(e: Error): void; progress(n: number, best: MoveStat): void }>();
let idle: ReturnType<typeof setTimeout> | undefined;
const IDLE_MS = 90_000;

function startWorker(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    const w = new Worker(new URL('../platform/lc0Worker.ts', import.meta.url), { type: 'module', name: 'lc0-search' });
    worker = w;
    w.onmessage = (e: MessageEvent<FromLc0>) => {
      const m = e.data;
      if (m.type === 'status') return m.status === 'ready' ? resolve() : reject(new Error('Lc0’s files are not on this device'));
      if (m.type === 'failed') return reject(new Error(m.reason));
      if (!('id' in m)) return;
      const job = waiting.get(m.id);
      if (!job) return;
      if (m.type === 'progress') return job.progress(m.nodes, m.best);
      waiting.delete(m.id);
      if (searching === m.id) searching = undefined;
      if (m.type === 'searched') job.resolve(m.result);
      else if (m.type === 'error') job.reject(new Error(m.reason));
    };
    w.onerror = (e) => {
      reject(new Error(e.message || 'Lc0 stopped working'));
      for (const job of waiting.values()) job.reject(new Error(e.message || 'Lc0 stopped working'));
      waiting.clear();
      endWorker();
    };
    w.postMessage({ type: 'init' } satisfies ToLc0);
  });
  ready.catch(() => endWorker());
  return ready;
}

function endWorker(): void {
  worker?.terminate();
  worker = undefined;
  ready = undefined;
  searching = undefined;
}

function touch(): void {
  clearTimeout(idle);
  idle = setTimeout(() => {
    if (!waiting.size) endWorker();
  }, IDLE_MS);
}

async function lc0Move(fens: string[], nodes: number, progress: (n: number, best: MoveStat) => void): Promise<SearchResult> {
  await startWorker();
  touch();
  const id = nextId++;
  return new Promise<SearchResult>((resolve, reject) => {
    waiting.set(id, {
      resolve: (r) => (touch(), resolve(r)),
      reject,
      progress,
    });
    searching = id;
    worker!.postMessage({ type: 'search', id, fens, nodes } satisfies ToLc0);
  });
}

/* ------------------------------------------------------------------ people's moves */

type Reply = Extract<FromWorker, { type: 'practiceGames' }>;
let nextDbId = 900_000_000;
const dbWaiting = new Map<number, (r: Reply) => void>();
let listening = false;

function dbMoves(fen: string, filter: { speeds: string[]; ratings: number[] }): Promise<DbMoves | { error: string }> {
  if (!listening) {
    listening = true;
    onWorker((r) => {
      if (r.type !== 'practiceGames') return;
      const w = dbWaiting.get(r.id);
      dbWaiting.delete(r.id);
      w?.(r);
    });
  }
  const id = nextDbId++;
  return new Promise((resolve) => {
    const timer = setTimeout(() => (dbWaiting.delete(id), resolve({ error: 'the Lichess database did not answer within a minute' })), DB_WAIT_MS);
    dbWaiting.set(id, (r) => {
      clearTimeout(timer);
      if ('error' in r) resolve({ error: r.error.login ? `${r.error.message} (log in to Lichess for its database)` : r.error.message });
      else resolve({ total: r.games.total, moves: r.games.moves.map((m) => ({ uci: m.uci, san: m.san, games: m.white + m.draws + m.black })) });
    });
    postToWorker({ type: 'practiceGames', id, fen, speeds: filter.speeds, ratings: filter.ratings } satisfies ToWorker);
  });
}

/* ------------------------------------------------------------------ a run */

/** The dialog's Start (and Download first, when the files aren't on this device). */
export async function runContinuation(download = false): Promise<void> {
  const r = continuation.peek();
  const c = chapter.peek();
  if (!r || !c || c.id !== r.chapterId || r.phase === 'running' || r.phase === 'downloading') return;
  const id = ++runId;
  if (!(await stored(CONTINUATION_FILES).catch(() => false))) {
    if (!download) return patch(id, () => ({ phase: 'missing' }));
    patch(id, () => ({ phase: 'downloading', received: 0, total: 0 }));
    try {
      await ensure(CONTINUATION_FILES, (p) => patch(id, () => ({ received: p.received, total: p.total })));
    } catch (e) {
      return patch(id, () => ({ phase: 'failed', error: `The download failed: ${e instanceof Error ? e.message : String(e)}` }));
    }
    if (id !== runId) return;
  }
  const history = positionsTo(c, r.from);
  patch(id, () => ({ phase: 'running', moves: [], thinking: undefined, looking: false, ended: undefined, error: undefined }));
  try {
    const out = await modelContinuation({
      history,
      plies: r.plies,
      lc0: r.lc0,
      stopped: () => id !== runId,
      ports: {
        lc0: (line) => {
          patch(id, () => ({ thinking: { nodes: 0, best: { uci: '', san: '', visits: 0, prior: 0 } } }));
          return lc0Move(
            line.map((p) => makeFen(p.toSetup())),
            r.nodes,
            (n, best) => patch(id, () => ({ thinking: { nodes: n, best } })),
          );
        },
        db: (fen) => {
          patch(id, () => ({ looking: true }));
          return dbMoves(fen, r.filter);
        },
        maia: async (fen) => (await maiaPolicies(fen, [r.maiaElo]))?.[0],
      },
      onPly: (ply) => patch(id, (x) => ({ moves: [...x.moves, ply], thinking: undefined, looking: false })),
    });
    patch(id, () => ({ phase: 'done', thinking: undefined, looking: false, ...(out.ended ? { ended: out.ended } : {}) }));
  } catch (e) {
    patch(id, () => ({ phase: 'failed', thinking: undefined, looking: false, error: e instanceof Error ? e.message : String(e) }));
  }
}

/** The line's moves as SAN, numbered from its start: "13. Re1 Qb6 14. Bf1". */
export function continuationText(r: Pick<ContinuationRun, 'startPly' | 'moves'>): string {
  return r.moves
    .map((m, i) => {
      const ply = r.startPly + i;
      return ply % 2 === 0 ? `${plyNumber(ply)} ${m.san}` : i === 0 ? `${plyNumber(ply)}${m.san}` : m.san;
    })
    .join(' ');
}

/** The dialog's "Add to the chapter": the moves after the start, followed where they are there already. */
export function addContinuation(): boolean {
  const r = continuation.peek();
  const c = chapter.peek();
  if (!r || !c || !doc.peek() || c.id !== r.chapterId || !r.moves.length) return false;
  const sans = r.moves.map((m) => m.san);
  const planned = addLine(c, r.from, sans);
  if (!planned.ok) return (feedback.value = planned.error), false;
  const ok = edit((ch) => {
    const added = addLine(ch, r.from, sans);
    return added.ok ? { ok: true, value: added.value.chapter } : added;
  }, planned.value.path);
  if (!ok) return false;
  goTo(planned.value.path);
  feedback.value = `Lc0 vs people added: ${continuationText(r)}`;
  continuation.value = undefined;
  return true;
}
