// Stockfish's UCI output (PLAN.md §5.30): info lines, scores from White's side, PVs in SAN.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { formatScore, parseBestmove, parseInfo, pvToSan } from '../../../../src/core/engine/uci.ts';

const pos = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();

test('an info line, with White to move', () => {
  const line = 'info depth 14 seldepth 20 multipv 1 score cp 40 nodes 47416 nps 718424 hashfull 16 time 66 pv e2e4 e7e5 g1f3';
  assert.deepEqual(parseInfo(line, 'white'), { depth: 14, seldepth: 20, multipv: 1, score: { cp: 40 }, bound: false, nodes: 47416, nps: 718424, time: 66, pv: ['e2e4', 'e7e5', 'g1f3'] });
});

test('scores are turned to White’s side when Black moves', () => {
  assert.deepEqual(parseInfo('info depth 9 multipv 2 score cp 35 pv e7e5', 'black')?.score, { cp: -35 });
  assert.deepEqual(parseInfo('info depth 9 multipv 1 score mate 3 pv d8h4', 'black')?.score, { mate: -3 });
  assert.deepEqual(parseInfo('info depth 9 multipv 1 score mate -2 pv e1e2', 'white')?.score, { mate: -2 });
  assert.deepEqual(parseInfo('info depth 0 score mate 0 pv a1a1', 'black')?.score, { mate: 0 });
  assert.deepEqual(parseInfo('info depth 9 score cp 0 pv e2e4', 'black')?.score, { cp: 0 });
  assert.equal(Object.is(parseInfo('info depth 9 score cp 0 pv e2e4', 'black')?.score.cp, -0), false);
});

test('bounds are marked; lines with no score or PV, and info strings, are not infos', () => {
  assert.equal(parseInfo('info depth 22 seldepth 30 multipv 1 score cp 37 lowerbound nodes 1 pv e2e4', 'white')?.bound, true);
  assert.equal(parseInfo('info depth 22 multipv 1 score cp 37 upperbound pv e2e4', 'white')?.bound, true);
  assert.equal(parseInfo('info depth 3 currmove e2e4 currmovenumber 1', 'white'), undefined);
  assert.equal(parseInfo('info string NNUE evaluation using nn-9067e33176e8.nnue', 'white'), undefined);
  assert.equal(parseInfo('info depth 1 seldepth 1 multipv 1 score cp 20 nodes 20', 'white'), undefined);
  assert.equal(parseInfo('readyok', 'white'), undefined);
});

test('bestmove', () => {
  assert.equal(parseBestmove('bestmove e2e4 ponder e7e5'), 'e2e4');
  assert.equal(parseBestmove('bestmove e7e8q'), 'e7e8q');
  assert.equal(parseBestmove('bestmove (none)'), null);
  assert.equal(parseBestmove('info depth 1'), undefined);
});

test('a PV in SAN, with castling as the engine spells it, a promotion, and an illegal tail cut', () => {
  const p = pos('r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQkq - 4 8');
  assert.deepEqual(pvToSan(p, ['e1g1', 'e8c8', 'c3d5']), ['O-O', 'O-O-O', 'Nd5']);
  assert.deepEqual(pvToSan(p, ['e1c1', 'a1a1', 'e8g8']), ['O-O-O']);
  assert.deepEqual(pvToSan(pos('8/P7/8/8/8/8/5k1p/K7 w - - 0 1'), ['a7a8q', 'h2h1q']), ['a8=Q', 'h1=Q+']);
  // The position itself is left as it was.
  assert.equal(p.turn, 'white');
});

test('scores written as Qchess writes them', () => {
  assert.equal(formatScore({ cp: 38 }), '+0.38');
  assert.equal(formatScore({ cp: -120 }), '-1.20');
  assert.equal(formatScore({ cp: 0 }), '0.00');
  assert.equal(formatScore({ mate: 3 }), '#3');
  assert.equal(formatScore({ mate: -2 }), '-#2');
});
