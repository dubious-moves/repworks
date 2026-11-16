// Maia 3 for the opening-ideas skill (PLAN.md §5.128): what people at a rating play in a position,
// on onnxruntime-web under Node with the site's own encoding (as test/unit/engine/maia.test.ts
// runs it). The skill reads it for the moves the opponent will really meet us with, and for the
// natural moves that lose (the traps). Never below 2000: Maia plays weaker than its number, and
// the owner wants the opponent read at 2000 or more (2026-10-20).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import * as ort from 'onnxruntime-web';
import { clampElo, expectedScore, maiaHistoryTokens, maiaTokens, policyFrom, type MaiaMove } from '../../src/core/maia/encode.ts';
import { MAIA_BEFORE } from '../../src/core/maia/history.ts';

export const MAIA_FLOOR = 2000;

let session: Promise<ort.InferenceSession> | undefined;
/**
 * The model: the Maia platform's (the position alone), or the official 23M one (`MAIA_MODEL=23m`, or
 * `useModel('23m')`), which reads the positions before too: callers that know the line pass them
 * (PLAN.md §5.190). Chosen before the first read.
 */
let which: 'first' | '23m' = process.env['MAIA_MODEL'] === '23m' ? '23m' : 'first';
export function useModel(m: 'first' | '23m'): void {
  if (session && m !== which) throw new Error('the model is chosen before the first read');
  which = m;
}

function model(): Promise<ort.InferenceSession> {
  if (!session) {
    ort.env.wasm.numThreads = 1;
    session = ort.InferenceSession.create(readFileSync(join(import.meta.dirname, '..', '..', 'vendor', 'maia', which === '23m' ? 'maia3-23m.onnx' : 'maia3_simplified.onnx')));
  }
  return session;
}

export interface MaiaRead {
  elo: number;
  moves: MaiaMove[];
  /** The side to move's expected score, 0 to 1. */
  score: number;
}

/** `before`: the positions that led to `pos`, oldest first (FENs), read by the 23M model. */
export async function maia(pos: Position, elo: number, before: readonly string[] = []): Promise<MaiaRead> {
  if (elo < MAIA_FLOOR) throw new Error(`Maia at ${elo}: read it at ${MAIA_FLOOR} or more (it plays weaker than its number)`);
  const s = await model();
  const e = clampElo(elo);
  const out = await s.run({
    tokens: which === '23m' ? new ort.Tensor('float32', maiaHistoryTokens([...before.slice(-MAIA_BEFORE), makeFen(pos.toSetup())]), [1, 64, 96]) : new ort.Tensor('float32', maiaTokens(makeFen(pos.toSetup())), [1, 64, 12]),
    elo_self: new ort.Tensor('float32', Float32Array.from([e]), [1]),
    elo_oppo: new ort.Tensor('float32', Float32Array.from([e]), [1]),
  });
  return { elo: e, moves: policyFrom(pos, out['logits_move']!.data as Float32Array), score: expectedScore(out['logits_value']!.data as Float32Array) };
}

/** What people play at these ratings, averaged: the decisions' and the deck check's view of a club opponent (or of us). */
export function maiaPolicy(elos: readonly number[] = [MAIA_FLOOR, 2200]): (pos: Position) => Promise<MaiaMove[]> {
  return async (pos) => {
    const sum = new Map<string, MaiaMove>();
    for (const elo of elos) {
      for (const m of (await maia(pos, elo)).moves) {
        const s = sum.get(m.uci);
        sum.set(m.uci, { ...m, prob: (s?.prob ?? 0) + m.prob / elos.length });
      }
    }
    return [...sum.values()].sort((a, b) => b.prob - a.prob);
  };
}
