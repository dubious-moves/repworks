// The Chessnut Move's bytes (src/core/board/chessnut.ts, CHESSNUT.md §2 and Appendix C): the codec
// against the byte vectors from Chessnut's app's encoder, the README's decoder and the chessnut-move
// SDK's example.
//
// Controls (each run once, 2026-11-14, and each failed the named test):
// - the nibbles swapped in `nibble` and `block` (the first square of a byte in the high nibble):
//   "the start position, byte for byte", "the SDK example" and "stop and lights" fail (round
//   trips still pass: the codec agrees with itself, not with the board);
// - `wire` as the identity (a1 first on the wire): the same three fail;
// - `readBattery`'s charging read from byte 4: "battery and pieces" fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ASK_BATTERY, boardFenOf, driveTo, LIGHT, lightsCommand, readBattery, readPieces, readReport, squaresOf, STOP_DRIVE } from '../../../../src/core/board/chessnut.ts';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const report = (boardFen: string) => {
  const r = new Uint8Array(38);
  r.set(driveTo(squaresOf(boardFen)!).slice(2, 34), 2);
  return r;
};

test('the start position, byte for byte', () => {
  const d = driveTo(squaresOf(START)!);
  // Appendix C, from Chessnut's app's encoder.
  assert.equal(hex(d), '42 21 58 23 31 85 44 44 44 44 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 77 77 77 77 a6 c9 9b 6a 00');
  assert.equal(d.length, 35);
  assert.equal(boardFenOf(readReport(report(START))!), START);
  // A hand stops it: the flag 1.
  assert.equal(driveTo(squaresOf(START)!, false)[34], 1);
});

test('the SDK example: byte 2 = 0x21 is h8 black queen, g8 black king', () => {
  const r = new Uint8Array(38);
  r[2] = 0x21;
  assert.equal(boardFenOf(readReport(r)!), '6kq/8/8/8/8/8/8/8');
});

test('round trips', () => {
  for (const f of ['r1bq1rk1/pp2bppp/2n1pn2/2pp4/3P4/2PBPN2/PP1N1PPP/R1BQ1RK1', '8/8/8/8/8/8/8/K6k', 'q7/8/8/8/8/8/8/7Q', '8/P7/8/8/8/8/7p/8'])
    assert.equal(boardFenOf(readReport(report(f))!), f);
});

test('an unknown code is not read', () => {
  const r = report(START);
  r[10] = 0xdd;
  assert.equal(readReport(r), undefined);
  assert.equal(readReport(new Uint8Array(20)), undefined);
});

test('stop and lights', () => {
  assert.equal(hex(STOP_DRIVE), '42 21' + ' 00'.repeat(33));
  const lights: number[] = new Array(64).fill(0);
  lights[63] = LIGHT.red; // h8
  lights[62] = LIGHT.green; // g8
  lights[0] = LIGHT.blue; // a1
  const c = lightsCommand(lights as never);
  assert.equal(hex(c), '43 20 21' + ' 00'.repeat(30) + ' 30');
  assert.equal(c.length, 34);
  assert.equal(c[2], 0x21);
  assert.equal(c[33], 0x30);
});

test('battery and pieces', () => {
  assert.deepEqual(readBattery(Uint8Array.of(0x41, 0x03, 0x0c, 0x01, 72)), { charging: true, percent: 72 });
  assert.equal(readBattery(ASK_BATTERY), undefined);
  const b = new Uint8Array(3 + 34 * 4);
  b.set([0x41, 0x89, 0x0b]);
  b.set([1, 10, 20, 90], 3);
  b.set([12, 0, 0, 5], 3 + 33 * 4);
  const p = readPieces(b)!;
  assert.deepEqual(p[0], { piece: 'P', x: 10, y: 20, battery: 90, onBoard: true });
  assert.deepEqual(p[33], { piece: 'k', x: 0, y: 0, battery: 5, onBoard: false });
});

test('a board FEN that is not one is not read', () => {
  assert.equal(squaresOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP'), undefined);
  assert.equal(squaresOf('rnbqkbnr/pppppppp/9/8/8/8/PPPPPPPP/RNBQKBNR'), undefined);
  assert.equal(squaresOf('rnbqkbnr/ppppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR'), undefined);
  assert.equal(squaresOf('rnbqkbnr/pppxpppp/8/8/8/8/PPPPPPPP/RNBQKBNR'), undefined);
  // A full FEN's first field is taken.
  assert.equal(boardFenOf(squaresOf(`${START} w KQkq - 0 1`)!), START);
});
