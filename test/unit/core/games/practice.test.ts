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
import { advantageGrade, positionEvals, repertoireVerdict, historyEntry, historyOf, maiaPick, pickExplorerMove, readHistoryEntry, resultOf, reviewOf, startTrack, trackAdvantage, type ExplorerMove, type PlayedMove } from '../../../../src/core/games/practice.ts';
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
