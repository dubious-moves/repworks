// Stockfish for the opening-ideas skill (PLAN.md §5.128), under Node: the vendored lite build
// (copied with a .cjs name beside its wasm, as test/unit/engine/stockfish.test.ts runs it), or a
// native binary named by STOCKFISH, much stronger and faster where one is installed. Each search
// is kept on disk by its position, depth, lines and moves searched, so a skill run that asks the
// same question twice (or several agents at once) searches once.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { Chess, type Position } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseBestmove, parseInfo, pvToSan, type Score } from '../../src/core/engine/uci.ts';
import { winningChances } from '../../src/core/engine/winning.ts';

const VENDOR = join(import.meta.dirname, '..', '..', 'vendor', 'stockfish');
const cacheDir = () => process.env['IDEAS_CACHE'] ?? join(tmpdir(), 'repworks-ideas-cache');

export interface Line {
  /** From White's side. */
  score: Score;
  /** UCI as the engine writes it. */
  pv: string[];
  san: string[];
}

export interface Search {
  fen: string;
  depth: number;
  lines: Line[];
  engine: string;
}

export interface SearchOptions {
  depth: number;
  lines?: number;
  /** Only these root moves (UCI). */
  moves?: string[];
}

function engineCommand(): { cmd: string; args: string[]; label: string } {
  const native = process.env['STOCKFISH'];
  if (native) return { cmd: native, args: [], label: `native:${native}` };
  const version = process.env['STOCKFISH_LITE'] ?? '18';
  const dir = join(tmpdir(), `repworks-ideas-sf${version}`);
  if (!existsSync(join(dir, 'sf.cjs'))) {
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(VENDOR, `stockfish-${version}-lite-single.wasm`), join(dir, 'sf.wasm'));
    copyFileSync(join(VENDOR, `stockfish-${version}-lite-single.js`), join(dir, 'sf.cjs'));
  }
  return { cmd: process.execPath, args: [join(dir, 'sf.cjs')], label: `lite${version}` };
}

/** One engine process, searching one position at a time. */
export class Engine {
  private proc: ChildProcessWithoutNullStreams;
  private listener: ((line: string) => void) | undefined;
  private ready: Promise<void>;
  readonly label: string;

  constructor() {
    const { cmd, args, label } = engineCommand();
    this.label = label;
    this.proc = spawn(cmd, args);
    createInterface({ input: this.proc.stdout }).on('line', (line) => this.listener?.(line));
    this.ready = this.until((l) => l === 'readyok').then(() => undefined);
    const threads = Number(process.env['STOCKFISH_THREADS'] ?? 0);
    this.proc.stdin.write(`uci\n${threads && process.env['STOCKFISH'] ? `setoption name Threads value ${threads}\n` : ''}setoption name Hash value 64\nisready\n`);
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

  async search(fen: string, o: SearchOptions): Promise<Search> {
    const pos = positionOf(fen);
    const lines = o.lines ?? 1;
    const key = createHash('sha1').update(JSON.stringify([this.label, makeFen(pos.toSetup()), o.depth, lines, o.moves ?? []])).digest('hex');
    const file = join(cacheDir(), `${key}.json`);
    if (existsSync(file)) {
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as Search;
      } catch {
        // A cache file half written by a killed run: search again.
      }
    }
    await this.ready;
    const best = new Map<number, { depth: number; score: Score; pv: string[] }>();
    this.proc.stdin.write(`setoption name MultiPV value ${lines}\nposition fen ${fen}\ngo depth ${o.depth}${o.moves?.length ? ` searchmoves ${o.moves.join(' ')}` : ''}\n`);
    await this.until(
      (l) => parseBestmove(l) !== undefined,
      (l) => {
        const info = parseInfo(l, pos.turn);
        if (!info || info.bound || !info.pv.length) return;
        const prev = best.get(info.multipv);
        if (!prev || info.depth >= prev.depth) best.set(info.multipv, { depth: info.depth, score: info.score, pv: info.pv });
      },
    );
    const out: Search = {
      fen,
      depth: Math.max(0, ...[...best.values()].map((b) => b.depth)),
      lines: [...best.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => ({ score: b.score, pv: b.pv, san: pvToSan(pos, b.pv) })),
      engine: this.label,
    };
    mkdirSync(cacheDir(), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(out));
    renameSync(tmp, file);
    return out;
  }

  quit(): void {
    this.proc.stdin.write('quit\n');
    this.proc.stdin.end();
    setTimeout(() => this.proc.kill(), 200).unref();
  }
}

export function positionOf(fen: string): Position {
  const setup = parseFen(fen);
  if (setup.isErr) throw new Error(`not a FEN: ${fen}`);
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) throw new Error(`not a legal position: ${fen} (${pos.error.message})`);
  return pos.value;
}

/** A score from White's side as centipawns, mates as ±(10000 − distance), for comparing moves. */
export function cpOf(score: Score): number {
  if (score.mate !== undefined) return score.mate === 0 ? 0 : Math.sign(score.mate) * (10000 - Math.abs(score.mate));
  return score.cp;
}

/** Lichess's winning chances for White, 0 to 100. */
export const whiteWinPct = (score: Score) => 50 + 50 * winningChances(score);

/** A score as text from `side`'s view: `+0.62` or `#3`. */
export function scoreText(score: Score, side: 'white' | 'black' = 'white'): string {
  const s = side === 'white' ? 1 : -1;
  if (score.mate !== undefined) return score.mate === 0 ? '#0' : `${score.mate * s > 0 ? '' : '-'}#${Math.abs(score.mate)}`;
  // A mate carried as centipawns (cpOf).
  if (Math.abs(score.cp) >= 9000) return `${score.cp * s > 0 ? '' : '-'}#${10000 - Math.abs(score.cp)}`;
  const v = (score.cp * s) / 100;
  return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}
