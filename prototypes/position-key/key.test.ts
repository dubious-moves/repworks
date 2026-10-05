import { test } from 'node:test';
import assert from 'node:assert/strict';
import { positionKey } from './key.ts';
test('pinned pawn drops en passant', () => {
  assert.equal(positionKey('4k3/8/8/K2pP2r/8/8/8/8 w - d6 0 2'), '4k3/8/8/K2pP2r/8/8/8/8 w - -');
});
test('capturable keeps en passant', () => {
  assert.equal(positionKey('rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3'), 'rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6');
});
test('1.e4 from chess.js 0.10.3 FEN drops e3', () => {
  assert.equal(positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -');
});
test('impossible castling right is normalised away', () => {
  assert.equal(positionKey('4k3/8/8/8/8/8/8/4K3 w KQ - 0 1'), '4k3/8/8/8/8/8/8/4K3 w - -');
});
