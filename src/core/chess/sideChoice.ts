// The colour a drill is played with (PLAN.md §5.195): both, or White or Black alone. The storm and
// the endgames deal only what the user plays with the colour chosen, so a robotic board (the
// Chessnut Move) isn't turned between positions; kept per device, both by default.
import type { Color } from 'chessops/types';

export type SideChoice = 'both' | Color;
export const SIDE_CHOICES: readonly SideChoice[] = ['both', 'white', 'black'];

/** A stored choice read back: anything but White or Black is both. */
export const cleanSideChoice = (v: unknown): SideChoice => (v === 'white' || v === 'black' ? v : 'both');

/** Whether something the user plays as `side` is dealt with the choice. */
export const onSide = (choice: SideChoice, side: Color): boolean => choice === 'both' || choice === side;

/** How many of `items` the user plays with each colour. */
export function countBySide<T>(items: Iterable<T>, sideOf: (t: T) => Color): Record<Color, number> {
  const n = { white: 0, black: 0 };
  for (const t of items) n[sideOf(t)]++;
  return n;
}
