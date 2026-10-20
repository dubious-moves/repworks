// Maia 3 for the opening-ideas skill (PLAN.md §5.128): what people at a rating play in a position,
// on onnxruntime-web under Node with the site's own encoding (as test/unit/engine/maia.test.ts
// runs it). The skill reads it for the moves the opponent will really meet us with, and for the
// natural moves that lose (the traps).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Position } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import * as ort from 'onnxruntime-web';
import { clampElo, expectedScore, maiaTokens, policyFrom, type MaiaMove } from '../../src/core/maia/encode.ts';

let session: Promise<ort.InferenceSession> | undefined;

function model(): Promise<ort.InferenceSession> {
  if (!session) {
    ort.env.wasm.numThreads = 1;
    session = ort.InferenceSession.create(readFileSync(join(import.meta.dirname, '..', '..', 'vendor', 'maia', 'maia3_simplified.onnx')));
  }
  return session;
}

export interface MaiaRead {
  elo: number;
  moves: MaiaMove[];
  /** The side to move's expected score, 0 to 1. */
  score: number;
}

export async function maia(pos: Position, elo: number): Promise<MaiaRead> {
  const s = await model();
  const e = clampElo(elo);
  const out = await s.run({
    tokens: new ort.Tensor('float32', maiaTokens(makeFen(pos.toSetup())), [1, 64, 12]),
    elo_self: new ort.Tensor('float32', Float32Array.from([e]), [1]),
    elo_oppo: new ort.Tensor('float32', Float32Array.from([e]), [1]),
  });
  return { elo: e, moves: policyFrom(pos, out['logits_move']!.data as Float32Array), score: expectedScore(out['logits_value']!.data as Float32Array) };
}
