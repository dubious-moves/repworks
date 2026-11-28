// Stockfish for the audit's numbers (PLAN.md §5.219), made repeatable: one thread, a fixed number
// of nodes, and the hash cleared before every search, so the same engine gives the same score for
// the same question on every run. (A search by time on several threads does not: the difficulty
// measure's expLoss ranged from 1.2 to 2.2 for one move across runs.) Several such engines run side
// by side, one search each at a time, and every answer is kept on disk by its engine, position,
// nodes and moves.
//
// Three engines, each under its own name in the answers kept:
// - `sf19`: Stockfish 19 with its full net, the single-threaded build of the `stockfish` npm
//   package this repo pins (node_modules, after `npm ci`). The same file on every machine, and
//   the strongest here: the screens and the checks of a comment's lines use it.
// - `lite18`: the vendored Stockfish 18 lite, also the same file everywhere. The difficulty
//   measure uses it: the owner's class limits were set on Stockfish 16's scores, which this build
//   reproduces class for class, and which Stockfish 19 does not (PLAN.md §5.219 has the table).
// - `native`: the binary STOCKFISH names (a container's `apt-get install stockfish` gives 16).
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { parseBestmove, parseInfo, type Score } from '../../src/core/engine/uci.ts';
import { whiteShare } from '../../src/core/engine/winning.ts';
import { positionOf } from '../ideas/engine.ts';

export type EngineKind = 'sf19' | 'lite18' | 'native';

const ROOT = join(import.meta.dirname, '..', '..');
const SF19 = join(ROOT, 'node_modules', 'stockfish', 'bin', 'stockfish-19-single.js');

function command(kind: EngineKind): { cmd: string; args: string[] } {
  if (kind === 'native') {
    const native = process.env['STOCKFISH'];
    if (!native) throw new Error('STOCKFISH names no binary: set it, or use the repo\'s own engines');
    return { cmd: native, args: [] };
  }
  if (kind === 'sf19') {
    if (!existsSync(SF19)) throw new Error(`${SF19} is missing: run npm ci in the repworks checkout`);
    return { cmd: process.execPath, args: [SF19] };
  }
  // The vendored build is an ES-module-named file in this package: run from a copy with a .cjs name beside its wasm.
  const dir = join(tmpdir(), 'repworks-audit-sf18');
  if (!existsSync(join(dir, 'sf.cjs'))) {
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(ROOT, 'vendor', 'stockfish', 'stockfish-18-lite-single.wasm'), join(dir, 'sf.wasm'));
    copyFileSync(join(ROOT, 'vendor', 'stockfish', 'stockfish-18-lite-single.js'), join(dir, 'sf.cjs'));
  }
  return { cmd: process.execPath, args: [join(dir, 'sf.cjs')] };
}

export interface FoundLine {
  /** From White's side. */
  score: Score;
  /** UCI as the engine writes it. */
  pv: string[];
  depth: number;
}

export interface Ask {
  fen: string;
  nodes: number;
  /** Best lines wanted (MultiPV); 1 by default. */
  lines?: number;
  /** Only these root moves (UCI, castling as the engine writes it: e1g1). */
  moves?: string[];
}

/** One engine process: one thread, one search at a time, the hash cleared before each. */
class One {
  private proc: ChildProcessWithoutNullStreams;
  private listener: ((line: string) => void) | undefined;
  readonly ready: Promise<string>;

  constructor(kind: EngineKind) {
    const { cmd, args } = command(kind);
    this.proc = spawn(cmd, args);
    createInterface({ input: this.proc.stdout }).on('line', (line) => this.listener?.(line));
    let name: string = kind;
    this.ready = this.until(
      (l) => l === 'readyok',
      (l) => {
        if (l.startsWith('id name ')) name = l.slice('id name '.length).trim();
      },
    ).then(() => name);
    this.proc.stdin.write('uci\nsetoption name Threads value 1\nsetoption name Hash value 64\nisready\n');
  }

  private until(done: (line: string) => boolean, each?: (line: string) => void): Promise<string> {
    return new Promise((resolve) => {
      this.listener = (line) => {
        each?.(line);
        if (done(line)) {
          this.listener = undefined;
          resolve(line);
        }
      };
    });
  }

  async search(a: Ask): Promise<FoundLine[]> {
    await this.ready;
    const turn = positionOf(a.fen).turn;
    const lines = a.lines ?? 1;
    this.proc.stdin.write(`setoption name MultiPV value ${lines}\nucinewgame\nisready\n`);
    await this.until((l) => l === 'readyok');
    // The engine prints every line each time one of them is done, the ones not yet searched at the
    // new depth with the depth before's score: the last print of each is its view when it stopped,
    // every line another move.
    const latest = new Map<number, FoundLine>();
    this.proc.stdin.write(`position fen ${a.fen}\ngo nodes ${a.nodes}${a.moves?.length ? ` searchmoves ${a.moves.join(' ')}` : ''}\n`);
    await this.until(
      (l) => parseBestmove(l) !== undefined,
      (l) => {
        const info = parseInfo(l, turn);
        if (!info || info.bound || !info.pv.length) return;
        latest.set(info.multipv, { score: info.score, pv: info.pv, depth: info.depth });
      },
    );
    return [...latest.entries()].sort((x, y) => x[0] - y[0]).map(([, b]) => b);
  }

  quit(): void {
    this.proc.stdin.write('quit\n');
    this.proc.stdin.end();
    setTimeout(() => this.proc.kill(), 200).unref();
  }
}

export interface Engines {
  /** The engine's own name ("Stockfish 16"), known once the first has started. */
  name(): Promise<string>;
  search(a: Ask): Promise<FoundLine[]>;
  /** Searches answered from the disk, and searches run. */
  counts(): { cached: number; searched: number };
  quit(): void;
}

/**
 * `size` engines (the machine's cores by default) answering in turn, with the answers kept in
 * `cacheDir` (none kept without one). `engine`: `sf19` unless another is asked.
 */
export function createEngines(o: { size?: number; cacheDir?: string; engine?: EngineKind } = {}): Engines {
  const size = Math.max(1, o.size ?? availableParallelism());
  const idle: One[] = [];
  const all: One[] = [];
  const waiting: ((e: One) => void)[] = [];
  const counts = { cached: 0, searched: 0 };
  const take = (): Promise<One> => {
    const e = idle.pop();
    if (e) return Promise.resolve(e);
    if (all.length < size) {
      const made = new One(o.engine ?? 'sf19');
      all.push(made);
      return Promise.resolve(made);
    }
    return new Promise((resolve) => waiting.push(resolve));
  };
  const give = (e: One) => {
    const next = waiting.shift();
    if (next) next(e);
    else idle.push(e);
  };
  let named: Promise<string> | undefined;
  const name = () => {
    named ??= take().then((e) => e.ready.finally(() => give(e)));
    return named;
  };
  return {
    name,
    counts: () => ({ ...counts }),
    async search(a) {
      const engine = await name();
      const file = o.cacheDir ? join(o.cacheDir, `${createHash('sha1').update(JSON.stringify([engine, a.fen, a.nodes, a.lines ?? 1, a.moves ?? []])).digest('hex')}.json`) : undefined;
      if (file && existsSync(file)) {
        try {
          const hit = JSON.parse(readFileSync(file, 'utf8')) as FoundLine[];
          counts.cached++;
          return hit;
        } catch {
          // A file half written by a stopped run: search again.
        }
      }
      const e = await take();
      try {
        const found = await e.search(a);
        counts.searched++;
        if (file) {
          mkdirSync(o.cacheDir!, { recursive: true });
          const tmp = `${file}.${process.pid}.tmp`;
          writeFileSync(tmp, JSON.stringify(found));
          renameSync(tmp, file);
        }
        return found;
      } finally {
        give(e);
      }
    },
    quit: () => all.forEach((e) => e.quit()),
  };
}

/** A score as the win chance of `side`, 0 to 100 (Lichess's curve, as the app's eval bar). */
export const winPct = (score: Score, side: 'white' | 'black'): number => (side === 'white' ? whiteShare(score) : 100 - whiteShare(score));

/** A score in pawns from White's side as text: "+0.62", "-1.20", "#3", "-#2". */
export function pawns(score: Score): string {
  if (score.mate !== undefined) return score.mate === 0 ? '#0' : `${score.mate > 0 ? '' : '-'}#${Math.abs(score.mate)}`;
  const v = score.cp / 100;
  return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

/** A score as centipawns from White's side, a mate as ±(10000 − moves), for telling which move is ahead. */
export const cpOf = (score: Score): number => (score.mate !== undefined ? (score.mate === 0 ? 0 : Math.sign(score.mate) * (10000 - Math.abs(score.mate))) : score.cp);
