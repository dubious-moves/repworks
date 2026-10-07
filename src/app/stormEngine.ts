// Stockfish for the storm (PLAN.md §5.42, §5.43, §5.45): the walk's scorer on a ChessDB miss, the
// grade's engine tier, and the deepened standard. A client of its own over the same worker and
// search lifecycle as the study page's (§5.30): the storm's screen shows no engine panel, and it
// asks for one position at a time and waits for the answer. Started when first asked, ended when
// the storm's screen is left (`endStormEngine`).
import { positionKeyOf } from '../core/chess/positionKey.ts';
import { createSearch, type Analysis, type EngineLine, type Search } from '../core/engine/search.ts';
import { positionOf } from '../core/storm/walk.ts';
import { ensure } from '../platform/blobs.ts';
import { startStockfish, stockfishFiles, type EngineProcess } from '../platform/stockfish.ts';

export interface EngineAnswer {
  lines: EngineLine[];
  depth: number;
}

interface Job {
  fen: string;
  lines: number;
  depth: number;
  movetime: number;
  resolve(a: EngineAnswer | null): void;
}

let proc: EngineProcess | undefined;
let search: Search | undefined;
let starting: Promise<boolean> | undefined;
let job: Job | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const queue: Job[] = [];
let failed = false;

async function start(): Promise<boolean> {
  if (search) return true;
  if (failed) return false;
  starting ??= (async () => {
    try {
      const files = stockfishFiles(1);
      await ensure(files);
      search = createSearch({ send: (c) => proc?.send(c), now: () => performance.now(), onUpdate });
      proc = startStockfish({ line: (l) => search?.receive(l), crashed: () => crash() }, matchMedia('(max-width: 768px)').matches ? 16 : 32, 1);
      return true;
    } catch {
      failed = true;
      return false;
    } finally {
      starting = undefined;
    }
  })();
  return starting;
}

function crash(): void {
  proc?.terminate();
  proc = undefined;
  search = undefined;
  finish(null);
  for (const j of queue.splice(0)) j.resolve(null);
}

function onUpdate(a: Analysis): void {
  if (!job || a.fen !== job.fen) return;
  if (a.done || a.noMove) finish({ lines: a.lines, depth: a.depth });
}

function finish(a: EngineAnswer | null): void {
  clearTimeout(timer);
  const j = job;
  job = undefined;
  j?.resolve(a);
  void next();
}

async function next(): Promise<void> {
  if (job || !queue.length) return;
  job = queue.shift()!;
  if (!(await start()) || !search) return finish(null);
  const pos = positionOf(job.fen);
  if (!pos || pos.isEnd()) return finish(null);
  let legal = 0;
  for (const [, dests] of pos.allDests()) legal += dests.size();
  const j = job;
  // A search that runs out of time is taken at the depth it reached (§14.23).
  timer = setTimeout(() => {
    if (job !== j) return;
    const now = search?.current();
    search?.stop();
    finish(now && now.fen === j.fen && now.lines.length ? { lines: now.lines, depth: now.depth } : null);
  }, j.movetime + 4000);
  search.analyse({ fen: j.fen, key: positionKeyOf(pos), turn: pos.turn, depth: j.depth, movetime: j.movetime, lines: j.lines, legal });
}

/** Stockfish's MultiPV lines for a position, to `depth` or `movetime` ms; null when it can't. */
export function analyseForStorm(fen: string, lines: number, depth: number, movetime: number): Promise<EngineAnswer | null> {
  return new Promise((resolve) => {
    queue.push({ fen, lines, depth, movetime, resolve });
    void next();
  });
}

/** The search running and those waiting answered with nothing; the worker stays. */
export function cancelStormEngine(): void {
  for (const j of queue.splice(0)) j.resolve(null);
  search?.stop();
  finish(null);
}

/** Nothing more is wanted: the queue answered with nothing, the worker ended. */
export function endStormEngine(): void {
  for (const j of queue.splice(0)) j.resolve(null);
  finish(null);
  search?.stop();
  proc?.terminate();
  proc = undefined;
  search = undefined;
  failed = false;
}
