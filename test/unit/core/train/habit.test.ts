// The days trained (PLAN.md §5.167): the runs of days in a row, a calendar's shades, and a day's
// work counted over spans that are local days (core has no calendar: the spans are passed in).
//
// Controls run (2026-11-11), each failing the test named and no other:
// - `runsOf` counting today's empty day as the run's end (`current` read from the loop's `run`
//   whatever today holds): "a run still stands on a day with nothing answered yet" fails, 0 for 3.
// - `shadeOf` rounding down (`Math.floor` for `Math.ceil`): "the shades" fails, a day of 31 of
//   90 left at the first shade.
// - `spanOf` taking a span's end as inside it (`t <= s.end`): "a time is found in its span"
//   fails, the time at the last span's end found in it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { positionKeyOf } from '../../../../src/core/chess/positionKey.ts';
import { repertoireCard } from '../../../../src/core/progress/cards.ts';
import type { KnownEvent } from '../../../../src/core/progress/events.ts';
import { Replay, type DeviceEvent } from '../../../../src/core/progress/replay.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { indexStudies } from '../../../../src/core/repertoire/index.ts';
import { DEFAULT_TRAIN } from '../../../../src/core/train/settings.ts';
import { progressStats, runsOf, shadeOf, shadeTop, spanOf, workOf, type DayWork, type Span } from '../../../../src/core/train/stats.ts';
import { asDevice, DAY, iso } from '../../../support/reviewHistory.ts';

const HOUR = 3_600_000;

/** Days in a row from `work`, a day's answers each (today last). */
const days = (...work: number[]): DayWork[] => work.map((answers, i) => ({ start: i * DAY, end: (i + 1) * DAY, minutes: 0, answers, taught: 0 }));

test('the run of days in a row counts today once something is answered', () => {
  assert.deepEqual(runsOf(days(0, 4, 2, 9)), { current: 3, longest: 3, today: true });
  assert.deepEqual(runsOf(days(5)), { current: 1, longest: 1, today: true });
});

test('a run still stands on a day with nothing answered yet, and ends the day after', () => {
  // Trained three days, nothing yet today: the run is yesterday's.
  assert.deepEqual(runsOf(days(0, 4, 2, 9, 0)), { current: 3, longest: 3, today: false });
  // Nothing yesterday either: the run is over.
  assert.deepEqual(runsOf(days(4, 2, 9, 0, 0)), { current: 0, longest: 3, today: false });
  assert.deepEqual(runsOf(days(0, 0)), { current: 0, longest: 0, today: false });
  assert.deepEqual(runsOf([]), { current: 0, longest: 0, today: false });
});

test('a gap ends a run, and the longest run is kept', () => {
  //                          a run of 4       gap  2      gap  today's run of 3
  assert.deepEqual(runsOf(days(1, 1, 1, 1, 0, 3, 3, 0, 0, 7, 1, 2)), { current: 3, longest: 4, today: true });
  // The longest is the one still running.
  assert.deepEqual(runsOf(days(1, 1, 0, 1, 1, 1)), { current: 3, longest: 3, today: true });
});

test('a day of new moves alone is a day trained', () => {
  const taught: DayWork = { start: 0, end: DAY, minutes: 3, answers: 0, taught: 12 };
  assert.equal(workOf(taught), 12);
  assert.deepEqual(runsOf([taught, ...days(2).map((d) => ({ ...d, start: DAY, end: 2 * DAY }))]), { current: 2, longest: 2, today: true });
});

test('the shades: none, then the thirds of the busiest day’s work', () => {
  assert.equal(shadeOf(0, 90), 0);
  assert.deepEqual(
    [1, 30, 31, 60, 61, 90].map((w) => shadeOf(w, 90)),
    [1, 1, 2, 2, 3, 3],
  );
  // The bounds a legend names are the ones the shades are cut at.
  assert.deepEqual(
    [0, 1, 2, 3].map((s) => shadeTop(s, 90)),
    [0, 30, 60, 90],
  );
  for (const busiest of [1, 2, 3, 4, 5, 7, 10, 100, 101]) {
    for (let w = 1; w <= busiest; w++) {
      const s = shadeOf(w, busiest);
      assert.ok(s >= 1 && s <= 3, `${w} of ${busiest}`);
      assert.ok(w <= shadeTop(s, busiest) && w > shadeTop(s - 1, busiest), `${w} of ${busiest}: shade ${s}`);
    }
    assert.equal(shadeOf(busiest, busiest), 3);
  }
  // A busiest day of one answer: every day trained is the darkest; nothing is below it.
  assert.equal(shadeOf(1, 1), 3);
  // More than the busiest known (a count from another span): the darkest, never a fourth shade.
  assert.equal(shadeOf(200, 90), 3);
  assert.equal(shadeOf(5, 0), 3);
});

test('a time is found in its span, and in none before, between or after them', () => {
  const spans: Span[] = [
    { start: 10, end: 20 },
    { start: 20, end: 30 },
    { start: 40, end: 50 },
  ];
  assert.deepEqual(
    [9, 10, 19, 20, 29, 30, 39, 40, 49, 50].map((t) => spanOf(spans, t)),
    [-1, 0, 0, 1, 1, -1, -1, 2, 2, -1],
  );
  assert.equal(spanOf([], 5), -1);
});

const chapter = parseChapterFile('[Orientation "white"]\n\n1. e4 e5 2. Nf3 *\n', 'Ch1Openx');
if (!chapter.ok) throw new Error(chapter.reason);
const index = indexStudies([{ sid: 'Rep0Open', kind: 'repertoire', chapters: [chapter.chapter] }]);
const E4 = repertoireCard(positionKeyOf(Chess.default()), 'e2e4');
let n = 0;
type Bare<T> = T extends unknown ? Omit<T, 'v' | 'n' | 't'> : never;
const ev = (t: number, e: Bare<KnownEvent>): DeviceEvent => asDevice('Desktop1', [{ ...e, v: 1, n: ++n, t: iso(t) } as KnownEvent])[0]!;

test('a day across midnight local time: an answer belongs to the local day it was given on', () => {
  assert.ok(index.cards.has(E4));
  // A device two hours ahead of UTC: its days run from 22:00 UTC to 22:00 UTC.
  const midnight = Date.UTC(2026, 9, 6, 22);
  const local = (from: number, count: number): Span[] => Array.from({ length: count }, (_, i) => ({ start: from + i * DAY, end: from + (i + 1) * DAY }));
  const past = local(midnight - 2 * DAY, 3);
  const replay = new Replay();
  replay.add([
    // 23:58 and 23:59 on the 6th, local time: the same UTC day as the next two.
    ev(midnight - 2 * 60_000, { k: 'taught', card: E4 }),
    ev(midnight - 60_000, { k: 'review', card: E4, g: 3 }),
    // Midnight exactly and 00:01 on the 7th.
    ev(midnight, { k: 'review', card: E4, g: 3 }),
    ev(midnight + 60_000, { k: 'review', card: E4, g: 3 }),
  ]);
  const stats = progressStats(index, replay.states, (c) => replay.eventsOf(c), DEFAULT_TRAIN, { now: midnight + HOUR, since: midnight - 30 * DAY, ahead: [], past });
  assert.deepEqual(
    stats.days.map((d) => [d.answers, d.taught, d.minutes]),
    [
      [0, 0, 0],
      [1, 1, 1],
      // The minute from 23:59 to midnight is counted on the later answer's day.
      [2, 0, 2],
    ],
  );
  assert.deepEqual(runsOf(stats.days), { current: 2, longest: 2, today: true });
});

test('half a year of days is counted as the fortnight was: the same last 14, and work before them', () => {
  const today = Date.UTC(2026, 9, 1);
  const span = (count: number): Span[] => Array.from({ length: count }, (_, i) => ({ start: today - (count - 1 - i) * DAY, end: today - (count - 2 - i) * DAY }));
  const replay = new Replay();
  replay.add([
    ev(today - 100 * DAY + HOUR, { k: 'review', card: E4, g: 3 }),
    ev(today - 13 * DAY + HOUR, { k: 'review', card: E4, g: 3 }),
    ev(today - 13 * DAY + HOUR + 60_000, { k: 'review', card: E4, g: 3 }),
    ev(today + HOUR, { k: 'review', card: E4, g: 3 }),
  ]);
  const count = (past: Span[]) => progressStats(index, replay.states, (c) => replay.eventsOf(c), DEFAULT_TRAIN, { now: today + 2 * HOUR, since: today - 30 * DAY, ahead: [], past }).days;
  const [fortnight, half] = [count(span(14)), count(span(182))];
  assert.deepEqual(half.slice(-14), fortnight);
  assert.deepEqual(fortnight.map((d) => d.answers), [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
  assert.equal(half.length, 182);
  assert.equal(half[182 - 101]!.answers, 1);
  assert.equal(half.reduce((s, d) => s + d.answers, 0), 4);
});
