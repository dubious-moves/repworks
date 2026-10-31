// The messages of Lc0's worker (PLAN.md §5.143). Types only.
import type { Lc0Move, Wdl } from './encode.ts';

export type ToLc0 =
  /** Load the model (stored already: the page downloads it). */
  | { type: 'init' }
  /** Lc0's policy and W/D/L for the last of `fens`: the line from its start, oldest first. */
  | { type: 'ask'; id: number; fens: string[] };

export type FromLc0 =
  | { type: 'status'; status: 'ready' | 'missing' }
  | { type: 'failed'; reason: string }
  | { type: 'answer'; id: number; policy: Lc0Move[]; wdl: Wdl }
  | { type: 'error'; id: number; reason: string };
