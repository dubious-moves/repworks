// What a storm verdict offers past its grade (PLAN.md §5.154, the owner's request, 2026-11-06):
// the refutation of a mistake or a blunder, Stockfish's line after a great move or the top move,
// and Continue after a good one: the opponent's reply is played (Maia's, at the user's rating) and
// the position after it is asked as a card of its own (`continuedCard`), graded as any card is but
// as practice, nothing scored or recorded. Pure.
import { positionKeyOf } from '../chess/positionKey.ts';
import { maiaPick } from '../games/practice.ts';
import type { Band, StormConfig } from './config.ts';
import type { StoredPosition } from './harvest.ts';
import { fenAfterUci, positionOf, uciToSan } from './walk.ts';

export type FollowUp = 'refutation' | 'line' | 'continue';

export interface FollowFacts {
  band: Band | 'unanswered';
  /** The move played: none for show and grade's own word, or a card passed or left unanswered. */
  userUci?: string | undefined;
  /** The top move played (rank 1, or level with the best). */
  top: boolean;
  puzzle: boolean;
  /** Show and grade (§5.152): its cards come with Stockfish's whole list, which a continued position hasn't. */
  show: boolean;
}

/**
 * The follow-ups a verdict on the position `fen` offers: Show refutation after a Mistake or a
 * Blunder, Show line after a Great move or the top move, Continue after a Good or Great one (not in
 * show and grade). None for a puzzle, an answer with no move, or a move that ends the game.
 */
export function followUps(f: FollowFacts, fen: string): FollowUp[] {
  if (f.puzzle || !f.userUci) return [];
  const next = fenAfterUci(fen, f.userUci);
  const pos = next ? positionOf(next) : undefined;
  if (!pos || pos.isEnd()) return [];
  const out: FollowUp[] = [];
  if (f.band === 'bad' || f.band === 'blunder') out.push('refutation');
  if (f.band === 'great' || f.top) out.push('line');
  if ((f.band === 'good' || f.band === 'great') && !f.show) out.push('continue');
  return out;
}

/** A continued card's id: the dealt card's, then `~` and how many replies on. */
export const continuedId = (root: string, n: number): string => `${root}~${n}`;
/** The dealt card a card continues (itself when it was dealt). */
export const rootCard = (card: string): string => card.split('~')[0]!;
/** How many replies on from the dealt card (0 for the dealt card itself). */
export const continuedDepth = (card: string): number => Number(card.split('~')[1] ?? 0) || 0;

/** The opponent's reply from Maia's policy at the position after the user's move (precision `replyPrecision`). */
export function maiaReply<M extends { uci: string; prob: number }>(policy: readonly M[] | null | undefined, c: StormConfig, rnd: () => number): string | undefined {
  return policy?.length ? maiaPick(policy, c.replyPrecision, rnd)?.uci : undefined;
}

export type Continued =
  | { kind: 'card'; card: StoredPosition }
  /** The reply ends the game (a mate or a stalemate): nothing more to ask. */
  | { kind: 'over'; san: string; fen: string; mate: boolean }
  | { kind: 'illegal' };

/**
 * The position after the move answered on `p` and the opponent's reply, as a card of its own: the
 * same side asked, the same lines and names, two plies further past the line, arrived at by the
 * reply, with no list yet (the session's look-ahead and the grade's searches score it, as they do a
 * card ChessDB alone scored), and an id of its own (`continuedId`), so nothing of the dealt card's
 * is written over.
 */
export function continuedCard(p: StoredPosition, userUci: string, replyUci: string, at: number): Continued {
  const before = fenAfterUci(p.fen, userUci);
  const mid = before ? positionOf(before) : undefined;
  if (!before || !mid || mid.turn === p.side) return { kind: 'illegal' };
  const san = uciToSan(mid, replyUci);
  const fen = san ? fenAfterUci(before, replyUci) : undefined;
  const pos = fen ? positionOf(fen) : undefined;
  if (!fen || !pos) return { kind: 'illegal' };
  if (pos.isEnd()) return { kind: 'over', san, fen, mate: pos.isCheckmate() };
  return {
    kind: 'card',
    card: {
      card: continuedId(rootCard(p.card), continuedDepth(p.card) + 1),
      key: positionKeyOf(pos),
      fen,
      side: p.side,
      ply: p.ply + 2,
      lines: p.lines,
      names: p.names,
      arrived: { san, uci: replyUci, before },
      scored: [],
      src: 'cdb',
      depth: 0,
      invented: p.invented,
      unc: null,
      games: null,
      at,
    },
  };
}
