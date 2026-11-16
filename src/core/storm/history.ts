// The positions that led to a storm position (PLAN.md §5.190), for the 23M Maia, which reads the
// seven before the one it is asked about. A position the walk reached one reply past a line's end
// has its line's positions before it; one further out has only the position it arrived from; a
// continued card (§5.154) keeps its own. Pure.
import { makeFen } from 'chessops/fen';
import { keyFen } from '../chess/positionKey.ts';
import { beforeOf, MAIA_BEFORE } from '../maia/history.ts';
import type { Chapter } from '../study/model.ts';
import { positionsTo } from '../study/tree.ts';
import type { StoredPosition } from './harvest.ts';

/**
 * The positions before `p`, oldest first, at most seven (FENs). `chapter` finds the chapter a line
 * is in; with none (a study deleted since, a chapter edited so its line no longer ends where the
 * walk started) the position's arrival is all there is.
 */
export function storedBefore(p: Pick<StoredPosition, 'fen' | 'ply' | 'lines' | 'arrived' | 'lead'>, chapter: (sid: string, cid: string) => Chapter | undefined): string[] {
  if (p.lead) return p.lead.slice(-MAIA_BEFORE);
  const ref = p.lines[0];
  const c = ref && chapter(ref.sid, ref.cid);
  const along = c ? positionsTo(c, ref.path) : [];
  const end = along.at(-1);
  if (end && (p.ply === 1 || p.ply === 0)) {
    const from = p.ply === 1 ? p.arrived?.before : p.fen;
    if (from && keyFen(from)?.key === keyFen(makeFen(end.toSetup()))?.key) return beforeOf(p.ply === 1 ? [...along, p.fen] : along);
  }
  return p.arrived ? [p.arrived.before] : [];
}
