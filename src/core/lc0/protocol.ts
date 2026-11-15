// The messages of Lc0's worker (PLAN.md §5.143, §5.144). Types only.
import type { GpuInit, GpuNote } from '../engine/gpu.ts';
import type { Lc0Move, Wdl } from './encode.ts';
import type { MoveStat, SearchResult } from './search.ts';

export type ToLc0 =
  /** Load the model (stored already: the page downloads it); with `gpu`, on the graphics processor where it serves (§5.184). */
  | { type: 'init'; gpu?: GpuInit }
  /** Lc0's policy and W/D/L for the last of `fens`: the line from its start, oldest first. */
  | { type: 'ask'; id: number; fens: string[] }
  /** Lc0's searched move at the last of `fens` (§5.144), to `nodes` visits. */
  | { type: 'search'; id: number; fens: string[]; nodes: number }
  /** The search `id` ends at once, with its move so far. */
  | { type: 'stop'; id: number };

export type FromLc0 =
  /** Ready, with what became of the graphics processor when it was asked for. */
  | { type: 'status'; status: 'ready' | 'missing'; gpu?: GpuNote }
  | { type: 'failed'; reason: string }
  | { type: 'answer'; id: number; policy: Lc0Move[]; wdl: Wdl }
  /** A search's visits so far and its move now, every few playouts. */
  | { type: 'progress'; id: number; nodes: number; best: MoveStat }
  | { type: 'searched'; id: number; result: SearchResult }
  | { type: 'error'; id: number; reason: string };
