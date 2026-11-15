// The messages of Maia's worker (PLAN.md §5.32, §5.34): the page's and, over a port, the explorer
// worker's. Types, and the models' names.
import type { GpuInit, GpuNote } from '../engine/gpu.ts';
import type { MaiaMove } from './encode.ts';

/** A MessagePort, as far as the worker uses one (core has no DOM types). */
export interface MaiaPort {
  postMessage(m: FromMaia): void;
  onmessage: ((e: { data: ToMaia }) => void) | null;
}

/**
 * The models (§5.188): `maia3`, the Maia platform's (the position alone); `maia3-23m`, the
 * official 23M one, which reads the seven positions before too.
 */
export const MAIA_MODELS = ['maia3', 'maia3-23m'] as const;
export type MaiaModel = (typeof MAIA_MODELS)[number];

export type ToMaia =
  /** Load the model (stored already: the page downloads it); with `gpu`, on the graphics processor where it serves (§5.184). */
  | { type: 'init'; gpu?: GpuInit; model?: MaiaModel }
  /** Maia's policy and score in a position; `before`, the positions that led to it, oldest first (read by the 23M model). */
  | { type: 'ask'; id: number; fen: string; elo: number; before?: string[] }
  /** The mover's expected score after each of `sans` (Qchess's Ms). */
  | { type: 'scores'; id: number; fen: string; sans: string[]; elo: number }
  /** A port that asks as the page does (the explorer worker's, §5.34). */
  | { type: 'port'; port: MaiaPort };

export type FromMaia =
  /** Ready, with what became of the graphics processor when it was asked for. */
  | { type: 'status'; status: 'ready' | 'missing'; gpu?: GpuNote }
  /** Asked through a port: the page keeps the worker alive while the explorer worker uses it. */
  | { type: 'busy' }
  | { type: 'failed'; reason: string }
  | { type: 'answer'; id: number; policy: MaiaMove[]; value: number }
  | { type: 'scores'; id: number; scores: Record<string, number> }
  | { type: 'error'; id: number; reason: string };
