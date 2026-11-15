// Lichess's endgame tablebase over fetch (PLAN.md §5.187): a position with at most seven pieces,
// its outcome and every move's. Anyone may ask (no token; `access-control-allow-origin: *`,
// checked live on 2026-11-15). An answer is kept for the session; after a failure (offline, a
// timeout, 429) nothing is asked for a minute, so a judge never waits on it twice.
import { inTablebase, readTablebase, tablebaseUrl, type TablebasePosition } from '../core/endgames/tablebase.ts';

/** A judge waits at most this long for the tablebase; Stockfish's search runs beside it. */
const TIMEOUT_MS = 2500;
const BACKOFF_MS = 60_000;
const KEPT = 200;

const answers = new Map<string, Promise<TablebasePosition | undefined>>();
let quietUntil = 0;

/** The position's key: its board, side to move and en passant square, and the halfmove clock (the fifty-move rule's). */
const keyOf = (fen: string): string => fen.trim().split(/\s+/).slice(0, 5).join(' ');

async function ask(fen: string): Promise<TablebasePosition | undefined> {
  try {
    const r = await fetch(tablebaseUrl(fen), { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) throw new Error(String(r.status));
    return readTablebase(await r.json());
  } catch {
    quietUntil = Date.now() + BACKOFF_MS;
    return undefined;
  }
}

/** The tablebase's answer for `fen`; undefined when it has none (too many pieces, offline, unknown). Never rejects. */
export function tablebase(fen: string): Promise<TablebasePosition | undefined> {
  if (!inTablebase(fen)) return Promise.resolve(undefined);
  const key = keyOf(fen);
  const kept = answers.get(key);
  if (kept) return kept;
  if (Date.now() < quietUntil || (typeof navigator !== 'undefined' && navigator.onLine === false)) return Promise.resolve(undefined);
  const p = ask(fen);
  answers.set(key, p);
  if (answers.size > KEPT) answers.delete(answers.keys().next().value!);
  // A failure isn't kept: the next ask, the back-off over, tries again.
  void p.then((a) => {
    if (!a && answers.get(key) === p) answers.delete(key);
  });
  return p;
}
