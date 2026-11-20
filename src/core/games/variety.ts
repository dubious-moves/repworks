// A checklist drill's opponent varied over repeated games (PLAN.md §5.207, the owner's request of
// 2026-11-20): a reply the user has handled lately in a position comes up less often there, so
// drilling the same line again and again meets more of the middlegames it leads to, while a first
// game is drawn as before.
//
// Handled is judged on the whole game, not a few moves after the reply: a setup's difference
// (Nf3 or Ne2 against a Bg4 pin) may show only much later. A game won or drawn credits every one
// of the opponent's first `replies` moves after the line's end; a game lost or given up credits
// none of them, which leaves those replies at their usual odds (the owner's choice: no boost after
// a miss; the exact retry is for that). The credit is relative: a reply's odds are halved for
// each time it was handled more than the least-handled of the position's likely replies, so once
// the others have been handled as often it is back at its usual odds. Only the last `windowMs`
// counts: this is for one sitting of drilling a line, not a schedule. Pure.
import { replay } from './positions.ts';
import type { HistoryEntry } from './practice.ts';

export const VARIETY = {
  /** The games that count: ended this recently (ms). */
  windowMs: 24 * 60 * 60 * 1000,
  /** The opponent's moves after the line's end that are credited and varied. */
  replies: 10,
  /** Each time handled more than the least-handled likely reply: the odds times this. */
  factor: 0.5,
  /** A reply's odds never go below this share of its usual. */
  floor: 0.15,
  /** A likely reply: this share of the position's weight or more (the likeliest always). */
  likely: 0.15,
} as const;

/** How often each reply was handled, by the position before it (key) and the move (standard UCI). */
export type Handled = Map<string, Map<string, number>>;

/**
 * The replies handled in the checklist games of the window: each game won or drawn credits the
 * opponent's first `VARIETY.replies` moves after its start, those of a game's opening that
 * replayed an earlier game (`forced` plies, the exact retry) excepted.
 */
export function handledReplies(history: readonly HistoryEntry[], now: number): Handled {
  const out: Handled = new Map();
  for (const h of history) {
    if (h.source !== 'todo' || (h.outcome !== 'win' && h.outcome !== 'draw')) continue;
    if (h.ts > now || now - h.ts > VARIETY.windowMs) continue;
    const r = replay({ initialFen: h.baseFen, moves: h.moves.map((m) => m.san) });
    if (!r) continue;
    let replies = 0;
    for (const [i, p] of r.plies.entries()) {
      if (p.turn === h.playerColor) continue;
      if (replies++ >= VARIETY.replies) break;
      if (i < (h.forced ?? 0)) continue;
      const at = out.get(p.keyBefore) ?? new Map<string, number>();
      at.set(p.uci, (at.get(p.uci) ?? 0) + 1);
      out.set(p.keyBefore, at);
    }
  }
  return out;
}

/**
 * The moves' weights varied by how often each was handled (`count`, by the move's UCI): halved for
 * each time more than the least-handled likely move, to the floor. With nothing handled, or every
 * likely move handled alike, the weights as they were.
 */
export function variedWeights<M>(moves: readonly M[], weightOf: (m: M) => number, count: (m: M) => number): (m: M) => number {
  const total = moves.reduce((s, m) => s + Math.max(0, weightOf(m)), 0);
  if (!(total > 0)) return weightOf;
  const top = moves.reduce((a, b) => (weightOf(b) > weightOf(a) ? b : a));
  const likely = moves.filter((m) => m === top || weightOf(m) / total >= VARIETY.likely);
  const least = Math.min(...likely.map(count));
  return (m) => weightOf(m) * Math.max(VARIETY.floor, VARIETY.factor ** Math.max(0, count(m) - least));
}

/** A move drawn by its weight; null when none weighs anything. */
export function drawByWeight<M>(moves: readonly M[], weightOf: (m: M) => number, rnd: () => number): M | null {
  const total = moves.reduce((s, m) => s + Math.max(0, weightOf(m)), 0);
  if (!(total > 0)) return null;
  let r = rnd() * total;
  for (const m of moves) {
    r -= Math.max(0, weightOf(m));
    if (r <= 0) return m;
  }
  return moves[moves.length - 1]!;
}

/**
 * The exact retry (the owner's request of 2026-11-20): the earlier game's next move for the
 * opponent while the game so far is that game's, move for move; undefined once the user has played
 * a new move (or the earlier game has no more).
 */
export function retryMove(earlier: readonly string[], played: readonly string[]): string | undefined {
  if (played.length >= earlier.length) return undefined;
  for (let i = 0; i < played.length; i++) if (played[i] !== earlier[i]) return undefined;
  return earlier[played.length];
}

/** The plies a game shares with the one it retried, from the start: its forced opening. */
export function forcedPlies(earlier: readonly string[], played: readonly string[]): number {
  let n = 0;
  while (n < earlier.length && n < played.length && earlier[n] === played[n]) n++;
  return n;
}
