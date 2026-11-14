// What a game on the Chessnut Move says (src/core/board/speech.ts, CHESSNUT.md §4.10, §5.4): the
// opponent's moves as they come, the study move when the repertoire check takes one back; nothing
// of a game's moves when it is first seen (a new game, a resumed one); a move taken back forgotten.
//
// Controls (each run once, 2026-11-14, and each failed the named test):
// - the first look at a game saying its moves (no `heard.setup !== g.setup` return): "a game
//   first seen says nothing …".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTHING_HEARD, spokenFor, type SpokenGame } from '../../../../src/core/board/speech.ts';

const setup = {};
const game = (moves: [boolean, string][], deviation?: { repSan: string }): SpokenGame => ({ setup, moves: moves.map(([isUser, san]) => ({ isUser, san })), ...(deviation ? { deviation } : {}) });

test("a game first seen says nothing of its moves; then the opponent's moves as they come, not the user's", () => {
  let [words, heard] = spokenFor(NOTHING_HEARD, game([[true, 'e4'], [false, 'c5']]));
  assert.deepEqual(words, []);
  [words, heard] = spokenFor(heard, game([[true, 'e4'], [false, 'c5'], [true, 'Nf3']]));
  assert.deepEqual(words, []);
  [words, heard] = spokenFor(heard, game([[true, 'e4'], [false, 'c5'], [true, 'Nf3'], [false, 'd6']]));
  assert.deepEqual(words, ['d, 6']);
  // The same state again: nothing more.
  [words] = spokenFor(heard, game([[true, 'e4'], [false, 'c5'], [true, 'Nf3'], [false, 'd6']]));
  assert.deepEqual(words, []);
  // No game: nothing, and the next game is new.
  [words, heard] = spokenFor(heard, undefined);
  assert.deepEqual([words, heard], [[], NOTHING_HEARD]);
});

test("the repertoire check's refusal: the study move said once", () => {
  const deviation = { repSan: 'd6' };
  let [words, heard] = spokenFor(NOTHING_HEARD, game([[true, 'e4']]));
  [words, heard] = spokenFor(heard, game([[true, 'e4'], [false, 'c5']], undefined));
  assert.deepEqual(words, ['c, 5']);
  [words, heard] = spokenFor(heard, game([[true, 'e4'], [false, 'c5']], deviation));
  assert.deepEqual(words, ['Not your repertoire. The study move is d, 6.']);
  [words] = spokenFor(heard, game([[true, 'e4'], [false, 'c5']], deviation));
  assert.deepEqual(words, []);
});

test("a take-back: the moves taken off forgotten, the opponent's next answer said", () => {
  let [, heard] = spokenFor(NOTHING_HEARD, game([[true, 'e4'], [false, 'c5'], [true, 'Nf3'], [false, 'd6']]));
  let words: string[];
  [words, heard] = spokenFor(heard, game([[true, 'e4'], [false, 'c5']]));
  assert.deepEqual(words, []);
  [words, heard] = spokenFor(heard, game([[true, 'e4'], [false, 'c5'], [true, 'Nc3']]));
  [words] = spokenFor(heard, game([[true, 'e4'], [false, 'c5'], [true, 'Nc3'], [false, 'Nc6']]));
  assert.deepEqual(words, ['Knight c, 6']);
});
