// The positions that led to the one Maia is asked about (PLAN.md §5.188, §5.190): the official 23M
// model reads the last eight positions, so a caller that knows the line of play sends the seven
// before the asked one (oldest first, as FENs). The first model ignores them. Pure.
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { MAIA_HISTORY } from './encode.ts';

/** How many positions before the asked one the 23M model reads. */
export const MAIA_BEFORE = MAIA_HISTORY - 1;

/**
 * The positions before the last of `line` (the line's positions from its start to the asked one,
 * oldest first), at most `MAIA_BEFORE`, as FENs. A line of one position has none before it: the
 * model then repeats the position, as the official engine does without history.
 */
export function beforeOf(line: readonly (Position | string)[], n: number = MAIA_BEFORE): string[] {
  return line
    .slice(0, -1)
    .slice(-n)
    .map((p) => (typeof p === 'string' ? p : makeFen(p.toSetup())));
}

/** `before` and the position after one more move: what a model asked about the child reads. */
export function beforeChild(before: readonly string[] | undefined, fen: string, n: number = MAIA_BEFORE): string[] {
  return [...(before ?? []), fen].slice(-n);
}

/** A history's key part: each position's board and side to move (the model reads nothing else). */
export const historyKey = (before: readonly string[]): string => before.map((f) => f.split(' ').slice(0, 2).join(' ')).join('|');

/**
 * The positions before a node of a search tree (§5.190): `rootBefore` (the positions that led to
 * the search's root), the root, and each position along `moves` (SANs from the root to the node,
 * the node itself the last, so left out), at most `MAIA_BEFORE`. `play` makes a move's FEN and
 * throws for an illegal one. Undefined when the node's moves aren't known.
 */
export function trailBefore(rootBefore: readonly string[], rootFen: string, moves: readonly string[] | undefined, play: (fen: string, san: string) => string): string[] | undefined {
  if (!moves) return undefined;
  const line = [...rootBefore, rootFen];
  let fen = rootFen;
  for (const san of moves.slice(0, -1)) {
    fen = play(fen, san);
    line.push(fen);
  }
  return line.slice(-MAIA_BEFORE);
}

/**
 * The positions before position `n` of a game: position 0 is `startFen`, position k the `afters[k-1]`
 * (the position after the game's k-th move), and `lead` the positions before the start (a line the
 * game was started from, oldest first). `n` 0 is the start itself, with only `lead` before it.
 */
export function gameBefore(lead: readonly string[] | undefined, startFen: string, afters: readonly string[], n: number): string[] {
  return [...(lead ?? []), ...(n > 0 ? [startFen, ...afters.slice(0, n - 1)] : [])].slice(-MAIA_BEFORE);
}
