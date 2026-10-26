// The eval graphs' geometry (the games' and the practice review's), drawn as chess.com draws its
// game-review graph: White's area light and Black's dark, so the colour says who is ahead, and the
// user's side at the bottom as on the board, so the curve rises as the user's game gets better.
// For a Black game White's light area hangs from the top, as the eval bar beside the board does.
import { whiteShare } from '../core/engine/winning.ts';
import type { Color } from '../core/games/record.ts';

/** The height in a graph `h` high of a score for the user (a mate ±10,000): the user's share, as the eval bar counts it. */
export function graphY(userCp: number, h: number): number {
  const share = whiteShare(Math.abs(userCp) >= 10000 ? { mate: userCp > 0 ? 1 : -1 } : { cp: userCp });
  return h - (h * share) / 100;
}

/** The edge White's area closes on: the bottom when the user is White, the top when Black. */
export const whiteEdge = (color: Color, h: number): number => (color === 'white' ? h : 0);

/** The graph's label, its colours read out. */
export const graphLabel = (color: Color) => `The evaluation through the game: White’s advantage light, Black’s dark, ${color === 'white' ? 'White' : 'Black'} (you) at the bottom`;
