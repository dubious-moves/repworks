import { Chess, normalizeMove } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { chessgroundMove, chessgroundDests } from 'chessops/compat';
const pos = Chess.fromSetup(parseFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1').unwrap()).unwrap();
const mv = parseSan(pos, 'O-O');
console.log('internal', makeUci(mv), 'normalized', makeUci(normalizeMove ? pos.normalizeMove?.(mv) ?? mv : mv), 'chessground', chessgroundMove(mv));
console.log('dests e1:', [...chessgroundDests(pos).get('e1')]);
