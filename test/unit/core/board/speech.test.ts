// What a game on the Chessnut Move says (src/core/board/speech.ts, CHESSNUT.md §4.10, §5.4): the
// opponent's moves as they come, the study move when the repertoire check takes one back; nothing
// of a game's moves when it is first seen (a new game, a resumed one); a move taken back forgotten.
//
// Controls (each run once, 2026-11-14, and each failed the named test):
// - the first look at a game saying its moves (no `heard.setup !== g.setup` return): "a game
//   first seen says nothing …".
// - `verdictSpeech` saying the best move with no `bestSan` check (part (e), 2026-11-14): "a storm
//   verdict …".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTHING_HEARD, spokenFor, verdictSpeech, type SpokenGame } from '../../../../src/core/board/speech.ts';

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

test("a storm verdict: the band's word, the best move when another was played and shown, a puzzle's solved or not", () => {
  assert.equal(verdictSpeech({ band: 'great', top: true, bestSan: 'Nf3' }), 'Best move.');
  assert.equal(verdictSpeech({ band: 'good', top: false, bestSan: 'Nf3' }), 'Good. The best move was Knight f, 3.');
  assert.equal(verdictSpeech({ band: 'bad', top: false, bestSan: 'O-O' }), 'Mistake. The best move was castles short.');
  // A held set card keeps the best hidden: its caller leaves it out.
  assert.equal(verdictSpeech({ band: 'blunder', top: false }), 'Blunder.');
  assert.equal(verdictSpeech({ band: 'great', top: false, puzzle: true, bestSan: 'Qh8' }), 'Solved.');
  assert.equal(verdictSpeech({ band: 'blunder', top: false, puzzle: true }), 'Not the solution.');
  assert.equal(verdictSpeech({ band: 'unanswered', top: false }), '');
});
