// The parts of scripts/maia-eval.ts that need no model (PLAN.md §5.190): reading a Lichess dump,
// replaying its games, sampling positions, scoring a policy against the move played, and the paired
// bootstrap. Plain Node, so a test can run them on a small PGN.
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { zstdDecompress } from 'node:zlib';
import { promisify } from 'node:util';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { isNormal } from 'chessops/types';
import { standardUci } from '../src/core/chess/uci.ts';
import { BEFORE_KEPT, type EvalPosition } from './maia-eval-types.ts';

/* ------------------------------------------------------------------ the dump */

/**
 * The zstd frames in `buf`, whole ones only (`rest` is what is left: a frame not all here yet).
 * A dump is many frames in a row, and starts with a skippable one that Node's decoder rejects;
 * Node's decoder also stops after the first frame it decodes. So the frames are found by their
 * headers and block sizes (RFC 8878 §3.1.1) and decoded one by one; skippable ones are dropped.
 */
export function splitFrames(buf: Buffer): { frames: Buffer[]; rest: Buffer } {
  const frames: Buffer[] = [];
  let at = 0;
  for (;;) {
    if (buf.length - at < 8) break;
    const magic = buf.readUInt32LE(at);
    if ((magic & 0xfffffff0) >>> 0 === 0x184d2a50) {
      const end = at + 8 + buf.readUInt32LE(at + 4);
      if (end > buf.length) break;
      at = end;
      continue;
    }
    if (magic !== 0xfd2fb528) throw new Error(`not a zstd frame at byte ${at}`);
    const fhd = buf[at + 4]!;
    const single = (fhd & 0x20) !== 0;
    let p = at + 5 + (single ? 0 : 1) + [0, 1, 2, 4][fhd & 3]! + [single ? 1 : 0, 2, 4, 8][fhd >> 6]!;
    let last = false;
    while (!last) {
      if (p + 3 > buf.length) return { frames, rest: buf.subarray(at) };
      const h = buf[p]! | (buf[p + 1]! << 8) | (buf[p + 2]! << 16);
      last = (h & 1) === 1;
      const type = (h >> 1) & 3;
      p += 3 + (type === 1 ? 1 : h >> 3);
    }
    if (fhd & 4) p += 4;
    if (p > buf.length) return { frames, rest: buf.subarray(at) };
    frames.push(buf.subarray(at, p));
    at = p;
  }
  return { frames, rest: buf.subarray(at) };
}

/** The decoded text of a `.pgn.zst` read as a stream; a part cut off mid-frame ends at its last whole frame. */
async function* decodedChunks(input: AsyncIterable<Buffer>): AsyncGenerator<Buffer> {
  const decode = promisify(zstdDecompress);
  let rest: Buffer = Buffer.alloc(0);
  for await (const chunk of input) {
    const got = splitFrames(Buffer.concat([rest, chunk]));
    rest = got.rest;
    for (const f of got.frames) yield await decode(f);
  }
}

/**
 * The dump's lines: `-` is standard input (decoded text, e.g. from Python's `zstandard`), `.zst`
 * is decoded here frame by frame, anything else is read as PGN.
 */
export function dumpLines(path: string): AsyncIterable<string> {
  if (path === '-') return createInterface({ input: process.stdin, crlfDelay: Infinity });
  const raw = createReadStream(path);
  if (!path.endsWith('.zst')) return createInterface({ input: raw, crlfDelay: Infinity });
  return createInterface({ input: Readable.from(decodedChunks(raw)), crlfDelay: Infinity });
}

export interface RawGame {
  headers: Record<string, string>;
  moves: string;
}

/** The games of a PGN's lines: headers and movetext, as text. */
export async function* gamesOf(lines: AsyncIterable<string>): AsyncGenerator<RawGame> {
  let headers: Record<string, string> = {};
  let moves: string[] = [];
  let inMoves = false;
  for await (const line of lines) {
    if (line.startsWith('[')) {
      if (inMoves) {
        yield { headers, moves: moves.join(' ') };
        headers = {};
        moves = [];
        inMoves = false;
      }
      const m = /^\[(\w+) "(.*)"\]$/.exec(line);
      if (m) headers[m[1]!] = m[2]!;
    } else if (line.trim()) {
      inMoves = true;
      moves.push(line.trim());
    }
  }
  if (inMoves) yield { headers, moves: moves.join(' ') };
}

/* ------------------------------------------------------------------ one game */

export interface Ply {
  san: string;
  /** Seconds the mover had after the move, from `[%clk]`; undefined without one. */
  clock?: number;
}

/** The movetext's plies: SANs, each with the clock after it. Comments, numbers, NAGs and the result dropped. */
export function pliesOf(movetext: string): Ply[] {
  const out: Ply[] = [];
  const re = /\{([^}]*)\}|(\d+\.+)|\$\d+|(1-0|0-1|1\/2-1\/2|\*)|(\S+)/g;
  for (let m = re.exec(movetext); m; m = re.exec(movetext)) {
    if (m[1] !== undefined) {
      const c = /\[%clk (\d+):(\d+):(\d+(?:\.\d+)?)\]/.exec(m[1]);
      const last = out[out.length - 1];
      if (c && last && last.clock === undefined) last.clock = Number(c[1]) * 3600 + Number(c[2]) * 60 + Number(c[3]);
    } else if (m[4]) out.push({ san: m[4].replace(/[!?]+$/, '') });
  }
  return out;
}

export interface Criteria {
  /** Fullmove numbers of the mover's move, inclusive. */
  moves: [number, number];
  /** Pieces on the board, both sides, inclusive. */
  pieces: [number, number];
  /** Seconds on the mover's clock when the position arises (after their previous move). */
  minClock: number;
}

export const MIDDLEGAME: Criteria = { moves: [11, 35], pieces: [14, 28], minClock: 30 };

export interface Candidate {
  ply: number;
  /** The mover's side. */
  white: boolean;
}

/**
 * The positions of a game that meet the criteria, with the FENs of every position (index = ply, the
 * position before that ply's move) and the moves' UCIs. Stops at an illegal move (the game is cut
 * there; a few exports have them).
 */
export function replay(plies: readonly Ply[], c: Criteria = MIDDLEGAME): { fens: string[]; ucis: string[]; candidates: Candidate[] } {
  const pos = Chess.default();
  const fens: string[] = [];
  const ucis: string[] = [];
  const candidates: Candidate[] = [];
  for (let i = 0; i < plies.length; i++) {
    const fen = makeFen(pos.toSetup());
    fens.push(fen);
    const move = parseSan(pos, plies[i]!.san);
    if (!move || !isNormal(move)) break;
    const full = (i >> 1) + 1;
    // The mover's clock as the position arises: what it showed after their previous move.
    const clock = i >= 2 ? plies[i - 2]!.clock : undefined;
    const n = pos.board.occupied.size();
    if (full >= c.moves[0] && full <= c.moves[1] && n >= c.pieces[0] && n <= c.pieces[1] && clock !== undefined && clock >= c.minClock) candidates.push({ ply: i, white: i % 2 === 0 });
    ucis.push(standardUci(pos, move));
    pos.play(move);
  }
  return { fens, ucis, candidates };
}

/** A seeded random source (mulberry32): the same sample from the same dump and seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const shuffle = <T>(xs: T[], rand: () => number): T[] => {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [xs[i], xs[j]] = [xs[j]!, xs[i]!];
  }
  return xs;
};

export interface SampleOptions {
  speeds: readonly string[];
  /** Band centres; a band takes the movers within `width` of its centre. */
  bands: readonly number[];
  width: number;
  criteria: Criteria;
  seed: number;
  /** Stop reading after this many games that matched (a dump part is large). */
  maxGames?: number;
}

export const speedOf = (event: string): string | undefined => /^Rated (\w+)/.exec(event)?.[1]?.toLowerCase();

/**
 * Every game's one position per side: of the plies that meet the criteria, one at random, for each
 * side whose rating is in a band. Returns the candidates (many more than a sample needs) for
 * `takeSample` to draw from.
 */
export async function candidatesFrom(games: AsyncIterable<RawGame>, o: SampleOptions): Promise<{ all: EvalPosition[]; read: number; used: number }> {
  const rand = rng(o.seed);
  const all: EvalPosition[] = [];
  let read = 0;
  let used = 0;
  for await (const g of games) {
    read++;
    const h = g.headers;
    const speed = speedOf(h['Event'] ?? '');
    if (!speed || !o.speeds.includes(speed) || h['Termination'] === 'Abandoned') continue;
    const wr = Number(h['WhiteElo']);
    const br = Number(h['BlackElo']);
    if (!Number.isFinite(wr) || !Number.isFinite(br)) continue;
    const bandOf = (r: number) => o.bands.find((b) => Math.abs(r - b) <= o.width);
    if (bandOf(wr) === undefined && bandOf(br) === undefined) continue;
    const { fens, ucis, candidates } = replay(pliesOf(g.moves), o.criteria);
    if (!candidates.length) continue;
    used++;
    const id = /\/(\w+)$/.exec(h['Site'] ?? '')?.[1] ?? `g${read}`;
    for (const white of [true, false]) {
      const band = bandOf(white ? wr : br);
      const mine = candidates.filter((c) => c.white === white);
      if (band === undefined || !mine.length) continue;
      const c = mine[Math.floor(rand() * mine.length)]!;
      all.push({
        game: id,
        speed,
        band,
        ply: c.ply,
        fen: fens[c.ply]!,
        before: fens.slice(Math.max(0, c.ply - BEFORE_KEPT), c.ply),
        played: ucis[c.ply]!,
        elo: white ? wr : br,
        oppo: white ? br : wr,
      });
    }
    if (o.maxGames && used >= o.maxGames) break;
  }
  return { all, read, used };
}

/** `perBand` positions of each band, drawn at random (all of a band's, if fewer). */
export function takeSample(all: readonly EvalPosition[], bands: readonly number[], perBand: number, seed: number): EvalPosition[] {
  const rand = rng(seed + 1);
  return bands.flatMap((b) => shuffle(all.filter((p) => p.band === b), rand).slice(0, perBand));
}

/* ------------------------------------------------------------------ scores */

export interface Scored {
  nll: number;
  top1: boolean;
  top3: boolean;
  /** The most likely move's probability and the distribution's entropy (nats): how sharp the model is. */
  topProb: number;
  entropy: number;
  /** The probability of the move played. */
  p: number;
  /** How many of the model's `top` likeliest moves have at least `min` (the endgames' defence takes up to three of 5% or more, §5.147): its candidate set's size. */
  cands: number;
}

/**
 * How a distribution over every legal move does on the move played: `moves` as the model's logits
 * gave them (UCI and logit). Null when the move played isn't among them (a position we replayed
 * wrongly).
 */
export function scoreMoves(moves: readonly { uci: string; logit: number }[], played: string, top = 3, min = 0.05): Scored | null {
  const max = Math.max(...moves.map((m) => m.logit));
  const e = moves.map((m) => Math.exp(m.logit - max));
  const z = e.reduce((a, b) => a + b, 0);
  const i = moves.findIndex((m) => m.uci === played);
  if (i < 0) return null;
  const probs = e.map((x) => x / z);
  const p = probs[i]!;
  const rank = probs.filter((x) => x > p).length;
  const topProb = Math.max(...probs);
  const entropy = -probs.reduce((a, x) => (x > 0 ? a + x * Math.log(x) : a), 0);
  const cands = [...probs].sort((a, b) => b - a).slice(0, top).filter((x) => x >= min).length;
  return { nll: -Math.log(Math.max(p, 1e-12)), top1: rank === 0, top3: rank < 3, topProb, entropy, p, cands };
}

/* ------------------------------------------------------------------ bootstrap */

export interface Interval {
  mean: number;
  lo: number;
  hi: number;
}

/**
 * The mean of `x[i] - y[i]` (or of `x` alone with no `y`) over the positions in `idx`, with a 95%
 * interval from a paired bootstrap that resamples whole games (a game's two sides are not
 * independent): `groups` maps a position to its game's number.
 */
export function pairedBootstrap(x: ArrayLike<number>, y: ArrayLike<number> | undefined, idx: readonly number[], groups: ArrayLike<number>, resamples: number, seed: number): Interval {
  const d = (i: number) => x[i]! - (y ? y[i]! : 0);
  const by = new Map<number, number[]>();
  for (const i of idx) {
    const g = groups[i]!;
    const a = by.get(g);
    if (a) a.push(i);
    else by.set(g, [i]);
  }
  const games = [...by.values()].map((is) => ({ n: is.length, sum: is.reduce((a, i) => a + d(i), 0) }));
  const total = games.reduce((a, g) => a + g.sum, 0);
  const n = idx.length;
  const mean = n ? total / n : NaN;
  if (!games.length) return { mean, lo: NaN, hi: NaN };
  const rand = rng(seed);
  const means: number[] = [];
  for (let r = 0; r < resamples; r++) {
    let s = 0;
    let c = 0;
    for (let k = 0; k < games.length; k++) {
      const g = games[Math.floor(rand() * games.length)]!;
      s += g.sum;
      c += g.n;
    }
    means.push(s / c);
  }
  means.sort((a, b) => a - b);
  return { mean, lo: means[Math.floor(0.025 * resamples)]!, hi: means[Math.min(resamples - 1, Math.floor(0.975 * resamples))]! };
}


/* ------------------------------------------------------------------ the memo's keys */

export interface MemoStats {
  games: number;
  /** Positions asked (every ply of every game up to `plies`). */
  asks: number;
  /** Distinct positions: what the first model's memo (position and rating) keeps. */
  positions: number;
  /** Distinct (position, the last `k` positions before it) by `k`: what the 23M's memo keeps. */
  keys: Record<number, number>;
}

/**
 * How much the history makes the memo grow (§5.190): over the first `plies` plies of each game,
 * the positions asked, the distinct positions, and the distinct positions with the last `k`
 * positions before them for each of `depths`. Openings are where lines meet, so this is the worst
 * case for a key that includes the line: the more a position is reached by different orders, the
 * more keys one position has.
 */
export async function memoStats(games: AsyncIterable<RawGame>, o: { plies: number; depths: readonly number[]; maxGames: number }): Promise<MemoStats> {
  const positions = new Set<string>();
  const keys = new Map<number, Set<string>>(o.depths.map((k) => [k, new Set<string>()]));
  let asks = 0;
  let n = 0;
  const board = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
  const turnKey = (fen: string) => fen.split(' ').slice(0, 2).join(' ');
  for await (const g of games) {
    if (++n > o.maxGames) break;
    const { fens } = replay(pliesOf(g.moves), { moves: [0, 0], pieces: [0, 0], minClock: 0 });
    // fens[i] is the position before ply i: position i of the game; the first `plies`.
    for (let i = 1; i <= Math.min(o.plies, fens.length - 1); i++) {
      asks++;
      const key = board(fens[i]!);
      positions.add(key);
      for (const k of o.depths) keys.get(k)!.add(`${key}|${fens.slice(Math.max(0, i - k), i).map(turnKey).join('|')}`);
    }
  }
  return { games: n - 1, asks, positions: positions.size, keys: Object.fromEntries(o.depths.map((k) => [k, keys.get(k)!.size])) };
}
