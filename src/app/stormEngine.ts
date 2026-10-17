// Stockfish for the storm (PLAN.md §5.42, §5.43, §5.45): the walk's scorer on a ChessDB miss, the
// grade's engine tier, and the deepened standard. A client of its own over the same worker and
// search lifecycle as the study page's (§5.30): the storm's screen shows no engine panel, and it
// asks for one position at a time and waits for the answer. Started when first asked, ended when
// the storm's screen is left (`endStormEngine`). Focused scoring (§5.103) runs several workers at
// once, one position each: a lane per worker, the waiting positions dealt to the free ones.
import { positionKeyOf } from '../core/chess/positionKey.ts';
import { createSearch, type Analysis, type DepthScores, type EngineLine, type Search } from '../core/engine/search.ts';
import { positionOf } from '../core/storm/walk.ts';
import { ensure } from '../platform/blobs.ts';
import { startStockfish, stockfishFiles, type EngineProcess } from '../platform/stockfish.ts';
import { enginePrefs, runningThreads } from './engine.ts';

export interface EngineAnswer {
  lines: EngineLine[];
  depth: number;
  /** Each root move's exact score by depth (§5.120), copied when the answer is taken. */
  scores: DepthScores;
}

/** A search's answer as it stands, its scores copied: the search keeps adding to its own. */
const answerOf = (a: Analysis, depth = a.depth): EngineAnswer => ({ lines: a.lines, depth, scores: new Map([...a.scores].map(([uci, byDepth]) => [uci, new Map(byDepth)])) });

interface Job {
  fen: string;
  lines: number;
  depth: number;
  movetime: number;
  /** When a worker took it, ms (`performance.now`). */
  startedAt?: number;
  resolve(a: EngineAnswer | null): void;
}

interface Lane {
  proc?: EngineProcess;
  search?: Search;
  starting?: Promise<boolean>;
  job?: Job;
  timer?: ReturnType<typeof setTimeout>;
}

const phone = () => matchMedia('(max-width: 768px)').matches;
/** A focused lane's hash: each searches a position of its own, so each gets more than the one engine's 32 MB. */
const FOCUSED_HASH_MB = 64;

let lanes: Lane[] = [{}];
const queue: Job[] = [];
let failed = false;

/**
 * Engines at once in focused scoring (§5.103): one a core, less one for the page, at most 16.
 * One where the device can't tell or has two cores or fewer.
 */
export function focusedWidth(): number {
  const cores = typeof navigator === 'undefined' ? 1 : navigator.hardwareConcurrency || 1;
  return Math.max(1, Math.min(16, cores - 1));
}

/** The workers running now. */
export const stormEngineWidth = (): number => lanes.length;

/**
 * One worker on the device's threads (§5.36), or `n` single-threaded ones (§5.103): many positions
 * at once scale with the cores better than one search on many threads. The workers there now end,
 * their searches answered with nothing.
 */
export function setStormEngineWidth(n: number): void {
  if (n === lanes.length) return;
  endStormEngine();
  lanes = Array.from({ length: n }, () => ({}));
}

async function start(lane: Lane): Promise<boolean> {
  if (lane.search) return true;
  if (failed) return false;
  lane.starting ??= (async () => {
    try {
      // The device's version (§5.75) and threads (§5.36), as the study page's engine (§5.84);
      // a focused lane is one thread of its own.
      const version = enginePrefs.peek().version;
      const focused = lanes.length > 1;
      const threads = focused ? 1 : runningThreads();
      const files = stockfishFiles(threads, version);
      await ensure(files);
      if (!lanes.includes(lane)) return false;
      lane.search = createSearch({ send: (c) => lane.proc?.send(c), now: () => performance.now(), onUpdate: (a) => onUpdate(lane, a) });
      lane.proc = startStockfish({ line: (l) => lane.search?.receive(l), crashed: () => crash(lane) }, focused ? FOCUSED_HASH_MB : phone() ? 16 : 32, threads, version);
      return true;
    } catch {
      failed = true;
      return false;
    } finally {
      lane.starting = undefined;
    }
  })();
  return lane.starting;
}

function crash(lane: Lane): void {
  lane.proc?.terminate();
  lane.proc = undefined;
  lane.search = undefined;
  finish(lane, null);
  // A lane of several dies alone; the one engine takes its queue with it, as before.
  if (lanes.length === 1) for (const j of queue.splice(0)) j.resolve(null);
}

function onUpdate(lane: Lane, a: Analysis): void {
  if (!lane.job || a.fen !== lane.job.fen) return;
  if (a.done || a.noMove) finish(lane, answerOf(a));
}

function finish(lane: Lane, a: EngineAnswer | null): void {
  clearTimeout(lane.timer);
  const j = lane.job;
  lane.job = undefined;
  j?.resolve(a);
  void next();
}

async function next(): Promise<void> {
  const lane = lanes.find((l) => !l.job);
  if (!lane || !queue.length) return;
  const job = queue.shift()!;
  job.startedAt = performance.now();
  lane.job = job;
  // Another free lane takes the next position while this one starts.
  void next();
  if (!(await start(lane)) || !lane.search) return finish(lane, null);
  const search = lane.search;
  const pos = positionOf(job.fen);
  if (!pos || pos.isEnd()) return finish(lane, null);
  let legal = 0;
  for (const [, dests] of pos.allDests()) legal += dests.size();
  // A search that runs out of time is taken at the depth it reached (§14.23).
  lane.timer = setTimeout(() => {
    if (lane.job !== job) return;
    const now = search.current();
    search.stop();
    finish(lane, now && now.fen === job.fen && now.lines.length ? answerOf(now) : null);
  }, job.movetime + 4000);
  search.analyse({ fen: job.fen, key: positionKeyOf(pos), turn: pos.turn, depth: job.depth, movetime: job.movetime, lines: job.lines, legal });
}

/**
 * The search under way on `fen` as it stands, at its shallowest line's depth (lines of a MultiPV
 * search finish an iteration one by one); null when none runs there or it has no line yet.
 */
export function stormSearchSoFar(fen: string): EngineAnswer | null {
  const lane = lanes.find((l) => l.job?.fen === fen);
  const now = lane?.search?.current();
  if (!now || now.fen !== fen || !now.lines.length) return null;
  return answerOf(now, Math.min(...now.lines.map((l) => l.depth)));
}

/** A worker's search as it stands (§5.104): what the deepening's progress shows. */
export interface LaneProgress {
  fen: string;
  /** The best line's depth so far, and the depth asked for. */
  depth: number;
  target: number;
  ms: number;
  nps?: number;
}

/** Each worker's search now, null for an idle one. */
export function stormEngineProgress(): (LaneProgress | null)[] {
  return lanes.map((l) => {
    const j = l.job;
    if (!j) return null;
    const now = l.search?.current();
    const on = now && now.fen === j.fen ? now : undefined;
    return { fen: j.fen, depth: on?.depth ?? 0, target: j.depth, ms: performance.now() - (j.startedAt ?? performance.now()), nps: on?.nps };
  });
}

/** Stockfish's MultiPV lines for a position, to `depth` or `movetime` ms; null when it can't. */
export function analyseForStorm(fen: string, lines: number, depth: number, movetime: number): Promise<EngineAnswer | null> {
  return new Promise((resolve) => {
    queue.push({ fen, lines, depth, movetime, resolve });
    void next();
  });
}

/** The searches running and those waiting answered with nothing; the workers stay. */
export function cancelStormEngine(): void {
  for (const j of queue.splice(0)) j.resolve(null);
  for (const lane of lanes) {
    lane.search?.stop();
    finish(lane, null);
  }
}

/** Nothing more is wanted: the queue answered with nothing, the workers ended. */
export function endStormEngine(): void {
  for (const j of queue.splice(0)) j.resolve(null);
  for (const lane of lanes) {
    finish(lane, null);
    lane.search?.stop();
    lane.proc?.terminate();
    lane.proc = undefined;
    lane.search = undefined;
  }
  failed = false;
}
