// Maia in the app (PLAN.md §5.32, §5.33): the device's Maia settings, its worker (started when
// Maia is switched on, ended when it is switched off or after 90 s unused: an ORT session holds
// hundreds of MB; `idle` then, and started again by the next ask, its columns kept meanwhile), the
// one-time download behind Qchess's dialog, and the explorer's asks: the policy at the board's
// position and Qchess's Ms for the first rows. Answers are kept for the session.
import { computed, signal } from '@preact/signals';
import { maiaEloFor, type MaiaMove } from '../core/maia/encode.ts';
import type { FromMaia, ToMaia } from '../core/maia/protocol.ts';
import { ENGINES, ensure, remove } from '../platform/blobs.ts';
import { linkMaia, prefs as explorerPrefs, setPrefs as setExplorerPrefs } from './explorer.ts';
import { effect } from '@preact/signals';

export interface MaiaPrefs {
  on: boolean;
  /** Maia's rating, or 0 for the explorer's filter's (q_extension's `maiaEloFor`). */
  rating: number;
}

export const DEFAULT_MAIA_PREFS: MaiaPrefs = { on: false, rating: 0 };
const PREFS_KEY = 'repworks-maia';
const IDLE_MS = 90_000;
export const MAIA_FILES = [ENGINES.maiaModel, ENGINES.ortWasm, ENGINES.ortMjs];

function loadPrefs(): MaiaPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return { ...DEFAULT_MAIA_PREFS, ...(raw ? (JSON.parse(raw) as Partial<MaiaPrefs>) : {}) };
  } catch {
    return { ...DEFAULT_MAIA_PREFS };
  }
}

export const maiaPrefs = signal<MaiaPrefs>(loadPrefs());

/** The rating Maia plays at: the one chosen, or the explorer's filter's. */
export const maiaElo = computed(() => maiaPrefs.value.rating || maiaEloFor(explorerPrefs.value.ratings));

export type MaiaState =
  | { kind: 'off' }
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'downloading'; received: number; total: number }
  | { kind: 'ready' }
  /** On, its worker ended after a while unused (its memory freed): started again by the next ask. */
  | { kind: 'idle' }
  | { kind: 'failed'; reason: string };

export const maiaState = signal<MaiaState>({ kind: 'off' });
/** Qchess's one-time download dialog is open. */
export const maiaDialog = signal(false);

export interface MaiaSeen {
  policy?: MaiaMove[];
  /** Qchess's Ms by SAN: the mover's expected score after the move. */
  scores: Record<string, number>;
  /** SANs whose score was asked. */
  asked: Set<string>;
  error?: string;
}

/** What Maia said, by `<fen>|<elo>`; replaced (not mutated) so the explorer redraws. */
export const maiaSeen = signal<ReadonlyMap<string, MaiaSeen>>(new Map());
export const maiaKey = (fen: string, elo: number) => `${fen}|${elo}`;

export function setMaiaPrefs(patch: Partial<MaiaPrefs>): void {
  maiaPrefs.value = { ...maiaPrefs.value, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(maiaPrefs.value));
  } catch {
    // This session only.
  }
}

let worker: Worker | undefined;
let idle: ReturnType<typeof setTimeout> | undefined;
let nextId = 1;
const waiting = new Map<number, (m: FromMaia) => void>();

function post(m: ToMaia): void {
  touch();
  worker?.postMessage(m);
}

function touch(): void {
  clearTimeout(idle);
  idle = setTimeout(() => {
    if (!waiting.size) stopWorker();
  }, IDLE_MS);
}

function stopWorker(): void {
  worker?.terminate();
  worker = undefined;
  for (const w of waiting.values()) w({ type: 'error', id: 0, reason: 'Maia was stopped' });
  waiting.clear();
  // Ended for being unused, not switched off: the explorer keeps its columns, and the next ask
  // starts it again. (Set to `off` before, the columns went and nothing asked again: the owner
  // had to switch Maia off and on, 2026-10-08.)
  if (maiaState.peek().kind === 'ready') maiaState.value = { kind: 'idle' };
}

/** Whether the worker is ended and the next ask should start it: switched on, unused a while. */
const asleep = () => !worker && maiaPrefs.peek().on && (maiaState.peek().kind === 'off' || maiaState.peek().kind === 'idle');

function startWorker(): void {
  if (worker) return;
  // Started again after a while unused: still `idle` (its columns kept) until it is ready.
  if (maiaState.peek().kind !== 'idle') maiaState.value = { kind: 'loading' };
  worker = new Worker(new URL('../platform/maiaWorker.ts', import.meta.url), { type: 'module', name: 'maia' });
  worker.onmessage = (e: MessageEvent<FromMaia>) => {
    const m = e.data;
    if (m.type === 'status') {
      if (m.status === 'missing') {
        maiaState.value = { kind: 'missing' };
        if (maiaPrefs.peek().on) maiaDialog.value = true;
      } else maiaState.value = { kind: 'ready' };
      return;
    }
    if (m.type === 'failed') {
      maiaState.value = { kind: 'failed', reason: m.reason };
      return;
    }
    if (m.type === 'busy') return touch();
    const w = waiting.get(m.id);
    if (w) {
      waiting.delete(m.id);
      w(m);
    }
  };
  worker.onerror = (e) => {
    maiaState.value = { kind: 'failed', reason: e.message || 'Maia stopped working' };
    worker = undefined;
  };
  post({ type: 'init' });
}

/** Qchess's Maia switch. On also opens the explorer, where Maia's columns are. */
export function setMaiaOn(on: boolean): void {
  setMaiaPrefs({ on });
  if (!on) {
    maiaDialog.value = false;
    stopWorker();
    maiaState.value = { kind: 'off' };
    return;
  }
  if (!explorerPrefs.peek().on) setExplorerPrefs({ on: true });
  startWorker();
}

/** The dialog's Download: the model and the runtime into the engines' cache, then Maia starts. */
export async function downloadMaia(): Promise<void> {
  try {
    await ensure(MAIA_FILES, (p) => (maiaState.value = { kind: 'downloading', ...p }));
  } catch (e) {
    maiaState.value = { kind: 'failed', reason: `The download failed: ${e instanceof Error ? e.message : String(e)}` };
    return;
  }
  maiaDialog.value = false;
  worker?.terminate();
  worker = undefined;
  startWorker();
}

/** The dialog's Cancel: Maia stays off. */
export function cancelMaia(): void {
  maiaDialog.value = false;
  setMaiaOn(false);
}

/** Deletes the stored model and runtime (Maia goes off). */
export async function deleteMaia(): Promise<void> {
  setMaiaOn(false);
  await remove(MAIA_FILES);
}

function update(key: string, fn: (s: MaiaSeen) => MaiaSeen): void {
  const next = new Map(maiaSeen.peek());
  next.set(key, fn(next.get(key) ?? { scores: {}, asked: new Set() }));
  maiaSeen.value = next;
}

type Asked = Extract<ToMaia, { id: number }>;
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;

function ask<T extends FromMaia>(m: WithoutId<Asked>): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve) => {
    waiting.set(id, resolve as (m: FromMaia) => void);
    post({ ...m, id } as ToMaia);
  });
}

/** Maia's policy at `fen`, at the rating in use; once per position and rating this session. */
export function requestPolicy(fen: string): void {
  if (!maiaPrefs.peek().on) return;
  const elo = maiaElo.peek();
  const key = maiaKey(fen, elo);
  const seen = maiaSeen.peek().get(key);
  if (seen?.policy || seen?.error || seen?.asked.has('')) return;
  // Ended after a while unused: started again, and asked once it is ready (the explorer asks again then).
  if (asleep()) return startWorker();
  if (maiaState.peek().kind !== 'ready') return;
  update(key, (s) => ({ ...s, asked: new Set([...s.asked, '']) }));
  void ask<Extract<FromMaia, { type: 'answer' } | { type: 'error' }>>({ type: 'ask', fen, elo }).then((r) =>
    update(key, (s) => (r.type === 'answer' ? { ...s, policy: r.policy } : { ...s, error: r.reason })),
  );
}

/**
 * Maia's policy at `fen` and `elo`, for practice's opponent (§5.57): null when Maia is off, or not
 * ready within 5 s of starting (mistake-lab waits as long for its model).
 */
export async function maiaPolicy(fen: string, elo: number): Promise<MaiaMove[] | null> {
  if (!maiaPrefs.peek().on) return null;
  if (asleep()) startWorker();
  const starting = () => maiaState.peek().kind === 'loading' || (maiaState.peek().kind === 'idle' && !!worker);
  for (let waited = 0; starting() && waited < 5000; waited += 100) await new Promise((r) => setTimeout(r, 100));
  if (maiaState.peek().kind !== 'ready') return null;
  const r = await ask<Extract<FromMaia, { type: 'answer' } | { type: 'error' }>>({ type: 'ask', fen, elo });
  return r.type === 'answer' ? r.policy : null;
}

/** Qchess's Ms for `sans` at `fen` (those not asked yet). */
export function requestScores(fen: string, sans: readonly string[]): void {
  if (!maiaPrefs.peek().on) return;
  const elo = maiaElo.peek();
  const key = maiaKey(fen, elo);
  const seen = maiaSeen.peek().get(key);
  const fresh = sans.filter((s) => !seen?.asked.has(s));
  if (!fresh.length) return;
  if (asleep()) return startWorker();
  if (maiaState.peek().kind !== 'ready') return;
  update(key, (s) => ({ ...s, asked: new Set([...s.asked, ...fresh]) }));
  void ask<Extract<FromMaia, { type: 'scores' } | { type: 'error' }>>({ type: 'scores', fen, sans: [...fresh], elo }).then((r) => {
    if (r.type === 'scores') update(key, (s) => ({ ...s, scores: { ...s.scores, ...r.scores } }));
  });
}

// The Practical search asks Maia too (§5.34), over a port of its own into this worker, while Maia
// is ready; the rating goes with it.
effect(() => {
  const ready = maiaState.value.kind === 'ready' && maiaPrefs.value.on;
  const elo = maiaElo.value;
  linkMaia(
    ready && worker
      ? {
          elo,
          connect: () => {
            const channel = new MessageChannel();
            worker?.postMessage({ type: 'port', port: channel.port1 }, [channel.port1]);
            return channel.port2;
          },
        }
      : undefined,
  );
});

// Maia comes back on with the page when it was left on (its files stored: no dialog then).
if (maiaPrefs.peek().on) startWorker();
