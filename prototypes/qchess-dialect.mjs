// Does chessops read PGN as qchess's generatePGN/buildPGNMoves writes it?
// One brace block per node: shapes first, no inner spaces; NAGs as $n after the move;
// Black's moves numbered only at a line start or a variation start; root comment first.
import { parsePgn, emptyHeaders, startingPosition, parseComment } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
const pgn = `[ChapterName "Najdorf 6.Bg5"]
[Event "Najdorf 6.Bg5"]
[White "Najdorf 6.Bg5"]

{[%csl Gd5][%cal Gf6d5] The key square (with braces typed as parens)} 1. e4 c5 2. Nf3 d6 $146 {[%cal Rd2d4] Prepare d4} 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Bg5 $5 {sharp} e6 (6... Nbd7 $6 {(7. Bc4 Qa5)} 7. Bc4) 7. f4 $16 *


[SetUp "1"]
[FEN "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2"]
[ChapterName "From a FEN, Black to move"]

2... d6 $1 {[%csl Rd4]} 3. d4 cxd4 $22 $132 4. Nxd4 *`;
const games = parsePgn(pgn, emptyHeaders);
console.log('games', games.length);
for (const g of games) {
  const pos = startingPosition(g.headers).unwrap();
  const out = []; let illegal = 0;
  const walk = (node, p) => { for (const c of node.children) { const q = p.clone(); const mv = parseSan(q, c.data.san); if (!mv) { illegal++; continue; } q.play(mv);
      const cm = (c.data.comments || []).map(x => parseComment(x)); out.push([c.data.san, (c.data.nags||[]).join(','), cm.map(x => x.text + '|' + x.shapes.length).join(';')].join(' ')); walk(c, q); } };
  walk(g.moves, pos);
  console.log([...g.headers.keys()].join(','), '| root comments:', (g.comments||[]).map(x => JSON.stringify(parseComment(x))).join(' '), '| illegal:', illegal);
  console.log('  ' + out.filter(s => / \S/.test(s.slice(s.indexOf(' ')))).join('\n  '));
}
