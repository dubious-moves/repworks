// The material under the board: each side's surplus and the points it is up, as Lichess counts them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { material } from '../../../../src/core/chess/material.ts';

const zero = { queen: 0, rook: 0, bishop: 0, knight: 0, pawn: 0 };

test('the start is level, with nothing left over', () => {
  assert.deepEqual(material('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), { white: zero, black: zero, score: 0 });
});

test('a pawn taken: the taker is a pawn up', () => {
  // 1. e4 d5 2. exd5
  const m = material('rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2');
  assert.deepEqual(m.white, { ...zero, pawn: 1 });
  assert.deepEqual(m.black, zero);
  assert.equal(m.score, 1);
});

test('the exchange: each side keeps what the other lacks, and the points net out', () => {
  // White has a rook for Black's bishop and pawn.
  const m = material('4k3/pppp4/8/8/8/8/PPP5/R3K3 w - - 0 1');
  assert.deepEqual(m.white, { ...zero, rook: 1 });
  assert.deepEqual(m.black, { ...zero, pawn: 1 });
  assert.equal(m.score, 4);
  const n = material('4kb2/pppp4/8/8/8/8/PPP5/R3K3 w - - 0 1');
  assert.deepEqual(n.black, { ...zero, bishop: 1, pawn: 1 });
  assert.equal(n.score, 1);
});

test('Black ahead gives a score below 0; a bishop for a knight is level', () => {
  assert.equal(material('3qk3/8/8/8/8/8/8/4K3 w - - 0 1').score, -9);
  const m = material('2b1k3/8/8/8/8/8/8/1N2K3 w - - 0 1');
  assert.deepEqual([m.white.knight, m.black.bishop, m.score], [1, 1, 0]);
});

test('a placement alone reads as a FEN', () => {
  assert.equal(material('4k3/8/8/8/8/8/8/Q3K3').score, 9);
});
