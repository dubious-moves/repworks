// Which rows the Practical column computes without a click, and which value is the best (PLAN.md
// §5.24). Ported from q_extension `src/main-world.js` (`peAutoRows`, `peBestOf`, `peMaiaElo`'s
// neighbour `peShares`) at c26242f, by the same owner, under this repo's GPL-3.0-or-later; there
// they read the page's panel, here they take its rows.
import { winFromCp } from './search.ts';
import type { TableRow } from './table.ts';
import type { RowResult } from './search.ts';

export const PE_MAX_AUTO = 8;

export interface RowPicking {
  /** Your candidates: within this many win% points of the best eval (q_extension's ownMargin). */
  margin: number;
  /** ...and at most this many of them. */
  maxCandidates: number;
  /** Then moves played in at least this share of games (q_extension's rowThreshold, 2%). */
  minShare: number;
}

/**
 * Rows computed without a click: the moves the engine rates near its best, then the ones people
 * play. Popularity alone would skip a strong move that is rarely played - exactly the kind of move
 * worth comparing - and the engine alone would skip the moves you are most likely to meet. Excluded
 * rows are left out, so excluding the engine's best lets the next one in.
 */
export function autoRows(rows: readonly TableRow[], turn: 'w' | 'b', excluded: ReadonlySet<string>, o: RowPicking): string[] {
  const ok = (san: string) => !excluded.has(san);
  const shares = new Map(rows.filter((r) => !r.novelty).map((r) => [r.san, r.share] as const));
  // The eval as win% for the side to move (the table's evals are from White's side).
  const byEval: [string, number][] = [];
  for (const r of rows) if (r.eval && ok(r.san)) byEval.push([r.san, winFromCp(turn === 'w' ? r.eval.cp : -r.eval.cp)]);
  // Evals are rounded to the centipawn, and a quiet position has a dozen moves at 0.00: among
  // equals, the more played one goes first.
  byEval.sort((a, b) => b[1] - a[1] || (shares.get(b[0]) ?? 0) - (shares.get(a[0]) ?? 0));
  const list = byEval
    .filter((x) => byEval[0]![1] - x[1] <= o.margin)
    .slice(0, Math.max(1, o.maxCandidates))
    .map((x) => x[0]);
  const byGames: [string, number][] = [];
  for (const [san, share] of shares) if (share >= o.minShare && share > 0 && ok(san)) byGames.push([san, share]);
  byGames.sort((a, b) => b[1] - a[1]);
  for (const [san] of byGames) if (!list.includes(san)) list.push(san);
  return list.slice(0, PE_MAX_AUTO);
}

/*
 * Green: the highest value among `vals`, compared as displayed, so that equal-looking numbers are
 * marked alike. Values only compare at one depth - deeper ones drift upwards - so a row at another
 * depth (one added by a click, catching up) sits out; a row that can't go any deeper (`complete`)
 * is exact at every depth and always takes part. With fewer than two to compare, nothing is marked.
 */
export function bestOf(vals: readonly RowResult[]): { best: number | null; cmp: Set<RowResult> } {
  let top = 0;
  for (const r of vals) if (!r.complete && (r.depth ?? 0) > top) top = r.depth ?? 0;
  let best: number | null = null;
  const cmp = new Set<RowResult>();
  for (const r of vals) {
    if (!r.complete && r.depth !== top) continue;
    cmp.add(r);
    const v = Math.round(r.value ?? 0);
    if (best == null || v > best) best = v;
  }
  return { best: cmp.size < 2 ? null : best, cmp };
}
