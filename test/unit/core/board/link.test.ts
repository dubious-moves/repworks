// The link (src/core/board/link.ts, CHESSNUT.md §4.4): what the site does with each report from
// the board, each position it wants shown and each tick, driven through scripted events. The
// times are the defaults: a move read once held 600 ms, a wrong position put back after 2 s, a
// drive stuck after 20 s, a refused move put back after 500 ms.
//
// Controls (each run once, 2026-11-14, and each failed the named tests):
// - the tick reading reports while `driving` as if `synced` (the `driving` guard gone): "a
//   take-back's drive passing the user's move on its way: never read";
// - `onlyLifted` always false: "a hand during the opponent's turn put back after 2 s; a piece only
//   lifted never";
// - `turned` as the identity: "a Black player's board is turned …" and "castling read for Black
//   on both wings, turned" (the tests turn the board with their own `turned`);
// - the window's `held < o.settleMs` as `<=`: "the window respected exactly" and three more;
// - the acted-on guard gone (`if (s.handed || same(s.seen, s.actedOn))`): "a move by hand read
//   after the window, once", "a move the site turns down is put back at once" and "a move read,
//   then the site's new position 300 ms later".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Squares } from '../../../../src/core/board/chessnut.ts';
import { squaresOfFen } from '../../../../src/core/board/read.ts';
import { initialLink, step, type Action, type Event, type LinkState } from '../../../../src/core/board/link.ts';

const S = (fen: string): Squares => squaresOfFen(fen)!;
/** The board turned half round, written apart from read.ts's `turned` so a mistake there shows. */
const turned = (s: Squares): Squares => [...s].reverse();

// The link, driven through scripted events.
function run(events: Event[], state: LinkState = initialLink()): { state: LinkState; actions: Action[] } {
  const actions: Action[] = [];
  for (const e of events) {
    const [s, a] = step(state, e);
    state = s;
    actions.push(...a);
  }
  return { state, actions };
}
const FEN0 = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FEN1 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const FEN2 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
const sq = (fen: string) => S(fen);
const kinds = (a: Action[]) => a.map((x) => (x.t === 'phase' ? `phase:${x.phase}` : x.t === 'move' ? `move:${x.uci}` : x.t));

test('a position sent, reports on the way ignored, then in sync', () => {
  const { state, actions } = run([
    { t: 'report', squares: sq('8/8/8/8/8/8/8/K6k w - - 0 1'), now: 0 },
    { t: 'want', want: { fen: FEN0, movable: true, turned: false }, now: 10 },
    // On the way: a position one legal move from nothing; never read.
    { t: 'report', squares: sq('rnbqkbnr/pppppppp/8/8/8/8/8/K6k w - - 0 1'), now: 500 },
    { t: 'tick', now: 2000 },
    { t: 'report', squares: sq(FEN0), now: 4000 },
  ]);
  assert.deepEqual(kinds(actions), ['drive', 'phase:driving', 'phase:synced']);
  assert.equal(state.phase, 'synced');
});

test('a move by hand read after the window, once', () => {
  const start = run([
    { t: 'report', squares: sq(FEN0), now: 0 },
    { t: 'want', want: { fen: FEN0, movable: true, turned: false }, now: 0 },
  ]);
  assert.equal(start.state.phase, 'synced');
  const { state, actions } = run(
    [
      { t: 'report', squares: sq(FEN1), now: 1000 },
      { t: 'tick', now: 1300 },
      { t: 'tick', now: 1700 },
      { t: 'tick', now: 1900 },
    ],
    start.state,
  );
  assert.deepEqual(kinds(actions), ['move:e2e4']);
  // The site shows the move: in sync, nothing driven.
  const next = run([{ t: 'want', want: { fen: FEN1, movable: false, turned: false }, now: 2000 }], state);
  assert.deepEqual(kinds(next.actions), []);
  assert.equal(next.state.phase, 'synced');
  // The opponent's answer: driven.
  const reply = run([{ t: 'want', want: { fen: FEN2, movable: true, turned: false }, now: 2500 }], next.state);
  assert.deepEqual(kinds(reply.actions), ['drive', 'phase:driving']);
});

test('a move the site turns down is put back at once', () => {
  const start = run([
    { t: 'report', squares: sq(FEN0), now: 0 },
    { t: 'want', want: { fen: FEN0, movable: true, turned: false }, now: 0 },
    { t: 'report', squares: sq(FEN1), now: 1000 },
    { t: 'tick', now: 1700 },
  ]);
  assert.deepEqual(kinds(start.actions), ['phase:synced', 'move:e2e4']);
  const { actions } = run([{ t: 'tick', now: 2100 }, { t: 'tick', now: 2300 }], start.state);
  assert.deepEqual(kinds(actions), ['drive', 'phase:driving']);
});

test('a hand during the opponent\'s turn put back after 2 s; a piece only lifted never', () => {
  const start = run([
    { t: 'report', squares: sq(FEN1), now: 0 },
    { t: 'want', want: { fen: FEN1, movable: false, turned: false }, now: 0 },
  ]);
  const lifted = run([{ t: 'report', squares: sq('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKB1R b KQkq - 0 1'), now: 100 }, { t: 'tick', now: 5000 }], start.state);
  assert.deepEqual(kinds(lifted.actions), []);
  const moved = run([{ t: 'report', squares: sq('rnbqkbnr/pppppppp/8/8/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 0 1'), now: 100 }, { t: 'tick', now: 1500 }, { t: 'tick', now: 2200 }], start.state);
  assert.deepEqual(kinds(moved.actions), ['drive', 'phase:driving']);
});

test('a Black player\'s board is turned, and moves are read turned back', () => {
  const blackToMove = FEN1;
  const { state, actions } = run([
    { t: 'report', squares: turned(sq(blackToMove)), now: 0 },
    { t: 'want', want: { fen: blackToMove, movable: true, turned: true }, now: 0 },
    { t: 'report', squares: turned(sq('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')), now: 100 },
    { t: 'tick', now: 800 },
  ]);
  assert.equal(state.phase, 'synced');
  assert.deepEqual(kinds(actions), ['phase:synced', 'move:c7c5']);
});

test('a held card\'s move taken back by hand is Try again', () => {
  const card = FEN0;
  const { actions } = run([
    { t: 'report', squares: sq(FEN1), now: 0 },
    { t: 'want', want: { fen: FEN1, movable: false, turned: false, undoFen: card }, now: 0 },
    { t: 'report', squares: sq(card), now: 100 },
    { t: 'tick', now: 800 },
  ]);
  assert.deepEqual(kinds(actions), ['phase:synced', 'undo']);
});

test('a drive not reached in 20 s is stuck; fixed by hand it is in sync', () => {
  const { state, actions } = run([
    { t: 'report', squares: sq('8/8/8/8/8/8/8/K6k w - - 0 1'), now: 0 },
    { t: 'want', want: { fen: FEN0, movable: true, turned: false }, now: 0 },
    { t: 'tick', now: 20000 },
    { t: 'report', squares: sq(FEN0), now: 25000 },
  ]);
  assert.deepEqual(kinds(actions), ['drive', 'phase:driving', 'phase:stuck', 'phase:synced']);
  assert.equal(state.phase, 'synced');
});

test('a position the pieces can\'t make is never driven', () => {
  const { actions } = run([{ t: 'want', want: { fen: 'k7/8/8/8/8/8/8/QQQ1K3 w - - 0 1', movable: true, turned: false }, now: 0 }]);
  assert.deepEqual(actions, [{ t: 'phase', phase: 'unmakeable', missing: ['Q'] }]);
});

/** The link in sync with `fen` on the board (as the user sees it: turned when asked). */
const syncedAt = (fen: string, movable = true, turn = false): LinkState =>
  run([
    { t: 'report', squares: turn ? turned(sq(fen)) : sq(fen), now: 0 },
    { t: 'want', want: { fen, movable, turned: turn }, now: 0 },
  ]).state;

test('castling read for Black on both wings, turned', () => {
  const castleB = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R b KQkq - 0 1';
  const short = run([{ t: 'report', squares: turned(sq('r4rk1/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQ - 1 2')), now: 100 }, { t: 'tick', now: 700 }], syncedAt(castleB, true, true));
  assert.deepEqual(kinds(short.actions), ['move:e8g8']);
  const long = run([{ t: 'report', squares: turned(sq('2kr3r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQ - 1 2')), now: 100 }, { t: 'tick', now: 700 }], syncedAt(castleB, true, true));
  assert.deepEqual(kinds(long.actions), ['move:e8c8']);
  // The same squares unturned are no move of Black's: nothing, then put back after 2 s.
  const unturned = run([{ t: 'report', squares: sq('r4rk1/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQ - 1 2'), now: 100 }, { t: 'tick', now: 700 }, { t: 'tick', now: 2100 }], syncedAt(castleB, true, true));
  assert.deepEqual(kinds(unturned.actions), ['drive', 'phase:driving']);
});

test('a position unchanged after the window: nothing', () => {
  const { actions } = run([{ t: 'tick', now: 700 }, { t: 'report', squares: sq(FEN0), now: 1000 }, { t: 'tick', now: 3000 }, { t: 'tick', now: 60000 }], syncedAt(FEN0));
  assert.deepEqual(actions, []);
});

test('the window respected exactly: 599 ms nothing, 600 ms read', () => {
  const at = run([{ t: 'report', squares: sq(FEN1), now: 1000 }, { t: 'tick', now: 1599 }], syncedAt(FEN0));
  assert.deepEqual(at.actions, []);
  assert.deepEqual(kinds(run([{ t: 'tick', now: 1600 }], at.state).actions), ['move:e2e4']);
  // Another setting: 300 ms.
  const quick = { settleMs: 300, putBackMs: 2000, driveMs: 20000, refusedMs: 500 };
  const [s1] = step(syncedAt(FEN0), { t: 'report', squares: sq(FEN1), now: 1000 }, quick);
  assert.deepEqual(step(s1, { t: 'tick', now: 1299 }, quick)[1], []);
  assert.deepEqual(kinds(step(s1, { t: 'tick', now: 1300 }, quick)[1]), ['move:e2e4']);
});

test('a move read, then the site\'s new position 300 ms later: in sync, nothing driven', () => {
  const read = run([{ t: 'report', squares: sq(FEN1), now: 1000 }, { t: 'tick', now: 1600 }], syncedAt(FEN0));
  assert.deepEqual(kinds(read.actions), ['move:e2e4']);
  const shown = run([{ t: 'tick', now: 1800 }, { t: 'want', want: { fen: FEN1, movable: false, turned: false }, now: 1900 }, { t: 'tick', now: 2500 }, { t: 'tick', now: 9000 }], read.state);
  assert.deepEqual(shown.actions, []);
  assert.equal(shown.state.phase, 'synced');
  assert.equal(shown.state.handed, undefined);
});

test('a want changing during a drive: driven again to the new position', () => {
  const { state, actions } = run([
    { t: 'report', squares: sq('8/8/8/8/8/8/8/K6k w - - 0 1'), now: 0 },
    { t: 'want', want: { fen: FEN0, movable: true, turned: false }, now: 0 },
    { t: 'want', want: { fen: FEN2, movable: true, turned: false }, now: 100 },
    // The first drive's position reached: not the one wanted now.
    { t: 'report', squares: sq(FEN0), now: 300 },
    { t: 'tick', now: 1500 },
    { t: 'report', squares: sq(FEN2), now: 2000 },
  ]);
  assert.deepEqual(kinds(actions), ['drive', 'phase:driving', 'drive', 'phase:synced']);
  const drives = actions.filter((a) => a.t === 'drive');
  assert.deepEqual(drives[1], { t: 'drive', squares: sq(FEN2) });
  assert.equal(state.phase, 'synced');
});

test('resend while in sync and equal: nothing; while differing: a drive', () => {
  assert.deepEqual(run([{ t: 'resend', now: 100 }], syncedAt(FEN0)).actions, []);
  const lifted = run([{ t: 'report', squares: sq('rnbqkbnr/pppppppp/8/8/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1'), now: 100 }, { t: 'resend', now: 200 }], syncedAt(FEN0));
  assert.deepEqual(kinds(lifted.actions), ['drive', 'phase:driving']);
  // Nothing wanted: nothing to send.
  assert.deepEqual(run([{ t: 'report', squares: sq(FEN0), now: 0 }, { t: 'resend', now: 100 }]).actions, []);
});

test('a take-back\'s drive passing the user\'s move on its way: never read', () => {
  // After 1.e4 e5 the user takes both back: on its way the robot shows 1.e4 alone, a legal move
  // from the position wanted; it is only watched, and the user's next move is read once there.
  const { state, actions } = run(
    [
      { t: 'want', want: { fen: FEN0, movable: true, turned: false }, now: 100 },
      { t: 'report', squares: sq(FEN1), now: 400 },
      { t: 'tick', now: 1100 },
      { t: 'tick', now: 1900 },
      { t: 'tick', now: 3000 },
      { t: 'report', squares: sq(FEN0), now: 3200 },
      { t: 'report', squares: sq('rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1'), now: 4000 },
      { t: 'tick', now: 4600 },
    ],
    syncedAt(FEN2),
  );
  assert.deepEqual(kinds(actions), ['drive', 'phase:driving', 'phase:synced', 'move:d2d4']);
  assert.equal(state.phase, 'synced');
});

test('nothing wanted: the link idle, reports kept, nothing done', () => {
  const { state, actions } = run([{ t: 'want', want: undefined, now: 10 }, { t: 'report', squares: sq(FEN1), now: 20 }, { t: 'tick', now: 5000 }], syncedAt(FEN0));
  assert.deepEqual(kinds(actions), ['phase:idle']);
  assert.equal(state.phase, 'idle');
  assert.deepEqual(state.seen, sq(FEN1));
});
