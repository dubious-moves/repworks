// A checklist drill's variety and the exact retry (PLAN.md §5.207): the replies credited by a whole
// game won or drawn, the odds halved relative to the least-handled likely reply, and the earlier
// game's moves replayed until the user plays a new one.
//
// Controls run on this rule (2026-11-20), each failing the named test: the credit given whatever
// the game's outcome → "a lost game credits nothing"; the halving by the count alone, not above
// the least-handled likely reply → "back at its usual odds"; the forced plies credited → "an exact
// retry's replayed opening".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import type { NormalMove } from 'chessops/types';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { historyEntry, pickExplorerMove, readHistoryEntry, PRACTICE, type HistoryEntry, type PlayedMove } from '../../../../src/core/games/practice.ts';
import { drawByWeight, forcedPlies, handledReplies, retryMove, variedWeights, VARIETY } from '../../../../src/core/games/variety.ts';
import { positionKey } from '../../../../src/core/chess/positionKey.ts';
import { standardUci } from '../../../../src/core/chess/uci.ts';

const START = makeFen(Chess.default().toSetup());
const NOW = 1_800_000_000_000;

/** A checklist game from the start, the user White, by SAN. */
function game(sans: string[], o: Partial<HistoryEntry> = {}): HistoryEntry {
  const pos = Chess.default();
  const moves: PlayedMove[] = sans.map((san, i) => {
    const m = parseSan(pos, san) as NormalMove;
    const uci = standardUci(pos, m);
    pos.play(m);
    return { san, uci, isUser: i % 2 === 0 };
  });
  return { id: 'g', ts: NOW - 1000, updatedAt: NOW - 1000, baseFen: START, playerColor: 'white', source: 'todo', outcome: 'win', finalCp: 300, openingName: '', accuracy: null, keyMoveCount: 0, userMoveCount: 0, moves, ...o };
}
const AFTER_E4 = positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');

test('a game won or drawn credits the opponent’s replies, in the window, the first ten', () => {
  const h = handledReplies([game(['e4', 'e5', 'Nf3', 'Nc6']), game(['e4', 'c5', 'Nf3', 'd6'], { outcome: 'draw' })], NOW);
  assert.deepEqual([...h.get(AFTER_E4)!], [['e7e5', 1], ['c7c5', 1]]);
  assert.equal(h.size, 3);
  // Too old, another kind of game, or the 11th reply on: nothing.
  assert.equal(handledReplies([game(['e4', 'e5'], { ts: NOW - VARIETY.windowMs - 1 })], NOW).size, 0);
  assert.equal(handledReplies([game(['e4', 'e5'], { source: 'practice' })], NOW).size, 0);
  const long = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
  const h2 = handledReplies([game([...long, ...long, ...long, ...long, ...long, ...long])], NOW);
  assert.equal([...h2.values()].reduce((s, m) => s + [...m.values()].reduce((a, b) => a + b, 0), 0), VARIETY.replies);
});

test('a lost game credits nothing (no boost either: its replies keep their usual odds)', () => {
  assert.equal(handledReplies([game(['e4', 'e5'], { outcome: 'loss' }), game(['e4', 'e5'], { outcome: 'stopped' })], NOW).size, 0);
});

test('an exact retry’s replayed opening isn’t credited, its replies after the new move are', () => {
  const earlier = game(['e4', 'e5', 'Nf3', 'Nc6']).moves.map((m) => m.uci);
  const g = game(['e4', 'e5', 'Bc4', 'Nf6']);
  const forced = forcedPlies(earlier, g.moves.map((m) => m.uci));
  assert.equal(forced, 2);
  const h = handledReplies([{ ...g, forced }], NOW);
  assert.equal(h.get(AFTER_E4), undefined);
  assert.equal(h.size, 1);
  // The history entry keeps it, and reads it back.
  const review = { judged: false, accuracy: 0, keyMoves: [], tally: {}, deviations: [], corrected: [], evalPoints: [] } as never;
  const e = historyEntry({ id: 'r', ts: 1, baseFen: START, color: 'white', source: 'todo', outcome: 'win', finalCp: 0, title: '', moves: game(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4', 'exd4']).moves, review, forced: 4 })!;
  assert.equal(readHistoryEntry(JSON.parse(JSON.stringify(e)))!.forced, 4);
});

test('the odds halved for each time handled more than the least-handled likely reply, to the floor', () => {
  const moves = [
    { uci: 'a', w: 60 },
    { uci: 'b', w: 30 },
    { uci: 'c', w: 10 },
  ];
  const count = (n: Record<string, number>) => (m: { uci: string }) => n[m.uci] ?? 0;
  const w = (n: Record<string, number>) => moves.map(variedWeights(moves, (m) => m.w, count(n)));
  assert.deepEqual(w({}), [60, 30, 10]);
  assert.deepEqual(w({ a: 1 }), [30, 30, 10]);
  assert.deepEqual(w({ a: 2 }), [15, 30, 10]);
  assert.deepEqual(w({ a: 9 }), [60 * VARIETY.floor, 30, 10]);
});

test('back at its usual odds once the other likely replies are handled as often', () => {
  const moves = [
    { uci: 'a', w: 50 },
    { uci: 'b', w: 30 },
    { uci: 'c', w: 15 },
    // An unlikely reply (under 15%) doesn't hold the others down.
    { uci: 'd', w: 5 },
  ];
  const n: Record<string, number> = { a: 1, b: 1, c: 1 };
  assert.deepEqual(moves.map(variedWeights(moves, (m) => m.w, (m) => n[m.uci] ?? 0)), [50, 30, 15, 5]);
  n['a'] = 2;
  assert.deepEqual(moves.map(variedWeights(moves, (m) => m.w, (m) => n[m.uci] ?? 0)), [25, 30, 15, 5]);
});

test('the explorer’s draw varied by the replies handled', () => {
  const data = { white: 100, draws: 0, black: 0, moves: [{ uci: 'e7e5', san: 'e5', white: 60, draws: 0, black: 0 }, { uci: 'c7c5', san: 'c5', white: 40, draws: 0, black: 0 }] };
  // rnd 0.55: by the games e5 (0–0.6); e5 handled once, its weight 30 of 70: c5.
  assert.equal(pickExplorerMove(data, () => 0.55)!.san, 'e5');
  assert.equal(pickExplorerMove(data, () => 0.55, { ...PRACTICE, handled: (m) => (m.uci === 'e7e5' ? 1 : 0) })!.san, 'c5');
});

test('a weighted draw', () => {
  const ms = ['x', 'y'];
  assert.equal(drawByWeight(ms, (m) => (m === 'x' ? 1 : 3), () => 0.2), 'x');
  assert.equal(drawByWeight(ms, (m) => (m === 'x' ? 1 : 3), () => 0.3), 'y');
  assert.equal(drawByWeight(ms, () => 0, () => 0.3), null);
});

test('the exact retry: the earlier game’s move while the game follows it, none after a new move', () => {
  const earlier = ['e2e4', 'e7e5', 'g1f3', 'b8c6'];
  assert.equal(retryMove(earlier, ['e2e4']), 'e7e5');
  assert.equal(retryMove(earlier, ['e2e4', 'e7e5', 'g1f3']), 'b8c6');
  assert.equal(retryMove(earlier, ['e2e4', 'e7e5', 'f1c4']), undefined);
  assert.equal(retryMove(earlier, earlier), undefined);
  assert.equal(forcedPlies(earlier, ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']), 4);
});
