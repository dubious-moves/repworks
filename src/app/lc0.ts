// Lc0 in the app (PLAN.md §5.143): the device's switch, its worker (started when Lc0 is switched
// on, ended when it is switched off or after 90 s unused: `idle` then, started again by the next
// position), the one-time download behind its dialog, and its answer for the study page's board:
// Lc0's policy and W/D/L there, from the line that led to it. One ask at a time: stepping through
// a line asks for the position the board stops at, not every one on the way. Answers are kept for
// the session.
import { computed, signal } from '@preact/signals';
import { makeFen } from 'chessops/fen';
import type { Position } from 'chessops/chess';
import type { Lc0Move, Wdl } from '../core/lc0/encode.ts';
import type { FromLc0, ToLc0 } from '../core/lc0/protocol.ts';
import { ENGINES, ensure, remove } from '../platform/blobs.ts';

export interface Lc0Prefs {
  on: boolean;
}

export const DEFAULT_LC0_PREFS: Lc0Prefs = { on: false };
const PREFS_KEY = 'repworks-lc0';
const IDLE_MS = 90_000;
/** Positions of the line sent: Lc0 reads 8, and repetitions further back. */
const HISTORY = 30;
export const LC0_FILES = [ENGINES.lc0Model, ENGINES.ortWasm, ENGINES.ortMjs];

function loadPrefs(): Lc0Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return { ...DEFAULT_LC0_PREFS, ...(raw ? (JSON.parse(raw) as Partial<Lc0Prefs>) : {}) };
  } catch {
    return { ...DEFAULT_LC0_PREFS };
  }
}

export const lc0Prefs = signal<Lc0Prefs>(loadPrefs());

export type Lc0State =
  | { kind: 'off' }
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'downloading'; received: number; total: number }
  | { kind: 'ready' }
  /** On, its worker ended after a while unused: started again by the next position. */
  | { kind: 'idle' }
  | { kind: 'failed'; reason: string };

export const lc0State = signal<Lc0State>({ kind: 'off' });
/** The one-time download dialog is open. */
export const lc0Dialog = signal(false);

export interface Lc0Answer {
  /** The position's FEN. */
  fen: string;
  policy: Lc0Move[];
  /** For the side to move. */
  wdl: Wdl;
}

/** Answers by the line's key; replaced (not mutated) so the panel redraws. */
const seen = signal<ReadonlyMap<string, Lc0Answer>>(new Map());
/** The board's line (FENs, oldest first) and its key, while the study page shows it. */
const board = signal<{ key: string; fens: string[] } | undefined>(undefined);

/** Lc0's answer for the board's position, once it has one. */
export const lc0Answer = computed(() => {
  const b = board.value;
  return b ? seen.value.get(b.key) : undefined;
});

function savePrefs(patch: Partial<Lc0Prefs>): void {
  lc0Prefs.value = { ...lc0Prefs.value, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(lc0Prefs.value));
  } catch {
    // This session only.
  }
}

let worker: Worker | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
let nextId = 1;
/** The key asked and not answered yet. */
let asking: string | undefined;

function touch(): void {
  clearTimeout(idle);
  idle = setTimeout(() => {
    if (!asking) stopWorker();
  }, IDLE_MS);
}

function stopWorker(): void {
  worker?.terminate();
  worker = undefined;
  asking = undefined;
  if (lc0State.peek().kind === 'ready') lc0State.value = lc0Prefs.peek().on ? { kind: 'idle' } : { kind: 'off' };
}

function startWorker(): void {
  if (worker) return;
  if (lc0State.peek().kind !== 'idle') lc0State.value = { kind: 'loading' };
  worker = new Worker(new URL('../platform/lc0Worker.ts', import.meta.url), { type: 'module', name: 'lc0' });
  worker.onmessage = (e: MessageEvent<FromLc0>) => {
    const m = e.data;
    if (m.type === 'status') {
      if (m.status === 'missing') {
        lc0State.value = { kind: 'missing' };
        if (lc0Prefs.peek().on) lc0Dialog.value = true;
      } else {
        lc0State.value = { kind: 'ready' };
        pump();
      }
      return;
    }
    if (m.type === 'failed') {
      lc0State.value = { kind: 'failed', reason: m.reason };
      return;
    }
    const key = asking;
    asking = undefined;
    if (key && m.type === 'answer') {
      const next = new Map(seen.peek());
      next.set(key, { fen: key.slice(key.lastIndexOf('|') + 1), policy: m.policy, wdl: m.wdl });
      seen.value = next;
    }
    pump();
  };
  worker.onerror = (e) => {
    lc0State.value = { kind: 'failed', reason: e.message || 'Lc0 stopped working' };
    worker = undefined;
    asking = undefined;
  };
  touch();
  worker.postMessage({ type: 'init' } satisfies ToLc0);
}

/** Asks for the board's position when nothing is asked and it has no answer yet. */
function pump(): void {
  const b = board.peek();
  if (!b || asking || !lc0Prefs.peek().on || seen.peek().has(b.key)) return;
  if (!worker) return startWorker();
  if (lc0State.peek().kind !== 'ready') return;
  asking = b.key;
  touch();
  worker.postMessage({ type: 'ask', id: nextId++, fens: b.fens } satisfies ToLc0);
}

/**
 * The study page's board (§5.31): the line from the chapter's start to the board's position,
 * oldest first, or nothing once the page is left.
 */
export function lc0Position(line: readonly Position[] | undefined): void {
  if (!line?.length) {
    board.value = undefined;
    return;
  }
  const fens = line.slice(-HISTORY).map((p) => makeFen(p.toSetup()));
  board.value = { key: fens.join('|'), fens };
  pump();
}

/** The switch in the engine bar. */
export function setLc0On(on: boolean): void {
  savePrefs({ on });
  if (!on) {
    lc0Dialog.value = false;
    stopWorker();
    lc0State.value = { kind: 'off' };
    return;
  }
  startWorker();
}

/** The dialog's Download: the network and the runtime into the engines' cache, then Lc0 starts. */
export async function downloadLc0(): Promise<void> {
  try {
    await ensure(LC0_FILES, (p) => (lc0State.value = { kind: 'downloading', ...p }));
  } catch (e) {
    lc0State.value = { kind: 'failed', reason: `The download failed: ${e instanceof Error ? e.message : String(e)}` };
    return;
  }
  lc0Dialog.value = false;
  worker?.terminate();
  worker = undefined;
  startWorker();
}

/** The dialog's Cancel: Lc0 stays off. */
export function cancelLc0(): void {
  lc0Dialog.value = false;
  setLc0On(false);
}

/** Deletes the stored network (Lc0 goes off). The runtime stays when Maia shares it. */
export async function deleteLc0(): Promise<void> {
  setLc0On(false);
  await remove([ENGINES.lc0Model]);
}

// Lc0 comes back on with the page when it was left on (its files stored: no dialog then).
if (lc0Prefs.peek().on) startWorker();
