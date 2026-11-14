// Repertoire endgames (PLAN.md §5.149): the endgames the user's own openings lead to, taken from
// real games through the repertoire's line ends and played on the Endgames page for a goal, as
// the theoretical ones are (§5.145–§5.148). Pure: the games, Stockfish's score and the clock come
// in from the caller.
//
// - **An endgame**, for this: at most two pieces a side besides the king and pawns, at most four
//   in all, worth at most 20 together (a queen 9, a rook 5, a minor piece 3), and a pawn on the
//   board. Lichess's own phase line (scalachess's Divider: six pieces or fewer) lets in positions
//   with two rooks and a minor piece a side, which are middlegames to drill; a pawnless ending is a
//   theoretical one, not the opening's.
// - **The position drilled** is the first of the game's endgame with the user to move, not in
//   check, the last move no capture (not halfway through a trade), within `settlePlies` of the
//   endgame's start: the moment the user would have had to start thinking about it.
// - **The goal** from Stockfish's score for the user at the start: +3 or better a win (until a
//   pawn queens or the lead is 5 points of material), −1 to +1.5 a draw held for 15 moves (or
//   better). Between them, and below, none: a goal near the judge's lines (±2, `GOAL_CP`) would
//   have good moves stopped as slips.
import type { Position } from 'chessops/chess';
import type { Color } from 'chessops/types';
import { positionKeyOf, type PositionKey } from '../chess/positionKey.ts';
import { advance, fenOf, positionOf, sanToUci, START_FEN, type Arrival } from '../storm/walk.ts';
import type { LineRef } from '../storm/sources.ts';
import { CONVERT_LEAD, materialFor, type Endgame, type Goal } from './endgames.ts';

export const REP = {
  /** The user's score at the start, centipawns: a win from here… */
  winFromCp: 300,
  /** …a draw in this band. */
  drawLoCp: -100,
  drawHiCp: 150,
  /** A draw is held for this many of the user's moves. */
  hold: 15,
  /** Plies after the endgame's first position to find one to drill. */
  settlePlies: 6,
  /** Endgames kept from one line end in one gather. */
  perLineEnd: 3,
  /** Endgames kept on the device at most. */
  max: 400,
  /** An older window of games each gather after the first walk (the explorer's `until`), months. */
  stepMonths: 4,
} as const;

/* ------------------------------------------------------------------ material and categories */

export interface Side {
  q: number;
  r: number;
  b: number;
  n: number;
  p: number;
}

export function sideMaterial(pos: Position, color: Color): Side {
  const mine = pos.board[color];
  return {
    q: pos.board.queen.intersect(mine).size(),
    r: pos.board.rook.intersect(mine).size(),
    b: pos.board.bishop.intersect(mine).size(),
    n: pos.board.knight.intersect(mine).size(),
    p: pos.board.pawn.intersect(mine).size(),
  };
}

const pieces = (s: Side) => s.q + s.r + s.b + s.n;
const worth = (s: Side) => 9 * s.q + 5 * s.r + 3 * (s.b + s.n);

/** Whether a position is an endgame to drill: few pieces, a pawn or more. */
export function isEndgame(pos: Position): boolean {
  const w = sideMaterial(pos, 'white');
  const b = sideMaterial(pos, 'black');
  return pieces(w) <= 2 && pieces(b) <= 2 && pieces(w) + pieces(b) <= 4 && worth(w) + worth(b) <= 20 && w.p + b.p > 0;
}

export type Category = 'pawn' | 'minor' | 'rook' | 'rook-minor' | 'heavy' | 'imbalance';

/** The categories in the list's order, each with a few sentences of technique (standard endgame theory). */
export const CATEGORIES: readonly { id: Category; title: string; idea: string }[] = [
  {
    id: 'rook',
    title: 'Rook endings',
    idea: 'An active rook is worth more than a pawn: put it behind passed pawns, yours and the opponent’s, and use it to cut the enemy king off along a rank or a file. Bring your king up before you push. A rook stuck defending a pawn from the side loses; a pawn down with an active rook often holds.',
  },
  {
    id: 'pawn',
    title: 'Pawn endings',
    idea: 'Count before you move: whose king gets to the pawns first, and who queens first. Bring the king in at once. An outside passed pawn pulls the enemy king away; a spare pawn move wins the opposition. Every trade here is for good, so check it to the end.',
  },
  {
    id: 'minor',
    title: 'Minor-piece endings',
    idea: 'King to the centre first. A bishop likes pawns on both wings and its own pawns on the other colour; a knight likes a closed position and squares the pawns can’t chase it from. Make a passed pawn far from the enemy piece. With bishops on opposite colours the defender blockades on its bishop’s colour and draws even pawns down.',
  },
  {
    id: 'rook-minor',
    title: 'Rook and minor piece',
    idea: 'The rooks still decide: keep yours active and behind passed pawns. Of the minor pieces the bishop is usually the better one with pawns on both wings. A trade of rooks leaves a minor-piece ending and a trade of minor pieces a rook ending: choose the one you want.',
  },
  {
    id: 'heavy',
    title: 'Queens and two rooks',
    idea: 'The kings are still targets: look for checks and mating nets before pawns. The side that is better trades a pair of rooks, or the queens, to make its extra pawn count; the side that is worse keeps them for counterplay and perpetual check. A passed pawn backed by the queen runs far.',
  },
  {
    id: 'imbalance',
    title: 'Material imbalances',
    idea: 'The material differs, so the plans do: the side with the extra piece trades the dangerous pawns off and makes a passed pawn of its own; the side with pawns for it pushes them together and tries to take the last pawns of the other side. A rook beats a minor piece most easily with pawns on both wings.',
  },
];

export const categoryById = (id: string) => CATEGORIES.find((c) => c.id === id);

/** An endgame's category by the pieces each side has besides the king and pawns. */
export function categoryOf(pos: Position): Category {
  const w = sideMaterial(pos, 'white');
  const b = sideMaterial(pos, 'black');
  if (!pieces(w) && !pieces(b)) return 'pawn';
  if (w.q !== b.q || w.r !== b.r || w.b + w.n !== b.b + b.n) return 'imbalance';
  if (w.q || w.r === 2) return 'heavy';
  if (w.r === 1) return w.b + w.n ? 'rook-minor' : 'rook';
  return 'minor';
}

/** Whether each side has one bishop and they stand on squares of opposite colours. */
export function oppositeBishops(pos: Position): boolean {
  const w = pos.board.bishop.intersect(pos.board.white);
  const b = pos.board.bishop.intersect(pos.board.black);
  if (w.size() !== 1 || b.size() !== 1) return false;
  const light = (sq: number) => ((sq >> 3) + (sq & 7)) % 2 === 1;
  return light(w.first()!) !== light(b.first()!);
}

const letters = (s: Side) => [...'Q'.repeat(s.q), ...'R'.repeat(s.r), ...'B'.repeat(s.b), ...'N'.repeat(s.n)].join('+') || 'K';

/** "R+B vs R+N · pawns 4 v 3", the user's side first; "Pawns 4 v 3" for a pawn ending. */
export function titleOf(pos: Position, side: Color): string {
  const me = sideMaterial(pos, side);
  const them = sideMaterial(pos, side === 'white' ? 'black' : 'white');
  const pawns = `${me.p} v ${them.p}`;
  if (!pieces(me) && !pieces(them)) return `Pawns ${pawns}`;
  return `${letters(me)} vs ${letters(them)} · pawns ${pawns}${oppositeBishops(pos) ? ' · opposite bishops' : ''}`;
}

/* ------------------------------------------------------------------ the game walked */

export interface Found {
  fen: string;
  /** Plies past the line's end (1 is the position after its first move). */
  ply: number;
  /** The move number in the game. */
  move: number;
  arrived: Arrival | null;
}

/**
 * A real game walked from the start through the line's end (`frontierFen`, reached by any move
 * order) to its endgame (see the header), or why there is none.
 */
export function endgameInGame(frontierFen: string, side: Color, sans: readonly string[], settle: number = REP.settlePlies): Found | string {
  const target = positionOf(frontierFen);
  if (!target) return 'unparseable position';
  const targetKey = positionKeyOf(target);
  let pos = positionOf(START_FEN)!;
  let fen = START_FEN;
  let i = 0;
  while (i < sans.length && positionKeyOf(pos) !== targetKey) {
    const uci = sanToUci(pos, sans[i]!);
    const step = uci && advance(fen, pos, uci);
    if (!step) return 'the game left the board';
    fen = step.fen;
    pos = positionOf(fen)!;
    i++;
  }
  if (positionKeyOf(pos) !== targetKey) return 'never reached the line’s end';
  if (isEndgame(pos)) return 'an endgame already at the line’s end';
  const from = i;
  let arrived: Arrival | null = null;
  let captured = false;
  let start: number | undefined;
  for (;;) {
    if (isEndgame(pos)) {
      start ??= i;
      if (i - start > settle) return 'no quiet moment early in the endgame';
      if (pos.turn === side && !captured && !pos.isCheck() && !pos.isEnd()) {
        return { fen, ply: i - from, move: Math.floor(i / 2) + 1, arrived };
      }
    } else if (start !== undefined) return 'the endgame was left again';
    if (i >= sans.length) return start === undefined ? 'no endgame in the game' : 'the game ended in the endgame’s first moves';
    const uci = sanToUci(pos, sans[i]!);
    const step = uci && advance(fen, pos, uci);
    if (!step) return 'a move of the game did not resolve';
    captured = step.prevCapSq !== null;
    arrived = step.arrived;
    fen = step.fen;
    pos = positionOf(fen)!;
    i++;
  }
}

/* ------------------------------------------------------------------ the goal */

/**
 * The goal for the user at an endgame's start, from Stockfish's score for them (centipawns) and
 * their material lead (`materialFor`, points), or why there is none.
 */
export function goalFor(cp: number, lead: number): Goal | string {
  if (cp >= REP.winFromCp) return lead >= CONVERT_LEAD ? 'already won on material' : 'win';
  if (cp >= REP.drawLoCp && cp <= REP.drawHiCp) return 'draw';
  return cp < REP.drawLoCp ? 'you are worse' : 'better, but not clearly winning';
}

/* ------------------------------------------------------------------ kept */

/** A repertoire endgame as this device keeps it. */
export interface RepertoireEndgame {
  v: 1;
  /** `r-` and the key's hash: the address's id. */
  id: string;
  key: PositionKey;
  fen: string;
  side: Color;
  goal: Goal;
  /** Stockfish's score for the user at the start, and its depth. */
  cp: number;
  depth: number;
  category: Category;
  title: string;
  /** The repertoire lines whose end the game passed (the first few), and their chapters' names. */
  lines: LineRef[];
  names: string[];
  /** The game: its Lichess id and players, the plies from the line's end, the move number. */
  game: { id: string; white: string; black: string; ply: number; move: number };
  /** The move that reached the position, as SAN, when known. */
  san?: string;
  /** When it was kept, ms. */
  at: number;
}

/** FNV-1a over a string, as 8 hex digits. */
export function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

export const repertoireId = (key: string): string => `r-${hash(key)}`;
export const isRepertoireId = (id: string): boolean => /^r-[0-9a-f]{8}$/.test(id);

/** The endgame kept from a found position and Stockfish's score for the user, or why not. */
export function repertoireEndgame(
  found: Found,
  side: Color,
  score: { cp: number; depth: number },
  from: { lines: readonly LineRef[]; names: readonly string[]; game: { id: string; white: string; black: string } },
  at: number,
): RepertoireEndgame | string {
  const pos = positionOf(found.fen);
  if (!pos) return 'unparseable position';
  const goal = goalFor(score.cp, materialFor(pos, side));
  if (goal !== 'win' && goal !== 'draw') return goal;
  const key = positionKeyOf(pos);
  return {
    v: 1,
    id: repertoireId(key),
    key,
    fen: fenOf(pos),
    side,
    goal,
    cp: Math.round(score.cp),
    depth: score.depth,
    category: categoryOf(pos),
    title: titleOf(pos, side),
    lines: from.lines.slice(0, 4).map((l) => ({ sid: l.sid, cid: l.cid, path: [...l.path] })),
    names: from.names.slice(0, 3),
    game: { ...from.game, ply: found.ply, move: found.move },
    ...(found.arrived ? { san: found.arrived.san } : {}),
    at,
  };
}

/** A kept endgame as the drill plays it: a win converted, or a draw held for `REP.hold` moves. */
export function asEndgame(r: RepertoireEndgame): Endgame {
  const idea = categoryById(r.category)?.idea ?? '';
  return { id: r.id, group: r.category, title: r.title, fen: r.fen, goal: r.goal, ...(r.goal === 'win' ? { until: 'convert' as const } : { hold: REP.hold }), idea };
}

/** Whether a stored value is a kept endgame this version reads. */
export function readRepertoireEndgame(x: unknown): RepertoireEndgame | undefined {
  const r = x as Partial<RepertoireEndgame> | null;
  if (!r || r.v !== 1 || typeof r.id !== 'string' || typeof r.fen !== 'string' || (r.goal !== 'win' && r.goal !== 'draw') || (r.side !== 'white' && r.side !== 'black')) return undefined;
  if (!categoryById(String(r.category)) || !positionOf(r.fen) || !Array.isArray(r.lines) || !r.game) return undefined;
  return r as RepertoireEndgame;
}

/** Adds the endgames not kept yet (by id); at most `max`, the oldest out first. Returns the list and how many were new. */
export function addEndgames(have: readonly RepertoireEndgame[], fresh: readonly RepertoireEndgame[], max: number = REP.max): { list: RepertoireEndgame[]; added: number } {
  const ids = new Set(have.map((r) => r.id));
  const add = fresh.filter((r, i) => !ids.has(r.id) && fresh.findIndex((x) => x.id === r.id) === i);
  const all = [...have, ...add].sort((a, b) => a.at - b.at);
  return { list: all.slice(Math.max(0, all.length - max)), added: add.length };
}

/** The list's order: by category, then as kept. */
export function inListOrder(list: readonly RepertoireEndgame[]): RepertoireEndgame[] {
  const rank = new Map(CATEGORIES.map((c, i) => [c.id, i]));
  return [...list].sort((a, b) => (rank.get(a.category) ?? 99) - (rank.get(b.category) ?? 99) || a.at - b.at);
}
