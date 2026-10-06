// Maia's encoding (PLAN.md §5.32), q_extension's on chessops: tokens, move indices, the policy
// over given logits, the expected score, the rating for a filter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { expectedScore, legalMoves, maiaEloFor, maiaTokens, MAIA_MOVES, moveIndex, policyFrom } from '../../../../src/core/maia/encode.ts';

const pos = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
const on = (t: Float32Array) => [...t.keys()].filter((i) => t[i] === 1);

test('tokens: one per piece, a1 first; with Black to move the board turned and the colours swapped', () => {
  const start = maiaTokens('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  assert.equal(on(start).length, 32);
  // a1: White's rook (channel 3); e1: White's king (5); e8: Black's king (11).
  assert.equal(start[0 * 12 + 3], 1);
  assert.equal(start[4 * 12 + 5], 1);
  assert.equal(start[60 * 12 + 11], 1);
  // The start with Black to move looks, to the model, like the start with White to move.
  assert.deepEqual(on(maiaTokens('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1')), on(start));
  // A position and its colour-flipped twin give the same tokens.
  assert.deepEqual(
    on(maiaTokens('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2')),
    on(maiaTokens('rnbqkb1r/pppp1ppp/5n2/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 2')),
  );
});

test('move indices: from × 64 + to, castling as the king’s two squares, promotions after 4096', () => {
  assert.equal(moveIndex('e2', 'e4'), 12 * 64 + 28);
  assert.equal(moveIndex('e1', 'g1'), 4 * 64 + 6);
  assert.equal(moveIndex('a7', 'a8', 'q'), 4096);
  assert.equal(moveIndex('a7', 'b8', 'n'), 4096 + 1 * 4 + 3);
  assert.equal(moveIndex('h7', 'h8', 'n'), MAIA_MOVES - 1);
  const castle = legalMoves(pos('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1')).filter((m) => m.san.startsWith('O-O'));
  assert.deepEqual(castle.map((m) => m.uci).sort(), ['e1c1', 'e1g1']);
  const promo = legalMoves(pos('8/P7/8/8/8/8/5k1p/K7 w - - 0 1')).filter((m) => m.uci.startsWith('a7'));
  assert.deepEqual(promo.map((m) => m.san).sort(), ['a8=B', 'a8=N', 'a8=Q', 'a8=R']);
});

test('the policy: a softmax over the legal moves alone, read in the turned frame for Black', () => {
  const logits = new Float32Array(MAIA_MOVES).fill(-50);
  // White: e4, d4 and Nf3 at 3 : 2 : 1; an illegal index high, which must not count.
  logits[moveIndex('e2', 'e4')] = Math.log(3);
  logits[moveIndex('d2', 'd4')] = Math.log(2);
  logits[moveIndex('g1', 'f3')] = 0;
  logits[moveIndex('e2', 'e5')] = 9;
  const white = policyFrom(pos('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), logits);
  assert.deepEqual(white.map((m) => m.san), ['e4', 'd4', 'Nf3']);
  assert.ok(Math.abs(white[0]!.prob - 1 / 2) < 1e-6 && Math.abs(white[2]!.prob - 1 / 6) < 1e-6);
  // Black to move: e2e4 in the turned frame is Black's e7e5.
  const black = policyFrom(pos('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'), logits);
  assert.deepEqual(black.map((m) => [m.san, m.uci]), [['e5', 'e7e5'], ['d5', 'd7d5'], ['Nf6', 'g8f6']]);
  // An offset reads the row of a batch.
  const two = new Float32Array(2 * MAIA_MOVES).fill(-50);
  two.set(logits, MAIA_MOVES);
  assert.deepEqual(policyFrom(pos('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), two, MAIA_MOVES), white);
  assert.deepEqual(policyFrom(pos('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1'), logits), []);
});

test('the expected score: win plus half the draws, for the side to move', () => {
  assert.ok(Math.abs(expectedScore([0, 0, 0]) - 0.5) < 1e-12);
  assert.ok(Math.abs(expectedScore([-30, -30, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(expectedScore([0, -30, -30]) - 0) < 1e-9);
  assert.ok(Math.abs(expectedScore([9, 0, 0, 0], 1) - 0.5) < 1e-12);
});

test('the rating for the filter: q_extension’s midpoints, by 50, in Maia’s range', () => {
  assert.equal(maiaEloFor([1600, 1800, 2000, 2200, 2500]), 2150);
  assert.equal(maiaEloFor([2500]), 2600);
  assert.equal(maiaEloFor([400]), 800);
  assert.equal(maiaEloFor([]), 1900);
});
