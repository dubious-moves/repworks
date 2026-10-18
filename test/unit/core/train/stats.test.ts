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
import { answersOf, progressStats, type Span } from '../../../../src/core/train/stats.ts';
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
