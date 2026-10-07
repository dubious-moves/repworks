// What a storm answer says (PLAN.md §5.39): lichessable's dev/check-storm.js section 9 (the
// verdict line) and section 10's provenance (§14.20), ported. "ChessDB cannot score it" became
// "nothing could score it" (Stockfish is asked too, §26), and the uncovered reply's note says
// "repertoire" where lichessable said "course"; every other wording is as shipped.
//
// Controls re-run on this port (2026-10-06), each failing exactly the named assertions:
// - `bestLine`'s same-move guard removed → "the top move is printed once" and "the best line"
//   (its engine case agreeing with the engine's best) fail;
// - the points' sign dropped (an unconditional '+') → "a penalty keeps its own sign" fails.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STORM as C } from '../../../../src/core/storm/config.ts';
import { bestLine, estimated, formatCp, formatShare, formatWp, gapNote, sourceLabel, sourceTitle, verdictLine, type CardFacts } from '../../../../src/core/storm/verdict.ts';

const card = (over: Partial<CardFacts> = {}): CardFacts => ({ bestSan: 'Bb5', bestScore: 32, bestWinrate: 54, nScored: 31, ...over });

test('figures: pawns with two decimals and a sign, win% with one decimal under ten', () => {
  assert.equal(formatCp(32), '+0.32');
  assert.equal(formatCp(-116), '-1.16');
  assert.equal(formatCp(-1), '-0.01');
  assert.equal(formatCp(0), '0.00');
  assert.equal(formatCp(undefined), '');
  assert.equal(formatWp(3.44), '3.4%');
  assert.equal(formatWp(23.4), '23%');
  assert.equal(formatWp(null), '');
  assert.equal(formatShare(7.04), '7.0%');
});

test('the verdict line', () => {
  assert.equal(verdictLine({ verdict: 'great', userSan: 'Bb5', rank: 1, wp: 0, points: 2 }, card()), 'Bb5 · the top move · level with the best · +2');
  assert.equal(verdictLine({ verdict: 'good', userSan: 'Nf3', rank: 4, wp: 3.44, points: 1 }, card()), 'Nf3 · #4 of 31 · 3.4% of the game · +1');
  assert.equal(verdictLine({ verdict: 'bad', userSan: 'a3', rank: null, wp: 14.2, points: 0 }, card()), 'a3 · 14% of the game');
  assert.equal(verdictLine({ verdict: 'great', userSan: 'Bb5', rank: 1, wp: 0, points: 6 }, card()), 'Bb5 · the top move · level with the best · +6');
  assert.equal(verdictLine({ verdict: 'great', userSan: 'Bb5', rank: 2, wp: 0.01, points: 2 }, card()), 'Bb5 · #2 of 31 · level with the best · +2');
  assert.equal(verdictLine({ verdict: 'blunder', passed: true }, card()), 'Passed — no answer given');
  assert.equal(verdictLine({ verdict: 'unknown', userSan: 'Nxh2' }, card()), 'Nxh2 — nothing could score it here');
});

test('a penalty keeps its own sign', () => {
  assert.equal(verdictLine({ verdict: 'blunder', userSan: 'a3', rank: null, wp: 31.5, points: C.blunderPoints }, card()), 'a3 · 32% of the game · ' + C.blunderPoints);
});

test('the card the storm ended on (§14.10c)', () => {
  assert.equal(verdictLine({ verdict: 'unanswered', unanswered: true, userSan: '', wp: null, loss: null, rank: null }, card()), 'Not answered — the storm ended on this position');
  assert.equal(verdictLine({ verdict: 'unanswered', unanswered: true, userSan: 'Nf3' }, card()), 'Nf3 — the storm ended before it was graded');
  assert.equal(bestLine({ verdict: 'unanswered', unanswered: true, userSan: '' }, card()), 'best Bb5 +0.32 · 54%');
});

test('the top move is printed once', () => {
  assert.equal(bestLine({ verdict: 'great', userSan: 'Bb5', rank: 1, userScore: 32, userWinrate: 54 }, card()), 'best Bb5 +0.32 · 54%');
  assert.equal(bestLine({ verdict: 'great', userSan: 'Bb5', rank: null, userScore: 32 }, card()), 'best Bb5 +0.32 · 54%');
});

test('the best line: both moves when they differ, the engine’s best when the engine graded', () => {
  assert.equal(bestLine({ verdict: 'good', userSan: 'Nf3', rank: 4, userScore: -10, userWinrate: 49 }, card()), 'best Bb5 +0.32 · 54%   Nf3 -0.10 · 49%');
  assert.equal(bestLine({ verdict: 'blunder', userSan: 'a3', rank: null, userScore: -148 }, card()), 'best Bb5 +0.32 · 54%   a3 -1.48');
  assert.equal(bestLine({ verdict: 'unknown', userSan: 'Nxh2' }, card({ bestSan: 'Qe8', bestScore: -83, bestWinrate: undefined })), 'best Qe8 -0.83');
  assert.equal(verdictLine({ verdict: 'bad', userSan: 'Nxh2', rank: null, wp: 12.7, source: 'engine', points: 0 }, card()), 'Nxh2 · 13% of the game');
  assert.equal(bestLine({ verdict: 'bad', userSan: 'Nxh2', rank: null, userScore: -108, source: 'engine', bestSan: 'Qf3', bestScore: 32 }, card()), 'best Qf3 +0.32   Nxh2 -1.08   · by Stockfish');
  assert.equal(bestLine({ verdict: 'bad', userSan: 'Nxh2', rank: null, userScore: -108, source: 'engine', bestSan: 'Qf3', bestScore: 32, userWinrate: 41 }, card()).indexOf('%'), -1);
  assert.equal(bestLine({ verdict: 'good', userSan: 'Qf3', rank: null, userScore: 32, source: 'engine', bestSan: 'Qf3', bestScore: 32 }, card()), 'best Qf3 +0.32   · by Stockfish');
});

test('which tier graded it (§14.20)', () => {
  assert.equal(sourceLabel({ verdict: 'good', source: 'list' }), 'ChessDB’s ranking here');
  assert.equal(sourceLabel({ verdict: 'good', source: 'child' }), 'scored one move on');
  assert.equal(sourceLabel({ verdict: 'good', source: 'engine', depth: 20 }), 'by Stockfish d20');
  assert.equal(sourceLabel({ verdict: 'good', source: 'engine' }), 'by Stockfish');
  assert.equal(sourceLabel({ verdict: 'good' }), '');
  assert.equal(sourceLabel({ verdict: 'great', puzzle: true }), '');
  assert.equal(bestLine({ verdict: 'good', userSan: 'Nf3', rank: 4, userScore: -10, userWinrate: 49, source: 'list' }, card()), 'best Bb5 +0.32 · 54%   Nf3 -0.10 · 49%   · ChessDB’s ranking here');
  assert.equal(bestLine({ verdict: 'blunder', userSan: 'a3', rank: null, userScore: -148, source: 'child' }, card()), 'best Bb5 +0.32 · 54%   a3 -1.48   · scored one move on');
  assert.equal(estimated({ verdict: 'good', source: 'list' }), true);
  assert.equal(estimated({ verdict: 'good', source: 'child' }), true);
  assert.equal(estimated({ verdict: 'good', source: 'engine' }), false);
  assert.equal(estimated({ verdict: 'good', source: 'sflist' }), false);
  assert.equal(estimated({ verdict: 'unknown' }), true);
  assert.equal(estimated(null), false);
  assert.equal(new Set([sourceTitle({ verdict: 'good', source: 'list' }), sourceTitle({ verdict: 'good', source: 'child' }), sourceTitle({ verdict: 'good', source: 'engine', depth: 20 })]).size, 3);
  assert.ok(/depth 20/.test(sourceTitle({ verdict: 'good', source: 'engine', depth: 20 })));
  assert.ok(!/depth/.test(sourceTitle({ verdict: 'good', source: 'engine' })));
  assert.equal(sourceTitle(null), '');
});

test('the uncovered reply’s note (§19)', () => {
  assert.equal(gapNote(card({ unc: { san: 'Nf6', share: 7.04 } })), 'after Nf6, which your repertoire doesn’t answer · 7.0% of games here');
  assert.equal(gapNote(card()), '');
});
