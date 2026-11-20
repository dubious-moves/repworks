// A checklist line's failed lines (PLAN.md §5.208): the move that lost a drill, whether the loss is
// kept by itself (before the endgame) or offered, the line's events read back, and the event.
//
// Controls run on this rule (2026-11-20), each failing the named test: the losing move taken as
// the first under the line, not the first that stayed under → "the move after which it stayed
// lost"; the endgame not looked at → "a loss in the endgame is offered"; a retry not won counted
// on a cleared line → "opened, tried, cleared".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FAILED, failedLinesOf, losingMove, lossVerdict, numberedSan } from '../../../../src/core/games/failedLines.ts';
import { formatEvent, parseLog, type KnownEvent } from '../../../../src/core/progress/events.ts';
import type { PlayedMove } from '../../../../src/core/games/practice.ts';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** A game from the start, the user White: e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6, the user's scores given. */
function game(scores: (number | undefined)[], before = 30): PlayedMove[] {
  const ucis = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'c2c3', 'g8f6'];
  return ucis.map((uci, i) => {
    const isUser = i % 2 === 0;
    const cp = scores[i / 2];
    return { san: '?', uci, isUser, ...(isUser && cp !== undefined ? { afterCp: cp, bestCp: i === 0 ? before : 0 } : {}) };
  });
}

test('the move after which it stayed lost, not the first that went under', () => {
  // Under at Nf3, back at Bc4, under again for good at c3.
  assert.equal(losingMove(game([20, -300, 10, -400])), 6);
  assert.equal(losingMove(game([20, 0, -250, -400])), 4);
  // Ended above the line (stopped at equality): none.
  assert.equal(losingMove(game([20, 0, -250, -100])), undefined);
  // Lost from the first move: that move, unless the start was lost already.
  assert.equal(losingMove(game([-300, -300, -400, -500])), 0);
  assert.equal(losingMove(game([-300, -300, -400, -500], -250)), undefined);
  assert.equal(losingMove(game([])), undefined);
  assert.equal(FAILED.losing, -200);
});

test('a loss before the endgame is kept by itself, with its losing move', () => {
  assert.deepEqual(lossVerdict(START, game([20, 0, -250, -400])), { keep: true, at: 4 });
  assert.deepEqual(lossVerdict(START, game([20, 0, 10, 0])), { keep: false, why: 'unclear' });
});

test('a loss in the endgame is offered, not kept', () => {
  // Two rooks a side and a bishop: five pieces, kings and pawns not counted.
  const fen = 'r3k2r/pppb1ppp/8/8/8/8/PPP2PPP/R3K2R w KQkq - 0 1';
  const moves: PlayedMove[] = [
    { san: 'a3', uci: 'a2a3', isUser: true, bestCp: 0, afterCp: -10 },
    { san: 'a6', uci: 'a7a6', isUser: false },
    { san: 'b3', uci: 'b2b3', isUser: true, bestCp: 0, afterCp: -300 },
  ];
  assert.deepEqual(lossVerdict(fen, moves), { keep: false, why: 'endgame', at: 2 });
});

test('the losing move numbered', () => {
  assert.equal(numberedSan(START, ['e2e4', 'e7e5', 'g1f3', 'b8c6'], 3), '2…Nc6');
  assert.equal(numberedSan(START, ['e2e4', 'e7e5', 'g1f3'], 2), '2.Nf3');
  assert.equal(numberedSan(START, ['e2e4'], 3), undefined);
});

test('opened, tried, cleared: the open failed lines read from the line’s events', () => {
  const ev = (t: number, e: Record<string, unknown>) => ({ t, event: { k: 'failed', ...e } });
  const events = [
    ev(1, { g: 'a', on: true, m: 'e2e4 e7e5', preset: 'medium', at: 0 }),
    ev(2, { g: 'b', on: true, m: 'd2d4 d7d5', preset: 'hard' }),
    ev(3, { g: 'a', on: true }),
    ev(4, { g: 'a', on: true }),
    ev(5, { g: 'b', on: false }),
    // A try at a cleared line, or at none, is nothing.
    ev(6, { g: 'b', on: true }),
    ev(7, { g: 'z', on: true }),
    { t: 8, event: { k: 'drop' } },
  ];
  assert.deepEqual(failedLinesOf(events), [{ g: 'a', preset: 'medium', moves: ['e2e4', 'e7e5'], at: 0, t: 1, tries: 3 }]);
  // Kept again by hand after an Undo: open again, the try at it while cleared not counted.
  const again = failedLinesOf([...events, ev(9, { g: 'b', on: true, m: 'd2d4 d7d5', preset: 'hard' })]);
  assert.deepEqual(again.map((l) => [l.g, l.tries]), [['a', 3], ['b', 1]]);
});

test('the `failed` event formats and parses back; a bad one is refused', () => {
  const e: KnownEvent = { v: 1, n: 1, t: '2026-11-20T10:00:00.000Z', k: 'failed', card: 'c|x', g: 'fl_1_ab', on: true, m: 'e2e4 e7e5', preset: 'medium', at: 1 };
  const back = parseLog(formatEvent(e) + '\n');
  assert.deepEqual(back.problems, []);
  assert.deepEqual(back.lines[0]!.event, e);
  const bad = parseLog(JSON.stringify({ ...e, at: 2 }) + '\n' + JSON.stringify({ ...e, card: 'x|x' }) + '\n');
  assert.equal(bad.problems.length, 2);
});
