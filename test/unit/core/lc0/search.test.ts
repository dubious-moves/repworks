// Lc0's search (PLAN.md §5.144) on a fake network that counts material, with priors that like
// the wrong move: what only a search with its signs right finds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess, type Position } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { legalMoves } from '../../../../src/core/maia/encode.ts';
import { CPUCT, key, lc0Search, terminalValue, type Net } from '../../../../src/core/lc0/search.ts';

const VALUE = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 } as const;

const pos = (fen: string): Position => Chess.fromSetup(parseFen(fen).unwrap()).unwrap();

function material(p: Position): number {
  let sum = 0;
  for (const [sq, piece] of p.board) {
    void sq;
    sum += (piece.color === p.turn ? 1 : -1) * VALUE[piece.role];
  }
  return sum;
}

/** Material for the side to move as Q; `liked` moves (SAN) take most of the policy. */
function fakeNet(liked: readonly string[] = [], calls = { n: 0 }): Net {
  return async (history) => {
    calls.n++;
    const p = history[history.length - 1]!;
    const moves = legalMoves(p);
    const raw = moves.map((m) => (liked.includes(m.san) ? 20 : 1));
    const z = raw.reduce((a, b) => a + b, 0);
    const v = Math.tanh(material(p) / 4);
    return {
      policy: moves.map((m, i) => ({ ...m, prob: raw[i]! / z })).sort((a, b) => b.prob - a.prob),
      wdl: { win: Math.max(0, v), draw: 1 - Math.abs(v), loss: Math.max(0, -v) },
    };
  };
}

const line = (fen: string, sans = ''): Position[] => {
  const out = [pos(fen)];
  for (const san of sans.split(' ').filter(Boolean)) {
    const p = out[out.length - 1]!.clone();
    p.play(parseSan(p, san)!);
    out.push(p);
  }
  return out;
};

test('a poisoned pawn the policy likes is left alone; a free one it doesn’t is taken', async () => {
  // Qxd5 exd5 loses the queen; the policy puts 20 times the weight on it.
  const white = await lc0Search({ history: line('6k1/8/4p3/3p4/8/8/8/3Q2K1 w - - 0 1'), nodes: 300, net: fakeNet(['Qxd5']) });
  assert.notEqual(white.san, 'Qxd5');
  assert.ok(white.q > -0.5, `${white.q}`);
  // Black to move, the same: the values are kept from each side's view.
  const black = await lc0Search({ history: line('3q2k1/8/8/8/3P4/4P3/8/6K1 b - - 0 1'), nodes: 300, net: fakeNet(['Qxd4']) });
  assert.notEqual(black.san, 'Qxd4');
  // An undefended knight taken (and the rook out of the bishop's way), though the policy likes a
  // king move that leaves the rook to the bishop.
  const free = await lc0Search({ history: line('6k1/8/8/3n3b/8/8/8/3R2K1 w - - 0 1'), nodes: 200, net: fakeNet(['Kh1']) });
  assert.equal(free.san, 'Rxd5');
  assert.ok(free.q > 0.2, `${free.q}`);
  assert.equal(free.moves[0]!.san, 'Rxd5');
  assert.equal(free.pv[0], 'Rxd5');
});

test('the visits: the root’s count reached, one network run each, the most visited played', async () => {
  const calls = { n: 0 };
  const r = await lc0Search({ history: line('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'), nodes: 120, net: fakeNet([], calls) });
  assert.ok(r.nodes <= 120 && r.nodes > 60, `${r.nodes}`);
  assert.equal(r.evals, calls.n);
  assert.ok(r.evals <= r.nodes);
  const visits = r.moves.map((m) => m.visits);
  assert.deepEqual(visits, [...visits].sort((a, b) => b - a));
  assert.equal(r.moves[0]!.uci, r.uci);
  // The root's own run plus one visit a playout.
  assert.equal(visits.reduce((a, b) => a + b, 0), r.nodes - 1);
  assert.ok(CPUCT > 1);
});

test('stopping early: once the runner-up can’t catch up, and when asked', async () => {
  // A queen hangs: every visit goes to taking it, and the search ends long before 2000.
  const r = await lc0Search({ history: line('6k1/8/8/3q4/8/8/8/3Q2K1 w - - 0 1'), nodes: 2000, net: fakeNet(['Qxd5+']) });
  assert.equal(r.san, 'Qxd5+');
  assert.ok(r.nodes < 2000);
  const second = r.moves[1]!.visits;
  assert.ok(r.moves[0]!.visits - second > 2000 - r.nodes);
  let seen = 0;
  const stopped = await lc0Search({
    history: line('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'),
    nodes: 1000,
    net: fakeNet(),
    progress: (n) => (seen = n) < 30,
  });
  assert.equal(stopped.nodes, 30);
  assert.equal(seen, 30);
});

test('a mate in one at once, a single legal move after one run', async () => {
  const calls = { n: 0 };
  const mate = await lc0Search({ history: line('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1'), nodes: 500, net: fakeNet([], calls) });
  assert.equal(mate.san, 'Ra8#');
  assert.equal(mate.forced, 'mate');
  assert.equal(calls.n, 0);
  const only = await lc0Search({ history: line('7k/8/8/8/8/8/1q6/K7 w - - 0 1'), nodes: 500, net: fakeNet([], calls) });
  assert.equal(only.san, 'Kxb2');
  assert.equal(only.forced, 'only');
  assert.equal(calls.n, 1);
  await assert.rejects(lc0Search({ history: line('7k/8/8/8/8/8/1q6/K1q5 w - - 0 1'), nodes: 10, net: fakeNet() }), /over/);
});

test('the game’s end: mate, stalemate, dead positions, fifty moves, threefold, a twofold in the tree', () => {
  const at = (l: Position[], rootAt = 0) => terminalValue(l, l.map(key), rootAt);
  assert.equal(at(line('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Ra8#')), -1);
  assert.equal(at(line('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')), 0);
  assert.equal(at(line('7k/8/8/8/8/8/8/K6N w - - 0 1')), 0);
  assert.equal(at(line('7k/8/8/8/8/8/8/KR6 w - - 100 80')), 0);
  assert.equal(at(line('7k/8/8/8/8/8/8/KR6 w - - 99 80')), undefined);
  // Rb2 Kg8 Rb1 Kh8: the start again. From a root before it, a draw; from a root after the first
  // time, only a twofold of the game's: played on.
  const dance = line('7k/8/8/8/8/8/8/KR6 w - - 0 1', 'Rb2 Kg8 Rb1 Kh8');
  assert.equal(at(dance, 0), 0);
  assert.equal(at(dance, 1), undefined);
  // The third time is a draw wherever the root is.
  const twice = line('7k/8/8/8/8/8/8/KR6 w - - 0 1', 'Rb2 Kg8 Rb1 Kh8 Rb2 Kg8 Rb1 Kh8');
  assert.equal(at(twice, 8), 0);
  assert.equal(at(twice.slice(0, -1), 7), undefined);
});
