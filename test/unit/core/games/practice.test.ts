// Practice (PLAN.md §5.57): the opponent's pick from the explorer and from Maia, the advantage
// drill's tracking and grade, the review, the result of a game stopped, and the history. The rules
// give the same answers as mistake-lab's own code on every case of test/fixtures/games/practice.json
// (`pickExplorerMove`, `maiaSampleMove`, `updateAdvantageTracking` + `finishAdvantage`,
// `buildContLineReviewData`, `evalToResult`, recorded by mistake-lab-practice.cjs at c525403).
//
// Controls re-run on this port (2026-10-07), each failing exactly the named assertions:
// - the explorer's 5% share taken of the moves' sum instead of the position's games → "the
//   explorer's pick" ("5% of the position, not of the moves listed");
// - a dip counted whatever the move gave up → "the advantage drill" ("a low score by a good move
//   does not count");
// - a corrected deviation flagged even when the move first tried is in the repertoire now (PLAN.md
//   §6 item 2) → "the review: …" ("corrected deviation no longer: …").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { advantageGrade, BLEND, blendMoves, databaseShare, drawAccepted, explorerTotal, GUARD, guardCandidates, guardedChoice, guardNeedsBefore, naturalMove, plyOf, positionEvals, repertoireVerdict, historyEntry, historyOf, maiaPick, pickExplorerMove, PREPARED, readHistoryEntry, temperedOdds, resultOf, reviewOf, ruleDraw, startTrack, trackAdvantage, type ExplorerMove, type PlayedMove } from '../../../../src/core/games/practice.ts';
import { parseLog } from '../../../../src/core/progress/events.ts';
import { toDeviceEvents, type DeviceEvent } from '../../../../src/core/progress/replay.ts';

const cases = JSON.parse(readFileSync(new URL('../../../fixtures/games/practice.json', import.meta.url), 'utf8')) as {
  explorer: { name: string; data: { white: number; draws: number; black: number; moves: ExplorerMove[] }; rnd: number; expected: string | null }[];
  maia: { name: string; probs: number[]; precision: number; rnd: number; expected: number }[];
  advantage: { name: string; peak: number; steps: [number, number][]; end: 'victory' | 'draw' | 'interrupted'; expected: { collapsedAt: number; claimAt: number; minCp: number | null; above: number; grade: number | null } }[];
  review: { name: string; baseFen: string; moves: (PlayedMove & { fen: string })[]; trie: Record<string, { san: string; uci: string }[]>; expected: { tally: Record<string, number>; accuracy: number; keyMoves: number[]; deviations: [number, string][]; corrected: [number, string][]; evalPoints: { idx: number; cp: number }[] } }[];
  results: { cp: number | null; color: 'white' | 'black'; expected: string }[];
};

test('the explorer’s pick: mistake-lab’s', () => {
  for (const c of cases.explorer) assert.equal(pickExplorerMove(c.data, () => c.rnd)?.uci ?? null, c.expected, c.name);
});

test('Maia’s draw at its precision: mistake-lab’s', () => {
  for (const c of cases.maia) {
    const policy = c.probs.map((prob, i) => ({ i, prob }));
    assert.equal(maiaPick(policy, c.precision, () => c.rnd)?.i, c.expected, c.name);
  }
  assert.equal(maiaPick([], 0.5, Math.random), null);
});

test('the advantage drill: the lowest score, the run at +10, the collapse and the grade, as mistake-lab’s', () => {
  for (const c of cases.advantage) {
    let track = startTrack(c.peak);
    let collapsedAt = -1;
    let claimAt = -1;
    c.steps.forEach(([cp, wp], i) => {
      if (collapsedAt >= 0) return;
      const r = trackAdvantage(track, cp, wp);
      track = r.track;
      if (r.collapse) collapsedAt = i;
      if (r.claim && claimAt < 0) claimAt = i;
    });
    const grade = advantageGrade(collapsedAt >= 0 ? 'collapse' : c.end, track, false) ?? null;
    assert.deepEqual({ collapsedAt, claimAt, minCp: track.minCp, above: track.above, grade }, c.expected, c.name);
  }
  // A checklist's drill never collapses; a hint makes a win Hard.
  assert.equal(trackAdvantage(startTrack(), 0, 20, false).collapse, false);
  assert.equal(advantageGrade('victory', startTrack(500), true), 2);
});

test('the review: the tally, the accuracy, the key moves, the deviations and the graph, as mistake-lab’s', () => {
  for (const c of cases.review) {
    const fens = c.moves.map((_, i) => (i === 0 ? c.baseFen : c.moves[i - 1]!.fen));
    const rep = (i: number) => repertoireVerdict(c.trie[fens[i]!.split(' ').slice(0, 4).join(' ')], c.moves[i]!);
    const r = reviewOf(c.moves, rep);
    assert.deepEqual(
      { tally: r.tally, accuracy: r.accuracy, keyMoves: r.keyMoves, deviations: [...r.deviations], corrected: [...r.corrected], evalPoints: r.evalPoints.map((p) => ({ idx: p.idx, cp: p.cp })) },
      { ...c.expected, tally: c.expected.tally },
      c.name,
    );
  }
});

test('a game stopped: won from +1, lost from −1, as mistake-lab’s', () => {
  for (const c of cases.results) assert.equal(resultOf(c.cp), c.expected, `${c.cp} ${c.color}`);
});

let n = 0;
const ev = (e: Record<string, unknown>): DeviceEvent => {
  const { lines, problems } = parseLog(JSON.stringify({ v: 1, n: ++n, t: '2026-10-07T10:00:00.000Z', ...e }));
  assert.deepEqual(problems, []);
  return toDeviceEvents('d', lines)[0]!;
};

test('the history: five user moves at least, slim, read back, the latest version of an id, newest first', () => {
  const c = cases.review[0]!;
  const review = reviewOf(c.moves);
  const short = historyEntry({ id: 'rev_1', ts: 1, baseFen: c.baseFen, color: 'white', source: 'practice', outcome: 'win', finalCp: 120.4, title: 'Sicilian', moves: c.moves.slice(0, 7), review });
  assert.equal(short, undefined, 'four user moves');
  const h = historyEntry({ id: 'rev_2', ts: 2000, baseFen: c.baseFen, color: 'white', source: 'practice', outcome: 'stopped', finalCp: 120.4, title: 'Sicilian', moves: c.moves, review })!;
  assert.equal(h.userMoveCount, 5);
  assert.equal(h.finalCp, 120);
  assert.equal(h.accuracy, 50);
  assert.ok(!('fen' in h.moves[0]!), 'no FENs kept');
  assert.deepEqual(readHistoryEntry(JSON.parse(JSON.stringify(h))), h);
  // mistake-lab's own snapshot reads too (the migration's played events).
  const ml = readHistoryEntry({ id: 'rev_x', ts: 5, baseFen: c.baseFen, playerColor: 'black', source: 'checklist', outcome: 'win', moves: [{ san: 'e4', uci: 'e2e4', isUser: true, classification: 'best', wpDrop: 0 }] })!;
  assert.equal(ml.userMoveCount, 1);
  assert.equal(ml.moves[0]!.classification, 'best');
  assert.equal(readHistoryEntry({ id: 'x', baseFen: 'f', moves: [{ san: 1 }] }), undefined);

  const events = new Map<string, DeviceEvent[]>([
    ['h|rev_2', [ev({ k: 'played', card: 'h|rev_2', game: { ...h, outcome: 'ended', updatedAt: 1000 } }), ev({ k: 'played', card: 'h|rev_2', game: h })]],
    ['h|rev_x', [ev({ k: 'played', card: 'h|rev_x', game: { id: 'rev_x', ts: 5, baseFen: c.baseFen, moves: [] } })]],
    ['h|wrong', [ev({ k: 'played', card: 'h|wrong', game: { id: 'other', ts: 9, baseFen: c.baseFen, moves: [] } })]],
  ]);
  const list = historyOf(events.keys(), (k) => events.get(k) ?? []);
  assert.deepEqual(
    list.map((x) => [x.id, x.outcome]),
    [
      ['rev_2', 'stopped'],
      ['rev_x', 'ended'],
    ],
  );
});

test('the eval bar’s scores: before and after each user move, an opponent’s move by the next user move', () => {
  const moves: PlayedMove[] = [
    { san: 'e4', uci: 'e2e4', isUser: true, bestCp: 30, afterCp: 25 },
    { san: 'c5', uci: 'c7c5', isUser: false },
    { san: 'Nf3', uci: 'g1f3', isUser: true, bestCp: 35, cpLoss: 5 },
    { san: 'd6', uci: 'd7d6', isUser: false },
    { san: 'd4', uci: 'd2d4', isUser: true },
    { san: 'cxd4', uci: 'c5d4', isUser: false },
  ];
  assert.deepEqual(positionEvals(moves), [30, 25, 35, 30, undefined, undefined, undefined]);
});

// ---- Draws (the owner's request, 2026-10-30): repetition, fifty moves, and a draw offered ----

/** The keys of the positions of a game from the start, and the last position's halfmove clock. */
function walk(sans: string[]): { keys: string[]; halfmoves: number } {
  const pos = Chess.default();
  const keys = [makeFen(pos.toSetup()).split(' ').slice(0, 4).join(' ')];
  for (const san of sans) {
    pos.play(parseSan(pos, san)!);
    keys.push(makeFen(pos.toSetup()).split(' ').slice(0, 4).join(' '));
  }
  return { keys, halfmoves: pos.halfmoves };
}

test('a draw by repetition: the third time a position stands, the positions before the game counted', () => {
  const lead = ['e4', 'c5', 'c3', 'Nf6'];
  const shuffle = ['Na3', 'Ng8', 'Nb1', 'Nf6', 'Na3', 'Ng8', 'Nb1'];
  // After 2.c3 (Black to move) stands again after 4.Nb1 and 6.Nb1: the third time with the lead-up counted.
  const w = walk([...lead, ...shuffle]);
  assert.equal(ruleDraw(w.keys, w.halfmoves), 'repetition');
  // The game alone (from 2...Nf6): only twice so far.
  assert.equal(ruleDraw(w.keys.slice(lead.length), w.halfmoves), undefined);
  // One move earlier, nothing stands three times.
  const v = walk([...lead, ...shuffle.slice(0, -1)]);
  assert.equal(ruleDraw(v.keys, v.halfmoves), undefined);
  // The same placement with the other side to move is another position.
  assert.equal(ruleDraw(['a w', 'a b', 'a w', 'a b'], 0), undefined);
  assert.equal(ruleDraw(['a w', 'a b', 'a w', 'a b', 'a w'], 0), 'repetition');
});

test('a draw by the fifty-move rule: a hundred plies with no capture or pawn move', () => {
  assert.equal(ruleDraw(['x'], 99), undefined);
  assert.equal(ruleDraw(['x'], 100), 'fifty');
  assert.equal(walk(['Nf3', 'Nf6', 'Ng1', 'Ng8']).halfmoves, 4);
});

test('a draw offered: accepted from move 20 when the last five moves and the position now are level; else declined', () => {
  assert.equal(plyOf(1, 'white'), 0);
  assert.equal(plyOf(20, 'white'), 38);
  assert.equal(plyOf(20, 'black'), 39);
  assert.equal(plyOf(21, 'white'), 40);
  const level = [300, 40, -20, 0, 50, -50];
  assert.equal(drawAccepted({ ply: 40, userCps: level, nowCp: 10 }), true);
  // Too early in the game.
  assert.equal(drawAccepted({ ply: 39, userCps: level, nowCp: 10 }), false);
  // Fewer than five moves, or one of the last five not level (the first, 300, is out of the run).
  assert.equal(drawAccepted({ ply: 60, userCps: [0, 0, 0, 0], nowCp: 0 }), false);
  assert.equal(drawAccepted({ ply: 60, userCps: [0, 0, 60, 0, 0], nowCp: 0 }), false);
  assert.equal(drawAccepted({ ply: 60, userCps: [0, 0, -60, 0, 0], nowCp: 0 }), false);
  // A move whose judge failed, or the position now not level (the opponent's last move a blunder).
  assert.equal(drawAccepted({ ply: 60, userCps: [0, 0, undefined, 0, 0], nowCp: 0 }), false);
  assert.equal(drawAccepted({ ply: 60, userCps: [0, 0, 0, 0, 0], nowCp: 400 }), false);
  assert.equal(drawAccepted({ ply: 60, userCps: [0, 0, 0, 0, 0], nowCp: undefined }), false);
});

test('the check on the opponent (§5.205): natural blunders on Maia’s odds, nonsense ones never, missed chances no blunder', () => {
  const policy = [
    { uci: 'a', prob: 0.4 },
    { uci: 'b', prob: 0.3 },
    { uci: 'c', prob: 0.15 },
    { uci: 'd', prob: 0.1 },
    { uci: 'e', prob: 0.04 },
    { uci: 'f', prob: 0.01 },
  ];
  // The candidates: 2% or more, the likeliest always, at most `maxMoves`.
  assert.deepEqual(guardCandidates(policy).map((m) => m.uci), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(guardCandidates([{ uci: 'x', prob: 0.01 }]).map((m) => m.uci), ['x']);
  assert.equal(guardCandidates(Array.from({ length: 20 }, (_, i) => ({ uci: `m${i}`, prob: 0.05 }))).length, GUARD.maxMoves);
  assert.equal(naturalMove(policy, policy[1]!), true);
  assert.equal(naturalMove(policy, policy[2]!), false);
  assert.equal(guardNeedsBefore(60, [55, 50]), false);
  assert.equal(guardNeedsBefore(60, [55, 49]), true);

  const at = (wps: number[]) => policy.slice(0, 5).map((m, i) => ({ ...m, wp: wps[i]! }));
  // a and b blunder (natural), c, d, e sound: wrong on Maia's odds, 0.7 against 0.29.
  const scored = at([20, 20, 55, 55, 55]);
  const pick = (r: number[]) => guardedChoice(policy, scored, 60, undefined, 0.75, () => r.shift() ?? 0)!;
  assert.equal(pick([0.69, 0]).wrong, true);
  assert.equal(pick([0.69, 0]).move.uci, 'a', 'the wrong move at the precision: the likelier');
  assert.equal(pick([0.71, 0]).wrong, false);
  assert.equal(pick([0.71, 0]).move.uci, 'c');
  // Only an unlikely move blunders: never played.
  const onlyD = at([60, 58, 58, 20, 58]);
  for (const r of [0, 0.5, 0.999]) assert.equal(guardedChoice(policy, onlyD, 60, undefined, 0.75, () => r)!.move.uci === 'd', false);
  // The user blundered (the opponent stood at 30 before): moves at 30 are no blunder.
  const missed = at([90, 30, 30, 30, 30]);
  assert.equal(guardedChoice(policy, missed, 90, undefined, 0.75, () => 0)!.wrong, true, 'against the best now, all but a fail');
  assert.equal(guardedChoice(policy, missed, 90, 30, 0.75, () => 0)!.wrong, false, 'against where it stood, none does');
  // Every move a blunder: a natural one; none natural: the least bad.
  assert.equal(guardedChoice(policy, at([10, 12, 5, 5, 5]), 60, undefined, 0.75, () => 0.99)!.wrong, true);
  assert.equal(guardedChoice(policy, at([10, 12, 5, 5, 5]), 60, undefined, 1, () => 0.99)!.move.uci, 'a');
  const noneNatural = [{ uci: 'c', prob: 0.15, wp: 5 }, { uci: 'd', prob: 0.1, wp: 8 }];
  assert.deepEqual(guardedChoice(policy, noneNatural, 60, undefined, 0.75, () => 0)!.move.uci, 'd');
  assert.equal(guardedChoice(policy, [], 60, undefined, 0.75, Math.random), null);
});

/** The share of a grid of dice that `pick` turns into each answer. */
function shares(pick: (r: number) => string | undefined, steps = 2000): Map<string | undefined, number> {
  const out = new Map<string | undefined, number>();
  for (let i = 0; i < steps; i++) {
    const k = pick((i + 0.5) / steps);
    out.set(k, (out.get(k) ?? 0) + 1 / steps);
  }
  return out;
}
const near = (a: number | undefined, b: number, eps = 0.002, msg?: string) => assert.ok(a !== undefined && Math.abs(a - b) < eps, `${msg ?? ''} ${a} ≉ ${b}`);

test('the blend (§5.206): a thin sample’s games with Maia as k games; the opponent’s weights at the precision', () => {
  const db = [
    { uci: 'x', white: 4, draws: 1, black: 2 },
    { uci: 'y', white: 2, draws: 1, black: 2 },
  ];
  const policy = [
    { uci: 'y', prob: 0.8 },
    { uci: 'z', prob: 0.14 },
    { uci: 'x', prob: 0.01 },
  ];
  const b = blendMoves(db, policy, 0.75, 50);
  assert.deepEqual(b.map((m) => m.uci), ['y', 'x', 'z']);
  near(b[0]!.prob, 45 / 62);
  near(b[1]!.prob, 7.5 / 62);
  near(b[2]!.prob, 7 / 62);
  // Weights: the games, and Maia's 50 games drawn at 0.75 (its odds squared, normalised).
  const t = temperedOdds(policy, 0.75);
  near(t.get('y'), 0.64 / 0.6597, 1e-4);
  near(b[0]!.weight, 5 + 50 * t.get('y')!, 1e-6);
  near(b[1]!.weight, 7 + 50 * t.get('x')!, 1e-6);
  near(b[2]!.weight, 50 * t.get('z')!, 1e-6);
  // No Maia: the games alone; no games: Maia's odds, its weights maiaPick's.
  assert.deepEqual(blendMoves(db, [], 0.75).map((m) => [m.uci, m.prob, m.weight]), [['x', 7 / 12, 7], ['y', 5 / 12, 5]]);
  const alone = blendMoves([], policy, 0.75);
  assert.deepEqual(alone.map((m) => m.uci), ['y', 'z', 'x']);
  near(alone[0]!.prob, 0.8, 1e-9);
  assert.deepEqual(blendMoves([], [], 0.75), []);
  assert.deepEqual([...temperedOdds(policy, 1)], [['y', 1]]);
  // The database's own draw, unchecked: its games against Maia's k.
  assert.equal(databaseShare(0, true), 0);
  assert.equal(databaseShare(BLEND.k, true), 0.5);
  assert.equal(databaseShare(0, false), 1);
  assert.equal(databaseShare(7, false), 1);
  assert.equal(explorerTotal({ white: 3, draws: 1, black: 2, moves: [] }), 6);
  assert.equal(explorerTotal({ moves: db.map((m) => ({ ...m, san: m.uci })) }), 12);
  assert.equal(explorerTotal(null), 0);
});

test('the check over the blend (§5.206): a thin sample’s blunder is no natural move; the move drawn by the weights', () => {
  const db = [
    { uci: 'x', white: 4, draws: 1, black: 2 },
    { uci: 'y', white: 2, draws: 1, black: 2 },
  ];
  const policy = [
    { uci: 'y', prob: 0.8 },
    { uci: 'z', prob: 0.14 },
    { uci: 'x', prob: 0.01 },
  ];
  const wp: Record<string, number> = { x: 20, y: 55, z: 52 };
  const blend = blendMoves(db, policy, 0.75, 50);
  const scored = guardCandidates(blend).map((m) => ({ ...m, wp: wp[m.uci]! }));
  assert.deepEqual(scored.map((m) => m.uci), ['y', 'x', 'z']);
  // x, seven games of twelve, throws the game away: Maia puts it at 1%, so in the blend it is no natural move.
  const blended = shares((r) => guardedChoice(blend, scored, 56, undefined, 0.75, () => r)?.move.uci);
  assert.equal(blended.get('x'), undefined, 'never played');
  // Which sound move: by the weights, y's 5 games and 48.5 of Maia's against z's 1.5.
  near(blended.get('y'), blend[0]!.weight / (blend[0]!.weight + blend[2]!.weight), 0.002);
  // The games alone (as a well-sampled position would be read): x is the likeliest, a natural blunder, played on its odds.
  const games = blendMoves(db, [], 0.75);
  const raw = games.map((m) => ({ ...m, wp: wp[m.uci]! }));
  assert.equal(guardedChoice(games, raw, 56, undefined, 0.75, () => 0)!.move.uci, 'x');
  // Without weights, the draw is maiaPick's at the precision, as before.
  const plain = policy.map((m) => ({ ...m, wp: wp[m.uci]! }));
  for (const r of [0, 0.5, 0.97, 0.999]) assert.equal(guardedChoice(policy, plain, 56, undefined, 0.75, () => r)!.move.uci, maiaPick(plain.filter((m) => m.uci !== 'x'), 0.75, () => r)!.uci);
});

test('a prepared opponent (§5.206): the replies weighted by how they score for it, a few games’ luck drawn toward the position’s', () => {
  const data = {
    white: 600,
    draws: 100,
    black: 300,
    moves: [
      { uci: 'a', san: 'a', white: 300, draws: 50, black: 250 },
      { uci: 'b', san: 'b', white: 300, draws: 50, black: 50 },
    ],
  };
  const pick = (prepared: 'white' | 'black' | undefined) => shares((r) => pickExplorerMove(data, () => r, { minGames: 5, minFreq: 0.05, ...(prepared ? { prepared } : {}) })?.uci);
  near(pick(undefined).get('b'), 0.4, 0.001, 'by the games');
  // White's score: a 0.55 and b 0.794 once drawn toward the position's 0.65 by 50 games.
  const wa = 600 * Math.exp(PREPARED.beta * 100 * ((325 + 50 * 0.65) / 650 - 0.65));
  const wb = 400 * Math.exp(PREPARED.beta * 100 * ((325 + 50 * 0.65) / 450 - 0.65));
  near(pick('white').get('b'), wb / (wa + wb), 0.001, 'White prefers b');
  assert.ok(pick('black').get('a')! > 0.9, 'Black prefers a');
  // A reply of ten games, all won: drawn toward the position, it gains, but doesn't take over.
  const lucky = {
    white: 40,
    draws: 0,
    black: 30,
    moves: [
      { uci: 'd', san: 'd', white: 30, draws: 0, black: 30 },
      { uci: 'e', san: 'e', white: 10, draws: 0, black: 0 },
    ],
  };
  const e = shares((r) => pickExplorerMove(lucky, () => r, { minGames: 5, minFreq: 0.05, prepared: 'white' })?.uci).get('e')!;
  assert.ok(e > 10 / 70 && e < 0.5, `e ${e}`);
});
