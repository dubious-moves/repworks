// The messages of Lc0's worker (PLAN.md §5.143, §5.144). Types only.
import type { Lc0Move, Wdl } from './encode.ts';
import type { MoveStat, SearchResult } from './search.ts';

export type ToLc0 =
  /** Load the model (stored already: the page downloads it). */
  | { type: 'init' }
  /** Lc0's policy and W/D/L for the last of `fens`: the line from its start, oldest first. */
  | { type: 'ask'; id: number; fens: string[] }
  /** Lc0's searched move at the last of `fens` (§5.144), to `nodes` visits. */
  | { type: 'search'; id: number; fens: string[]; nodes: number }
  /** The search `id` ends at once, with its move so far. */
  | { type: 'stop'; id: number };

export type FromLc0 =
  | { type: 'status'; status: 'ready' | 'missing' }
  | { type: 'failed'; reason: string }
  | { type: 'answer'; id: number; policy: Lc0Move[]; wdl: Wdl }
  /** A search's visits so far and its move now, every few playouts. */
  | { type: 'progress'; id: number; nodes: number; best: MoveStat }
  | { type: 'searched'; id: number; result: SearchResult }
  | { type: 'error'; id: number; reason: string };
