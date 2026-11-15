// An endgame's defence varied over tries (PLAN.md §5.174): the replies met at each position and the
// try before remembered, Maia's likely moves tried least met first, the same defence again after a
// miss; and "Maia alone"'s checks without a search (nothing hanging, nothing ended, no repetition
// for a draw's attacker).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { authorFirst, beginTry, captureGain, hangs, lc0Vetoed, PUSH_MIN, KEEP_ENDGAMES, KEEP_POSITIONS, noteEnd, noteReply, readMemories, replyHints, replyOrder, trustPick, VARY_MIN, type Memories } from '../../../../src/core/endgames/variety.ts';

const pos = (fen: string) => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
const after = (fen: string, uci: string) => {
  const p = pos(fen);
  p.play(parseUci(uci)!);
  return p;
};
const ucis = (ms: readonly { uci: string }[]) => ms.map((m) => m.uci);

test('Maia’s likely moves tried least met first, the likelier first among equals; a long shot never put first', () => {
  const c = [
    { uci: 'c', prob: 0.1 },
    { uci: 'a', prob: 0.6 },
    { uci: 'b', prob: 0.25 },
  ];
  assert.equal(VARY_MIN, 0.15);
  assert.deepEqual(ucis(replyOrder(c)), ['a', 'b', 'c']);
  assert.deepEqual(ucis(replyOrder(c, { a: 1 })), ['b', 'a', 'c']);
  assert.deepEqual(ucis(replyOrder(c, { a: 1, b: 1 })), ['a', 'b', 'c']);
  assert.deepEqual(ucis(replyOrder(c, { a: 2, b: 1 })), ['b', 'a', 'c']);
  // c (10%) is under VARY_MIN: never ahead of a likely move, however often those were met.
  assert.deepEqual(ucis(replyOrder(c, { a: 5, b: 5 })), ['a', 'b', 'c']);
  // The likeliest always counts as likely, even under VARY_MIN.
  assert.deepEqual(
    ucis(
      replyOrder(
        [
          { uci: 'a', prob: 0.1 },
          { uci: 'b', prob: 0.08 },
        ],
        { a: 1 },
      ),
    ),
    ['a', 'b'],
  );
  assert.deepEqual(replyOrder([]), []);
});

test('the memory: replies counted by position, the same defence again only after a missed try', () => {
  let m: Memories = beginTry({}, 'opp');
  m = noteReply(m, 'opp', 'k1', 'f8e7');
  m = noteReply(m, 'opp', 'k2', 'e7d7');
  assert.deepEqual(replyHints(m, 'opp', 'k1'), { seen: { f8e7: 1 } });
  // Missed: the next try plays it again.
  m = noteEnd(m, 'opp', 'missed');
  m = beginTry(m, 'opp');
  assert.deepEqual(replyHints(m, 'opp', 'k1'), { seen: { f8e7: 1 }, replay: 'f8e7' });
  assert.deepEqual(replyHints(m, 'opp', 'k2'), { seen: { e7d7: 1 }, replay: 'e7d7' });
  assert.deepEqual(replyHints(m, 'opp', 'k3'), { seen: {} });
  // A try begun and left before any reply keeps the missed one as the last.
  m = beginTry(m, 'opp');
  assert.equal(replyHints(m, 'opp', 'k1').replay, 'f8e7');
  // Played again and solved: varied from then on.
  m = noteReply(m, 'opp', 'k1', 'f8e7');
  m = noteEnd(m, 'opp', 'solved');
  m = beginTry(m, 'opp');
  assert.deepEqual(replyHints(m, 'opp', 'k1'), { seen: { f8e7: 2 } });
  // Left unfinished: varied too.
  m = noteReply(m, 'opp', 'k1', 'f8e8');
  m = beginTry(m, 'opp');
  assert.deepEqual(replyHints(m, 'opp', 'k1'), { seen: { f8e7: 2, f8e8: 1 } });
  // The first end counts: a miss stays a miss.
  m = noteReply(m, 'opp', 'k1', 'f8f7');
  m = noteEnd(noteEnd(m, 'opp', 'missed'), 'opp', 'solved');
  m = beginTry(m, 'opp');
  assert.equal(replyHints(m, 'opp', 'k1').replay, 'f8f7');
  // Endgames apart.
  assert.deepEqual(replyHints(m, 'other', 'k1'), { seen: {} });
});

test('the memory stored: read back as written, a bad store starting afresh, the oldest dropped', () => {
  let m: Memories = beginTry({}, 'a');
  m = noteReply(m, 'a', 'k', 'e2e4');
  m = noteEnd(m, 'a', 'missed');
  assert.deepEqual(readMemories(JSON.stringify(m)), m);
  for (const bad of [null, '', 'nope', '[]', '{"a":1}', '{"a":{"seen":[]}}']) assert.deepEqual(readMemories(bad), {}, String(bad));
  assert.deepEqual(readMemories('{"a":{"seen":{"k":{"e2e4":2,"d2d4":"x","c2c4":0}},"cur":{"replies":{"k":3}},"last":{"replies":{"k":"e2e4"},"end":"won"}}}'), {
    a: { seen: { k: { e2e4: 2 } }, cur: { replies: {} }, last: { replies: { k: 'e2e4' } } },
  });

  let many: Memories = {};
  for (let i = 0; i <= KEEP_ENDGAMES; i++) many = beginTry(many, `e${i}`);
  assert.equal(Object.keys(many).length, KEEP_ENDGAMES);
  assert.ok(!('e0' in many));
  // Used again: kept as the latest.
  many = beginTry(many, 'e1');
  many = beginTry(many, 'new');
  assert.ok('e1' in many && !('e2' in many));

  let deep: Memories = {};
  for (let i = 0; i <= KEEP_POSITIONS; i++) deep = noteReply(deep, 'a', `k${i}`, 'e2e4');
  assert.equal(Object.keys(deep['a']!.seen).length, KEEP_POSITIONS);
  assert.ok(!('k0' in deep['a']!.seen));
});

test('hanging, from the board alone: taken by a cheaper piece, or with nothing to take back', () => {
  // Ra8+ Kxa8 (§5.147's hung rook); Rc2 leaves nothing to take.
  const rook = '1K6/1P2k3/8/8/8/8/r7/3R4 b - - 0 1';
  assert.equal(hangs(after(rook, 'a2a8')), true);
  assert.equal(hangs(after(rook, 'a2c2')), false);
  // A rook defended by its king alone, taken by a rook the other king covers: the king can't take back.
  assert.equal(hangs(pos('8/8/3k4/3r4/2K5/8/8/3R4 w - - 0 1')), true);
  // Rook for rook, the king taking back: an exchange, not a piece hanging.
  assert.equal(hangs(pos('8/8/3k4/3r4/8/8/K7/3R4 w - - 0 1')), false);
  // A knight a pawn can take, though defended.
  assert.equal(hangs(pos('8/8/3k4/4n3/3P4/8/8/K7 w - - 0 1')), true);
  // A pawn its king defends, against a lone king; then left alone.
  assert.equal(hangs(pos('8/8/8/3k4/4p3/4K3/8/8 w - - 0 1')), false);
  assert.equal(hangs(pos('8/8/8/8/k3p3/4K3/8/8 w - - 0 1')), true);
});

test('Maia alone: nothing ended, nothing hanging, no repetition for a draw’s attacker; a forced give-up still played', () => {
  const check = (fen: string, repeated: string[] = []) => ({
    ends: (u: string) => {
      const p = after(fen, u);
      return !p.isEnd() ? undefined : p.isCheckmate() ? ('mate' as const) : ('draw' as const);
    },
    repeats: (u: string) => repeated.includes(u),
    hangs: (u: string) => hangs(after(fen, u)),
  });
  const policy = (...us: string[]) => us.map((uci, i) => ({ uci, prob: 0.5 / (i + 1) }));
  // Ke6 stalemates: Kd6, which keeps the pawn, instead.
  const st = '4k3/4P3/8/4K3/8/8/8/8 w - - 0 1';
  assert.deepEqual(trustPick('draw', ['e5e6', 'e5d6'], policy('e5e6', 'e5d6'), [], check(st)), { uci: 'e5d6' });
  // Ra8+ hangs the rook: Rc2.
  const rook = '1K6/1P2k3/8/8/8/8/r7/3R4 b - - 0 1';
  assert.deepEqual(trustPick('win', ['a2a8', 'a2c2'], policy('a2a8', 'a2c2'), [], check(rook)), { uci: 'a2c2' });
  // Only Ra8+ to choose from: played all the same.
  assert.deepEqual(trustPick('win', ['a2a8'], policy('a2a8'), [], check(rook)), { uci: 'a2a8' });
  // A draw's attacker: a repetition passed over; a defence may repeat.
  const kp = '8/8/4k3/8/3KP3/8/8/8 w - - 0 1';
  assert.deepEqual(trustPick('draw', ['d4c4', 'd4d3'], policy('d4c4', 'd4d3'), [], check(kp, ['d4c4'])), { uci: 'd4d3' });
  assert.deepEqual(trustPick('win', ['d4c4', 'd4d3'], policy('d4c4', 'd4d3'), [], check(kp, ['d4c4'])), { uci: 'd4c4' });
  // The owner's report (2026-11-14): Kd4 at 99% repeats the position, and Kd3 at 0.3% was played
  // instead. Only a likely move is ever played: the repetition, here; a long shot never.
  const king = '8/8/3k4/3P4/4K3/8/8/8 w - - 0 1';
  const shots = [{ uci: 'e4d4', prob: 0.99 }, { uci: 'e4d3', prob: 0.003 }, { uci: 'e4f5', prob: 0.003 }];
  assert.deepEqual(trustPick('draw', ['e4d4'], shots, [], check(king, ['e4d4'])), { uci: 'e4d4' });
  // Nothing decent that ends nothing: Stockfish, not a long shot.
  assert.equal(trustPick('win', [], shots, [], check(king)), undefined);
  // The pawn pushed when asked for, its king behind it; not when the push hangs it.
  assert.deepEqual(trustPick('draw', ['d4c4'], policy('d4c4', 'e4e5'), ['e4e5'], check(kp)), { uci: 'e4e5', push: true });
  const loose = '8/8/4k3/8/4P3/4K3/8/8 w - - 0 1';
  assert.deepEqual(trustPick('draw', ['e3d4'], policy('e3d4', 'e4e5'), ['e4e5'], check(loose)), { uci: 'e3d4' });
  // Nothing at all to play: Stockfish then.
  assert.equal(trustPick('win', [], [], [], check(kp)), undefined);
  // A defence's draw on the board is its best: Kxe7 (king against king) played, not passed over.
  const bare = '4k3/4P3/8/4K3/8/8/8/8 b - - 0 1';
  assert.deepEqual(trustPick('win', ['e8e7', 'e8d7'], policy('e8e7', 'e8d7'), [], check(bare)), { uci: 'e8e7' });
  // A mate is played though the board checks call every move here hanging.
  const mate = '6k1/5ppp/8/8/8/8/r4PPP/6K1 b - - 0 1';
  assert.deepEqual(trustPick('draw', ['a2b2', 'a2a1'], policy('a2b2', 'a2a1'), [], { ...check(mate), hangs: () => true }), { uci: 'a2a1' });
});

test('The owner’s report (2026-11-14, Réti): after 8.Qxc7+ the attacker takes the queen when the rest lose', () => {
  const fen = '8/2Q1K3/1k6/8/8/8/8/8 b - - 0 8';
  const check = {
    ends: (u: string) => (after(fen, u).isEnd() ? ('draw' as const) : undefined),
    repeats: () => false,
    hangs: (u: string) => hangs(after(fen, u)),
  };
  const maia = [{ uci: 'b6c7', prob: 0.92 }, { uci: 'b6b5', prob: 0.07 }, { uci: 'b6a6', prob: 0.013 }];
  // Kxc7 ends the game, king against king: a draw.
  assert.equal(check.ends('b6c7'), 'draw');
  // Without Lc0, the board-only rule passes an attacker's draw over (§5.147's stalemates): Kb5.
  assert.deepEqual(trustPick('draw', ['b6c7', 'b6b5', 'b6a6'], maia, [], check), { uci: 'b6b5' });
  // Lc0 rates Kxc7 by its result (0.5) and the king moves as lost: they're vetoed, and the draw played.
  const vetoed = lc0Vetoed({ b6c7: 0.5, b6b5: 0.004, b6a6: 0.003 });
  assert.deepEqual([...vetoed].sort(), ['b6a6', 'b6b5']);
  const left = ['b6c7', 'b6b5', 'b6a6'].filter((u) => !vetoed.has(u));
  assert.deepEqual(trustPick('draw', left, maia, [], check, true), { uci: 'b6c7' });
  // Not vetted (no Lc0), a draw that is all that's left goes to Stockfish.
  assert.equal(trustPick('draw', left, maia, [], check), undefined);
});

test('Lc0’s veto: the moves rated clearly below the best, nothing when they are alike', () => {
  // The real case (2026-11-14): 1…Kb6 loses the opposition, Kd5 and Kd6 hold; Lc0's values after each move.
  assert.deepEqual([...lc0Vetoed({ b6: 0.106, d5: 0.493, d6: 0.493, g5: 0.038 })].sort(), ['b6', 'g5']);
  // Near equals (the 0.30 slips Lc0 can't tell apart) and a lost position's values are left alone.
  assert.equal(lc0Vetoed({ a: 0.5, b: 0.45, c: 0.41 }).size, 0);
  assert.equal(lc0Vetoed({ a: 0.02, b: 0.01 }).size, 0);
  assert.deepEqual([...lc0Vetoed({ a: 0.5, b: 0.39 }, 0.2)], []);
});

test('hanging counts the exchange that follows, and what the move itself won (the owner’s report of 2026-11-15)', () => {
  // Test 2: 7.b5+ is defended by a4 but taken twice (a6, Kc6): it loses a pawn.
  const t2 = '8/5p2/ppk1p1p1/4P2p/PP1K1PP1/8/7P/8 w - - 0 7';
  assert.equal(hangs(after(t2, 'b4b5')), true);
  assert.equal(captureGain(after(t2, 'b4b5')), 1);
  // 7.gxh5 gxh5 is an exchange: the pawn the move took is counted, nothing is lost.
  assert.equal(hangs(after(t2, 'g4h5'), 1), false);
  assert.equal(hangs(after(t2, 'g4h5')), true);
  // 7.h3 leaves nothing to take.
  assert.equal(hangs(after(t2, 'h2h3')), false);
  // The rook ending: 2…f6 drops the pawn to gxf6.
  assert.equal(hangs(after('8/5p1p/p1k3p1/6P1/1PK5/P7/8/8 b - - 0 2', 'f7f6')), true);
  assert.equal(hangs(after('8/5p1p/p1k3p1/6P1/1PK5/P7/8/8 b - - 0 2', 'c6d6')), false);
});

test('Lc0’s veto measured against the best move that gives nothing away (the owner’s report of 2026-11-15)', () => {
  // 2…f6 drops a pawn yet one run rates it best: Kd6 and Kb6 were vetoed against it, f6 played every try.
  const values = { c6d6: 0.309, f7f6: 0.423, c6b6: 0.106 };
  assert.deepEqual([...lc0Vetoed(values)].sort(), ['c6b6', 'c6d6']);
  const firm = (u: string) => u !== 'f7f6';
  assert.deepEqual([...lc0Vetoed(values, undefined, firm)], ['c6b6']);
  // Nothing firm: measured against all of them, as before.
  assert.deepEqual([...lc0Vetoed(values, undefined, () => false)].sort(), ['c6b6', 'c6d6']);
});

test('a draw’s attacker’s push is one Maia gives some chance, not a long shot (the owner’s report of 2026-11-15)', () => {
  const t2 = '8/5p2/ppk1p1p1/4P2p/PP1K1PP1/8/7P/8 w - - 0 7';
  const check = {
    ends: () => undefined,
    repeats: () => false,
    hangs: (u: string) => {
      const p = after(t2, u);
      return hangs(p, u === 'g4h5' ? 1 : 0);
    },
  };
  const maia = [
    { uci: 'g4h5', prob: 0.633 },
    { uci: 'h2h3', prob: 0.29 },
    { uci: 'g4g5', prob: 0.061 },
    { uci: 'b4b5', prob: 0.006 },
  ];
  // b5+ at 0.6%, even were it firm, isn't pushed; nor when it is the only push Lc0 left.
  assert.ok(0.006 < PUSH_MIN);
  assert.deepEqual(trustPick('draw', ['g4h5'], maia, ['b4b5'], { ...check, hangs: () => false }), { uci: 'g4h5' });
  assert.deepEqual(trustPick('draw', ['g4h5'], maia, ['b4b5'], check), { uci: 'g4h5' });
  // A likely push is still made first.
  assert.deepEqual(trustPick('draw', ['g4h5'], maia, ['h2h3', 'b4b5'], check), { uci: 'h2h3', push: true });
});

test('a course drill’s defence is the author’s until a try that met it is solved', () => {
  let m: Memories = beginTry({}, 'c-1');
  assert.equal(authorFirst(m, 'c-1'), true);
  m = noteReply(m, 'c-1', 'k1', 'c6b6', true);
  m = noteEnd(m, 'c-1', 'missed');
  // Missed: still the author's, and the stored memory keeps the mark.
  m = beginTry(m, 'c-1');
  assert.equal(authorFirst(m, 'c-1'), true);
  assert.equal(readMemories(JSON.stringify(m))['c-1']!.last!.author, true);
  // A solved try that met none of the author's replies (the line ran out) doesn't end it.
  m = noteReply(m, 'c-1', 'k9', 'e8d8');
  m = noteEnd(m, 'c-1', 'solved');
  assert.equal(authorFirst(m, 'c-1'), true);
  m = beginTry(m, 'c-1');
  m = noteReply(m, 'c-1', 'k1', 'c6b6', true);
  m = noteEnd(m, 'c-1', 'solved');
  assert.equal(authorFirst(m, 'c-1'), false);
  // Kept across tries and in storage; a solve after a miss in the same try doesn't count.
  m = beginTry(m, 'c-1');
  assert.equal(authorFirst(readMemories(JSON.stringify(m)), 'c-1'), false);
  let n: Memories = beginTry({}, 'c-2');
  n = noteReply(n, 'c-2', 'k1', 'c6b6', true);
  n = noteEnd(noteEnd(n, 'c-2', 'missed'), 'c-2', 'solved');
  assert.equal(authorFirst(n, 'c-2'), true);
});
