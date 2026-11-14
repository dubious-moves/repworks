// Reading the Chessnut Move (src/core/board/read.ts, CHESSNUT.md §4.3, §4.6, §4.8): a move from
// the squares the board reports, compared with each legal move's result as Chessnut's own app
// reads one; the board turned for a Black player; the pieces a position needs; what differs.
//
// Controls (each run once, 2026-11-14, and each failed the named test):
// - `readMove` without its second pass (the pawn on the last rank as itself): "a pawn left on the
//   last rank reads as a queen's promotion" fails;
// - `readMove` handing castling over as chessops's king-takes-rook (`e1h1`), not `uciOf`:
//   "castling, both wings, both sides" fails;
// - `turned` as the identity: "the board turned half round" fails;
// - `onlyLifted` always false: "differences and lifted pieces" fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Squares } from '../../../../src/core/board/chessnut.ts';
import { differences, missingPieces, onlyLifted, readMove, squaresOfFen, turned, turnSquare } from '../../../../src/core/board/read.ts';

const S = (fen: string): Squares => squaresOfFen(fen)!;
const after = (fen: string) => S(fen);

test('moves read from the squares', () => {
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  assert.equal(readMove(start, after('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')), 'e2e4');
  assert.equal(readMove(start, after('rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1')), 'g1f3');
  // A piece lifted reads as nothing; so does the position itself.
  assert.equal(readMove(start, after('rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1')), undefined);
  assert.equal(readMove(start, after(start)), undefined);
  // One pawn step read; two pawns moved (no legal move) is nothing.
  assert.equal(readMove(start, after('rnbqkbnr/pppppppp/8/8/8/4P3/PPPP1PPP/RNBQKBNR b KQkq - 0 1')), 'e2e3');
  assert.equal(readMove(start, after('rnbqkbnr/pppppppp/8/8/3P4/4P3/PPP2PPP/RNBQKBNR b KQkq - 0 1')), undefined);
  // A capture.
  const cap = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
  assert.equal(readMove(cap, after('rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2')), 'e4d5');
  // Only the captured pawn taken off: nothing yet.
  assert.equal(readMove(cap, after('rnbqkbnr/ppp1pppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')), undefined);
  // Not a FEN: nothing.
  assert.equal(readMove('not a fen', after(start)), undefined);
});

test('castling, both wings, both sides, as the king\'s two-square step; the rook first is a rook move', () => {
  const castle = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1';
  assert.equal(readMove(castle, after('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R4RK1 b kq - 1 1')), 'e1g1');
  assert.equal(readMove(castle, after('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/2KR3R b kq - 1 1')), 'e1c1');
  const castleB = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R b KQkq - 0 1';
  assert.equal(readMove(castleB, after('r4rk1/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQ - 1 2')), 'e8g8');
  assert.equal(readMove(castleB, after('2kr3r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQ - 1 2')), 'e8c8');
  // The rook moved first and left: a rook move (the screen says to castle with the king first).
  assert.equal(readMove(castle, after('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3KR2 b Qkq - 1 1')), 'h1f1');
  // The king alone on g1: no move yet.
  assert.equal(readMove(castle, after('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R5KR w KQkq - 0 1')), undefined);
  // No castling right: the same squares are no move.
  assert.equal(readMove('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w Qkq - 0 1', after('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R4RK1 b kq - 1 1')), undefined);
});

test('en passant, for White and for Black', () => {
  const ep = 'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3';
  assert.equal(readMove(ep, after('rnbqkbnr/ppp1p1pp/5P2/3p4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3')), 'e5f6');
  const epB = 'rnbqkbnr/pppp1ppp/8/8/3Pp3/5N2/PPP1PPPP/RNBQKB1R b KQkq d3 0 3';
  assert.equal(readMove(epB, after('rnbqkbnr/pppp1ppp/8/8/8/3p1N2/PPP1PPPP/RNBQKB1R w KQkq - 0 4')), 'e4d3');
  // The pawn moved, the captured one still there: nothing yet.
  assert.equal(readMove(epB, after('rnbqkbnr/pppp1ppp/8/8/3P4/3p1N2/PPP1PPPP/RNBQKB1R w KQkq - 0 4')), undefined);
});

test('promotions: the spare queen, a knight, a promotion by capture', () => {
  const promo = '8/4P3/8/8/8/8/k7/4K3 w - - 0 1';
  assert.equal(readMove(promo, after('4Q3/8/8/8/8/8/k7/4K3 b - - 0 1')), 'e7e8q');
  assert.equal(readMove(promo, after('4N3/8/8/8/8/8/k7/4K3 b - - 0 1')), 'e7e8n');
  assert.equal(readMove(promo, after('4R3/8/8/8/8/8/k7/4K3 b - - 0 1')), 'e7e8r');
  // exd8=N: the rook taken, a knight put down.
  const capture = '3r3k/4P3/8/8/8/8/8/4K3 w - - 0 1';
  assert.equal(readMove(capture, after('3N3k/8/8/8/8/8/8/4K3 b - - 0 1')), 'e7d8n');
  // Black's, from Black's side.
  assert.equal(readMove('4k3/8/8/8/8/8/3p4/K7 b - - 0 1', after('4k3/8/8/8/8/8/8/K2q4 w - - 0 2')), 'd2d1q');
});

test('a pawn left on the last rank reads as a queen\'s promotion', () => {
  assert.equal(readMove('8/4P3/8/8/8/8/k7/4K3 w - - 0 1', after('4P3/8/8/8/8/8/k7/4K3 b - - 0 1')), 'e7e8q');
  assert.equal(readMove('3r3k/4P3/8/8/8/8/8/4K3 w - - 0 1', after('3P3k/8/8/8/8/8/8/4K3 b - - 0 1')), 'e7d8q');
  assert.equal(readMove('4k3/8/8/8/8/8/3p4/K7 b - - 0 1', after('4k3/8/8/8/8/8/8/K2p4 w - - 0 2')), 'd2d1q');
});

test('the board turned half round', () => {
  const start = S('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  const t = turned(start);
  // White's king on e1 goes to d8, Black's queen on d8 to e1; a1's rook to h8.
  assert.equal(t[59], 'K');
  assert.equal(t[4], 'q');
  assert.equal(t[63], 'R');
  assert.deepEqual(turned(t), start);
  assert.equal(turnSquare(0), 63);
  assert.equal(turnSquare(turnSquare(12)), 12);
});

test('the pieces a position needs', () => {
  assert.deepEqual(missingPieces(S('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1')), []);
  // The spare queen: two a side can be set up.
  assert.deepEqual(missingPieces(S('k6q/8/8/8/8/8/8/QQ2K2q w - - 0 1')), []);
  assert.deepEqual(missingPieces(S('k7/8/8/8/8/8/8/QQQ1K3 w - - 0 1')), ['Q']);
  assert.deepEqual(missingPieces(S('k7/8/8/8/8/8/8/NNN1K3 w - - 0 1')), ['N']);
  assert.deepEqual(missingPieces(S('kbbb4/8/8/8/8/8/8/4K3 w - - 0 1')), ['b']);
});

test('differences and lifted pieces', () => {
  const want = S('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1');
  const lifted = S('rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR w - - 0 1');
  assert.deepEqual(differences(want, lifted), [{ square: 'e2', want: 'P', has: '' }]);
  assert.deepEqual(differences(want, want), []);
  assert.equal(onlyLifted(want, lifted), true);
  assert.equal(onlyLifted(want, S('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w - - 0 1')), false);
});
