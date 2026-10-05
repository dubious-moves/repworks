import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseSan, makeSan } from 'chessops/san';
import { parsePgn, startingPosition, emptyHeaders } from 'chessops/pgn';
// Scotch 4...Qh4?! line as in lichessable's ground truth (course 291847): Ndb5 where Nc3 is pinned
const [g] = parsePgn('1. e4 e5 2. Nf3 Nc6 3. d4 exd4 4. Nxd4 Qh4 5. Nc3 Bb4 6. Ndb5 *', emptyHeaders);
let pos = Chess.default();
for (const n of g.moves.mainline()) {
  const mv = parseSan(pos, n.san);
  if (!mv) { console.log('parseSan REFUSED', n.san, 'in', makeFen(pos.toSetup())); break; }
  console.log(n.san.padEnd(5), '->', makeSan(pos, mv)); pos.play(mv);
}
// zero-castling and lowercase tolerance
for (const s of ['0-0', 'O-O', 'e8=Q', 'exd6e.p.']) { console.log(s, JSON.stringify(parseSan(Chess.default(), s) ?? null)); }
