// Lc0 as the veto of "Maia alone" in an endgame (PLAN.md §5.176): the network's value of the
// positions Maia's candidate moves lead to, one run each (~60 ms in Node, wasm, one thread), and its
// own likeliest move. Used when its files are on this device, whether or not the study page's switch
// is on; nothing is downloaded for it. A worker of its own, ended after 90 s unused; anything wrong
// (no files, no answer in time) is `null`, and the reply goes without the veto.
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { expected, type Lc0Move, type Wdl } from '../core/lc0/encode.ts';
import type { FromLc0, ToLc0 } from '../core/lc0/protocol.ts';

const IDLE_MS = 90_000;
/** The worker's start (the network read and compiled) and the whole of one ask, at most. */
const START_MS = 30_000;
const ASK_MS = 6_000;
/** After finding the files missing: no new try for this long. */
const MISSING_MS = 60_000;

let worker: Worker | undefined;
let ready: Promise<void> | undefined;
let missingAt = 0;
let nextId = 1;
let idle: ReturnType<typeof setTimeout> | undefined;
const waiting = new Map<number, { resolve(r: { policy: Lc0Move[]; wdl: Wdl }): void; reject(e: Error): void }>();

function end(): void {
  worker?.terminate();
  worker = undefined;
  ready = undefined;
  for (const job of waiting.values()) job.reject(new Error('Lc0 stopped'));
  waiting.clear();
}

function touch(): void {
  clearTimeout(idle);
  idle = setTimeout(() => {
    if (!waiting.size) end();
  }, IDLE_MS);
}

function start(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    const w = new Worker(new URL('../platform/lc0Worker.ts', import.meta.url), { type: 'module', name: 'lc0-endgames' });
    worker = w;
    w.onmessage = (e: MessageEvent<FromLc0>) => {
      const m = e.data;
      if (m.type === 'status') {
        if (m.status === 'ready') return resolve();
        missingAt = Date.now();
        return reject(new Error('Lc0’s files are not on this device'));
      }
      if (m.type === 'failed') return reject(new Error(m.reason));
      if (!('id' in m)) return;
      const job = waiting.get(m.id);
      if (!job) return;
      waiting.delete(m.id);
      if (m.type === 'answer') job.resolve({ policy: m.policy, wdl: m.wdl });
      else if (m.type === 'error') job.reject(new Error(m.reason));
    };
    w.onerror = (e) => reject(new Error(e.message || 'Lc0 stopped working'));
    w.postMessage({ type: 'init' } satisfies ToLc0);
  });
  ready.catch(end);
  return ready;
}

const within = <T>(p: Promise<T>, ms: number): Promise<T> => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Lc0 did not answer in time')), ms))]);

async function ask(fens: string[]): Promise<{ policy: Lc0Move[]; wdl: Wdl }> {
  await within(start(), START_MS);
  touch();
  const id = nextId++;
  return within(
    new Promise((resolve, reject) => {
      waiting.set(id, { resolve: (r) => (touch(), resolve(r)), reject });
      worker!.postMessage({ type: 'ask', id, fens } satisfies ToLc0);
    }),
    ASK_MS,
  );
}

/** Starts the worker ahead of the first reply, when the files are here (a failure is ignored). */
export function warmEndgameLc0(): void {
  if (Date.now() - missingAt < MISSING_MS) return;
  start().catch(() => undefined);
}

export interface EndgameLc0 {
  /** Lc0's own likeliest move here. */
  top?: string;
  /** For each of `ucis` that doesn't end the game, and `top`: the mover's expected score after it. */
  values: Record<string, number>;
}

/** Lc0's view of `fen` for the side to move: its likeliest move, and the value of each of `ucis`. Null when it isn't there or is too slow. */
export async function endgameLc0(fen: string, ucis: readonly string[]): Promise<EndgameLc0 | null> {
  if (Date.now() - missingAt < MISSING_MS) return null;
  try {
    const setup = parseFen(fen);
    if (setup.isErr) return null;
    const pos = Chess.fromSetup(setup.value).unwrap();
    const root = await ask([fen]);
    const top = root.policy[0]?.uci;
    const values: Record<string, number> = {};
    for (const uci of new Set([...ucis, ...(top ? [top] : [])])) {
      const move = parseUci(uci);
      if (!move) continue;
      const child = pos.clone();
      child.play(move);
      if (child.isEnd()) continue;
      values[uci] = 1 - expected((await ask([fen, makeFen(child.toSetup())])).wdl);
    }
    return { ...(top ? { top } : {}), values };
  } catch {
    return null;
  }
}
