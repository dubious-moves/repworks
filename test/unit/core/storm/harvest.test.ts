// The storm's producer (PLAN.md §5.42) over fake services: lichessable's `harvestFrontier` and
// `harvestUncovered`, with §26.4's branch (games → the hybrid walk, none → the engine's invented
// line) and §7's stage-0 band.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { STORM as C } from '../../../../src/core/storm/config.ts';
import type { ScoredList, ScoredMove } from '../../../../src/core/storm/grade.ts';
import { cdbList, deepenedPosition, engineList, harvestDecision, harvestFrontier, needsDeepening, storedList, storedPosition, type HarvestIo } from '../../../../src/core/storm/harvest.ts';
import { decisions, frontiers, stormLines } from '../../../../src/core/storm/sources.ts';
import { positionOf, uciToSan } from '../../../../src/core/storm/walk.ts';
import { standardUci } from '../../../../src/core/chess/uci.ts';
import { positionKey } from '../../../../src/core/chess/positionKey.ts';

const LADDER = [0, -12, -40, -60, -130, -200];
function scoredFor(fen: string, base: number): ScoredList {
  const pos = positionOf(fen)!;
  const ucis: string[] = [];
  for (const [from, dests] of pos.allDests()) for (const to of dests) ucis.push(standardUci(pos, { from, to }));
  const out: ScoredMove[] = [...new Set(ucis)]
    .sort()
    .slice(0, LADDER.length)
    .map((uci, i) => ({ uci, san: uciToSan(pos, uci), score: base + LADDER[i]! }));
  return out.sort((a, b) => b.score - a.score);
}

function chapterLines(moves: string, side: 'white' | 'black' = 'white') {
  const p = parseChapterFile(`[Orientation "${side}"]\n[ChapterName "Ruy"]\n\n${moves} *\n`, 'c1');
  if (!p.ok) throw new Error(p.reason);
  return stormLines([{ sid: 'S1', chapter: p.chapter }]);
}

const GAME = '[Event "x"]\n[GameId "AAAAAAAA"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 1-0\n';

function io(over: Partial<HarvestIo> = {}, log: string[] = []): HarvestIo {
  return {
    explorer: async (fen) => (log.push('explorer ' + fen.split(' ')[0]), { total: 1000, moves: [], gameIds: ['AAAAAAAA', 'BBBBBBBB'] }),
    pgns: async (ids) => (log.push('pgns ' + ids.join(',')), GAME),
    cdb: async (fen) => (log.push('cdb'), Object.assign(scoredFor(fen, 20), { source: 'cdb' as const })),
    engine: async (fen, lines, depth) => (log.push(`engine ${lines} ${depth}`), Object.assign(scoredFor(fen, 20), { source: 'sf' as const, depth })),
    rnd: () => 0,
    ...over,
  };
}

test('a frontier with games: one export for the pass, the walk scored by ChessDB, the user to move', async () => {
  const lines = chapterLines('1. e4 e5 2. Nf3 Nc6 3. Bb5');
  const { frontiers: fs, cont } = frontiers(lines, C);
  const log: string[] = [];
  const h = await harvestFrontier(fs[0]!, cont, io({}, log), C, 2);
  assert.equal(h.refused, undefined);
  assert.ok(h.candidates.length > 0);
  assert.ok(h.candidates.every((c) => c.userColor === 'white' && c.fen.split(' ')[1] === 'w' && !c.invented));
  assert.equal(log.filter((l) => l.startsWith('pgns')).length, 1);
  assert.equal(log.filter((l) => l.startsWith('engine')).length, 0);
  assert.deepEqual(h.stops, { 'the game ended': 1 });
});

test('ChessDB unknown: Stockfish scores that position (MultiPV 6, depth 14); a ChessDB failure scores nothing', async () => {
  const lines = chapterLines('1. e4 e5 2. Nf3 Nc6 3. Bb5');
  const { frontiers: fs, cont } = frontiers(lines, C);
  const log: string[] = [];
  const h = await harvestFrontier(fs[0]!, cont, io({ cdb: async () => (log.push('cdb'), null) }, log), C, 2);
  assert.ok(log.includes('engine 6 14'));
  assert.ok(h.candidates.every((c) => c.scored.source === 'sf'));
  const failed = await harvestFrontier(fs[0]!, cont, io({ cdb: async () => 'error' }, []), C, 2);
  assert.equal(failed.refused, 'nothing could score the line’s end');
});

test('no games (or no login): the engine’s invented line, seeded with the line’s last move', async () => {
  const lines = chapterLines('1. e4 e5 2. Nf3 Nc6 3. Bb5');
  const { frontiers: fs, cont } = frontiers(lines, C);
  const log: string[] = [];
  const h = await harvestFrontier(fs[0]!, cont, io({ explorer: async () => null }, log), C, 2);
  assert.ok(!log.some((l) => l === 'cdb'), 'ChessDB is not asked on the invented path');
  assert.ok(h.candidates.length > 0 && h.candidates.every((c) => c.invented));
  assert.ok(!log.some((l) => l.startsWith('pgns')));
});

test('stage 0: a line ending out of the band is refused for one request', async () => {
  const lines = chapterLines('1. e4 e5 2. Nf3 Nc6 3. Bb5');
  const { frontiers: fs, cont } = frontiers(lines, C);
  const log: string[] = [];
  // Black to move at the end; +250 for Black is −250 for the White repertoire.
  const h = await harvestFrontier(fs[0]!, cont, io({ cdb: async (fen) => (log.push('cdb'), scoredFor(fen, 250)) }, log), C, 2);
  assert.equal(h.refused, 'the line ends losing');
  assert.equal(log.filter((l) => l === 'cdb').length, 1);
  assert.ok(!log.some((l) => l.startsWith('pgns')));
});

test('uncovered replies: one explorer request, one score each, marked with the reply', async () => {
  const lines = chapterLines('1. e4 e5 2. Nf3 Nc6 3. Bb5');
  const { points } = decisions(lines);
  const afterE4 = points.find((p) => p.key === positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'))!;
  const log: string[] = [];
  const reply = (san: string, games: number) => ({ san, white: games, draws: 0, black: 0 });
  const h = await harvestDecision(afterE4, io({ explorer: async () => (log.push('explorer'), { total: 10000, moves: [reply('e5', 5000), reply('c5', 3000), reply('e6', 1000)], gameIds: [] }) }, log), C);
  assert.deepEqual(
    h.candidates.map((c) => c.unc!.san),
    ['c5', 'e6'],
  );
  assert.ok(h.candidates.every((c) => c.ply === 1 && c.userColor === 'white'));
  assert.equal(log.filter((l) => l === 'explorer').length, 1);
  assert.equal(log.filter((l) => l === 'cdb').length, 2);
});

test('lists: ChessDB’s unscored moves dropped and sorted; the engine’s lines from the mover’s side', () => {
  const l = cdbList({ status: 'ok', moves: [{ uci: 'a2a3', san: 'a3', score: -30 }, { uci: 'e2e4', san: 'e4', score: 25 }, { uci: 'h2h4', san: 'h4', score: NaN }] })!;
  assert.deepEqual(
    l.map((m) => m.uci),
    ['e2e4', 'a2a3'],
  );
  assert.equal(l.source, 'cdb');
  assert.equal(cdbList({ status: 'unknown', moves: [] }), null);
  const e = engineList(
    [
      { multipv: 1, depth: 14, score: { cp: -40 }, pv: ['e7e5'] },
      { multipv: 2, depth: 14, score: { cp: 10 }, pv: ['c7c5'] },
    ],
    'black',
    14,
    C,
  )!;
  assert.deepEqual(
    e.map((m) => [m.uci, m.score]),
    [
      ['e7e5', 40],
      ['c7c5', -10],
    ],
  );
  assert.deepEqual([e.source, e.depth], ['sf', 14]);
});

test('a stored position keeps every scored move and comes back as the same list', async () => {
  const lines = chapterLines('1. e4 e5 2. Nf3 Nc6 3. Bb5');
  const { frontiers: fs, cont } = frontiers(lines, C);
  const h = await harvestFrontier(fs[0]!, cont, io(), C, 2);
  const cand = h.candidates.find((c) => !c.reject)!;
  const p = storedPosition(cand, { lines: fs[0]!.lines, names: fs[0]!.names, games: 1234 }, 99)!;
  assert.equal(p.card, 's|' + positionKey(cand.fen));
  assert.equal(p.scored.length, cand.scored.length);
  assert.deepEqual(
    storedList(p).map((m) => [m.uci, m.score]),
    cand.scored.map((m) => [m.uci, m.score]),
  );
  assert.equal(storedList(p).source, 'cdb');
  assert.deepEqual([p.games, p.at, p.names], [1234, 99, ['Ruy']]);
});

test('the deepened standard: a list below depth 20 doesn’t count; a deep one replaces ChessDB’s', async () => {
  const lines = chapterLines('1. e4 e5 2. Nf3 Nc6 3. Bb5');
  const { frontiers: fs, cont } = frontiers(lines, C);
  const h = await harvestFrontier(fs[0]!, cont, io(), C, 2);
  const p = storedPosition(h.candidates.find((c) => !c.reject)!, { lines: fs[0]!.lines, names: fs[0]!.names }, 1)!;
  assert.equal(needsDeepening(p, C), true);
  const shallow = Object.assign(scoredFor(p.fen, 30), { source: 'sf' as const, depth: 18 });
  assert.equal(deepenedPosition(p, shallow, C), null);
  const deep = Object.assign(scoredFor(p.fen, 30), { source: 'sf' as const, depth: 21 });
  const d = deepenedPosition(p, deep, C)!;
  assert.deepEqual([d.src, d.depth, d.scored[0]!.s], ['sf', 21, 30]);
  assert.equal(needsDeepening(d, C), false);
  assert.equal(deepenedPosition(p, cdbList({ status: 'ok', moves: [{ uci: 'a2a3', san: 'a3', score: 1 }] }), C), null);
});
