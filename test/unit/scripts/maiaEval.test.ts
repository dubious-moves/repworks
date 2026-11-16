// The parts of scripts/maia-eval.ts that need no model (PLAN.md §5.190): the dump's frames, the
// PGN's games, the sample's criteria and the scores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zstdCompressSync } from 'node:zlib';
import { Readable } from 'node:stream';
import { candidatesFrom, gamesOf, MIDDLEGAME, pairedBootstrap, pliesOf, replay, rng, scoreMoves, splitFrames, takeSample } from '../../../scripts/maia-eval-lib.ts';

/** A skippable frame, as Lichess's files start with. */
const skippable = Buffer.concat([Buffer.from([0x50, 0x2a, 0x4d, 0x18, 4, 0, 0, 0]), Buffer.from('abcd')]);

test('a dump\'s frames: the skippable one dropped, the others split at their ends, a cut-off one left', () => {
  const a = zstdCompressSync(Buffer.from('first frame '.repeat(2000)));
  const b = zstdCompressSync(Buffer.from('second frame '.repeat(5000)));
  const c = zstdCompressSync(Buffer.from('third'));
  const all = Buffer.concat([skippable, a, b, c]);
  const got = splitFrames(all);
  assert.deepEqual(got.frames.map((f) => f.length), [a.length, b.length, c.length]);
  assert.equal(got.rest.length, 0);
  // Cut in the middle of the last frame: two whole frames, the rest kept for the next chunk.
  const cut = splitFrames(all.subarray(0, all.length - 3));
  assert.equal(cut.frames.length, 2);
  assert.equal(cut.rest.length, c.length - 3);
  // Fed in pieces, as a stream gives them: nothing is lost or decoded twice.
  let rest: Buffer = Buffer.alloc(0);
  let n = 0;
  for (let i = 0; i < all.length; i += 700) {
    const r = splitFrames(Buffer.concat([rest, all.subarray(i, i + 700)]));
    n += r.frames.length;
    rest = r.rest;
  }
  assert.equal(n, 3);
});

const GAME = (id: string, white: number, black: number, event = 'Rated Rapid game') => `[Event "${event}"]
[Site "https://lichess.org/${id}"]
[White "a"]
[Black "b"]
[Result "1-0"]
[WhiteElo "${white}"]
[BlackElo "${black}"]
[TimeControl "600+0"]
[Termination "Normal"]

${MOVES}

`;
// 1. e4 … a game of 30 moves with clocks: Italian-ish shuffles that stay legal.
const SHUFFLE = '1. e4 { [%clk 0:10:00] } 1... e5 { [%clk 0:10:00] } 2. Nf3 { [%clk 0:09:59] } 2... Nc6 { [%clk 0:09:59] } 3. Bc4 { [%clk 0:09:58] } 3... Bc5 { [%clk 0:09:58] } 4. c3 { [%clk 0:09:57] } 4... Nf6 { [%clk 0:09:57] } 5. d3 { [%clk 0:09:56] } 5... d6 { [%clk 0:09:56] } 6. O-O { [%clk 0:09:55] } 6... O-O { [%clk 0:09:55] } 7. Re1 { [%clk 0:09:54] } 7... a6 { [%clk 0:09:54] } 8. Bb3 { [%clk 0:09:53] } 8... Ba7 { [%clk 0:09:53] } 9. Nbd2 { [%clk 0:09:52] } 9... h6 { [%clk 0:09:52] } 10. Nf1 { [%clk 0:09:51] } 10... Be6 { [%clk 0:09:51] } 11. Bxe6 { [%clk 0:09:50] } 11... fxe6 { [%clk 0:09:50] } 12. Ng3 { [%clk 0:09:49] } 12... Qd7 { [%clk 0:00:20] } 13. Nh4 { [%clk 0:09:48] } 13... Ne7 { [%clk 0:00:19] } 14. Qf3 { [%clk 0:09:47] } 14... Rf7 { [%clk 0:00:18] } 1-0';
const MOVES = SHUFFLE;

test('a movetext\'s plies: SANs with the clock after each; comments, numbers, annotations and the result dropped', () => {
  const plies = pliesOf('1. e4 { [%clk 0:10:00] } 1... e5?! { [%clk 0:09:58.5] } 2. Nf3 $1 { [%eval 0.2] [%clk 1:00:01] } 1/2-1/2');
  assert.deepEqual(plies, [{ san: 'e4', clock: 600 }, { san: 'e5', clock: 598.5 }, { san: 'Nf3', clock: 3601 }]);
});

test('games of a PGN: headers and movetext, two games, the last without a trailing blank line', async () => {
  const text = GAME('aaaaaaaa', 1500, 1480) + GAME('bbbbbbbb', 1900, 1950, 'Rated Blitz game').trimEnd();
  const games: string[] = [];
  for await (const g of gamesOf(Readable.from(text.split('\n')))) games.push(`${g.headers['Site']} ${g.headers['Event']} ${g.moves.split(' ').length > 20}`);
  assert.deepEqual(games, ['https://lichess.org/aaaaaaaa Rated Rapid game true', 'https://lichess.org/bbbbbbbb Rated Blitz game true']);
});

test('replay: a position qualifies by move number, pieces on the board and the mover\'s clock as it arises', () => {
  // The criteria's moves 11 to 35 and the mover's previous clock ≥ 30 s (pieces: 14 to 32 here, a game of few captures).
  const r = replay(pliesOf(SHUFFLE), { ...MIDDLEGAME, pieces: [14, 32] });
  assert.equal(replay(pliesOf(SHUFFLE)).candidates.filter((c) => c.ply < 24).length, 0, 'with the real piece count (28 or fewer) nothing of this game qualifies before the captures');
  const byPly = new Map(r.candidates.map((c) => [c.ply, c.white]));
  assert.ok(byPly.has(20), 'White, move 11: clock 9:51 before it');
  assert.ok(byPly.has(21), 'Black, move 11: clock 9:51');
  assert.ok(byPly.has(22), 'White, move 12');
  // Black's move 13 comes after the 12th reply left 20 s on its clock (the position arises with 0:20).
  assert.ok(!byPly.has(24 + 1), 'Black, move 13: 20 s left, under 30');
  assert.ok(!byPly.has(18), 'White, move 10: before move 11');
  assert.ok(r.ucis.every((u) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(u)));
  assert.ok(r.ucis.includes('e1g1'), 'castling in standard UCI, not king takes rook');
  assert.deepEqual(MIDDLEGAME.moves, [11, 35]);
});

test('a game that breaks off at an illegal move is cut there', () => {
  const r = replay(pliesOf('1. e4 e5 2. Qxh7 Nc6 *'));
  assert.equal(r.ucis.length, 2);
});

test('the sample: one position per side whose rating is in a band, the sample seeded and balanced', async () => {
  const text = [GAME('aaaaaaaa', 1500, 1480), GAME('bbbbbbbb', 1100, 1900), GAME('cccccccc', 1500, 1500, 'Rated Blitz game'), GAME('dddddddd', 1650, 1650)].join('\n');
  const lines = () => Readable.from(text.split('\n'));
  const o = { speeds: ['rapid'], bands: [1100, 1500, 1900, 2300], width: 100, criteria: { ...MIDDLEGAME, pieces: [14, 32] as [number, number] }, seed: 1 };
  const { all, read, used } = await candidatesFrom(gamesOf(lines()), o);
  assert.equal(read, 4);
  assert.equal(used, 2, 'the blitz game and the 1650s are left out');
  // aaaaaaaa: both sides in the 1500 band; bbbbbbbb: its two sides in the 1100 and the 1900 band.
  assert.deepEqual(all.map((p) => [p.game, p.band]).sort(), [['aaaaaaaa', 1500], ['aaaaaaaa', 1500], ['bbbbbbbb', 1100], ['bbbbbbbb', 1900]]);
  for (const p of all) {
    assert.ok(p.before.length <= 7);
    assert.equal(p.before.length, Math.min(7, p.ply));
    assert.ok(p.ply >= 20);
  }
  const again = await candidatesFrom(gamesOf(lines()), o);
  assert.deepEqual(again.all, all, 'the same seed, the same positions');
  assert.equal(takeSample(all, [1500], 1, 1).length, 1);
  assert.equal(takeSample(all, [1100, 1500, 1900, 2300], 5, 1).length, 4);
});

test('the scores: the likelihood of the move played over every legal move, its rank, and the distribution\'s sharpness', () => {
  const moves = [{ uci: 'e2e4', logit: 2 }, { uci: 'd2d4', logit: 1 }, { uci: 'c2c4', logit: 0 }, { uci: 'a2a3', logit: -3 }];
  const z = Math.exp(2) + Math.exp(1) + Math.exp(0) + Math.exp(-3);
  const top = scoreMoves(moves, 'e2e4')!;
  assert.ok(Math.abs(top.p - Math.exp(2) / z) < 1e-12);
  assert.ok(Math.abs(top.nll + Math.log(Math.exp(2) / z)) < 1e-12);
  assert.ok(top.top1 && top.top3);
  assert.ok(Math.abs(top.topProb - top.p) < 1e-12);
  const third = scoreMoves(moves, 'c2c4')!;
  assert.deepEqual([third.top1, third.top3], [false, true]);
  const last = scoreMoves(moves, 'a2a3')!;
  assert.deepEqual([last.top1, last.top3], [false, false]);
  assert.equal(scoreMoves(moves, 'h2h4'), null, 'a move that isn\'t among them');
  // A uniform distribution has the entropy ln n.
  assert.ok(Math.abs(scoreMoves(moves.map((m) => ({ ...m, logit: 0 })), 'e2e4')!.entropy - Math.log(4)) < 1e-12);
});

test('the paired bootstrap: the mean difference, an interval around it that shrinks with the sample and holds when games are shared', () => {
  const rand = rng(5);
  const n = 400;
  const x = Array.from({ length: n }, () => 1 + 0.2 * rand());
  const y = x.map((v) => v + 0.05 + 0.01 * (rand() - 0.5));
  const idx = x.map((_, i) => i);
  const games = idx.map((i) => i >> 1);
  const d = pairedBootstrap(x, y, idx, games, 500, 3);
  assert.ok(Math.abs(d.mean + 0.05) < 0.002);
  assert.ok(d.lo < d.mean && d.mean < d.hi && d.hi - d.lo < 0.01);
  const alone = pairedBootstrap(y, undefined, idx, games, 500, 3);
  assert.ok(alone.lo < alone.mean && alone.mean < alone.hi);
  // A bootstrap that resamples games, not positions: the same positions in fewer games give a wider interval.
  const clustered = pairedBootstrap(x, y, idx, idx.map((i) => i >> 6), 500, 3);
  assert.ok(clustered.hi - clustered.lo > 0);
  assert.equal(pairedBootstrap(x, y, [], games, 10, 1).lo, NaN);
});
