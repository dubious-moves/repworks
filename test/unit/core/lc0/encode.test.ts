// Lc0's encoding (PLAN.md §5.143): the 1858 moves against Lc0's own table, a move's index from
// either side, the 112 input planes (pieces from the mover's view, history, repetitions, the
// filled history of a FEN, castling, the 50-move count), the policy over given logits, the eval.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Chess, type Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { expected, lc0Centipawns, lc0Index, lc0Planes, lc0Policy, LC0_INPUT, LC0_MOVES, LC0_OUTPUTS, POLICY_TEMPERATURE } from '../../../../src/core/lc0/encode.ts';

const pos = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
function line(sans: string, start: Position = Chess.default()): Position[] {
  const p = start.clone();
  const out = [p.clone()];
  for (const san of sans ? sans.split(' ') : []) {
    p.play(parseSan(p, san)!);
    out.push(p.clone());
  }
  return out;
}
/** The squares set in a plane, as names (a1 = 0 in the mover's frame). */
function plane(planes: Float32Array, n: number): string[] {
  const out: string[] = [];
  for (let sq = 0; sq < 64; sq++) if (planes[n * 64 + sq]) out.push(`${'abcdefgh'[sq & 7]}${(sq >> 3) + 1}`);
  return out;
}
const full = (planes: Float32Array, n: number, v = 1) => Array.from(planes.subarray(n * 64, n * 64 + 64)).every((x) => x === v);
const empty = (planes: Float32Array, n: number) => full(planes, n, 0);
const rank = (r: number) => [...'abcdefgh'].map((f) => `${f}${r}`);

test('the 1858 moves are Lc0’s table (encoder.cc’s kMoveStrs at v0.32.1)', () => {
  assert.equal(LC0_MOVES.length, LC0_OUTPUTS);
  // sha256 of Lc0's kMoveStrs joined by spaces, read from its source when this was built.
  assert.equal(createHash('sha256').update(LC0_MOVES.join(' ')).digest('hex'), 'c4c47aca96e213995c772d1aab24498e3ad9c91209d3467889f20fa1a10678dd');
  assert.equal(LC0_MOVES[0], 'a1b1');
  assert.equal(LC0_MOVES[1857], 'h7h8b');
});

test('a move’s index: from the mover’s view, castling onto the rook, a knight promotion plain', () => {
  const start = Chess.default();
  assert.equal(LC0_MOVES[lc0Index(start, 'e2e4')], 'e2e4');
  assert.equal(LC0_MOVES[lc0Index(start, 'g1f3')], 'g1f3');
  // Black's moves turned: e7e5 is e2e4 from Black's side.
  const e4 = line('e4').at(-1)!;
  assert.equal(lc0Index(e4, 'e7e5'), lc0Index(start, 'e2e4'));
  assert.equal(LC0_MOVES[lc0Index(e4, 'b8c6')], 'b1c3');
  const castle = pos('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.equal(LC0_MOVES[lc0Index(castle, 'e1g1')], 'e1h1');
  assert.equal(LC0_MOVES[lc0Index(castle, 'e1c1')], 'e1a1');
  assert.equal(LC0_MOVES[lc0Index(castle, 'e1h1')], 'e1h1');
  const castleB = pos('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1');
  assert.equal(LC0_MOVES[lc0Index(castleB, 'e8g8')], 'e1h1');
  assert.equal(LC0_MOVES[lc0Index(castleB, 'e8c8')], 'e1a1');
  const promo = pos('1n6/P7/8/8/8/8/5k1p/K7 w - - 0 1');
  assert.equal(LC0_MOVES[lc0Index(promo, 'a7a8q')], 'a7a8q');
  assert.equal(LC0_MOVES[lc0Index(promo, 'a7b8r')], 'a7b8r');
  assert.equal(LC0_MOVES[lc0Index(promo, 'a7a8n')], 'a7a8');
  const promoB = pos('8/P7/8/8/8/8/5k1p/K7 b - - 0 1');
  assert.equal(LC0_MOVES[lc0Index(promoB, 'h2h1b')], 'h7h8b');
});

test('the start: the mover’s pieces, the castling rights, White to move, the edges; no history', () => {
  const p = lc0Planes(line(''));
  assert.equal(p.length, LC0_INPUT);
  assert.deepEqual(plane(p, 0), rank(2));
  assert.deepEqual(plane(p, 3), ['a1', 'h1']);
  assert.deepEqual(plane(p, 5), ['e1']);
  assert.deepEqual(plane(p, 6), rank(7));
  assert.deepEqual(plane(p, 11), ['e8']);
  assert.ok(empty(p, 12));
  for (const n of [104, 105, 106, 107, 111]) assert.ok(full(p, n), `plane ${n}`);
  for (const n of [108, 109, 110]) assert.ok(empty(p, n), `plane ${n}`);
  // The start's history is not filled in (Lc0's fen_only).
  for (let n = 13; n < 104; n++) assert.ok(empty(p, n), `plane ${n}`);
});

test('Black to move: the board turned, Black’s pieces first; the position before from the same view', () => {
  const p = lc0Planes(line('e4'));
  assert.deepEqual(plane(p, 0), rank(2)); // Black's pawns, turned
  assert.deepEqual(plane(p, 5), ['e1']); // Black's king on e8, turned
  assert.deepEqual(plane(p, 6), [...rank(7).filter((s) => s !== 'e7'), 'e5'].sort((a, b) => (a[1]! + a[0]!).localeCompare(b[1]! + b[0]!))); // White's pawns, e4 turned to e5
  // One ply back, the start, still from Black's view: White's pawns all on rank 2, turned to 7.
  assert.deepEqual(plane(p, 13), rank(2));
  assert.deepEqual(plane(p, 19), rank(7));
  assert.ok(full(p, 108));
  for (let n = 26; n < 104; n++) assert.ok(empty(p, n), `plane ${n}`);
});

test('a FEN without history: the position repeated in all eight; its en passant pawn put back', () => {
  const p = lc0Planes([pos('4k3/8/8/8/8/8/4P3/4K3 w - - 7 40')]);
  for (let i = 0; i < 8; i++) assert.deepEqual(plane(p, 13 * i), ['e2'], `history ${i}`);
  assert.ok(full(p, 109, 7));
  for (const n of [104, 105, 106, 107]) assert.ok(empty(p, n));
  // After ...f7f5 (en passant possible), the positions before show f7 again.
  const ep = lc0Planes([pos('rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3')]);
  assert.ok(plane(ep, 6).includes('f5'));
  for (let i = 1; i < 8; i++) {
    assert.ok(plane(ep, 13 * i + 6).includes('f7'), `history ${i}`);
    assert.ok(!plane(ep, 13 * i + 6).includes('f5'), `history ${i}`);
  }
});

test('a repetition sets its plane; the 50-move count is the plies, unscaled', () => {
  const h = line('Nf3 Nf6 Ng1 Ng8 Nf3');
  const p = lc0Planes(h);
  // Now (after 3. Nf3) is a repetition of 1. Nf3, and the position before it (after 2... Ng8) of
  // the start; the three between occurred once.
  assert.ok(full(p, 12));
  assert.ok(full(p, 13 + 12));
  for (const i of [2, 3, 4, 5]) assert.ok(empty(p, 13 * i + 12), `history ${i}`);
  assert.ok(full(p, 109, 5));
});

test('the policy: legal moves only, at Lc0’s temperature, likeliest first; the eval', () => {
  const start = Chess.default();
  const logits = new Float32Array(LC0_OUTPUTS).fill(-5);
  logits[lc0Index(start, 'e2e4')] = 2;
  logits[lc0Index(start, 'd2d4')] = 1;
  logits[LC0_MOVES.indexOf('e1h1')] = 50; // not legal here
  const p = lc0Policy(start, logits);
  assert.deepEqual(p.slice(0, 2).map((m) => m.san), ['e4', 'd4']);
  assert.ok(Math.abs(p[0]!.prob / p[1]!.prob - Math.exp(1 / POLICY_TEMPERATURE)) < 1e-6);
  assert.ok(Math.abs(p.reduce((a, m) => a + m.prob, 0) - 1) < 0.02);
  assert.equal(lc0Policy(pos('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), logits).length, 0);
  assert.equal(expected({ win: 0.5, draw: 0.3, loss: 0.2 }), 0.65);
  assert.equal(lc0Centipawns({ win: 0.3, draw: 0.4, loss: 0.3 }), 0);
  assert.ok(lc0Centipawns({ win: 0.31, draw: 0.47, loss: 0.22 }) > 0);
  assert.ok(lc0Centipawns({ win: 1, draw: 0, loss: 0 }) > 10_000);
  assert.ok(lc0Centipawns({ win: 0, draw: 0, loss: 1 }) < -10_000);
});
