// Lc0's inputs and outputs (PLAN.md §5.143), as Lc0 v0.32.1 encodes them for a network with the
// classical 112 input planes (src/neural/encoder.cc) and reads its 1858 policy outputs. Pure.
//
//   input   [B, 112, 8, 8]  from the side to move's view (with Black to move the ranks are
//                           turned: rank 8 becomes rank 1), a square's index rank * 8 + file:
//            planes 13i…13i+12, for the position i plies back (i = 0…7): the mover's pawns,
//                           knights, bishops, rooks, queens, king, then the other side's, then
//                           ones if that position has occurred before
//            104–107        ones if the mover can castle long, short; the other side long, short
//            108            ones with Black to move
//            109            the plies since the last capture or pawn move (not scaled)
//            110            zeros
//            111            ones (the board's edges)
//   policy  [B, 1858]       logits, in the moves' order of `LC0_MOVES`, in the same turned frame
//   wdl     [B, 3]          win, draw, loss for the side to move (a softmax)
//
// History as Lc0's default `HistoryFill=fen_only`: fewer than 8 positions known, the oldest is
// repeated, unless it is the standard starting position (then the planes stay empty). Repeated, a
// position reached by a double pawn push (en passant possible) shows the pawn back where it came
// from, as Lc0 does.
import type { Position } from 'chessops/chess';
import type { NormalMove, Role, Square } from 'chessops/types';
import { makeBoardFen } from 'chessops/fen';
import { legalMoves } from '../maia/encode.ts';
import { parseUci } from 'chessops/util';

export const LC0_PLANES = 112;
export const LC0_INPUT = LC0_PLANES * 64;
export const LC0_OUTPUTS = 1858;
/** Lc0's default policy softmax temperature (`PolicyTemperature`): its "P" in move statistics. */
export const POLICY_TEMPERATURE = 1.359;
/** The long tail carries no weight, only size. */
export const MIN_PROB = 0.001;
const HISTORY = 8;
const START_BOARD = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

const KNIGHT: readonly (readonly [number, number])[] = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];

/**
 * Lc0's 1858 policy moves (encoder.cc's `kMoveStrs`), from White's view: for each from-square
 * a1…h8, every square a queen or a knight reaches from it, in square order; then the promotions
 * from the 7th rank (straight and both captures, in square order), each to q, r and b. A knight
 * promotion is the plain move, castling the king's move onto its rook (e1h1).
 */
export const LC0_MOVES: readonly string[] = (() => {
  const name = (sq: number) => `${'abcdefgh'[sq & 7]}${(sq >> 3) + 1}`;
  const out: string[] = [];
  for (let from = 0; from < 64; from++) {
    const fr = from >> 3;
    const ff = from & 7;
    for (let to = 0; to < 64; to++) {
      if (to === from) continue;
      const dr = (to >> 3) - fr;
      const df = (to & 7) - ff;
      const queen = dr === 0 || df === 0 || Math.abs(dr) === Math.abs(df);
      const knight = KNIGHT.some(([a, b]) => a === dr && b === df);
      if (queen || knight) out.push(name(from) + name(to));
    }
  }
  for (let file = 0; file < 8; file++) {
    for (let to = 56 + Math.max(0, file - 1); to <= 56 + Math.min(7, file + 1); to++) {
      for (const p of 'qrb') out.push(name(48 + file) + name(to) + p);
    }
  }
  return out;
})();

const INDEX = new Map(LC0_MOVES.map((m, i) => [m, i]));

const PROMO: Partial<Record<Role, string>> = { queen: 'q', rook: 'r', bishop: 'b' };
const ROLES: readonly Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

/** A legal move's policy index in `pos` (standard UCI in, castling as e1g1 or e1h1). */
export function lc0Index(pos: Position, uci: string): number {
  const move = parseUci(uci) as NormalMove | undefined;
  if (!move || !('from' in move)) return -1;
  let to = move.to;
  const piece = pos.board.get(move.from);
  // Castling: the king onto its rook (chessops' standard form e1g1 / e1c1 too).
  if (piece?.role === 'king' && Math.abs((to & 7) - (move.from & 7)) === 2 && (to >> 3) === (move.from >> 3)) {
    to = ((to & 7) > (move.from & 7) ? 7 : 0) + (move.from & ~7);
  }
  const turn = pos.turn === 'black' ? 56 : 0;
  const name = (sq: number) => `${'abcdefgh'[sq & 7]}${((sq ^ turn) >> 3) + 1}`;
  const p = move.promotion ? (PROMO[move.promotion] ?? '') : '';
  return INDEX.get(name(move.from) + name(to) + p) ?? -1;
}

/** A position as the history knows it: the board, and how often it occurred before. */
interface Seen {
  pos: Position;
  repetitions: number;
}

/** Repetitions as Lc0 counts them: the same pieces, side to move, castling and en passant. */
function withRepetitions(history: readonly Position[]): Seen[] {
  const counts = new Map<string, number>();
  return history.map((pos) => {
    const key = `${makeBoardFen(pos.board)} ${pos.turn} ${pos.castles.castlingRights} ${pos.epSquare ?? '-'}`;
    const n = counts.get(key) ?? 0;
    counts.set(key, n + 1);
    return { pos, repetitions: n };
  });
}

/**
 * The input planes for the last position of `history` (positions oldest first, each the one
 * before played on: the line from its start), into `out` from `offset`.
 */
export function lc0Planes(history: readonly Position[], out = new Float32Array(LC0_INPUT), offset = 0): Float32Array {
  const seen = withRepetitions(history.slice(-(HISTORY + 1 + 100)));
  const current = seen[seen.length - 1]!.pos;
  const us = current.turn;
  const them = us === 'white' ? 'black' : 'white';
  const turn = us === 'black' ? 56 : 0;
  const set = (plane: number, sq: number) => (out[offset + plane * 64 + (sq ^ turn)] = 1);
  const fill = (plane: number, v: number) => out.fill(v, offset + plane * 64, offset + plane * 64 + 64);
  out.fill(0, offset, offset + LC0_INPUT);
  for (let i = 0; i < HISTORY; i++) {
    const at = seen.length - 1 - i;
    let entry = seen[Math.max(0, at)]!;
    if (at < 0) {
      if (makeBoardFen(entry.pos.board) === START_BOARD) break;
      entry = { pos: beforeDoublePush(entry.pos), repetitions: entry.repetitions };
    }
    const board = entry.pos.board;
    for (let r = 0; r < 6; r++) {
      const role = ROLES[r]!;
      for (const sq of board[role].intersect(board[us])) set(13 * i + r, sq);
      for (const sq of board[role].intersect(board[them])) set(13 * i + 6 + r, sq);
    }
    if (entry.repetitions >= 1) fill(13 * i + 12, 1);
  }
  const rights = current.castles.castlingRights;
  const backRank = (color: 'white' | 'black') => (color === 'white' ? 0 : 56);
  if (rights.has((backRank(us) + 0) as Square)) fill(104, 1);
  if (rights.has((backRank(us) + 7) as Square)) fill(105, 1);
  if (rights.has((backRank(them) + 0) as Square)) fill(106, 1);
  if (rights.has((backRank(them) + 7) as Square)) fill(107, 1);
  if (us === 'black') fill(108, 1);
  fill(109, current.halfmoves);
  fill(111, 1);
  return out;
}

/** The position before the double pawn push that allows en passant (the same, without one). */
function beforeDoublePush(pos: Position): Position {
  if (pos.epSquare === undefined) return pos;
  const before = pos.clone();
  const mover = pos.turn === 'white' ? 'black' : 'white';
  const step = mover === 'white' ? 8 : -8;
  const landed = pos.epSquare + step;
  const origin = pos.epSquare - step;
  const pawn = before.board.take(landed);
  if (pawn) before.board.set(origin, pawn);
  before.epSquare = undefined;
  return before;
}

export interface Lc0Move {
  san: string;
  /** Standard UCI (castling e1g1). */
  uci: string;
  prob: number;
}

/**
 * Lc0's policy in `pos` from its row of `logits` (from `offset`): the legal moves, likeliest
 * first, at Lc0's policy temperature, the tail under `MIN_PROB` dropped. Empty with no legal move.
 */
export function lc0Policy(pos: Position, logits: ArrayLike<number>, offset = 0, temperature = POLICY_TEMPERATURE): Lc0Move[] {
  const moves = legalMoves(pos);
  if (!moves.length) return [];
  const ls = moves.map((m) => logits[offset + lc0Index(pos, m.uci)]! / temperature);
  const max = Math.max(...ls);
  const e = ls.map((x) => Math.exp(x - max));
  const z = e.reduce((a, b) => a + b, 0);
  return moves
    .map((m, i) => ({ san: m.san, uci: m.uci, prob: e[i]! / z }))
    .filter((x) => x.prob >= MIN_PROB)
    .sort((a, b) => b.prob - a.prob);
}

/** Win, draw and loss for the side to move, summing to 1. */
export interface Wdl {
  win: number;
  draw: number;
  loss: number;
}

export function wdlFrom(out: ArrayLike<number>, offset = 0): Wdl {
  return { win: out[offset]!, draw: out[offset + 1]!, loss: out[offset + 2]! };
}

/** The mover's expected score, 0 to 1. */
export const expected = (w: Wdl): number => w.win + w.draw / 2;

/** Lc0's centipawns from Q = win − loss (its classic `90 · tan(1.5637541897 · Q)`), Q within ±0.999. */
export function lc0Centipawns(w: Wdl): number {
  const q = Math.max(-0.999, Math.min(0.999, w.win - w.loss));
  return Math.round(90 * Math.tan(1.5637541897 * q));
}
