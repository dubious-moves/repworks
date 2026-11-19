// The parts of scripts/opponent-strength.ts that need no model or engine (PLAN.md §5.202): a game's
// end and adjudication, the Elo fit and its mapping onto the bots' ratings, the levels' sampling,
// the same-position comparison, and the whole games (PLAN.md §5.204).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess, type Position } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { positionKeyOf } from '../../../src/core/chess/positionKey.ts';
import { PRESETS } from '../../../src/core/games/checklist.ts';
import { maiaPick } from '../../../src/core/games/practice.ts';
import { rng } from '../../../scripts/maia-eval-lib.ts';
import {
  adjudicate,
  ADJUDICATION,
  AHEAD,
  boardEnd,
  botMove,
  courseOf,
  DECIDED,
  levelSpec,
  parseLevel,
  phaseOf,
  type ScoredGame,
  scoredMoves,
  wholeGameReport,
  crossing,
  eloDiff,
  expectedScore,
  fitElo,
  fitLine,
  type GameRecord,
  gameRng,
  LEVELS,
  levelLoss,
  lossOf,
  matchReport,
  type MistakePosition,
  mistakeReport,
  movesToScore,
  moverWin,
  resampleTally,
  tallies,
  tempered,
  whiteCp,
  type BandStat,
} from '../../../scripts/opponent-strength-lib.ts';

const play = (sans: string, fen?: string): { pos: Position; seen: Map<string, number> } => {
  let pos = fen ? Chess.fromSetup(parseFen(fen).unwrap()).unwrap() : Chess.default();
  const seen = new Map([[positionKeyOf(pos), 1]]);
  for (const san of sans.split(' ').filter(Boolean)) {
    pos = pos.clone();
    pos.play(parseSan(pos, san)!);
    seen.set(positionKeyOf(pos), (seen.get(positionKeyOf(pos)) ?? 0) + 1);
  }
  return { pos, seen };
};

test('the levels are the checklist presets, as practice plays them', () => {
  assert.deepEqual(
    LEVELS.map((l) => [l.id, l.elo, l.precision]),
    Object.entries(PRESETS).map(([id, p]) => [id, p.maiaElo, p.precision]),
  );
});

test("a game's end on the board: mate, stalemate, bare kings, three times the same position, fifty moves", () => {
  const mate = play('f3 e5 g4 Qh4#');
  assert.deepEqual(boardEnd(mate.pos, mate.seen), { result: 0, reason: 'checkmate' });
  const scholar = play('e4 e5 Bc4 Nc6 Qh5 Nf6 Qxf7#');
  assert.deepEqual(boardEnd(scholar.pos, scholar.seen), { result: 1, reason: 'checkmate' });
  const stale = play('', '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.equal(boardEnd(stale.pos, stale.seen)?.reason, 'stalemate');
  const bare = play('Kxb3', '8/8/8/8/8/1P6/2k5/K7 b - - 0 1');
  assert.equal(boardEnd(bare.pos, bare.seen)?.reason, 'insufficient');
  const twice = play('Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1');
  assert.equal(boardEnd(twice.pos, twice.seen), undefined, 'the start position has been seen twice and once more after Ng8');
  const thrice = play('Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1 Ng8');
  assert.deepEqual(boardEnd(thrice.pos, thrice.seen), { result: 0.5, reason: 'threefold' });
  const fifty = play('', '8/8/4k3/8/8/4K3/4R3/8 w - - 100 80');
  assert.equal(boardEnd(fifty.pos, fifty.seen)?.reason, 'fifty');
  assert.equal(boardEnd(Chess.default(), new Map()), undefined);
});

test("adjudication: a side 800 ahead at two checks in a row wins; a quiet late game is a draw; the limit's score decides", () => {
  assert.equal(adjudicate([900], 40), undefined, 'one check is not enough');
  assert.deepEqual(adjudicate([100, 850, 900], 40), { result: 1, reason: 'adjudicated' });
  assert.deepEqual(adjudicate([-850, -9990], 40), { result: 0, reason: 'adjudicated' });
  assert.equal(adjudicate([900, 700], 40), undefined);
  assert.equal(adjudicate([0, 0, 0, 0, 0], 120), undefined, 'too early for a draw');
  assert.deepEqual(adjudicate([300, 10, -20, 0, 40, -50], ADJUDICATION.drawAfterPly), { result: 0.5, reason: 'adjudicated-draw' });
  assert.equal(adjudicate([10, -20, 0, 60, -50], 250), undefined, 'one check outside the window');
  assert.deepEqual(adjudicate([400], ADJUDICATION.maxPly), { result: 1, reason: 'max-plies' });
  assert.deepEqual(adjudicate([-200], ADJUDICATION.maxPly), { result: 0.5, reason: 'max-plies' });
  assert.equal(whiteCp({ mate: 3 }), 9997);
  assert.equal(whiteCp({ mate: -1 }), -9999);
  assert.equal(whiteCp({ cp: -42 }), -42);
});

test("a game's random source is the same for the same game and seed", () => {
  const a = gameRng('easy|maia-1100|3', 1);
  const b = gameRng('easy|maia-1100|3', 1);
  const c = gameRng('easy|maia-1100|4', 1);
  const xs = [a(), a(), a()];
  assert.deepEqual([b(), b(), b()], xs);
  assert.notDeepEqual([c(), c(), c()], xs);
});

const game = (white: string, black: string, result: 1 | 0.5 | 0): GameRecord => ({ white, black, result, opening: 0, reason: 'checkmate', plies: 1, moves: [] });
/** `n` games between a and b in which a scores `score` (in wins and losses, a draw for an odd half). */
function games(a: string, b: string, n: number, score: number): GameRecord[] {
  const points = Math.round(score * n * 2) / 2;
  const wins = Math.floor(points);
  return Array.from({ length: n }, (_, i) => {
    const r = i < wins ? 1 : i === wins && points > wins ? 0.5 : 0;
    // Colours alternate; the score is a's.
    return i % 2 ? game(b, a, (1 - r) as 1 | 0.5 | 0) : game(a, b, r as 1 | 0.5 | 0);
  });
}

test('tallies count each pair from its first-named side, whoever had White', () => {
  const ts = tallies([game('b', 'a', 1), game('a', 'b', 0.5), game('a', 'b', 1), game('c', 'a', 0)]);
  assert.deepEqual(ts, [
    { a: 'a', b: 'b', w: 1, d: 1, l: 1 },
    { a: 'a', b: 'c', w: 1, d: 0, l: 0 },
  ]);
});

test('the Elo fit: a 76% score is 200 points, and three players line up', () => {
  assert.ok(Math.abs(eloDiff(expectedScore(200)) - 200) < 1e-6);
  const two = fitElo(['a', 'b'], tallies(games('a', 'b', 1000, expectedScore(200))));
  assert.ok(Math.abs(two.get('a')! - two.get('b')! - 200) < 3, `${two.get('a')! - two.get('b')!}`);
  assert.ok(Math.abs(two.get('a')! + two.get('b')!) < 1e-6, 'centred on the mean');
  const truth = { a: 0, b: 150, c: 400 };
  const all = [...games('b', 'a', 2000, expectedScore(150)), ...games('c', 'b', 2000, expectedScore(250)), ...games('c', 'a', 2000, expectedScore(400))];
  const r = fitElo(['a', 'b', 'c'], tallies(all), ['a']);
  for (const [p, v] of Object.entries(truth)) assert.ok(Math.abs(r.get(p)! - v) < 5, `${p} ${r.get(p)}`);
  // A clean sweep stays finite.
  const sweep = fitElo(['a', 'b'], tallies(games('a', 'b', 20, 1)));
  assert.ok(Number.isFinite(sweep.get('a')!) && sweep.get('a')! > 300);
});

test('a resampled tally keeps its games, drawn from its results', () => {
  const t = { a: 'a', b: 'b', w: 30, d: 0, l: 0 };
  assert.deepEqual(resampleTally(t, rng(1)), t);
  const mixed = resampleTally({ a: 'a', b: 'b', w: 50, d: 20, l: 30 }, rng(2));
  assert.equal(mixed.w + mixed.d + mixed.l, 100);
});

test('the line through the bots maps a level onto their Lichess ratings', () => {
  assert.deepEqual(fitLine([0, 1, 2], [1, 3, 5]), { a: 1, b: 2 });
  // Locally the bots are 0, 200 and 400 and the level 300; on Lichess the bots are 1400, 1500, 1600.
  const all = [
    ...games('maia-1500', 'maia-1100', 4000, expectedScore(200)),
    ...games('maia-1900', 'maia-1500', 4000, expectedScore(200)),
    ...games('maia-1900', 'maia-1100', 4000, expectedScore(400)),
    ...games('easy', 'maia-1100', 4000, expectedScore(300)),
    ...games('easy', 'maia-1500', 4000, expectedScore(100)),
    ...games('maia-1900', 'easy', 4000, expectedScore(100)),
  ];
  const ratings = { maia1: { rapid: { rating: 1400, rd: 0, games: 1 } }, maia5: { rapid: { rating: 1500, rd: 0, games: 1 } }, maia9: { rapid: { rating: 1600, rd: 0, games: 1 } } };
  const r = matchReport(all, ratings, { boot: 20, seed: 1 });
  assert.deepEqual(Object.keys(r.speeds), ['rapid'], 'only the speeds every bot has');
  const m = r.speeds.rapid!;
  assert.ok(Math.abs(m.slope.value - 0.5) < 0.02, `slope ${m.slope.value}`);
  const easy = m.levels['easy']!;
  assert.ok(Math.abs(easy.line.value - 1550) < 5, `line ${easy.line.value}`);
  assert.ok(easy.line.lo <= easy.line.value && easy.line.value <= easy.line.hi);
  // The nearest bot (maia-1500 at 200, or maia-1900 at 400: both 100 away; the first found) plus the local difference.
  assert.ok(Math.abs(easy.nearest.value - (easy.nearestAnchor === 'maia-1500' ? 1600 : 1500)) < 5, `${easy.nearestAnchor} ${easy.nearest.value}`);
  assert.equal(r.games, all.length);
});

test("tempered is maiaPick's distribution: the likeliest move at precision 1, the policy itself at 0.5", () => {
  const policy = [
    { uci: 'e2e4', prob: 0.6 },
    { uci: 'd2d4', prob: 0.3 },
    { uci: 'c2c4', prob: 0.1 },
  ];
  assert.deepEqual(tempered(policy, 1), [{ uci: 'e2e4', prob: 1 }]);
  tempered(policy, 0.5).forEach((m, i) => assert.ok(Math.abs(m.prob - policy[i]!.prob) < 1e-12));
  const q = tempered(policy, 0.75);
  // Temperature 0.5 squares the probabilities: 0.36, 0.09, 0.01 over 0.46.
  assert.ok(Math.abs(q[0]!.prob - 0.36 / 0.46) < 1e-12);
  // maiaPick with its dice at r picks the move whose share of the tempered policy holds r.
  for (const r of [0.01, 0.5, 0.78, 0.79, 0.97, 0.99]) {
    let cum = 0;
    const want = q.find((m) => (cum += m.prob) >= r)!.uci;
    assert.equal(maiaPick(policy, 0.75, () => r)!.uci, want, `r ${r}`);
  }
});

const position = (o: Partial<MistakePosition> & Pick<MistakePosition, 'after' | 'best' | 'played'>): MistakePosition => ({ game: 'g', band: 1500, elo: 1500, fen: '', policies: {}, ...o });

test("a move's loss is the best move's win% less its own, the best taken over what was scored too", () => {
  const p = position({ best: 60, played: 'a', after: { a: 50, b: 65, c: 70 } });
  assert.equal(lossOf(p, 'a'), 20, 'b and c score better than the root search said');
  assert.equal(lossOf(p, 'c'), 0);
  assert.equal(lossOf(p, 'zz'), undefined);
  assert.equal(moverWin({ cp: 0 }, true), 50);
  assert.ok(Math.abs(moverWin({ cp: 300 }, false) + moverWin({ cp: 300 }, true) - 100) < 1e-9);
});

test("a level's expected loss: its tempered policy over the moves scored, renormalized", () => {
  const p = position({
    best: 70,
    played: 'a',
    after: { a: 70, b: 50 },
    policies: {
      '1500': [
        { uci: 'a', prob: 0.5 },
        { uci: 'b', prob: 0.4 },
        { uci: 'c', prob: 0.1 },
      ],
    },
  });
  const m = levelLoss(p, '1500', 0.5)!;
  assert.ok(Math.abs(m.covered - 0.9) < 1e-12);
  assert.ok(Math.abs(m.loss - (0.4 * 20) / 0.9) < 1e-12);
  assert.ok(Math.abs(m.blunder - 0.4 / 0.9) < 1e-12, 'b gives up 20 points: a blunder');
  assert.equal(levelLoss(p, '1900', 0.5), undefined);
  assert.deepEqual(movesToScore('x', [p.policies['1500']!], 0.2), ['x', 'a', 'b']);
});

test('the crossing: where the level gives up as much as people of that rating do', () => {
  // People give up 10 points at 1100, 0.4 fewer each 100 points; the level 6 everywhere: 2100.
  const stats: BandStat[] = [1100, 1500, 1900, 2300].map((band) => ({
    band,
    positions: 100,
    human: { loss: 10 - 0.004 * (band - 1100), blunder: 0 },
    model: { L: { loss: 6, blunder: 0, covered: 1 } },
  }));
  const x = crossing(stats, 'L', 'loss')!;
  assert.ok(Math.abs(x.rating - 2100) < 1e-6);
  assert.equal(x.outside, false);
  // A level better than everyone measured: beyond the bands.
  const strong = stats.map((s) => ({ ...s, model: { L: { loss: 4, blunder: 0, covered: 1 } } }));
  assert.equal(crossing(strong, 'L', 'loss')!.outside, true);
});

test('the same-position report: people by band against a level, with intervals from resampled games', () => {
  const rand = rng(3);
  const ps: MistakePosition[] = [];
  for (const band of [1100, 1500, 1900, 2300])
    for (let i = 0; i < 200; i++) {
      // People blunder less as the band rises; the level gives up 5 points with probability 0.5 everywhere.
      const humanLoss = rand() < 0.5 - (band - 1100) / 3000 ? 20 : 0;
      ps.push(
        position({
          game: `${band}-${i}`,
          band,
          best: 60,
          played: humanLoss ? 'bad' : 'good',
          after: { good: 60, bad: 40, meh: 50 },
          policies: {
            '1750': [
              { uci: 'good', prob: 0.5 },
              { uci: 'meh', prob: 0.5 },
            ],
          },
        }),
      );
    }
  const r = mistakeReport(ps, [{ id: 'L', policyKey: '1750', precision: 0.5 }], { boot: 50, seed: 1 });
  assert.equal(r.positions, 800);
  assert.equal(r.stats.length, 4);
  for (const s of r.stats) assert.ok(Math.abs(s.model['L']!.loss - 5) < 1e-9);
  const x = r.ratings['L']!.loss!;
  // People's mean loss is 20 × the blunder rate: 5 where it is 0.25, at 1850.
  assert.ok(Math.abs(x.value - 1850) < 250, `${x.value}`);
  assert.ok(x.lo <= x.value && x.value <= x.hi);
  // The level never blunders, people at every band do: their rate's line reaches 0 beyond the bands.
  assert.equal(r.ratings['L']!.blunder!.outside, true);
});

test('a level is played from the positions of a real game: fens round-trip', () => {
  const { pos } = play('e4 c5 Nf3');
  assert.equal(makeFen(pos.toSetup()), 'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2');
});

test("botMove: the likeliest move for argmax, a draw above the cutoff for dala's sampling", () => {
  const policy = [
    { uci: 'e2e4', prob: 0.5 },
    { uci: 'd2d4', prob: 0.3 },
    { uci: 'c2c4', prob: 0.16 },
    { uci: 'g2g4', prob: 0.04 },
  ];
  assert.equal(botMove(policy, { kind: 'argmax' }, () => 0.99)!.uci, 'e2e4');
  const play = { kind: 'sample', temperature: 1, minPolicy: 5 } as const;
  // g2g4 (4%) is under the cutoff: the draw is over 0.96.
  assert.equal(botMove(policy, play, () => 0.5 / 0.96 - 1e-9)!.uci, 'e2e4');
  assert.equal(botMove(policy, play, () => 0.5 / 0.96 + 1e-9)!.uci, 'd2d4');
  assert.equal(botMove(policy, play, () => 0.999)!.uci, 'c2c4');
  // The likeliest move is kept whatever the cutoff.
  assert.equal(botMove([{ uci: 'a2a3', prob: 0.02 }], play, () => 0.7)!.uci, 'a2a3');
  assert.equal(botMove([], play, () => 0.5), null);
});

test('a level is a preset by its id, or a Maia rating at a precision', () => {
  assert.deepEqual(parseLevel('medium'), LEVELS.find((l) => l.id === 'medium'));
  assert.deepEqual(parseLevel('r2300=2300@0.85'), { id: 'r2300', label: 'r2300', elo: 2300, precision: 0.85 });
  assert.throws(() => parseLevel('nonsense'));
  // The check (§5.205): Medium and Hard carry it, Easy doesn't; `+guard` for a level of its own.
  assert.deepEqual(LEVELS.map((l) => !!l.guard), [false, true, true]);
  const g = parseLevel('m=2000@0.75+guard');
  assert.deepEqual(g, { id: 'm', label: 'm', elo: 2000, precision: 0.75, guard: true });
  assert.equal(levelSpec(g), 'm=2000@0.75+guard');
  assert.deepEqual(parseLevel(levelSpec(LEVELS[2]!)), { ...LEVELS[2]!, label: 'hard' });
});

test("the endgame is Lichess's: six or fewer pieces other than pawns and kings", () => {
  assert.equal(phaseOf(Chess.default()), 'middlegame');
  assert.equal(phaseOf(play('', 'r3k2r/pppq1ppp/2n5/8/8/2N5/PPPQ1PPP/R3K2R w KQkq - 0 1').pos), 'middlegame');
  assert.equal(phaseOf(play('', 'r3k2r/ppp2ppp/2n5/8/8/2N5/PPP2PPP/R3K2R w KQkq - 0 1').pos), 'endgame');
});

const scored = (player: string, win: number[], firstWhite = true): ScoredGame => ({ player, game: `${player}|${win.join(',')}`, win, phase: win.map(() => 'middlegame'), firstWhite });

test("a scored game's moves: each side's loss, until a side reaches the decided win%", () => {
  // White 50 → 48 (White gave 2), Black 48 → 60 (Black gave 12), White 60 → 95, then decided.
  const g = scored('x', [50, 48, 60, 95, 96]);
  assert.deepEqual(scoredMoves(g).map((m) => m.loss), [2, 12, 0]);
  // Black to move first: the first move is Black's.
  assert.deepEqual(scoredMoves(scored('x', [50, 55, 40], false)).map((m) => m.loss), [5, 15]);
  // A position without a score skips the moves next to it.
  assert.deepEqual(scoredMoves({ ...g, win: [50, null, 60, 61] }).map((m) => m.loss), [0]);
  // A game between two players: each side's moves for its own player.
  assert.deepEqual(scoredMoves({ ...g, side: 'white' }).map((m) => m.loss), [2, 0]);
  assert.deepEqual(scoredMoves({ ...g, side: 'black' }).map((m) => m.loss), [12]);
});

test("a game's course: when it was decided, and whether a lead was kept", () => {
  assert.deepEqual(courseOf(scored('x', [50, AHEAD + 1, 80, DECIDED, 99])), { decidedAt: 3, converted: true });
  assert.deepEqual(courseOf(scored('x', [50, 100 - AHEAD - 1, 49, 51, 30])), { decidedAt: null, converted: false });
  assert.deepEqual(courseOf(scored('x', [50, 55, 45])), { decidedAt: null, converted: null });
  // A game won before the score got there (a resignation): decided at its end.
  assert.deepEqual(courseOf({ ...scored('x', [50, 60, 80]), decisiveEnd: true }), { decidedAt: 2, converted: true });
  // A side's own leads only: Black's lead given back counts for Black, not for White.
  const blackLed = scored('x', [50, 100 - AHEAD - 1, 49, 51, 30]);
  assert.deepEqual(courseOf({ ...blackLed, side: 'black' }), { decidedAt: null, converted: false });
  assert.deepEqual(courseOf({ ...blackLed, side: 'white' }), { decidedAt: null, converted: null });
});

test('the whole-game report counts each player apart, with intervals', () => {
  const games = [scored('human', [50, 40, 45, 30, 35]), scored('human', [50, 50, 50]), scored('bot', [50, 45, 50, 20, 20])];
  const r = wholeGameReport(games, { boot: 50, seed: 1 });
  assert.deepEqual(Object.keys(r).sort(), ['bot', 'human']);
  assert.equal(r['human']!.games, 2);
  // The human's moves: 10, 5 (Black's), 15, 5, then 0 and 0.
  assert.equal(r['human']!.moves, 6);
  assert.ok(Math.abs(r['human']!.loss.all.value - 35 / 6) < 1e-9);
  assert.equal(r['human']!.blunders.all.value, 0, 'a blunder is more than 15');
  assert.equal(r['bot']!.blunders.all.value, 25, 'one of four moves gave up 30');
  assert.ok(r['bot']!.loss.all.lo <= r['bot']!.loss.all.value && r['bot']!.loss.all.value <= r['bot']!.loss.all.hi);
});

test('each bot is placed by the line through the others', () => {
  const all = [
    ...games('maia-1500', 'maia-1100', 4000, expectedScore(200)),
    ...games('maia-1900', 'maia-1500', 4000, expectedScore(200)),
    ...games('maia-1900', 'maia-1100', 4000, expectedScore(400)),
  ];
  // Locally 0, 200, 400; on Lichess 1400, 1500 and, off the line, 1700.
  const ratings = { maia1: { rapid: { rating: 1400, rd: 0, games: 1 } }, maia5: { rapid: { rating: 1500, rd: 0, games: 1 } }, maia9: { rapid: { rating: 1700, rd: 0, games: 1 } } };
  const loo = matchReport(all, ratings, { boot: 0, seed: 1 }).leaveOneOut.rapid!;
  assert.equal(loo['maia-1900']!.rating, 1700);
  assert.ok(Math.abs(loo['maia-1900']!.placed - 1600) < 10, `${loo['maia-1900']!.placed}`);
  assert.ok(Math.abs(loo['maia-1100']!.placed - 1300) < 10, `${loo['maia-1100']!.placed}`);
});
