// The tablebase's verdict on an endgame's move (PLAN.md §5.187): the URL, Lichess's answer read
// (an answer taken live on 2026-11-15, cut to the fields read), and the rule beside Stockfish's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstSlip, goalKept } from '../../../../src/core/endgames/endgames.ts';
import { fiftyOf, inTablebase, keepingMoves, mateAfter, mateIn, outcomeOf, pieceCount, readTablebase, tablebaseSlips, tablebaseUrl, tablebaseVerdict } from '../../../../src/core/endgames/tablebase.ts';

/** https://tablebase.lichess.ovh/standard?fen=4k3/6KP/8/8/8/8/7p/8_w_-_-_0_1, its first moves and two others. */
const LIVE = {
  checkmate: false,
  stalemate: false,
  dtz: 1,
  dtm: 17,
  category: 'win',
  moves: [
    { uci: 'h7h8q', san: 'h8=Q+', zeroing: true, dtz: -2, dtm: -16, category: 'loss' },
    { uci: 'g7g8', san: 'Kg8', zeroing: false, dtz: 0, dtm: 0, category: 'draw' },
    { uci: 'g7f6', san: 'Kf6', zeroing: false, dtz: 1, dtm: 21, category: 'win' },
    { uci: 'g7h8', san: 'Kh8', category: 'unknown' },
  ],
};

test('which positions are asked, and how', () => {
  assert.equal(pieceCount('4k3/6KP/8/8/8/8/7p/8 w - - 0 1'), 4);
  assert.equal(pieceCount('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), 32);
  assert.equal(inTablebase('4k3/6KP/8/8/8/8/7p/8 w - - 0 1'), true);
  assert.equal(inTablebase('8/ppp4k/8/PPP5/8/8/8/7K w - - 0 1'), false); // eight pieces
  assert.equal(inTablebase('4k3/8/8/8/8/8/8/4K2R w K - 0 1'), false); // castling: Syzygy has none
  assert.equal(tablebaseUrl('4k3/6KP/8/8/8/8/7p/8 w - - 0 1'), 'https://tablebase.lichess.ovh/standard?fen=4k3/6KP/8/8/8/8/7p/8_w_-_-_0_1');
});

test('the categories as outcomes under the fifty-move rule', () => {
  for (const c of ['win', 'syzygy-win', 'maybe-win']) assert.equal(outcomeOf(c), 'win');
  for (const c of ['cursed-win', 'draw', 'blessed-loss']) assert.equal(outcomeOf(c), 'draw');
  for (const c of ['loss', 'syzygy-loss', 'maybe-loss']) assert.equal(outcomeOf(c), 'loss');
  for (const c of ['unknown', undefined, 3]) assert.equal(outcomeOf(c), undefined);
});

test('an answer read: the moves’ outcomes turned to the mover’s, an unknown move left out', () => {
  const pos = readTablebase(LIVE)!;
  assert.deepEqual(pos, {
    outcome: 'win',
    dtm: 17,
    dtz: 1,
    moves: [
      { uci: 'h7h8q', outcome: 'win', dtm: 16, dtz: 2 },
      { uci: 'g7g8', outcome: 'draw' },
      { uci: 'g7f6', outcome: 'loss', dtm: 21, dtz: 1 },
    ],
  });
  assert.equal(readTablebase({ category: 'unknown', moves: [] }), undefined);
  assert.equal(readTablebase({ category: 'win' }), undefined);
  assert.equal(readTablebase('nope'), undefined);
  assert.equal(readTablebase(null), undefined);
});

test('the verdict on a move, and the rule: a win kept only by a win, a draw lost only by a loss', () => {
  const pos = readTablebase(LIVE)!;
  assert.deepEqual(tablebaseVerdict(pos, 'h7h8q'), { best: 'win', after: 'win' });
  assert.deepEqual(tablebaseVerdict(pos, 'g7g8'), { best: 'win', after: 'draw' });
  assert.equal(tablebaseVerdict(pos, 'g7h8'), undefined);
  assert.equal(tablebaseSlips('win', { best: 'win', after: 'win' }), false);
  assert.equal(tablebaseSlips('win', { best: 'win', after: 'draw' }), true);
  assert.equal(tablebaseSlips('win', { best: 'win', after: 'loss' }), true);
  // Nothing there to keep: no slip.
  assert.equal(tablebaseSlips('win', { best: 'draw', after: 'loss' }), false);
  assert.equal(tablebaseSlips('draw', { best: 'draw', after: 'draw' }), false);
  assert.equal(tablebaseSlips('draw', { best: 'win', after: 'draw' }), false);
  assert.equal(tablebaseSlips('draw', { best: 'draw', after: 'loss' }), true);
  assert.equal(tablebaseSlips('draw', { best: 'loss', after: 'loss' }), false);
  assert.deepEqual(keepingMoves('win', pos), ['h7h8q']);
  assert.deepEqual(keepingMoves('draw', pos), ['h7h8q', 'g7g8']);
});

test('a move with a verdict is judged by it, whatever its scores say; one without, by its scores', () => {
  const reply = { isUser: false };
  // +9.00 to 0.00 by Stockfish, a win kept by the tablebase: no slip.
  assert.equal(firstSlip('win', [{ isUser: true, bestCp: 900, afterCp: 0, tb: { best: 'win', after: 'win' } }, reply]), undefined);
  // Stockfish content (+3.00 kept), the tablebase not: a slip, and one with no scores at all too.
  assert.equal(firstSlip('win', [{ isUser: true, bestCp: 300, afterCp: 300, tb: { best: 'win', after: 'draw' } }, reply]), 0);
  assert.equal(firstSlip('win', [{ isUser: true, tb: { best: 'win', after: 'draw' } }]), 0);
  assert.equal(firstSlip('win', [{ isUser: true, bestCp: 900, afterCp: 850 }, reply, { isUser: true, bestCp: 900, afterCp: 0 }]), 2);
  assert.equal(goalKept('win', { afterCp: 0, tb: { best: 'win', after: 'win' } }), true);
  assert.equal(goalKept('win', { afterCp: 900, tb: { best: 'win', after: 'draw' } }), false);
  assert.equal(goalKept('draw', { tb: { best: 'draw', after: 'draw' } }), true);
  assert.equal(goalKept('win', { afterCp: 900 }), true);
  assert.equal(goalKept('win', {}), false);
});

test('the distances and the fifty-move rule kept for the analysis board (§5.189)', () => {
  // The mate's distance is in plies: the position's 17 is mate on White's ninth move, the winning move's 16 after it the same ninth.
  assert.equal(mateIn(17), 9);
  assert.equal(mateIn(16), 8);
  assert.equal(mateAfter(16), 9);
  assert.equal(mateAfter(0), 1);
  assert.equal(fiftyOf('cursed-win'), 'cursed-win');
  assert.equal(fiftyOf('blessed-loss'), 'blessed-loss');
  assert.equal(fiftyOf('maybe-loss'), 'maybe');
  assert.equal(fiftyOf('win'), undefined);
  // A cursed win for the side to move is a draw; the move into it is, for the mover, a blessed loss turned: the other side's blessed loss is the mover's cursed win.
  const pos = readTablebase({
    category: 'cursed-win',
    dtz: 120,
    moves: [
      { uci: 'a1a2', category: 'blessed-loss', dtz: -2, dtm: null },
      { uci: 'a1b1', category: 'win', dtz: -3, dtm: -4 },
      { uci: 'a1b2', category: 'loss', dtz: 0, dtm: 0, checkmate: true },
    ],
  })!;
  assert.deepEqual(pos, {
    outcome: 'draw',
    fifty: 'cursed-win',
    moves: [
      { uci: 'a1a2', outcome: 'draw', fifty: 'cursed-win' },
      { uci: 'a1b1', outcome: 'loss', dtm: 4, dtz: 3 },
      { uci: 'a1b2', outcome: 'win', dtm: 0, dtz: 0, mate: true },
    ],
  });
});
