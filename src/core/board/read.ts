// Reading the board (CHESSNUT.md §4): the user's side turned to them, a move from the squares the
// board reports, whether the pieces can make a position, and what differs. Pure, on chessops.
import { Chess, type Position } from 'chessops/chess';
import { makeBoardFen, parseFen } from 'chessops/fen';
import { makeSquare, makeUci, parseSquare } from 'chessops/util';
import type { NormalMove, Role } from 'chessops/types';
import { castlingSide } from 'chessops/chess';
import { kingCastlesTo } from 'chessops/util';
import { squaresOf, type Squares } from './chessnut.ts';

/** The board turned half round: a1 ↔ h8 (square s ↔ 63 − s). Its own inverse. */
export const turned = (squares: Squares): Squares => squares.map((_, s) => squares[63 - s]!);
export const turnSquare = (s: number): number => 63 - s;

/** The squares of a full FEN's position. */
export function squaresOfFen(fen: string): Squares | undefined {
  return squaresOf(fen.split(' ')[0]!);
}

const same = (a: Squares, b: Squares): boolean => a.every((c, s) => c === b[s]);

/** Standard UCI (castling as the king's two-square step), as the site writes moves. */
function uciOf(pos: Position, m: NormalMove): string {
  const side = castlingSide(pos, m);
  return side ? makeUci({ from: m.from, to: kingCastlesTo(pos.turn, side) }) : makeUci(m);
}

const PROMOTIONS: Role[] = ['queen', 'knight', 'rook', 'bishop'];

/** Every legal move of `pos`, promotions to each piece. */
function legalMoves(pos: Position): NormalMove[] {
  const out: NormalMove[] = [];
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      const piece = pos.board.get(from)!;
      const last = to >> 3 === 0 || to >> 3 === 7;
      if (piece.role === 'pawn' && last) for (const promotion of PROMOTIONS) out.push({ from, to, promotion });
      else out.push({ from, to });
    }
  }
  return out;
}

/**
 * The legal move from `fen` that leaves the board as `seen` shows it (chessops's comparison, as
 * Chessnut's own app reads a move), in standard UCI; undefined when no move does. A pawn left on
 * the last rank, nothing swapped for it, reads as a queen's promotion (§4.3).
 */
export function readMove(fen: string, seen: Squares): string | undefined {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return undefined;
  const p = pos.value;
  for (const m of legalMoves(p)) {
    const next = p.clone();
    next.play(m);
    const after = squaresOf(makeBoardFen(next.board));
    if (after && same(after, seen)) return uciOf(p, m);
  }
  // The pawn on the last rank, as itself.
  for (const m of legalMoves(p)) {
    if (m.promotion !== 'queen') continue;
    const next = p.clone();
    next.play({ from: m.from, to: m.to });
    next.board.set(m.to, { role: 'pawn', color: p.turn });
    const after = squaresOf(makeBoardFen(next.board));
    if (after && same(after, seen)) return uciOf(p, m);
  }
  return undefined;
}

/** How many of each piece a side has on the Move: two queens (the spare), as Chessnut sells it. */
export const PIECES_ON_THE_BOARD: Record<string, number> = { P: 8, R: 2, N: 2, B: 2, Q: 2, K: 1, p: 8, r: 2, n: 2, b: 2, q: 2, k: 1 };

/** The pieces a position needs beyond the Move's set (none: it can be set up). */
export function missingPieces(squares: Squares): string[] {
  const count: Record<string, number> = {};
  for (const c of squares) if (c) count[c] = (count[c] ?? 0) + 1;
  return Object.entries(count).flatMap(([c, n]) => Array.from({ length: Math.max(0, n - (PIECES_ON_THE_BOARD[c] ?? 0)) }, () => c));
}

export interface Difference {
  square: string;
  /** What the board should have there ('' empty) and what it has. */
  want: string;
  has: string;
}
/** The squares where the board differs from the position wanted. */
export function differences(want: Squares, has: Squares): Difference[] {
  const out: Difference[] = [];
  for (let s = 0; s < 64; s++) if (want[s] !== has[s]) out.push({ square: makeSquare(s), want: want[s]!, has: has[s]! });
  return out;
}

/** Only pieces lifted (squares emptied), nothing put down wrong: a hand still moving, never put back. */
export const onlyLifted = (want: Squares, has: Squares): boolean => has.every((c, s) => c === want[s] || c === '');

/** The rook's step of each castling, a wing at a time: the rook's corner and the square it lands on. */
const ROOK_FIRST: readonly { rook: string; to: string; king: string }[] = [
  { rook: 'h1', to: 'f1', king: 'e1' },
  { rook: 'a1', to: 'd1', king: 'e1' },
  { rook: 'h8', to: 'f8', king: 'e8' },
  { rook: 'a8', to: 'd8', king: 'e8' },
];

/**
 * Whether `uci`, read from the board in `fen`, is a rook's step that castling on that wing would
 * have made, castling being legal there: a rook moved first and left, read as a rook move (§4.3),
 * the screen then saying "Castle with the king first".
 */
export function rookMovedFirst(fen: string, uci: string): boolean {
  const step = ROOK_FIRST.find((r) => uci === r.rook + r.to);
  if (!step) return false;
  const setup = parseFen(fen);
  if (setup.isErr) return false;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return false;
  const p = pos.value;
  const king = parseSquare(step.king)!;
  const rook = parseSquare(step.rook)!;
  const piece = p.board.get(rook);
  if (piece?.role !== 'rook' || piece.color !== p.turn || p.board.get(king)?.role !== 'king') return false;
  // chessops writes castling as the king onto its rook.
  return p.isLegal({ from: king, to: rook });
}
