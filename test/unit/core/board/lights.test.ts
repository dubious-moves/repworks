// The board's lights (src/core/board/lights.ts, CHESSNUT.md §4.7): what the screen's board draws,
// lit on the squares: the last move blue, a graded move in its band, the arrows in their brushes
// (only the top move's of show and grade's many), the squares to put right red; turned for a
// Black player; the README's three colours when asked.
//
// Controls (each run once, 2026-11-14, and each failed the named tests): `o.turned` ignored in
// `put`: "turned for a Black player; the four basic colours when asked" and "the turned board's
// lights"; `basic` as the identity: "turned for a Black player; the four basic colours when
// asked"; `MAX_LIT_ARROWS` at 20: "twelve arrows: the top move only".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lightsFor } from '../../../../src/core/board/lights.ts';
import { LIGHT } from '../../../../src/core/board/chessnut.ts';

const lit = (l: number[]) => Object.fromEntries(l.flatMap((v, s) => (v ? [['abcdefgh'[s & 7]! + ((s >> 3) + 1), v]] : [])));

test('the last move blue, arrows over it, the wrong squares red', () => {
  assert.deepEqual(lit(lightsFor({ lastUci: 'e2e4' }, { turned: false, basicOnly: false })), { e2: LIGHT.blue, e4: LIGHT.blue });
  assert.deepEqual(lit(lightsFor({ lastUci: 'e7e5', arrows: [{ orig: 'g1', dest: 'f3', brush: 'green' }, { orig: 'e5', dest: 'd4', brush: 'red' }] }, { turned: false, basicOnly: false })), { e7: 3, e5: 1, g1: 2, f3: 2, d4: 1 });
  assert.deepEqual(lit(lightsFor({ wrong: ['c3'] }, { turned: false, basicOnly: false })), { c3: 1 });
});

test('turned for a Black player; the four basic colours when asked', () => {
  assert.deepEqual(lit(lightsFor({ lastUci: 'e2e4' }, { turned: true, basicOnly: false })), { d7: 3, d5: 3 });
  assert.deepEqual(lit(lightsFor({ arrows: [{ orig: 'a1', dest: 'a2', brush: 'bandBad' }] }, { turned: false, basicOnly: true })), { a1: 1, a2: 1 });
});

test('twelve arrows: the top move only', () => {
  const arrows = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((f, i) => ({ orig: `${f}2`, dest: `${f}3`, brush: i === 2 ? 'bandBest' : 'bandOk' }));
  assert.deepEqual(lit(lightsFor({ arrows }, { turned: false, basicOnly: false })), { c2: 5, c3: 5 });
});

test('a graded move in its band', () => {
  assert.deepEqual(lit(lightsFor({ lastUci: 'g1f3', played: { uci: 'g1f3', brush: 'bandBad' } }, { turned: false, basicOnly: false })), { g1: 7, f3: 7 });
});

test('a hint: the piece, then its square', () => {
  assert.deepEqual(lit(lightsFor({ arrows: [{ orig: 'g1', brush: 'blue' }] }, { turned: false, basicOnly: false })), { g1: 3 });
  assert.deepEqual(lit(lightsFor({ arrows: [{ orig: 'g1', dest: 'f3', brush: 'blue' }] }, { turned: false, basicOnly: false })), { g1: 3, f3: 3 });
});

test('the turned board\'s lights: every mark turned, a1 ↔ h8', () => {
  const o = { turned: true, basicOnly: false };
  assert.deepEqual(lit(lightsFor({ lastUci: 'e7e5', played: { uci: 'g8f6', brush: 'bandGreat' }, arrows: [{ orig: 'c8', dest: 'g4', brush: 'red' }], wrong: ['a1'] }, o)), {
    // e7 → d2, e5 → d4, g8 → b1, f6 → c3, c8 → f1, g4 → b5, a1 → h8.
    d2: LIGHT.blue,
    d4: LIGHT.blue,
    b1: LIGHT.green,
    c3: LIGHT.green,
    f1: LIGHT.red,
    b5: LIGHT.red,
    h8: LIGHT.red,
  });
});

test('an unknown brush is blue; nothing drawn is every light off', () => {
  assert.deepEqual(lit(lightsFor({ arrows: [{ orig: 'b1', dest: 'c3', brush: 'someNewBrush' }] }, { turned: false, basicOnly: false })), { b1: LIGHT.blue, c3: LIGHT.blue });
  assert.deepEqual(lightsFor({}, { turned: false, basicOnly: false }), new Array(64).fill(LIGHT.off));
});
