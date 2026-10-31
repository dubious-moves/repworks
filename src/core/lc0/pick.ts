// Lc0's pick among Stockfish's close lines (PLAN.md §5.143): where two or more of the engine's
// lines are within `CLOSE_CP` of the best for the side to move, the one whose first move Lc0's
// policy likes most. Pure.
import type { Score } from '../engine/uci.ts';
import type { Lc0Move } from './encode.ts';

/** Lines this close to the best (centipawns, the mover's side) are a choice between equals. */
export const CLOSE_CP = 30;

/** A score as centipawns from White's side, a mate beyond any (the sooner, the larger). */
const value = (s: Score): number => (s.mate !== undefined ? Math.sign(s.mate || -1) * (100_000 - Math.abs(s.mate)) : s.cp);

export interface PickLine {
  /** From White's side. */
  score: Score;
  /** UCI, castling as e1g1. */
  pv: readonly string[];
}

/**
 * The first move (UCI) of the close line Lc0 prefers, or undefined when fewer than two lines are
 * close (nothing to choose between). `lines` best first, as the engine gives them.
 */
export function lc0Pick(lines: readonly PickLine[], policy: readonly Lc0Move[], turn: 'white' | 'black'): string | undefined {
  const best = lines[0];
  if (!best) return undefined;
  const sign = turn === 'white' ? 1 : -1;
  const top = sign * value(best.score);
  const close = lines.filter((l) => l.pv[0] && top - sign * value(l.score) <= CLOSE_CP);
  if (close.length < 2) return undefined;
  let pick = close[0]!;
  for (const l of close) if (shareOf(policy, l.pv[0]!) > shareOf(policy, pick.pv[0]!)) pick = l;
  return pick.pv[0];
}

/** Lc0's policy share of `uci`: 0 for a move under its policy's floor. */
export const shareOf = (policy: readonly Lc0Move[], uci: string): number => policy.find((m) => m.uci === uci)?.prob ?? 0;
