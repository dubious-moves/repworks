// Show and grade in the storm (PLAN.md §5.152, the owner's request of 2026-11-06): the user thinks
// of a move, the board shows every move of the position's list with its band, and the user grades
// the move they had in mind. Only a list that may judge a move (Stockfish's, at `judgeDepth` or
// deeper: in practice the deepened MultiPV 12, §5.84) is shown. Pure.
import type { Band, StormConfig } from './config.ts';
import { grade, wpLoss, type ScoredList } from './grade.ts';

/** A move of the list as it is shown: its rank, score (the mover's), win% given up and band. */
export interface ShownMove {
  uci: string;
  /** 1-based in the list. */
  rank: number;
  score: number;
  wp: number | null;
  band: Band;
  /** The top move: the list's first, or level with it. */
  top: boolean;
}

/** Whether a list may be shown: Stockfish's at `judgeDepth` or deeper, with a move in it. */
export function showable(list: ScoredList, c: StormConfig): boolean {
  return list.source === 'sf' && (list.depth ?? 0) >= c.judgeDepth && list.length > 0;
}

/** Every move of a list that may judge, best first, with its band; none when it may not judge. */
export function shownMoves(list: ScoredList, c: StormConfig): ShownMove[] {
  if (!showable(list, c)) return [];
  const best = list[0]!.score;
  return list.map((m, i) => {
    const wp = wpLoss(best, m.score, c);
    return { uci: m.uci, rank: i + 1, score: m.score, wp, band: grade(wp, c), top: i === 0 || m.score >= best };
  });
}

/** How an arrow looks: one tier a band, the top move a tier of its own. */
export type ArrowTier = 'best' | 'great' | 'good' | 'ok' | 'bad' | 'blunder';

export const arrowTier = (m: ShownMove): ArrowTier => (m.top ? 'best' : m.band === 'unknown' ? 'ok' : m.band);

/** The arrows in drawing order: the worst first, so the better ones lie on top. */
export const drawingOrder = (moves: readonly ShownMove[]): ShownMove[] => [...moves].reverse();

/**
 * A self-graded answer's band, written as an ordinary `storm` event with no move and no win%
 * (§5.152): found counts as Good, missed as a Mistake. The record's found share and what is done
 * follow from it as from a graded move; its average win% given up leaves it out.
 */
export const selfBand = (found: boolean): Band => (found ? 'good' : 'bad');

/** Where a card stands, for the two keys. */
export type ShowState = 'hidden' | 'shown' | 'answered' | 'busy';
/** What a key does there. */
export type ShowAction = 'show' | 'found' | 'missed' | 'next';

/**
 * The two keys of §5.9 (`next` 2, `wrong` 4, and the ring's media keys), in the storm: `next` shows
 * the moves, then grades the card found and goes on; `wrong` shows them if hidden and grades it
 * missed, the card staying for a look; once answered, either key goes on. Nothing while a move is
 * being graded.
 */
export function showPress(state: ShowState, press: 'next' | 'wrong'): ShowAction | null {
  if (state === 'busy') return null;
  if (state === 'answered') return 'next';
  if (press === 'wrong') return 'missed';
  return state === 'hidden' ? 'show' : 'found';
}
