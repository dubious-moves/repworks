// The audit's difficulty measure (PLAN.md §5.219): its arithmetic on made-up numbers, that the
// engine it stands on gives the same answer twice, and its calibration: the ten lines the owner's
// limits were set on (hard at 5, mid at 3), each labelled move landing in its class with the
// measure's own engine (the vendored Stockfish 18 lite) and node count. The limits belong to that
// engine's scores: Stockfish 19 puts 6.Nb5, 9.c3, 8.Qa4 and 11.Nd6+ at about 6 and 6.Na4 at 2.7
// (PLAN.md §5.219), so a change of ENGINE fails this test until the limits are set again.
//
// The calibration reads the engine's answers from test/fixtures/audit/sf (the engine's cache, made
// by this test with the same engine and nodes: 51 searches of 1,500,000 nodes, about 40 seconds on
// four cores); Maia runs live. A search the folder lacks is run and written there, so after a
// change of the node count, the natural moves or the engine the test is slow once and the new files
// are committed. AUDIT_LIVE=1 ignores the folder and searches everything again.
//
// Controls run on this file (2026-11-28), each undone after it failed the test named:
// - a natural move better than ours counted as a gain (no floor at 0) → "the measure's arithmetic";
// - classOf's limits swapped → the same test, and the calibration;
// - the engine's hash not cleared between searches (no ucinewgame) → "the same answer twice"
//   (the second answer's line differed);
// - NODES set to 4,000, searched live → "the calibration" (9.Bd3 fell to easy, 6.Nb5 rose to hard).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { classOf, createMeasure, ENGINE, hardestAfter, HARD, MID, naturalMoves, NODES, rated, verdict, type Class, type MoveRow } from '../../../scripts/audit/difficulty.ts';
import { createEngines, pawns, winPct } from '../../../scripts/audit/engine.ts';
import { sansOf } from '../../../scripts/audit/study.ts';

test("the measure's arithmetic: natural moves, what each gives up, the classes", () => {
  const policy: [string, number][] = [['Nxa8', 0.5], ['Qd2', 0.2], ['Bd3', 0.15], ['a3', 0.1], ['h3', 0.03], ['g3', 0.02]];
  // Up to 90% of the mass: the first three reach 0.85, the fourth 0.95.
  assert.deepEqual(naturalMoves(policy, 'Bd3').map(([san]) => san), ['Nxa8', 'Qd2', 'Bd3', 'a3']);
  // Our move is scored even when nobody would play it.
  assert.deepEqual(naturalMoves(policy, 'Kf1'), [['Nxa8', 0.5], ['Qd2', 0.2], ['Bd3', 0.15], ['a3', 0.1], ['Kf1', 0]]);
  assert.equal(naturalMoves([['a', 0.2], ['b', 0.15], ['c', 0.15], ['d', 0.1], ['e', 0.1], ['f', 0.1], ['g', 0.1], ['h', 0.1]], 'a').length, 6, 'six at most');

  const win: Record<string, number> = { Nxa8: 50, Qd2: 30, Bd3: 70, a3: 75 };
  const r = rated(naturalMoves(policy, 'Bd3'), 'Bd3', (san) => win[san]!);
  // 0.5 x 20 + 0.2 x 40 + 0.1 x 0 (a3 is better than ours: nothing lost by it).
  assert.equal(r.expLoss, 18);
  assert.equal(r.pFind, 0.15);
  assert.equal(r.ours, 70);
  assert.equal(r.behind, 5, 'a natural move is 5 better than ours');
  assert.deepEqual(r.natural, [{ san: 'Nxa8', p: 0.5, loss: 20 }, { san: 'Qd2', p: 0.2, loss: 40 }, { san: 'a3', p: 0.1, loss: 0 }]);
  assert.equal(r.cls, 'hard');
  assert.deepEqual([0, 2.99, MID, 4.99, HARD, 21].map(classOf), ['easy', 'easy', 'mid', 'mid', 'hard', 'hard']);
});

test('per reply the hardest of our next three moves, and what the guide makes of it', () => {
  const row = (line: string, expLoss: number): MoveRow => ({ path: sansOf(line), line, pFind: 0.5, expLoss, cls: classOf(expLoss), ours: 50, behind: 0, natural: [] });
  const rows = [
    row('1. d4 d5 2. c4', 0.5),
    row('1. d4 d5 2. c4 e6 3. Nc3', 1),
    row('1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5', 2),
    row('1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3', 4),
    row('1. d4 d5 2. c4 e6 3. Nc3 Nf6 4. Bg5 Be7 5. e3 O-O 6. Nf3', 9),
    row('1. d4 d5 2. c4 e6 3. Nc3 c5 4. cxd5', 6),
  ];
  const got = hardestAfter(rows, 2, 'white').map((r) => [r.path.join(' '), r.hardest.path.at(-1), r.hardest.expLoss]);
  assert.deepEqual(got, [
    // After 2...e6 our next three moves are 3.Nc3, then 4.Bg5 or 4.cxd5, then 5.e3: the 6 of 4.cxd5 is the hardest; 6.Nf3 is the fourth.
    ['d4 d5 c4 e6', 'cxd5', 6],
    ['d4 d5 c4 e6 Nc3 Nf6', 'Nf3', 9],
    ['d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7', 'Nf3', 9],
    ['d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O', 'Nf3', 9],
    ['d4 d5 c4 e6 Nc3 c5', 'cxd5', 6],
  ]);
  assert.equal(verdict(1 / 1500, 0.12, 'easy'), 'drill: common');
  assert.equal(verdict(1 / 1500, 0.09, 'easy'), 'clickable', 'reached often, but under 10% at its position');
  assert.equal(verdict(1 / 15000, 0.3, 'hard'), 'drill: hard to find');
  assert.equal(verdict(1 / 25000, 0.3, 'hard'), 'clickable');
  assert.equal(verdict(1 / 4000, 0.05, 'mid'), 'drill: mid, reached often enough');
  assert.equal(verdict(1 / 6000, 0.3, 'mid'), 'clickable');
});

test('the engine gives the same answer twice: one thread, fixed nodes, the hash cleared', async () => {
  const fen = 'r2qkb1r/1pp1pppp/p1n2n2/3p1b2/3P1B2/2N1PN2/PPP2PPP/R2QKB1R w KQkq - 2 6';
  const E = createEngines({ size: 1, engine: 'lite18' });
  try {
    assert.equal(await E.name(), 'Stockfish 18 Lite WASM');
    // Another search in between leaves its traces in the hash: cleared, the answer is the same again.
    const first = await E.search({ fen, nodes: 30_000, lines: 3 });
    await E.search({ fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', nodes: 30_000 });
    const again = await E.search({ fen, nodes: 30_000, lines: 3 });
    assert.deepEqual(again, first);
    assert.equal(first.length, 3);
    assert.equal(new Set(first.map((l) => l.pv[0])).size, 3, 'three lines, three different moves');
    const only = await E.search({ fen, nodes: 30_000, moves: ['f3e5'] });
    assert.equal(only[0]!.pv[0], 'f3e5');
    assert.match(pawns(only[0]!.score), /^[+-]?\d+\.\d\d$/);
    assert.ok(Math.abs(winPct(only[0]!.score, 'white') + winPct(only[0]!.score, 'black') - 100) < 1e-9);
    assert.deepEqual(E.counts(), { cached: 0, searched: 4 });
  } finally {
    E.quit();
  }
  // The screens' engine: Stockfish 19 from the npm package the repo pins, repeatable the same way.
  const S = createEngines({ size: 1, engine: 'sf19' });
  try {
    assert.equal(await S.name(), 'Stockfish 19 WASM');
    const first = await S.search({ fen, nodes: 20_000 });
    assert.deepEqual(await S.search({ fen, nodes: 20_000 }), first);
  } finally {
    S.quit();
  }
});

/** The lines the limits were set on (the old session's r17/cases.sh), and each labelled move's measure on 2026-11-28. */
const CASES: [label: string, line: string, moves: Record<string, [Class, number]>][] = [
  ['the in-between capture', '1.Nc3 d5 2.d4 Nf6 3.Bf4 a6 4.e3 Bf5 5.Nf3 e6 6.Ne5 Nbd7 7.g4 Nxe5 8.gxf5', { '8.gxf5': ['easy', 2.1] }],
  ['Bd3, not Nxa8', '1.Nc3 d5 2.d4 Nf6 3.Bf4 Bf5 4.e3 e6 5.Nf3 c5 6.Nb5 Qa5+ 7.b4 cxb4 8.Nc7+ Kd8 9.Bd3', { '6.Nb5': ['mid', 4.1], '9.Bd3': ['hard', 20.1] }],
  ['only moves: c3, then b4', '1.Nc3 d5 2.d4 Nf6 3.Bf4 a6 4.e3 c5 5.dxc5 Nc6 6.a3 e5 7.Bg5 d4 8.Na4 Qa5+ 9.c3 dxc3 10.b4', { '9.c3': ['mid', 3.8], '10.b4': ['hard', 14.8] }],
  ['Qa4, b3, Nd6+', '1.Nc3 d5 2.d4 Nf6 3.Bf4 Bf5 4.e3 e6 5.Nf3 c5 6.Nb5 Na6 7.c3 c4 8.Qa4 Nd7 9.b3 cxb3 10.axb3 Be7 11.Nd6+', { '8.Qa4': ['mid', 3.1], '9.b3': ['hard', 7.7], '11.Nd6+': ['mid', 3.9] }],
  ['Na4', '1.Nc3 d5 2.d4 Nf6 3.Bf4 a6 4.e3 c5 5.dxc5 e6 6.Na4', { '6.Na4': ['mid', 3.8] }],
  ['a tactic everyone sees', '1.Nc3 d5 2.d4 Nf6 3.Bf4 a6 4.e3 c5 5.dxc5 Nc6 6.a3 e5 7.Bg5 Bxc5 8.Bxf6 gxf6 9.Qxd5', { '9.Qxd5': ['easy', 0.2] }],
  ['the system move g4', '1.Nc3 d5 2.d4 Nf6 3.Bf4 a6 4.e3 Nc6 5.Bd3 Bg4 6.f3 Bh5 7.h4 Bg6 8.g4', { '8.g4': ['easy', 0.8] }],
  ['Nf3 and Qd2', '1.Nc3 d5 2.d4 Nf6 3.Bf4 c6 4.e3 g6 5.h4 Bg7 6.Bd3 h5 7.Nf3 Bg4 8.Qd2', { '8.Qd2': ['easy', 0.7] }],
  ['a recapture', '1.Nc3 d5 2.d4 Nf6 3.Bf4 a6 4.e3 Bf5 5.Nf3 Nc6 6.Ne5 Nxe5 7.dxe5', { '7.dxe5': ['easy', 0.9] }],
  ['punishing ...h6', '1.Nc3 d5 2.d4 Nf6 3.Bf4 a6 4.e3 Nc6 5.Bd3 Bg4 6.f3 Bh5 7.h4 h6 8.g4 Bg6 9.Bxg6 fxg6 10.Qd3', { '8.g4': ['easy', 1.1], '9.Bxg6': ['easy', 0.8], '10.Qd3': ['easy', 0] }],
];

test('the calibration: the lines the limits were set on land in their classes', { timeout: 600_000 }, async () => {
  const live = process.env['AUDIT_LIVE'] === '1';
  const E = createEngines({ engine: ENGINE, ...(live ? {} : { cacheDir: join(import.meta.dirname, '..', '..', 'fixtures', 'audit', 'sf') }) });
  const M = createMeasure(E);
  try {
    const got: string[] = [];
    const want: string[] = [];
    for (const [label, line, moves] of CASES) {
      const pos = Chess.default();
      const before: string[] = [];
      const sans = sansOf(line);
      for (let i = 0; i < sans.length; i++) {
        const name = `${i / 2 + 1}.${sans[i]}`;
        const expected = i % 2 === 0 ? moves[name] : undefined;
        if (expected) {
          const r = await M.rate(pos.clone(), [...before], sans[i]!);
          // The class, and the number to within 0.3 (it is the same on every run; the margin is for a new onnxruntime's last digits in Maia's chances).
          got.push(`${label}: ${name} ${r.cls} ${Math.abs(r.expLoss - expected[1]) <= 0.3 ? expected[1] : r.expLoss.toFixed(2)}`);
          want.push(`${label}: ${name} ${expected[0]} ${expected[1]}`);
        }
        before.push(makeFen(pos.toSetup()));
        pos.play(parseSan(pos, sans[i]!)!);
      }
    }
    assert.deepEqual(got, want);
    assert.deepEqual([ENGINE, NODES], ['lite18', 1_500_000]);
    if (!live && !process.env['AUDIT_WRITE']) assert.equal(E.counts().searched, 0, 'every search came from test/fixtures/audit/sf: commit the files a change of the measure wrote there');
  } finally {
    E.quit();
  }
});
