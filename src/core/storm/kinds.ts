// Kinds of storm position, and the focus that deals them (PLAN.md §5.100, the owner's request of
// 2026-10-12): important decisions, only moves, positional moves. Each tag is worked out from what
// a stored position already keeps (its list, Maia's policies, the kind the gather gave it), so a
// deepened list or a new rating re-tags it for free. Pure.
//
// - Hard for you (Maia at the user's rating): unintuitive (§5.82), critical, level up, your level.
// - The move: only move, quiet, retreat, pawn break, don't take. Read from the moves a list that
//   may judge counts as good (great or good, as the storm counts found), and only when the list
//   names them all (its last line isn't good).
// - The situation: punish, hold, convert, kept by the gather (`StoredPosition.kind`).
import type { Position } from 'chessops/chess';
import { pawnAttacks } from 'chessops/attacks';
import { squareRank } from 'chessops/util';
import type { Color } from 'chessops/types';
import { parseUciMove } from '../chess/uci.ts';
import type { StormConfig } from './config.ts';
import { grade, wpLoss, type ScoredList } from './grade.ts';
import { difficulty, foundShare, JUDGED_MIN, listJudges, MAIA_LADDER, unintuitive, type MaiaRating } from './maia.ts';
import { positionOf, type StoredKind } from './walk.ts';

export type Focus = 'unintuitive' | 'critical' | 'levelup' | 'level' | 'only' | 'quiet' | 'retreat' | 'break' | 'notake' | 'punish' | 'hold' | 'convert';
export type FocusGroup = 'maia' | 'move' | 'situation';

/** The focus's groups, in the home's order: within a group any chip chosen matches, across groups all must. */
export const FOCUS_GROUPS: readonly { id: FocusGroup; label: string; items: readonly Focus[] }[] = [
  { id: 'maia', label: 'Hard for you', items: ['unintuitive', 'critical', 'levelup', 'level'] },
  { id: 'move', label: 'The move', items: ['only', 'quiet', 'retreat', 'break', 'notake'] },
  { id: 'situation', label: 'The situation', items: ['punish', 'hold', 'convert'] },
];
export const FOCUSES: readonly Focus[] = FOCUS_GROUPS.flatMap((g) => g.items);
const SITUATIONS: readonly Focus[] = ['punish', 'hold', 'convert'];

export const FOCUS_LABEL: Record<Focus, string> = {
  unintuitive: 'Unintuitive',
  critical: 'Critical',
  levelup: 'Level up',
  level: 'Your level',
  only: 'Only move',
  quiet: 'Quiet',
  retreat: 'Retreat',
  break: 'Pawn break',
  notake: 'Don’t take',
  punish: 'Punish',
  hold: 'Hold',
  convert: 'Convert',
};

/** What each focus deals, in a sentence; `elo` is the user's Maia rating. */
export function focusAbout(f: Focus, elo: number, c: StormConfig): string {
  switch (f) {
    case 'unintuitive':
      return `The move Maia expects of a ${elo} player isn’t a good one.`;
    case 'critical':
      return `Players at ${elo} usually go wrong: Maia’s moves give up ${c.criticalWp}% or more on average.`;
    case 'levelup':
      return `Stronger players find a good move much more often than players at ${elo}.`;
    case 'level':
      return `Maia’s difficulty is from ${elo - c.levelBelow} to ${elo + c.levelAbove}.`;
    case 'only':
      return 'One good move, every other a mistake.';
    case 'quiet':
      return 'Every good move is quiet: no capture, check or promotion.';
    case 'retreat':
      return 'Every good move takes a piece back.';
    case 'break':
      return 'Every good move is a pawn move into contact with an enemy pawn.';
    case 'notake':
      return 'A capture tempts, but every good move leaves it.';
    case 'punish':
      return 'The opponent just erred: keep what they gave you.';
    case 'hold':
      return 'You are worse, and some moves make it worse still.';
    case 'convert':
      return 'You are clearly better, and most moves give some of it back.';
  }
}

/** A focus in words: "Unintuitive", "Quiet + Retreat". */
export const focusTitle = (focus: readonly Focus[]): string => focus.map((f) => FOCUS_LABEL[f]).join(' + ');

/** A stored focus as read back: known values only, in the groups' order. */
export function cleanFocus(v: unknown): Focus[] {
  return Array.isArray(v) ? FOCUSES.filter((f) => v.includes(f)) : [];
}

/** A move's facts, in the position it is played from; null when it isn't legal there. */
export interface MoveFacts {
  capture: boolean;
  check: boolean;
  promotion: boolean;
  /** A piece (not a pawn or the king) moved towards its own side. */
  retreat: boolean;
  /** A pawn moved, not capturing, to a square touching an enemy pawn diagonally. */
  contact: boolean;
}

const forward = (color: Color, from: number, to: number) => (color === 'white' ? squareRank(to) - squareRank(from) : squareRank(from) - squareRank(to));

export function moveFacts(pos: Position, uci: string): MoveFacts | null {
  const move = parseUciMove(pos, uci);
  if (!move) return null;
  const piece = pos.board.get(move.from);
  if (!piece) return null;
  const them = pos.turn === 'white' ? 'black' : 'white';
  const victim = pos.board.get(move.to);
  const capture = (!!victim && victim.color === them) || (piece.role === 'pawn' && move.to === pos.epSquare);
  const after = pos.clone();
  after.play(move);
  const retreat = piece.role !== 'pawn' && piece.role !== 'king' && forward(pos.turn, move.from, move.to) < 0;
  const contact = piece.role === 'pawn' && !capture && pawnAttacks(pos.turn, move.to).intersect(after.board.pieces(them, 'pawn')).nonEmpty();
  return { capture, check: after.isCheck(), promotion: !!move.promotion, retreat, contact };
}

/**
 * The moves a list counts as good (great or good), when it may judge (§5.84) and names them all:
 * null when its last line is good too (a good move may lie outside it).
 */
export function goodMoves(list: ScoredList, c: StormConfig): string[] | null {
  if (!listJudges(list, c) || list.length < 2) return null;
  const best = list[0]!.score;
  const good = (score: number) => c.storeDropOn.includes(grade(wpLoss(best, score, c), c));
  if (good(list[list.length - 1]!.score)) return null;
  return list.filter((m) => good(m.score)).map((m) => m.uci);
}

/**
 * The win% Maia's moves at one rating give up on average, by the list (a move outside it no less
 * than its last line). Null when the list can't judge, or Maia's kept moves are too few.
 */
export function expectedLoss(r: MaiaRating, list: ScoredList, c: StormConfig): number | null {
  if (!listJudges(list, c)) return null;
  const best = list[0]!.score;
  const floor = wpLoss(best, list[list.length - 1]!.score, c) ?? 0;
  let sum = 0;
  let mass = 0;
  for (const [uci, p] of r.moves) {
    const m = list.find((x) => x.uci === uci);
    const loss = m ? wpLoss(best, m.score, c) : floor;
    if (loss === null) continue;
    sum += p * loss;
    mass += p;
  }
  return mass >= JUDGED_MIN ? sum / mass : null;
}

/** What a position's tags are worked out from. */
export interface Taggable {
  fen: string;
  maia?: readonly MaiaRating[] | undefined;
  kind?: StoredKind | undefined;
}

/** A position's tags at the user's rating `elo` (the focus it matches), from its list. */
export function positionTags(p: Taggable, list: ScoredList, elo: number, c: StormConfig): Set<Focus> {
  const tags = new Set<Focus>();
  if (p.kind && p.kind !== 'only') tags.add(p.kind);
  if (p.kind === 'only') tags.add('only');
  const pos = positionOf(p.fen);
  const good = goodMoves(list, c);
  if (pos && good && good.length) {
    if (good.length === 1) tags.add('only');
    const facts = good.map((u) => moveFacts(pos, u));
    if (facts.every((f) => f && !f.capture && !f.check && !f.promotion)) tags.add('quiet');
    if (facts.every((f) => f?.retreat)) tags.add('retreat');
    if (facts.every((f) => f?.contact)) tags.add('break');
    if (facts.every((f) => f && !f.capture)) {
      // A capture tempts: Maia at the user's rating gives captures `takeShare`, or (unrated) one is
      // among the list's top three. Either way it isn't good: every good move leaves it.
      const mine = p.maia?.find((r) => r.elo === elo);
      const takes = (u: string) => !!moveFacts(pos, u)?.capture;
      const tempting = mine ? mine.moves.reduce((s, [u, pr]) => s + (takes(u) ? pr : 0), 0) >= c.takeShare : list.slice(0, 3).some((m) => takes(m.uci));
      if (tempting) tags.add('notake');
    }
  }
  const ratings = p.maia;
  const mine = ratings?.find((r) => r.elo === elo);
  if (ratings && mine && listJudges(list, c)) {
    if (unintuitive(ratings, elo, list, c)) tags.add('unintuitive');
    const loss = expectedLoss(mine, list, c);
    if (loss !== null && loss >= c.criticalWp) tags.add('critical');
    const share = foundShare(mine, list, c);
    if (share !== null && share < 0.5) {
      const above = ratings.filter((r) => r.elo > elo && MAIA_LADDER.includes(r.elo)).map((r) => foundShare(r, list, c) ?? 0);
      if (above.some((s) => s >= share + c.levelRise)) tags.add('levelup');
    }
    const d = difficulty(ratings, list, c);
    if (d && !d.edge && d.elo >= elo - c.levelBelow && d.elo <= elo + c.levelAbove) tags.add('level');
  }
  return tags;
}

/**
 * Whether a position is dealt for a focus. No focus: the classic storm's positions only (no kind).
 * Otherwise every group with a chip chosen must match one of its chips; with no situation chosen,
 * the situations' positions are left out (an only move kept by the gather is in).
 */
export function matchesFocus(tags: ReadonlySet<Focus>, kind: StoredKind | undefined, focus: readonly Focus[]): boolean {
  if (!focus.length) return !kind;
  for (const g of FOCUS_GROUPS) {
    const chosen = g.items.filter((f) => focus.includes(f));
    if (chosen.length && !chosen.some((f) => tags.has(f))) return false;
  }
  if (!focus.some((f) => SITUATIONS.includes(f)) && kind && kind !== 'only') return false;
  return true;
}

/** Easy at `elo` (§5.100): Maia there finds a good move `easyShare` of the time; the classic storm deals these last. */
export function easyAt(ratings: readonly MaiaRating[] | undefined, elo: number, list: ScoredList, c: StormConfig, at = c.easyShare): boolean {
  const mine = ratings?.find((r) => r.elo === elo);
  const share = mine ? foundShare(mine, list, c) : null;
  return share !== null && share >= at;
}

/** Too easy at `elo` (§5.105): Maia there finds a good move `tooEasyShare` of the time; never dealt. */
export const tooEasyAt = (ratings: readonly MaiaRating[] | undefined, elo: number, list: ScoredList, c: StormConfig): boolean =>
  easyAt(ratings, elo, list, c, c.tooEasyShare);

/** A position's tags in words, for a card once answered: "Only move · Quiet · Punish". */
export function tagWords(tags: ReadonlySet<Focus>): string {
  return FOCUSES.filter((f) => tags.has(f))
    .map((f) => FOCUS_LABEL[f])
    .join(' · ');
}
