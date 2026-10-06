// Maia's runs, batched (PLAN.md §5.32): q_extension's `createMaia` (`tools/repgen/maia.mjs`,
// `c26242f`). One run at a time; requests made while one runs, or in the same turn, share the
// next, up to `maxBatch` positions (a batch of 32 took 12 ms a position in q_extension against 35
// for one alone); answers are kept by position and rating; a position asked twice while in
// flight is run once. The model's run, and how to wait for the turn's end, are passed in. Pure.
import type { Position } from 'chessops/chess';
import { positionKeyOf } from '../chess/positionKey.ts';
import { expectedScore, MAIA_MOVES, MAIA_TOKENS, maiaTokens, policyFrom, type MaiaMove } from './encode.ts';
import { makeFen } from 'chessops/fen';

export interface MaiaOutput {
  /** batch × 4352 move logits. */
  moves: ArrayLike<number>;
  /** batch × 3 value logits (loss, draw, win for the side to move). */
  values: ArrayLike<number>;
}

export interface MaiaAnswer {
  /** The legal moves, most likely first, without the long tail. */
  policy: MaiaMove[];
  /** The side to move's expected score, 0 to 1. */
  value: number;
}

export interface MaiaBatchOptions {
  run(tokens: Float32Array, elos: Float32Array, batch: number): Promise<MaiaOutput>;
  /** Calls `fn` once the current turn's requests are in (q_extension's setImmediate). */
  defer(fn: () => void): void;
  maxBatch?: number;
  /** Answers kept (q_extension's 20,000). */
  memo?: number;
}

export interface MaiaBatch {
  ask(pos: Position, elo: number): Promise<MaiaAnswer>;
  counts(): { positions: number; batches: number };
}

interface Queued {
  pos: Position;
  elo: number;
  key: string;
  tokens: Float32Array;
  resolve(a: MaiaAnswer): void;
  reject(e: unknown): void;
}

export function createMaiaBatch(o: MaiaBatchOptions): MaiaBatch {
  const maxBatch = o.maxBatch ?? 32;
  const memoMax = o.memo ?? 20000;
  const memo = new Map<string, MaiaAnswer>();
  const inflight = new Map<string, Promise<MaiaAnswer>>();
  const queue: Queued[] = [];
  let running = false;
  const c = { positions: 0, batches: 0 };

  const remember = (key: string, a: MaiaAnswer) => {
    memo.set(key, a);
    if (memo.size > memoMax) memo.delete(memo.keys().next().value!);
  };

  const pump = (): void => {
    if (running || !queue.length) return;
    running = true;
    const batch = queue.splice(0, maxBatch);
    const tokens = new Float32Array(batch.length * MAIA_TOKENS);
    const elos = new Float32Array(batch.length);
    batch.forEach((q, i) => {
      tokens.set(q.tokens, i * MAIA_TOKENS);
      elos[i] = q.elo;
    });
    c.batches++;
    Promise.resolve()
      .then(() => o.run(tokens, elos, batch.length))
      .then(
        (out) => {
          batch.forEach((q, i) => {
            let a: MaiaAnswer;
            try {
              a = { policy: policyFrom(q.pos, out.moves, i * MAIA_MOVES), value: expectedScore(out.values, i * 3) };
            } catch (e) {
              return q.reject(e);
            }
            c.positions++;
            remember(q.key, a);
            q.resolve(a);
          });
        },
        (e: unknown) => batch.forEach((q) => q.reject(e)),
      )
      .then(() => {
        running = false;
        pump();
      });
  };

  return {
    ask(pos, elo) {
      const key = `${positionKeyOf(pos)}|${elo}`;
      const known = memo.get(key);
      if (known) return Promise.resolve(known);
      const flying = inflight.get(key);
      if (flying) return flying;
      const p = new Promise<MaiaAnswer>((resolve, reject) => {
        queue.push({ pos: pos.clone(), elo, key, tokens: maiaTokens(makeFen(pos.toSetup())), resolve, reject });
      });
      inflight.set(key, p);
      const done = () => void inflight.delete(key);
      p.then(done, done);
      o.defer(pump);
      return p;
    },
    counts: () => ({ ...c }),
  };
}
