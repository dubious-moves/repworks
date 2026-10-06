// Stockfish's UCI output (PLAN.md §5.30): `info` lines and `bestmove`, read into scores from
// White's side and principal variations in SAN. Pure.
import type { Position } from 'chessops/chess';
import { makeSanAndPlay } from 'chessops/san';
import { parseUciMove } from '../chess/uci.ts';

/**
 * A score from White's side: centipawns, or a mate in `mate` moves (positive: White mates;
 * negative: Black mates; 0: the side to move is mated).
 */
export type Score = { cp: number; mate?: undefined } | { mate: number; cp?: undefined };

export interface Info {
  depth: number;
  seldepth?: number;
  /** 1 for the best line. */
  multipv: number;
  /** The score from White's side. */
  score: Score;
  /** A `lowerbound` or `upperbound` score: not the line's value yet. */
  bound: boolean;
  nodes?: number;
  nps?: number;
  /** Milliseconds since `go`. */
  time?: number;
  /** The line, in UCI as the engine writes it (castling e1g1). */
  pv: string[];
}

/**
 * An `info` line carrying a score and a PV, or undefined for any other line (`info string`,
 * `currmove`, a depth with no PV). `turn` is the side to move in the searched position: the
 * engine scores from its side.
 */
export function parseInfo(line: string, turn: 'white' | 'black'): Info | undefined {
  if (!line.startsWith('info ')) return undefined;
  const w = line.split(/\s+/);
  const at = (name: string): number => w.indexOf(name);
  const num = (name: string): number | undefined => {
    const i = at(name);
    if (i < 0) return undefined;
    const n = Number(w[i + 1]);
    return Number.isFinite(n) ? n : undefined;
  };
  const pvAt = at('pv');
  const scoreAt = at('score');
  const depth = num('depth');
  if (pvAt < 0 || scoreAt < 0 || depth === undefined || at('string') >= 0) return undefined;
  const kind = w[scoreAt + 1];
  const value = Number(w[scoreAt + 2]);
  if (!Number.isFinite(value) || (kind !== 'cp' && kind !== 'mate')) return undefined;
  const sign = turn === 'white' ? 1 : -1;
  // `mate 0` (the side to move is mated) keeps its sign-less 0; -0 is avoided.
  const score: Score = kind === 'cp' ? { cp: sign * value || 0 } : { mate: sign * value || 0 };
  const info: Info = {
    depth,
    multipv: num('multipv') ?? 1,
    score,
    bound: w.includes('lowerbound') || w.includes('upperbound'),
    pv: w.slice(pvAt + 1).filter(Boolean),
  };
  const seldepth = num('seldepth');
  const nodes = num('nodes');
  const nps = num('nps');
  const time = num('time');
  if (seldepth !== undefined) info.seldepth = seldepth;
  if (nodes !== undefined) info.nodes = nodes;
  if (nps !== undefined) info.nps = nps;
  if (time !== undefined) info.time = time;
  return info;
}

/** `bestmove e2e4 ponder e7e5` → `e2e4`; `bestmove (none)` → null; any other line → undefined. */
export function parseBestmove(line: string): string | null | undefined {
  if (!line.startsWith('bestmove')) return undefined;
  const move = line.split(/\s+/)[1];
  return !move || move === '(none)' ? null : move;
}

/** A PV in SAN from `pos` (which is left untouched), as far as its moves are legal. */
export function pvToSan(pos: Position, pv: readonly string[]): string[] {
  const p = pos.clone();
  const out: string[] = [];
  for (const uci of pv) {
    const move = parseUciMove(p, uci);
    if (!move) break;
    out.push(makeSanAndPlay(p, move));
  }
  return out;
}

/** A score as Qchess writes it: `+0.38`, `-1.20`, `0.00`, `#3`, `-#2`, and `#0` for mated. */
export function formatScore(score: Score): string {
  if (score.mate !== undefined) return score.mate < 0 ? `-#${-score.mate}` : `#${score.mate}`;
  const pawns = score.cp / 100;
  return pawns > 0 ? `+${pawns.toFixed(2)}` : pawns.toFixed(2);
}
