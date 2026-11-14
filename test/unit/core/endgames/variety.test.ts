// An endgame's defence varied over tries (PLAN.md §5.174): the replies met at each position and the
// try before remembered, Maia's likely moves tried least met first, the same defence again after a
// miss; and "Maia alone"'s checks without a search (nothing hanging, nothing ended, no repetition
// for a draw's attacker).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { beginTry, hangs, KEEP_ENDGAMES, KEEP_POSITIONS, noteEnd, noteReply, readMemories, replyHints, replyOrder, trustPick, VARY_MIN, type Memories } from '../../../../src/core/endgames/variety.ts';

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
    over: (u: string) => after(fen, u).isEnd(),
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
  // The pawn pushed when asked for, its king behind it; not when the push hangs it.
  assert.deepEqual(trustPick('draw', ['d4c4'], policy('d4c4', 'e4e5'), ['e4e5'], check(kp)), { uci: 'e4e5', push: true });
  const loose = '8/8/4k3/8/4P3/4K3/8/8 w - - 0 1';
  assert.deepEqual(trustPick('draw', ['e3d4'], policy('e3d4', 'e4e5'), ['e4e5'], check(loose)), { uci: 'e3d4' });
  // Nothing at all to play: Stockfish then.
  assert.equal(trustPick('win', [], [], [], check(kp)), undefined);
});
