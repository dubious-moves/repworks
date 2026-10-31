// The lines of test/fixtures/lc0/reference.json (scripts/lc0-reference.mjs, PLAN.md §5.143), and
// the positions along each, oldest first, as Lc0 reads them.
import { Chess, type Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';

export interface Lc0Line {
  name: string;
  /** The start, or the standard one. */
  fen?: string;
  /** SAN, by spaces. */
  moves: string;
}

export const LINES: Lc0Line[] = [
  { name: 'start', moves: '' },
  { name: '1. e4', moves: 'e4' },
  { name: '1. e4 e5', moves: 'e4 e5' },
  { name: 'closed Ruy Lopez', moves: 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O' },
  { name: 'Najdorf', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6' },
  { name: 'QGD', moves: 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3' },
  { name: 'Qxf7 mates', moves: 'e4 e5 Bc4 Nc6 Qh5 Nf6' },
  { name: 'the queen hangs', moves: 'e4 e5 Qh5 Nc6 Qxe5+ Be7' },
  { name: 'Bxg4 wins the queen', moves: 'e4 d5 Qg4' },
  { name: 'a pawn promotes', fen: '8/P7/8/8/8/8/5k1p/K7 w - - 0 1', moves: '' },
  { name: 'a pawn promotes, Black', fen: '8/P7/8/8/8/8/5k1p/K7 b - - 0 1', moves: '' },
  { name: 'both may castle', fen: 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 4 8', moves: '' },
  { name: 'both may castle, Black', fen: 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R b KQkq - 4 8', moves: '' },
  { name: 'king and queen', fen: '8/8/8/4k3/8/8/8/KQ6 w - - 0 1', moves: '' },
  { name: 'en passant from a FEN', fen: 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3', moves: '' },
  { name: 'back rank mate', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 30', moves: '' },
];

export function history(line: Lc0Line): Position[] {
  const pos = line.fen ? Chess.fromSetup(parseFen(line.fen).unwrap()).unwrap() : Chess.default();
  const out = [pos.clone()];
  for (const san of line.moves ? line.moves.split(' ') : []) {
    pos.play(parseSan(pos, san)!);
    out.push(pos.clone());
  }
  return out;
}
