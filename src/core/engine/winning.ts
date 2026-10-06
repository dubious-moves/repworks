// Winning chances from an engine score (PLAN.md §5.31), as Lichess computes them (lila's
// `winningChances.ts`, which Qchess's eval bar copies): -1 to 1 for White, from a sigmoid over
// centipawns; a mate counts as a large score that shrinks as the mate gets longer.
import type { Score } from './uci.ts';

const MULTIPLIER = -0.00368208;

const fromCp = (cp: number): number => 2 / (1 + Math.exp(MULTIPLIER * cp)) - 1;

/** A mate in `n` as centipawns, as Lichess counts it: 2100 less 100 a move, at least 1100. */
const mateCp = (mate: number): number => {
  const n = Math.abs(mate);
  return Math.sign(mate || -1) * (21 - Math.min(10, n)) * 100;
};

/** White's winning chances, -1 to 1. A mate on the board (`mate 0`) is no score here: 0. */
export function winningChances(score: Score): number {
  if (score.mate !== undefined) return score.mate === 0 ? 0 : fromCp(mateCp(score.mate));
  return fromCp(Math.max(-1000, Math.min(1000, score.cp)));
}

/** White's share of the eval bar, 0 to 100. */
export function whiteShare(score: Score): number {
  return 50 + 50 * winningChances(score);
}
