// The engine's arrows on the board (PLAN.md §5.31), as Lichess draws them: the best line's first
// move in pale blue, the other lines' first moves in pale grey, thinner as they fall behind the
// best (none once 20% of winning chances behind); the threat's in pale red. Pure: squares and
// widths out, which the board gives chessground as auto shapes.
import type { EngineLine } from './search.ts';
import { winningChances } from './winning.ts';

export interface EngineArrow {
  orig: string;
  dest: string;
  brush: 'paleBlue' | 'paleGrey' | 'paleRed';
  lineWidth: number;
}

const BEST_WIDTH = 15;

/** The arrows for `lines` (best first) in a position where `turn` moves; `threat` for the threat's line. */
export function engineArrows(lines: readonly EngineLine[], turn: 'white' | 'black', threat = false): EngineArrow[] {
  const best = lines[0];
  if (!best?.pv[0]) return [];
  const arrow = (uci: string, brush: EngineArrow['brush'], lineWidth: number): EngineArrow => ({ orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush, lineWidth });
  if (threat) return [arrow(best.pv[0], 'paleRed', BEST_WIDTH)];
  const sign = turn === 'white' ? 1 : -1;
  const bestChances = sign * winningChances(best.score);
  const out = [arrow(best.pv[0], 'paleBlue', BEST_WIDTH)];
  const seen = new Set([best.pv[0].slice(0, 4)]);
  for (const line of lines.slice(1)) {
    const uci = line.pv[0];
    if (!uci || seen.has(uci.slice(0, 4))) continue;
    seen.add(uci.slice(0, 4));
    // Lichess: the shift is half the difference in chances, so 0 to 1.
    const shift = (bestChances - sign * winningChances(line.score)) / 2;
    if (shift >= 0.2) continue;
    out.push(arrow(uci, 'paleGrey', Math.round(12 - shift * 50)));
  }
  return out;
}
