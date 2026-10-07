// What the games say about the repertoire (PLAN.md §5.58–§5.60): deviations and gaps, recidivism,
// and weak spots. On test/fixtures/games/repcheck.json (17 games made for these rules, a five-line
// repertoire, drilled items, raw mistakes, practice games and practice results), each gives the
// same answers as mistake-lab's own code (`detectRepertoireDeviations`, `buildDrilledIndex` +
// `computeRecidivism`, its position index + `computeHumanWeakSpots` and `computeBotWeakSpots`),
// recorded by mistake-lab-repcheck.cjs at c525403.
//
// Controls re-run on this port (2026-10-07), each failing exactly the named assertions:
// - the walk stopped at a deviation → "deviations and gaps" (mistake-lab walks on: the gaps after
//   G02's and G03's Bc4 are its);
// - a game before the card's first review counted → "recidivism" (G01 before G02_5's);
// - the user's own moves kept as edges → "weak spots" (the human lens).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyFen, type PositionKey } from '../../../../src/core/chess/positionKey.ts';
import { replay } from '../../../../src/core/games/positions.ts';
import { deviationPasses, findDeviations, type WalkGame } from '../../../../src/core/games/deviations.ts';
import { badgeOf, drilledIndex, recidivism, relapsesToWrite, type RecidPractice } from '../../../../src/core/games/recidivism.ts';
import { botWeakSpots, humanWeakSpots } from '../../../../src/core/games/weakSpots.ts';
import type { GameItem } from '../../../../src/core/games/extract.ts';
import type { Classification } from '../../../../src/core/games/grade.ts';
import { indexStudies } from '../../../../src/core/repertoire/index.ts';
import { addLine, newChapter } from '../../../../src/core/study/ops.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';

interface Fixture {
  lines: { side: 'white' | 'black'; sans: string }[];
  games: { id: string; color: 'white' | 'black'; result: 'win' | 'loss' | 'draw'; moves: string[]; speed: string; analysed: boolean; createdAt: number }[];
  dismissed: string[];
  items: { type: 'mistake' | 'tactic'; gameId: string; movePly: number; fenBefore: string; sanPlayed?: string; tacticMoves?: { uci: string; san: string; isUser: boolean }[]; reps: number; firstReview?: string; invalidated?: boolean }[];
  mistakes: { gameId: string; fenBefore: string; sanPlayed: string }[];
  reviews: { id: string; ts: number; baseFen: string; moves: { san: string; uci: string; isUser: boolean; classification?: Classification }[] }[];
  scoreboard: Record<string, { result: 'win' | 'draw' | 'loss'; preset?: string }[]>;
  expected: {
    deviations: { key: string; color: string; repertoire: string; games: [string, number, string, string][] }[];
    gaps: { key: string; san: string; games: string[] }[];
    recid: { summary: Record<string, number>; byPid: Record<string, [string, string, string, boolean, boolean, boolean, string][]> };
    human: { key: string; san: string; w: number; l: number; d: number; userColor: string }[];
    bot: { key: string; preset: string; w: number; l: number; d: number }[];
  };
}
const fx = JSON.parse(readFileSync(new URL('../../../fixtures/games/repcheck.json', import.meta.url), 'utf8')) as Fixture;

const chapters: Chapter[] = fx.lines.map((l, i) => {
  const made = newChapter(`Ch${i}xxxxx`.slice(0, 8), 'Rep', `L${i}`, l.side);
  assert.ok(made.ok);
  const added = addLine(made.value, [], l.sans.split(' '));
  assert.ok(added.ok);
  return added.value.chapter;
});
const index = indexStudies([{ sid: 'Rep00001', kind: 'repertoire', chapters }]);
const played = new Map(fx.games.map((g) => [g.id, replay({ moves: g.moves })!]));
const walkGames: WalkGame[] = fx.games.map((g) => ({ id: g.id, color: g.color, speed: g.speed, createdAt: g.createdAt, plies: played.get(g.id)!.plies, finalKey: played.get(g.id)!.finalKey }));

test('deviations and gaps: mistake-lab’s', () => {
  const { deviations, gaps } = findDeviations(walkGames, index, new Set(fx.dismissed));
  assert.deepEqual(
    deviations.map((d) => ({ key: d.key, color: d.color, repertoire: d.repertoire.uci, games: d.games.map((g) => [g.gameId, g.ply, g.played.san, g.speed]) })),
    fx.expected.deviations,
  );
  assert.deepEqual(
    gaps.map((g) => ({ key: g.key, san: g.move.san, games: g.games })),
    fx.expected.gaps,
  );
  // The repertoire's move names its chapter; the filter is mistake-lab's.
  assert.deepEqual(deviations[0]!.repertoire.at.path, ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
  assert.equal(deviations.filter((d) => deviationPasses(d, { color: 'white', speeds: ['rapid'] })).length, 1);
  assert.equal(deviations.filter((d) => deviationPasses(d, { color: 'black', speeds: [] })).length, 1);
});

const pidOf = (m: Fixture['items'][number]) => (m.type === 'tactic' ? `${m.gameId}_t${m.movePly}` : `${m.gameId}_${m.movePly}`);
const items: GameItem[] = fx.items.map((m) => {
  const base = { pid: pidOf(m), gameId: m.gameId, ply: m.movePly, fenBefore: m.fenBefore, color: 'white' as const };
  if (m.type === 'tactic') return { ...base, kind: 'tactic', lines: [m.tacticMoves!.map((t) => ({ uci: t.uci, san: t.san, user: t.isUser }))], wpSwing: 20, wpDrop: 20, found: false };
  return { ...base, kind: 'mistake', key: keyFen(m.fenBefore)!.key, san: m.sanPlayed!, uci: '', cpBefore: 0, cpAfter: 0, cpLoss: 0, wpDrop: 20, timeTrouble: false };
});
const stateOf = (pid: string) => {
  const m = fx.items.find((x) => pidOf(x) === pid);
  return m ? { reps: m.reps, ...(m.firstReview ? { firstReview: Date.parse(m.firstReview) } : {}), dropped: !!m.invalidated } : undefined;
};
const gameTime = (id: string) => fx.games.find((g) => g.id === id)?.createdAt;
const keyOf = (fen: string) => keyFen(fen)?.key;

function practiceOf(r: Fixture['reviews'][number]): RecidPractice {
  const seq = replay({ initialFen: r.baseFen, moves: r.moves.map((m) => m.san) })!;
  return { id: r.id, ts: r.ts, seedKey: keyOf(r.baseFen)!, moves: r.moves.map((m, i) => ({ ...m, keyBefore: seq.plies[i]!.keyBefore })) };
}

test('recidivism: the encounters, their verdicts and the summary, as mistake-lab’s', () => {
  const drilled = drilledIndex(items, stateOf, gameTime, keyOf);
  const mistakesAt = new Map<string, Map<PositionKey, string>>();
  for (const m of fx.mistakes) {
    let g = mistakesAt.get(m.gameId);
    if (!g) mistakesAt.set(m.gameId, (g = new Map()));
    g.set(keyOf(m.fenBefore)!, m.sanPlayed);
  }
  const games = fx.games.map((g) => ({ id: g.id, createdAt: g.createdAt, analysed: g.analysed, color: g.color, plies: played.get(g.id)!.plies }));
  const { byPid, summary } = recidivism(drilled, games, (id) => mistakesAt.get(id), fx.reviews.map(practiceOf));
  assert.deepEqual(summary, fx.expected.recid.summary);
  assert.deepEqual(Object.fromEntries([...byPid].map(([pid, encs]) => [pid, encs.map((e) => [e.gameId, e.source, e.verdict, e.sameMove, e.exactBest, e.approx, e.playedSan])])), fx.expected.recid.byPid);

  // Reschedules: the real games' relapses not yet recorded for the card.
  assert.deepEqual(
    relapsesToWrite(byPid, (pid) => (pid === 'G05_t7' ? new Set(['G07']) : undefined)).map((r) => [r.pid, r.gameId]),
    [
      ['G02_5', 'G03'],
      ['G05_t7', 'G09'],
    ],
  );
  assert.deepEqual(badgeOf(byPid.get('G02_5')!), { fixed: 0, relapsed: 1, sameMove: true, inappFixed: 0, inappRelapsed: 1 });

  // The side to move: a game of the other colour reaching the position is no encounter.
  const asBlack = games.map((g) => (g.id === 'G03' ? { ...g, color: 'black' as const } : g));
  assert.equal(recidivism(drilled, asBlack, (id) => mistakesAt.get(id), []).byPid.get('G02_5'), undefined);
});

test('weak spots: the human lens and the bot lens, as mistake-lab’s', () => {
  const human = humanWeakSpots(fx.games.map((g) => ({ id: g.id, color: g.color, result: g.result, plies: played.get(g.id)!.plies })));
  assert.deepEqual(
    human.map((x) => ({ key: x.key, san: x.san, w: x.w, l: x.l, d: x.d, userColor: x.userColor })),
    fx.expected.human,
  );
  const results = Object.entries(fx.scoreboard).flatMap(([key, list]) => list.map((e) => ({ key: key as PositionKey, res: e.result, ...(e.preset ? { preset: e.preset } : {}) })));
  assert.deepEqual(
    botWeakSpots(results, ['easy', 'medium', 'hard']).map((x) => ({ key: x.key, preset: x.preset, w: x.w, l: x.l, d: x.d })),
    fx.expected.bot,
  );
});
