// Stockfish in the app (PLAN.md §5.30, §5.31): the device's engine settings, the worker (its
// files downloaded on first use), the search lifecycle (core/engine/search.ts) and what it shows.
// The study page tells it the board's position; it searches only while the engine is on, the
// page visible and this the one tab running it (Qchess's rule: a tab starting the engine stops it
// in the others). A `stop` that brings no `bestmove` within 3 s, or a crash, restarts the worker
// (mistake-lab's guard); three failures in a row and it gives up.
import { signal } from '@preact/signals';
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { positionKeyOf } from '../core/chess/positionKey.ts';
import { createSearch, type Analysis, type Search, type SearchRequest } from '../core/engine/search.ts';
import { ensure } from '../platform/blobs.ts';
import { startStockfish, stockfishFiles, STOCKFISH_VERSIONS, type EngineProcess, type StockfishVersion } from '../platform/stockfish.ts';
import { isolated, wantIsolation } from '../platform/isolation.ts';

export interface EnginePrefs {
  on: boolean;
  depth: number;
  lines: number;
  /** Seconds; 0 for no limit. */
  movetime: number;
  arrows: boolean;
  /** Engine threads (§5.36): more than one needs the page isolated, which the service worker does. */
  threads: number;
  /** Stockfish's version (§5.75): 18 by default, 19 as an option. */
  version: StockfishVersion;
}

// Qchess's defaults (depth 20, 8 s), with three lines for the outline's MultiPV arrows.
export const DEFAULT_ENGINE_PREFS: EnginePrefs = { on: false, depth: 20, lines: 3, movetime: 8, arrows: true, threads: 1, version: 18 };
export const DEPTHS = [20, 30, 40] as const;
export const MOVETIMES = [5, 8, 30] as const;

const PREFS_KEY = 'repworks-engine';

function loadPrefs(): EnginePrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const prefs = { ...DEFAULT_ENGINE_PREFS, ...(raw ? (JSON.parse(raw) as Partial<EnginePrefs>) : {}) };
    if (!STOCKFISH_VERSIONS.includes(prefs.version)) prefs.version = DEFAULT_ENGINE_PREFS.version;
    return prefs;
  } catch {
    return { ...DEFAULT_ENGINE_PREFS };
  }
}

export const enginePrefs = signal<EnginePrefs>(loadPrefs());

export type EngineStatus =
  | { kind: 'off' }
  | { kind: 'loading'; received: number; total: number }
  | { kind: 'ready' }
  | { kind: 'failed'; reason: string };

export const engineStatus = signal<EngineStatus>({ kind: 'off' });
/** What the engine shows for the board's position (or its threat), or nothing. */
export const analysis = signal<Analysis | undefined>(undefined);
/** Qchess's threat (W): the board's position with the other side to move. */
export const threat = signal(false);

export function updateEnginePrefs(patch: Partial<EnginePrefs>): void {
  enginePrefs.value = { ...enginePrefs.value, ...patch };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(enginePrefs.value));
  } catch {
    // Settings stay for this session only.
  }
  if ('on' in patch) {
    if (patch.on) claimTab();
    else stopEngine();
  }
  // Threads (§5.36): the page isolated from its next load when more than one is wanted, and the
  // engine started again with the build and threads that now apply.
  if ('threads' in patch) {
    void wantIsolation((patch.threads ?? 1) > 1);
    if (runningThreads() !== started) teardown();
  }
  // The version (§5.75): the engine started again with the other build.
  if ('version' in patch && patch.version !== startedVersion) teardown();
  refresh();
}

/** Ends the worker and the search; the next position starts them again. */
function teardown(): void {
  clearTimeout(watchdog);
  proc?.terminate();
  proc = undefined;
  search = undefined;
  analysis.value = undefined;
  engineStatus.value = { kind: 'off' };
}

const RESTART_AFTER_STOP_MS = 3000;
const MAX_FAILURES = 3;

let proc: EngineProcess | undefined;
let search: Search | undefined;
let starting: Promise<void> | undefined;
let failures = 0;
let watchdog: ReturnType<typeof setTimeout> | undefined;
let flush: ReturnType<typeof setTimeout> | undefined;
let pendingShow: Analysis | undefined;
/** The board's position, as the page last said. */
let board: Position | undefined;
let deeper = false;

const hashMb = (): number => (matchMedia('(max-width: 768px)').matches ? 16 : 32);
/** The threads the engine runs with: those chosen when the page is isolated, else one. */
export const runningThreads = (): number => (isolated() ? Math.max(1, enginePrefs.peek().threads) : 1);
let started = 1;
let startedVersion: StockfishVersion = 18;

// The lines come many times a second at low depths: shown at most every 100 ms.
function show(a: Analysis): void {
  pendingShow = a;
  if (flush) return;
  flush = setTimeout(() => {
    flush = undefined;
    analysis.value = pendingShow;
  }, 100);
}

function send(command: string): void {
  proc?.send(command);
  if (command === 'stop') armWatchdog();
}

function armWatchdog(): void {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    if (search?.stopping()) restart('Stockfish did not answer a stop');
  }, RESTART_AFTER_STOP_MS);
}

function spawn(): void {
  proc = startStockfish(
    {
      line: (line) => {
        if (line.startsWith('bestmove')) {
          clearTimeout(watchdog);
          failures = 0;
        }
        search?.receive(line);
      },
      crashed: (reason) => restart(reason),
    },
    hashMb(),
    started,
    startedVersion,
  );
}

function restart(reason: string): void {
  proc?.terminate();
  proc = undefined;
  failures++;
  if (failures >= MAX_FAILURES) {
    engineStatus.value = { kind: 'failed', reason };
    search = undefined;
    return;
  }
  spawn();
  search?.reset();
}

async function startEngine(): Promise<void> {
  if (search) return;
  if (starting) return starting;
  starting = (async () => {
    try {
      started = runningThreads();
      startedVersion = enginePrefs.peek().version;
      const files = stockfishFiles(started, startedVersion);
      engineStatus.value = { kind: 'loading', received: 0, total: files.reduce((n, f) => n + f.bytes, 0) };
      await ensure(files, (p) => {
        engineStatus.value = { kind: 'loading', ...p };
      });
      failures = 0;
      search = createSearch({ send, now: () => performance.now(), onUpdate: show });
      spawn();
      engineStatus.value = { kind: 'ready' };
    } catch (e) {
      engineStatus.value = { kind: 'failed', reason: `The engine could not be downloaded: ${e instanceof Error ? e.message : String(e)}` };
    } finally {
      starting = undefined;
    }
  })();
  return starting;
}

/** Stops the search; the worker stays, for the next position. */
function stopEngine(): void {
  search?.stop();
  clearTimeout(flush);
  flush = undefined;
  analysis.value = undefined;
}

/** The position the engine looks at: the board's, or with threat on the other side's move. */
function request(): SearchRequest | undefined {
  const pos = board;
  if (!pos || pos.isEnd()) return undefined;
  let p = pos;
  if (threat.value) {
    if (pos.isCheck()) return undefined;
    p = pos.clone();
    p.turn = p.turn === 'white' ? 'black' : 'white';
    p.epSquare = undefined;
    if (p.isCheck() || p.isEnd()) return undefined;
  }
  const prefs = enginePrefs.value;
  let legal = 0;
  for (const [, dests] of p.allDests()) legal += dests.size();
  return {
    fen: makeFen(p.toSetup()),
    key: positionKeyOf(p),
    turn: p.turn,
    depth: prefs.depth,
    movetime: prefs.movetime > 0 ? prefs.movetime * 1000 : Infinity,
    lines: threat.value ? 1 : prefs.lines,
    legal,
    deeper,
  };
}

function active(): boolean {
  return enginePrefs.value.on && document.visibilityState === 'visible' && engineStatus.value.kind !== 'failed';
}

function refresh(): void {
  if (!active()) return void stopEngine();
  const req = request();
  if (!req) return void stopEngine();
  if (!search) {
    void startEngine().then(() => search && active() && refresh());
    return;
  }
  search.analyse(req);
}

/** The study page's board: the position shown, or undefined when it leaves the page. */
export function analysePosition(pos: Position | undefined): void {
  board = pos;
  deeper = false;
  if (!pos) threat.value = false;
  refresh();
}

/** Qchess's "+": past the depth and time, until the position changes. */
export function goDeeper(): void {
  deeper = true;
  refresh();
}

export function setThreat(on: boolean): void {
  threat.value = on;
  deeper = false;
  if (on && !enginePrefs.value.on) updateEnginePrefs({ on: true });
  else refresh();
}

/** After "failed": try again from the start. */
export function retryEngine(): void {
  failures = 0;
  engineStatus.value = { kind: 'off' };
  refresh();
}

// One tab at a time runs the engine.
const tabId = Math.random().toString(36).slice(2);
const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('repworks-engine');
function claimTab(): void {
  channel?.postMessage({ running: tabId });
}
channel?.addEventListener('message', (e: MessageEvent<{ running?: string }>) => {
  if (e.data.running && e.data.running !== tabId && enginePrefs.value.on) {
    // Off here, without touching the device's setting, which the other tab has just used.
    enginePrefs.value = { ...enginePrefs.value, on: false };
    stopEngine();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && enginePrefs.value.on) claimTab();
  refresh();
});
