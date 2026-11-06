// Stockfish for the cloud gather (PLAN.md §5.155), under Node: the app's storm engine
// (src/app/stormEngine.ts) with a child process in place of the page's worker. The same search
// lifecycle (core's `createSearch`), the same answer (the lines, the depth and every root move's
// score by depth, §5.120), the same rule for a search out of time (taken at the depth it reached,
// §14.23), and focused scoring's lanes (§5.103): several single-threaded engines, each searching a
// position of its own. The engine is the vendored lite build the app runs by default (18; 19 with
// STOCKFISH_LITE=19), or a native binary named by STOCKFISH.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { positionKeyOf } from '../../src/core/chess/positionKey.ts';
import { createSearch, type Analysis, type DepthScores, type EngineLine, type Search } from '../../src/core/engine/search.ts';
import { positionOf } from '../../src/core/storm/walk.ts';

const VENDOR = join(import.meta.dirname, '..', '..', 'vendor', 'stockfish');
/** A lane's hash, as the app's focused lanes (§5.103). */
export const LANE_HASH_MB = 64;

export interface EngineAnswer {
  lines: EngineLine[];
  depth: number;
  scores: DepthScores;
}

/** The command that starts one engine, and its name in the log. */
export function engineCommand(env: NodeJS.ProcessEnv = process.env): { cmd: string; args: string[]; label: string } {
  const native = env['STOCKFISH'];
  if (native) return { cmd: native, args: [], label: `native ${native}` };
  const version = env['STOCKFISH_LITE'] === '19' ? '19' : '18';
  // The wasm is found by the script's own name, and this repo's package type would make a .js an ES module.
  const dir = join(tmpdir(), `repworks-storm-sf${version}`);
  if (!existsSync(join(dir, 'sf.cjs'))) {
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(VENDOR, `stockfish-${version}-lite-single.wasm`), join(dir, 'sf.wasm'));
    copyFileSync(join(VENDOR, `stockfish-${version}-lite-single.js`), join(dir, 'sf.cjs'));
  }
  return { cmd: process.execPath, args: [join(dir, 'sf.cjs')], label: `Stockfish ${version} lite` };
}

interface Job {
  fen: string;
  lines: number;
  depth: number;
  movetime: number;
  resolve(a: EngineAnswer | null): void;
}

interface Lane {
  proc: ChildProcessWithoutNullStreams;
  /** The engine exited: it takes no more positions. */
  dead?: boolean;
  search: Search;
  ready: Promise<void>;
  job?: Job;
  timer?: ReturnType<typeof setTimeout>;
}

export interface Engines {
  readonly width: number;
  readonly label: string;
  /** MultiPV `lines` to `depth`, or for `movetime` ms; null when it can't. */
  analyse(fen: string, lines: number, depth: number, movetime: number): Promise<EngineAnswer | null>;
  /** The searches under way and waiting answered with nothing; the engines stay. */
  cancel(): void;
  quit(): void;
}

/** A search's answer as it stands, its scores copied: the search keeps adding to its own. */
const answerOf = (a: Analysis): EngineAnswer => ({ lines: a.lines, depth: a.depth, scores: new Map([...a.scores].map(([uci, byDepth]) => [uci, new Map(byDepth)])) });

/** `width` engines, each one thread with a hash of its own, taking the waiting positions in turn. */
export function startEngines(width: number, env: NodeJS.ProcessEnv = process.env): Engines {
  const { cmd, args, label } = engineCommand(env);
  const queue: Job[] = [];
  const finish = (lane: Lane, a: EngineAnswer | null) => {
    clearTimeout(lane.timer);
    const j = lane.job;
    lane.job = undefined;
    j?.resolve(a);
    next();
  };
  const lanes: Lane[] = Array.from({ length: Math.max(1, width) }, () => {
    const proc = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let readyok: () => void = () => undefined;
    let handshake = true;
    const ready = new Promise<void>((resolve) => (readyok = resolve));
    const lane: Lane = {
      proc,
      ready,
      search: createSearch({
        send: (c) => proc.stdin.write(c + '\n'),
        now: () => performance.now(),
        onUpdate: (a) => {
          if (lane.job && a.fen === lane.job.fen && (a.done || a.noMove)) finish(lane, answerOf(a));
        },
      }),
    };
    createInterface({ input: proc.stdout }).on('line', (line) => {
      if (handshake) {
        if (line === 'uciok') proc.stdin.write(`setoption name Hash value ${LANE_HASH_MB}\nisready\n`);
        else if (line === 'readyok') {
          handshake = false;
          readyok();
        }
        return;
      }
      lane.search.receive(line);
    });
    proc.on('exit', () => {
      lane.dead = true;
      finish(lane, null);
    });
    proc.stdin.on('error', () => undefined);
    proc.stdin.write('uci\n');
    return lane;
  });

  function next(): void {
    // Every engine gone: nothing will answer.
    if (lanes.every((l) => l.dead)) for (const j of queue.splice(0)) j.resolve(null);
    const lane = lanes.find((l) => !l.job && !l.dead);
    if (!lane || !queue.length) return;
    const job = queue.shift()!;
    lane.job = job;
    next();
    void lane.ready.then(() => {
      if (lane.job !== job) return;
      const pos = positionOf(job.fen);
      if (!pos || pos.isEnd()) return finish(lane, null);
      let legal = 0;
      for (const [, dests] of pos.allDests()) legal += dests.size();
      // A search that runs out of time is taken at the depth it reached (§14.23).
      lane.timer = setTimeout(() => {
        if (lane.job !== job) return;
        const now = lane.search.current();
        lane.search.stop();
        finish(lane, now && now.fen === job.fen && now.lines.length ? answerOf(now) : null);
      }, job.movetime + 4000);
      lane.search.analyse({ fen: job.fen, key: positionKeyOf(pos), turn: pos.turn, depth: job.depth, movetime: job.movetime, lines: job.lines, legal });
    });
  }

  return {
    width: lanes.length,
    label,
    analyse: (fen, lines, depth, movetime) =>
      new Promise((resolve) => {
        queue.push({ fen, lines, depth, movetime, resolve });
        next();
      }),
    cancel() {
      for (const j of queue.splice(0)) j.resolve(null);
      for (const lane of lanes) {
        lane.search.stop();
        finish(lane, null);
      }
    },
    quit() {
      for (const j of queue.splice(0)) j.resolve(null);
      for (const lane of lanes) {
        finish(lane, null);
        lane.proc.stdin.end('quit\n');
        setTimeout(() => lane.proc.kill(), 500).unref();
      }
    },
  };
}
