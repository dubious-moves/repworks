// Moves as UCI strings (PLAN.md §4.3). chessops plays castling as king-takes-rook (e1h1)
// internally; card IDs and everything the site writes use standard UCI (e1g1). Moves read from
// elsewhere (the explorer's e1h1, ChessDB's e1g1) are normalized here, at the edge.
import { castlingSide, normalizeMove, type Position } from 'chessops/chess';
import { isNormal, type NormalMove } from 'chessops/types';
import { kingCastlesTo, makeUci, parseUci } from 'chessops/util';

/** Standard UCI for a legal move of `pos`: castling as the king's two-square step. */
export function standardUci(pos: Position, move: NormalMove): string {
  const side = castlingSide(pos, move);
  return side ? makeUci({ from: move.from, to: kingCastlesTo(pos.turn, side) }) : makeUci(move);
}

/** The legal move of `pos` that a UCI string names, in either castling spelling; else undefined. */
export function parseUciMove(pos: Position, uci: string): NormalMove | undefined {
  const move = parseUci(uci);
  if (!move || !isNormal(move)) return undefined;
  const normalized = normalizeMove(pos, move);
  if (!isNormal(normalized) || !pos.isLegal(normalized)) return undefined;
  return normalized;
}
