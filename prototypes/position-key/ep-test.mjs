import { Chess as Chess14 } from 'chess.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Chess0103 = require('chess.js-0103').Chess;
const { fenPositionKey: peKey } = require('/home/user/puzzle-explorer/lib/posKey.js');
import { Chess as COChess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';

// mistake-lab's key, copied verbatim from index.html for comparison
function isEnPassantPseudoLegal(boardField, sideToMove, epSquare) {
  if (!epSquare || epSquare === '-' || epSquare.length !== 2) return false;
  const file = epSquare.charCodeAt(0) - 97; const rank = +epSquare[1];
  if (file < 0 || file > 7) return false;
  let pawnChar, pawnRank;
  if (sideToMove === 'w') { if (rank !== 6) return false; pawnChar = 'P'; pawnRank = 5; }
  else if (sideToMove === 'b') { if (rank !== 3) return false; pawnChar = 'p'; pawnRank = 4; }
  else return false;
  const ranks = boardField.split('/'); if (ranks.length !== 8) return false;
  const rankStr = ranks[8 - pawnRank]; const files = new Array(8).fill(''); let fi = 0;
  for (let i = 0; i < rankStr.length && fi < 8; i++) { const ch = rankStr[i];
    if (ch >= '1' && ch <= '8') fi += +ch; else { files[fi] = ch; fi++; } }
  if (file - 1 >= 0 && files[file - 1] === pawnChar) return true;
  if (file + 1 <= 7 && files[file + 1] === pawnChar) return true;
  return false;
}
function mlKey(fen) { const p = fen.split(' '); if (p[3] !== '-' && !isEnPassantPseudoLegal(p[0], p[1], p[3])) p[3] = '-'; return p.slice(0,4).join(' '); }

const cases = [
  ['no adjacent pawn: 1.e4', null, ['e4']],
  ['capturable: 1.e4 Nf6 2.e5 d5', null, ['e4','Nf6','e5','d5']],
  ['horizontal pin: K a5, P e5, r h5; ...d7-d5', '4k3/3p4/8/K3P2r/8/8/8/8 b - - 0 1', ['d5']],
  ['diagonal pin: K g7, P e5 pinned by b c3; ...d7-d5', '8/3p2K1/8/4P3/8/2b5/8/k7 b - - 0 1', ['d5']],
  ['two adjacent pawns, one pinned (e5) one free (c5); ...d7-d5', '8/3p2K1/8/2P1P3/8/2b5/8/k7 b - - 0 1', ['d5']],
];
for (const [name, fen, sans] of cases) {
  // dataset path: chess.js 1.4.0 history verbose after + posKey.js
  const c14 = fen ? new Chess14(fen) : new Chess14(); for (const s of sans) c14.move(s);
  const after14 = c14.history({verbose:true}).at(-1).after;
  // chessops path
  let pos = fen ? COChess.fromSetup(parseFen(fen).unwrap()).unwrap() : COChess.default();
  for (const s of sans) { const mv = parseSan(pos, s); pos.play(mv); }
  const coFen = makeFen(pos.toSetup());
  // mistake-lab path: chess.js 0.10.3 fen + mistake-lab key
  const c010 = fen ? new Chess0103(fen) : new Chess0103(); for (const s of sans) c010.move(s);
  console.log('\n#', name);
  console.log('  chess.js 1.4 after :', after14, '\n    -> dataset key   :', peKey(after14));
  console.log('  chessops makeFen   :', coFen, '\n    -> pe key        :', peKey(coFen), ' legalEp?', pos.epSquare);
  console.log('  chess.js 0.10.3 fen:', c010.fen(), '\n    -> mistake-lab key:', mlKey(c010.fen()), '\n    -> pe key on same :', peKey(c010.fen()));
}
