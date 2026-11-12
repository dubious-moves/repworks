// Progress (PLAN.md §5.122): recall against FSRS's prediction, the moves' stages, chapters weakest
// first, moves missed, the forecast and the minutes trained.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';
import { positionKeyOf } from '../../../../src/core/chess/positionKey.ts';
import { standardUci } from '../../../../src/core/chess/uci.ts';
import { repertoireCard, type CardId } from '../../../../src/core/progress/cards.ts';
import type { KnownEvent } from '../../../../src/core/progress/events.ts';
import { DEFAULT_PARAMS, retrievability } from '../../../../src/core/progress/fsrs.ts';
import { Replay, type DeviceEvent } from '../../../../src/core/progress/replay.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { indexStudies } from '../../../../src/core/repertoire/index.ts';
import { DEFAULT_TRAIN } from '../../../../src/core/train/settings.ts';
import { answersOf, progressStats, studyMoves, type Span } from '../../../../src/core/train/stats.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { asDevice, DAY, iso } from '../../../support/reviewHistory.ts';

const MIN = 60_000;
const start = Date.UTC(2026, 9, 1);

function chapter(cid: string, moves: string): Chapter {
  const parsed = parseChapterFile(`[Orientation "white"]\n\n${moves} *\n`, cid);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.chapter;
}
function card(sans: string): CardId {
  const pos = Chess.default();
  const moves = sans.split(' ');
  for (const san of moves.slice(0, -1)) pos.play(parseSan(pos, san)!);
  return repertoireCard(positionKeyOf(pos), standardUci(pos, parseSan(pos, moves.at(-1)!) as NormalMove));
}

let n = 0;
type Bare<T> = T extends unknown ? Omit<T, 'v' | 'n' | 't'> : never;
const ev = (t: number, e: Bare<KnownEvent>): DeviceEvent => asDevice('Desktop1', [{ ...e, v: 1, n: ++n, t: iso(t) } as KnownEvent])[0]!;
const days = (from: number, count: number): Span[] =>
  Array.from({ length: count }, (_, i) => ({
    start: from + i * DAY,
    end: from + (i + 1) * DAY,
  }));

const index = indexStudies([
  {
    sid: 'Rep0Open',
    kind: 'repertoire',
    chapters: [chapter('Ch1Ruyxx', '1. e4 e5 2. Nf3 Nc6 3. Bb5'), chapter('Ch2Sicil', '1. e4 c5 2. Nf3 d6 3. d4')],
  },
]);
const E4 = card('e4');
const NF3 = card('e4 e5 Nf3');
const BB5 = card('e4 e5 Nf3 Nc6 Bb5');
const NF3C5 = card('e4 c5 Nf3');
const D4 = card('e4 c5 Nf3 d6 d4');

test('an answer carries the recall FSRS predicted for it; a first answer none, and one after a forget is first again', () => {
  const s0 = DEFAULT_PARAMS.weights[2]!;
  const events = [
    ev(start, { k: 'review', card: E4, g: 3 }),
    ev(start + 3 * DAY, { k: 'review', card: E4, g: 1, w: ['d2d4'] }),
    ev(start + 4 * DAY, { k: 'forget', card: E4 }),
    ev(start + 5 * DAY, { k: 'review', card: E4, g: 3 }),
  ];
  const answers = answersOf(events);
  assert.deepEqual(
    answers.map((a) => [a.first, a.right]),
    [
      [true, true],
      [false, false],
      [true, true],
    ],
  );
  assert.equal(answers[0]!.predicted, undefined);
  assert.equal(answers[1]!.predicted, retrievability(3, s0));
  assert.deepEqual(answers[1]!.wrong, ['d2d4']);
});

test('progress: recall against the prediction, the stages, chapters weakest first, moves missed, the forecast and the minutes', () => {
  const now = start + 40 * DAY + 10 * 60 * MIN;
  const today = start + 40 * DAY;
  const events: DeviceEvent[] = [
    // e4: long known, reviewed at its due times, right: mature.
    ev(start, { k: 'review', card: E4, g: 3 }),
    ev(start + 3 * DAY, { k: 'review', card: E4, g: 3 }),
    ev(start + 12 * DAY, { k: 'review', card: E4, g: 3 }),
    // Nf3 (the Ruy): taught, then missed three times in the window, once right.
    ev(start + 20 * DAY, { k: 'taught', card: NF3 }),
    ev(start + 20 * DAY + 5 * 3_600_000, { k: 'review', card: NF3, g: 3 }),
    ev(start + 30 * DAY, { k: 'review', card: NF3, g: 1, w: ['b1c3'] }),
    ev(start + 31 * DAY, { k: 'review', card: NF3, g: 1, w: ['f1c4'] }),
    ev(start + 32 * DAY, { k: 'review', card: NF3, g: 3 }),
    // Today: Bb5 taught, then 2 minutes later Nf3 (the Sicilian) taught; a 20-minute break; e4 reviewed.
    ev(today + 9 * 60 * MIN, { k: 'taught', card: BB5 }),
    ev(today + 9 * 60 * MIN + 2 * MIN, { k: 'taught', card: NF3C5 }),
    ev(today + 9 * 60 * MIN + 22 * MIN, { k: 'review', card: E4, g: 3 }),
    // d4: suspended.
    ev(start, { k: 'suspend', card: D4 }),
  ];
  const replay = new Replay();
  replay.add(events);
  const stats = progressStats(index, replay.states, (c) => replay.eventsOf(c), DEFAULT_TRAIN, {
    now,
    since: now - 30 * DAY,
    ahead: days(today, 14),
    past: days(today - 13 * DAY, 14),
  });

  assert.deepEqual(stats.moves, {
    total: 5,
    fresh: 0,
    learning: 2,
    young: 1,
    mature: 1,
    suspended: 1,
    paused: 0,
  });
  // Answers but first ones: e4's three after its first, Nf3's three after its first. The window
  // (from day 10) leaves out e4's on day 3.
  assert.equal(stats.all.answers, 6);
  assert.equal(stats.all.right, 4);
  assert.equal(stats.recent.answers, 5);
  assert.equal(stats.recent.right, 3);
  assert.ok(stats.recent.expected > 0 && stats.recent.expected < stats.recent.answers);
  assert.equal(
    stats.bands.reduce((s, b) => s + b.answers, 0),
    stats.all.answers,
  );
  // First answers in the window: Nf3's after teaching.
  assert.deepEqual(stats.firsts, { answers: 1, right: 1 });

  assert.deepEqual(
    stats.missed.map((m) => [m.card, m.misses, m.answers, m.wrong]),
    [[NF3, 2, 4, ['f1c4']]],
  );

  // The Ruy (Nf3 weak) before the Sicilian (e4 alone reviewed in it).
  assert.deepEqual(
    stats.chapters.map((c) => [c.cid, c.moves, c.started]),
    [
      ['Ch1Ruyxx', 3, 3],
      ['Ch2Sicil', 3, 2],
    ],
  );
  assert.ok(stats.chapters[0]!.recall! < stats.chapters[1]!.recall!);

  // Today's minutes: the 2-minute gap; the 20-minute break is none.
  assert.deepEqual(stats.days.at(-1), {
    start: today,
    end: today + DAY,
    minutes: 2,
    answers: 1,
    taught: 2,
  });
  // Days 30 to 32: one answer each, alone, so no minutes.
  assert.deepEqual(
    stats.days.slice(0, -1).map((d) => d.answers),
    [0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0],
  );
  assert.equal(
    stats.days.reduce((s, d) => s + d.minutes, 0),
    2,
  );

  // The forecast: Nf3 (the Ruy) overdue, and the two moves taught today after their step, today;
  // those two again after their first interval, and Nf3 after its next; d4 (suspended) never.
  assert.deepEqual(
    stats.forecast.map((d) => d.due),
    [3, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0],
  );
});

test('a paused line’s moves count as paused, and are never forecast', () => {
  const replay = new Replay();
  replay.add([ev(start, { k: 'review', card: BB5, g: 3 })]);
  const paused = {
    ...index,
    lines: index.lines.map((l) => (l.cid === 'Ch1Ruyxx' ? { ...l, paused: true as const } : l)),
  };
  const stats = progressStats(paused, replay.states, (c) => replay.eventsOf(c), DEFAULT_TRAIN, { now: start + DAY, since: start, ahead: days(start, 14), past: [] });
  // Nf3 and Bb5 are on the paused line only; e4 is on the Sicilian too.
  assert.equal(stats.moves.paused, 2);
  assert.equal(
    stats.forecast.reduce((s, d) => s + d.due, 0),
    0,
  );
});

// A study's moves by stage (PLAN.md §5.169), for its card on the home.
// Controls run (2026-11-12), each failing this test and no other:
// - a move counted once, for its first study alone (`places[0]!.sid` for every study it is in):
//   the Sicilian study's total is 2 for 3;
// - suspended moves counted (the `suspended` check dropped): the Sicilian study's total is 4,
//   one more young;
// - a move taught and not yet reviewed counted as not started (`status === 'fresh' || status ===
//   'learning'`): the open games' young is 1 for 2.
test('a study’s moves by stage: mature, young (taught ones too) and not started; a move in two studies counted in both, suspended and paused-only moves in neither', () => {
  const two = indexStudies([
    { sid: 'Rep0Open', kind: 'repertoire', chapters: [chapter('Ch1Ruyxx', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4')] },
    { sid: 'Rep1Sici', kind: 'repertoire', chapters: [chapter('Ch2Sicil', '1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4'), chapter('Ch3Alapn', '1. e4 c5 2. c3')] },
  ]);
  const BA4 = card('e4 e5 Nf3 Nc6 Bb5 a6 Ba4');
  const NXD4 = card('e4 c5 Nf3 d6 d4 cxd4 Nxd4');
  const C3 = card('e4 c5 c3');
  const replay = new Replay();
  replay.add([
    // e4, in both studies: reviewed at its due times, mature by day 12.
    ev(start, { k: 'review', card: E4, g: 3 }),
    ev(start + 3 * DAY, { k: 'review', card: E4, g: 3 }),
    ev(start + 12 * DAY, { k: 'review', card: E4, g: 3 }),
    // The open games: Nf3 reviewed once (young), Bb5 taught only (young), Ba4 never.
    ev(start + 12 * DAY, { k: 'review', card: NF3, g: 3 }),
    ev(start + 12 * DAY, { k: 'taught', card: BB5 }),
    // The Sicilian: Nf3 reviewed once, d4 suspended after a review, Nxd4 and c3 never.
    ev(start + 12 * DAY, { k: 'review', card: NF3C5, g: 3 }),
    ev(start + 12 * DAY, { k: 'review', card: D4, g: 3 }),
    ev(start + 13 * DAY, { k: 'suspend', card: D4 }),
  ]);
  assert.ok(replay.states.get(E4)!.card.stability >= 21, 'e4 is mature');
  // The Alapin's line is paused: c3 lies on it alone, e4 on active lines too.
  const paused = { ...two, lines: two.lines.map((l) => (l.cid === 'Ch3Alapn' ? { ...l, paused: true as const } : l)) };
  const moves = studyMoves(paused, replay.states);
  assert.deepEqual([...moves.keys()], ['Rep0Open', 'Rep1Sici']);
  assert.deepEqual(moves.get('Rep0Open'), { total: 4, mature: 1, young: 2, fresh: 1 });
  assert.deepEqual(moves.get('Rep1Sici'), { total: 3, mature: 1, young: 1, fresh: 1 });
  assert.ok(two.cards.has(BA4) && two.cards.has(NXD4) && two.cards.has(C3));
  // Unpaused, c3 is one more not started.
  assert.deepEqual(studyMoves(two, replay.states).get('Rep1Sici'), { total: 4, mature: 1, young: 1, fresh: 2 });
  // Nothing trained: every move not started. No study, no entry.
  assert.deepEqual(studyMoves(two, new Map()).get('Rep0Open'), { total: 4, mature: 0, young: 0, fresh: 4 });
  assert.equal(studyMoves(two, replay.states).get('Other000'), undefined);
});
