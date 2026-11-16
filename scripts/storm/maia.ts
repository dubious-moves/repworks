// Maia 3 for the cloud gather (PLAN.md §5.155), under Node: the app's Maia worker
// (src/platform/maiaWorker.ts) with the vendored model read from disk, the same runtime
// (onnxruntime-web, one thread) and the same batching (core/maia/batch.ts), so a position's
// ratings are what a device would have given it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ort from 'onnxruntime-web';
import { createMaiaBatch, type MaiaBatch } from '../../src/core/maia/batch.ts';
import { positionOf } from '../../src/core/storm/walk.ts';

const VENDOR = join(import.meta.dirname, '..', '..', 'vendor', 'maia');

let batch: Promise<MaiaBatch> | undefined;
/**
 * The model (§5.188, §5.190): the Maia platform's (default: what the devices run unless they
 * choose the other), or the official 23M one, which reads the positions before too. Chosen before
 * the first ask.
 */
let which: 'first' | '23m' = 'first';
export function useMaiaModel(m: 'first' | '23m'): void {
  if (batch && m !== which) throw new Error('the model is chosen before the first ask');
  which = m;
}
export const maiaModel = (): 'first' | '23m' => which;

function maia(): Promise<MaiaBatch> {
  batch ??= (async () => {
    ort.env.wasm.numThreads = 1;
    const session = await ort.InferenceSession.create(readFileSync(join(VENDOR, which === '23m' ? 'maia3-23m.onnx' : 'maia3_simplified.onnx')));
    return createMaiaBatch({
      history: which === '23m',
      run: async (tokens, elos, n) => {
        const out = await session.run({
          tokens: new ort.Tensor('float32', tokens, [n, 64, which === '23m' ? 96 : 12]),
          elo_self: new ort.Tensor('float32', elos, [n]),
          elo_oppo: new ort.Tensor('float32', Float32Array.from(elos), [n]),
        });
        return { moves: out['logits_move']!.data as Float32Array, values: out['logits_value']!.data as Float32Array };
      },
      defer: (fn) => setImmediate(fn),
    });
  })();
  return batch;
}

/**
 * Maia's policy at each rating (standard UCI and likelihood), as the app's `maiaPolicies`; null
 * when it can't. `before`: the positions that led to `fen`, oldest first, read by the 23M model.
 */
export async function maiaPolicies(fen: string, elos: readonly number[], before?: readonly string[]): Promise<{ uci: string; prob: number }[][] | null> {
  const pos = positionOf(fen);
  if (!pos) return null;
  const m = await maia();
  try {
    const answers = await Promise.all(elos.map((elo) => m.ask(pos, elo, before)));
    return answers.map((a) => a.policy);
  } catch {
    return null;
  }
}
