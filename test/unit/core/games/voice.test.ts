// Voice input (PLAN.md §5.63): the heard words as tokens and the move they name, the same as
// mistake-lab's own `voiceHeardToValues` and `voiceMatchMove` on every case of
// test/fixtures/games/voice.json (recorded by mistake-lab-voice.cjs at c525403: homophones,
// spelling words, "ninety-five", merged squares, captures, promotions, disambiguation, castling,
// yes and no, noise, and ties refused as ambiguous; an ambiguous answer's moves compared as a set,
// since the legal moves come in another order here), and the move spoken back.
//
// One difference, on purpose: a castle that gives check (`O-O-O+`) is said "castles long" and is
// found by "castle"; mistake-lab compares the SAN without its `+` and spells it out.
//
// Controls re-run on this port (2026-10-07), each failing exactly the named assertions:
// - the pawn preference on a tie left out → "mistake-lab’s matches" ("takes e4": dxe4 or Nxe4);
// - the 0.75 limit at 1.5 → "mistake-lab’s matches" ("king king king" names moves then).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { heardToValues, matchMove, moveToSpeech } from '../../../../src/core/games/voice.ts';
import { positionOf } from '../../../../src/core/storm/walk.ts';

const fx = JSON.parse(readFileSync(new URL('../../../fixtures/games/voice.json', import.meta.url), 'utf8')) as {
  cases: { fen: string; heard: string; pending?: boolean; expected: { values: string[]; result: null | { type: string; san?: string; value?: boolean; moves?: string[] } } }[];
  speech: string[];
  speechExpected: string[];
};

test('mistake-lab’s matches', () => {
  for (const c of fx.cases) {
    const values = heardToValues(c.heard);
    assert.deepEqual(values, c.expected.values, `${c.heard}: tokens`);
    const r = matchMove(values, positionOf(c.fen)!, !!c.pending);
    const got = r === null ? null : r.type === 'move' ? { type: 'move', san: r.san } : r.type === 'ambiguous' ? { type: 'ambiguous', moves: [...r.moves].sort() } : r;
    const want = c.expected.result?.type === 'ambiguous' ? { type: 'ambiguous', moves: [...c.expected.result.moves!].sort() } : c.expected.result;
    assert.deepEqual(got, want, c.heard);
  }
});

test('the move as standard UCI, castling included', () => {
  const r = matchMove(heardToValues('castle'), positionOf('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 5')!);
  assert.deepEqual(r, { type: 'move', san: 'O-O', uci: 'e1g1' });
});

test('the move spoken: mistake-lab’s, a castle with check said as a castle', () => {
  fx.speech.forEach((san, i) => assert.equal(moveToSpeech(san), san === 'O-O-O+' ? 'castles long' : fx.speechExpected[i], san));
});
