// The planning prototype's cases (prototypes/position-key/key.test.ts); §4.3's full suite
// builds on these.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyFen, positionKey } from '../../../../src/core/chess/positionKey.ts';

test('a pinned neighbouring pawn drops en passant', () => {
  assert.equal(positionKey('4k3/8/8/K2pP2r/8/8/8/8 w - d6 0 2'), '4k3/8/8/K2pP2r/8/8/8/8 w - -');
});

test('a capturable double push keeps en passant', () => {
  assert.equal(
    positionKey('rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3'),
    'rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6',
  );
});

test("chess.js 0.10.3's e3 after 1.e4 is dropped", () => {
  assert.equal(
    positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'),
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -',
  );
});

test('a castling right without its king and rook is dropped', () => {
  assert.equal(positionKey('4k3/8/8/8/8/8/8/4K3 w KQ - 0 1'), '4k3/8/8/8/8/8/8/4K3 w - -');
});

test('a position chessops refuses falls back to the pseudo-legal rule and says so', () => {
  // Both kings in check: not a legal position.
  const keyed = keyFen('4k3/4R3/8/3pP3/8/8/4r3/4K3 w - d6 0 1');
  assert.deepEqual(keyed, { key: '4k3/4R3/8/3pP3/8/8/4r3/4K3 w - d6', legal: false });
  assert.equal(keyFen('not a fen'), undefined);
});
