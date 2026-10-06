// The messages of Maia's worker (PLAN.md §5.32, §5.34): the page's and, over a port, the explorer
// worker's. Types only.
import type { MaiaMove } from './encode.ts';

/** A MessagePort, as far as the worker uses one (core has no DOM types). */
export interface MaiaPort {
  postMessage(m: FromMaia): void;
  onmessage: ((e: { data: ToMaia }) => void) | null;
}

export type ToMaia =
  /** Load the model (stored already: the page downloads it). */
  | { type: 'init' }
  /** Maia's policy and score in a position. */
  | { type: 'ask'; id: number; fen: string; elo: number }
  /** The mover's expected score after each of `sans` (Qchess's Ms). */
  | { type: 'scores'; id: number; fen: string; sans: string[]; elo: number }
  /** A port that asks as the page does (the explorer worker's, §5.34). */
  | { type: 'port'; port: MaiaPort };

export type FromMaia =
  | { type: 'status'; status: 'ready' | 'missing' }
  | { type: 'failed'; reason: string }
  | { type: 'answer'; id: number; policy: MaiaMove[]; value: number }
  | { type: 'scores'; id: number; scores: Record<string, number> }
  | { type: 'error'; id: number; reason: string };
