// The position key (D10, PLAN.md §4.3): the first four fields of chessops's canonical FEN.
// En passant is kept only when the capture is legal (the rule the published puzzle dataset
// follows), castling rights without their king and rook are dropped, and the clocks are dropped.
import { Chess, type Position } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import type { Setup } from 'chessops/setup';
import { squareFile, squareFromCoords, squareRank } from 'chessops/util';

/** A position's identity across the site: cards, notes, transpositions and the puzzle index. */
export type PositionKey = string & { readonly __brand: 'PositionKey' };

export interface KeyedFen {
  key: PositionKey;
  /**
   * False when chessops refused the position (`Chess.fromSetup` failed) and the key fell back
   * to the pseudo-legal en passant rule. Positions reached by play never do; the caller reports
   * the ones that do.
   */
  legal: boolean;
}

/** The key of a position chessops already holds: the fast path for walking a move tree. */
export function positionKeyOf(pos: Position): PositionKey {
  return firstFourFields(makeFen(pos.toSetup()));
}

/** The key of a FEN, whichever library wrote it; undefined when the text isn't a FEN. */
export function keyFen(fen: string): KeyedFen | undefined {
  const setup = parseFen(fen.trim());
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isOk) return { key: positionKeyOf(pos.value), legal: true };
  return { key: pseudoLegalKey(setup.value), legal: false };
}

/** The key of a FEN; throws when the text isn't a FEN. */
export function positionKey(fen: string): PositionKey {
  const keyed = keyFen(fen);
  if (!keyed) throw new Error(`Not a FEN: ${fen}`);
  return keyed.key;
}

function firstFourFields(fen: string): PositionKey {
  return fen.split(' ').slice(0, 4).join(' ') as PositionKey;
}

// The fallback for setups chessops refuses: mistake-lab's rule, which keeps the en passant
// square when a pawn of the side to move stands beside it on the right rank.
function pseudoLegalKey(setup: Setup): PositionKey {
  const ep = setup.epSquare;
  let keepEp = false;
  if (ep !== undefined) {
    const rank = setup.turn === 'white' ? 4 : 3; // the capturing pawn's rank, 0-based
    if (squareRank(ep) === (setup.turn === 'white' ? 5 : 2)) {
      for (const df of [-1, 1]) {
        const sq = squareFromCoords(squareFile(ep) + df, rank);
        const piece = sq === undefined ? undefined : setup.board.get(sq);
        if (piece && piece.role === 'pawn' && piece.color === setup.turn) keepEp = true;
      }
    }
  }
  return firstFourFields(makeFen({ ...setup, epSquare: keepEp ? ep : undefined }));
}
