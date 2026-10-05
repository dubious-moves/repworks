// Standard UCI for card IDs, and both castling spellings read at the edge (PLAN.md §4.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import { parseUciMove, standardUci } from '../../../../src/core/chess/uci.ts';

const castles = Chess.fromSetup(parseFen('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1').unwrap()).unwrap();
const blackCastles = Chess.fromSetup(parseFen('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R b KQkq - 0 1').unwrap()).unwrap();

test('all four castles come out as the king two squares', () => {
  const cases: [typeof castles, string, string][] = [
    [castles, 'O-O', 'e1g1'],
    [castles, 'O-O-O', 'e1c1'],
    [blackCastles, 'O-O', 'e8g8'],
    [blackCastles, 'O-O-O', 'e8c8'],
  ];
  for (const [pos, san, uci] of cases) {
    const move = parseSan(pos, san);
    assert.ok(move && 'from' in move, san);
    // chessops itself plays castling as king takes rook.
    assert.match(makeUci(move), /^e[18][ah][18]$/);
    assert.equal(standardUci(pos, move), uci);
  }
});

test("the explorer's e1h1 and ChessDB's e1g1 name the same move", () => {
  const fromExplorer = parseUciMove(castles, 'e1h1');
  const fromChessDb = parseUciMove(castles, 'e1g1');
  assert.deepEqual(fromExplorer, fromChessDb);
  assert.equal(standardUci(castles, fromExplorer!), 'e1g1');
  assert.equal(standardUci(castles, parseUciMove(castles, 'e1a1')!), 'e1c1');
});

test('ordinary moves and promotions are unchanged; illegal or malformed UCI is refused', () => {
  const pos = Chess.default();
  assert.equal(standardUci(pos, parseUciMove(pos, 'e2e4')!), 'e2e4');
  const promo = Chess.fromSetup(parseFen('8/P6k/8/8/8/8/8/K7 w - - 0 1').unwrap()).unwrap();
  assert.equal(standardUci(promo, parseUciMove(promo, 'a7a8q')!), 'a7a8q');
  assert.equal(parseUciMove(pos, 'e2e5'), undefined);
  assert.equal(parseUciMove(pos, 'e1g1'), undefined);
  assert.equal(parseUciMove(pos, 'xx'), undefined);
  assert.equal(parseUciMove(pos, 'P@e4'), undefined);
});
