// What a day's new moves will cost (PLAN.md §5.170): the simulation behind the line under "New
// moves a day", on a repertoire of known size (a made-up tree of 60 own moves, and smaller ones).
//
// Controls run (2026-11-12), each failing the tests named:
// - today's share not reduced by the moves already taught (`perDay` for `perDay - taughtToday`):
//   "today's share" fails, 5 taught today for 2 and the last move a day early;
// - a new move's first review at the time it is taught (the learning step left out): "a new
//   move's reviews" fails, the first review on the day taught, not the next;
// - the moves already started left out of the reviews (`reviewsAhead` not added): "added to the
//   forecast of the moves already started" fails, 0 reviews on the day e4 is due.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';
import { positionKeyOf } from '../../../../src/core/chess/positionKey.ts';
import { standardUci } from '../../../../src/core/chess/uci.ts';
import { repertoireCard, type CardId } from '../../../../src/core/progress/cards.ts';
import type { KnownEvent } from '../../../../src/core/progress/events.ts';
import { DEFAULT_PARAMS, newCard, review } from '../../../../src/core/progress/fsrs.ts';
import { Replay, type DeviceEvent } from '../../../../src/core/progress/replay.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { indexStudies } from '../../../../src/core/repertoire/index.ts';
import { movesLeft, newMovesForecast } from '../../../../src/core/train/newMoves.ts';
import { DEFAULT_TRAIN, type TrainSettings } from '../../../../src/core/train/settings.ts';
import { reviewsAhead, type Span } from '../../../../src/core/train/stats.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { asDevice, DAY, iso } from '../../../support/reviewHistory.ts';

const HOUR = 3_600_000;
const today = Date.UTC(2026, 10, 2);
/** 10:00 on a day whose midnights are UTC's. */
const now = today + 10 * HOUR;
const days = (count: number): Span[] => Array.from({ length: count }, (_, i) => ({ start: today + i * DAY, end: today + (i + 1) * DAY }));

function chapter(cid: string, moves: string, headers = ''): Chapter {
  const parsed = parseChapterFile(`[Orientation "white"]\n${headers}\n${moves} *\n`, cid);
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

// Sixty own moves: ten lines of six White moves each. Black's first move is the line's own, so no
// two lines reach the same position.
const FIRST = ['a3 a6', 'b3 b6', 'g3 c6', 'h3 d6', 'a4 e6', 'b4 g6', 'g4 h6', 'h4 a5', 'c4 b5', 'f4 h5'];
const sixty = indexStudies([
  {
    sid: 'Rep0Big0',
    kind: 'repertoire',
    chapters: FIRST.map((first, i) => chapter(`Ch${String(i).padStart(2, '0')}Line`, `1. ${first} 2. Nf3 Nf6 3. Nc3 Ng8 4. e4 Nf6 5. d4 Ng8 6. Be2`)),
  },
]);
const settings = (newPerDay: number, more: Partial<TrainSettings> = {}): TrainSettings => ({ ...DEFAULT_TRAIN, newPerDay, ...more });
const forecast = (perDay: number, taughtToday = 0, span = 14) => newMovesForecast(sixty, new Map(), settings(perDay), { now, ahead: days(span), taughtToday });

test('the repertoire of known size: sixty moves left, none started', () => {
  assert.equal(sixty.cards.size, 60);
  assert.equal(movesLeft(sixty, new Map()), 60);
});

test('the moves left are learned the day the last is taught: sixty at 20 a day in three days, at 7 in nine', () => {
  const twenty = forecast(20);
  assert.deepEqual(twenty.taught, [20, 20, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(twenty.doneIn, 2);
  const seven = forecast(7);
  assert.deepEqual(seven.taught, [7, 7, 7, 7, 7, 7, 7, 7, 4, 0, 0, 0, 0, 0]);
  assert.equal(seven.doneIn, 8);
  // Beyond the days passed: the day is counted all the same.
  assert.equal(forecast(1).doneIn, 59);
  assert.equal(forecast(1, 0, 3).doneIn, 59);
  // All of them today.
  assert.equal(forecast(60).doneIn, 0);
  assert.equal(forecast(1000).doneIn, 0);
});

test('a limit of 0 teaches nothing and has no day; nothing left has none either', () => {
  const none = forecast(0);
  assert.equal(none.left, 60);
  assert.equal(none.doneIn, undefined);
  assert.deepEqual(none.taught, Array(14).fill(0));
  assert.deepEqual(none.reviews, Array(14).fill(0));
  assert.equal(none.perDay, 0);
  const empty = newMovesForecast(indexStudies([]), new Map(), settings(20), { now, ahead: days(14), taughtToday: 0 });
  assert.deepEqual([empty.left, empty.doneIn, empty.perDay], [0, undefined, 0]);
});

test('today’s share is the limit less the moves already taught today', () => {
  const some = forecast(5, 3);
  assert.deepEqual(some.taught.slice(0, 3), [2, 5, 5]);
  // 2 today, then 58 at 5 a day: twelve more days.
  assert.equal(some.doneIn, 12);
  // The limit already reached, or passed: none today.
  assert.deepEqual(forecast(5, 5).taught.slice(0, 2), [0, 5]);
  assert.deepEqual(forecast(5, 9).taught.slice(0, 2), [0, 5]);
  assert.equal(forecast(5, 9).doneIn, 12);
});

test('a new move’s reviews: the first after the learning step, then at the scheduler’s intervals for a move answered right', () => {
  // The intervals FSRS gives a new move answered Good each time, at the retention set.
  const intervals = (retention: number): number[] => {
    const params = { ...DEFAULT_PARAMS, retention };
    const out: number[] = [];
    let c = review(newCard(), 3, 0, params);
    for (let i = 0; i < 4; i++) {
      out.push(c.scheduledDays);
      c = review(c, 3, c.due!, params);
    }
    return out;
  };
  const [first, second] = intervals(0.9);
  assert.ok(first! >= 2 && second! > first!, `${first}, ${second}`);
  // One move left, taught today at 10:00 with a 4-hour step: reviewed today, then after each interval.
  const one = indexStudies([{ sid: 'Rep0One0', kind: 'repertoire', chapters: [chapter('Ch1Onexx', '1. e4')] }]);
  const span = 1 + first! + second! + 2;
  const f = newMovesForecast(one, new Map(), settings(20), { now, ahead: days(span), taughtToday: 0 });
  const expected = Array<number>(span).fill(0);
  expected[0] = 1;
  expected[first!] = 1;
  expected[first! + second!] = 1;
  assert.deepEqual(f.reviews, expected);
  // A step that ends after midnight: the first review is tomorrow's.
  const late = newMovesForecast(one, new Map(), settings(20, { learnStepHours: 20 }), { now, ahead: days(span), taughtToday: 0 });
  assert.deepEqual(late.reviews.slice(0, 2), [0, 1]);
  assert.equal(late.reviews[1 + first!], 1);
  // A lower retention: longer intervals, so the second review comes later.
  const loose = intervals(0.8);
  assert.ok(loose[0]! > first!);
  const f80 = newMovesForecast(one, new Map(), settings(20, { retention: 0.8 }), { now, ahead: days(span), taughtToday: 0 });
  assert.equal(f80.reviews[loose[0]!], 1);
  assert.equal(f80.reviews[first!], 0);
});

test('more new moves a day are more reviews a day two weeks on, and each day’s are the moves taught before it', () => {
  const [two, four, twenty] = [forecast(2), forecast(4), forecast(20)];
  // At 2 and at 4 a day the sixty last past the fortnight: twice the moves, twice the reviews, day for day.
  assert.deepEqual(four.taught, Array(14).fill(4));
  assert.deepEqual(
    four.reviews,
    two.reviews.map((r) => r * 2),
  );
  assert.ok(two.perDay > 2, `${two.perDay}: more than the day's own first reviews`);
  assert.equal(four.perDay, two.perDay * 2);
  // The second week's mean is the mean of days 8 to 14.
  assert.equal(four.perDay, four.reviews.slice(7, 14).reduce((s, r) => s + r, 0) / 7);
  // All sixty learned in three days: fewer reviews a day two weeks on than at 4 a day, still being taught.
  assert.ok(twenty.perDay < four.perDay, `${twenty.perDay}, ${four.perDay}`);
  // Every review counted is a taught move's: 20 a day, first reviews on the day taught.
  assert.deepEqual(twenty.reviews.slice(0, 3), [20, 20, 20]);
});

test('added to the forecast of the moves already started; suspended, paused and known moves are not left to learn', () => {
  const index = indexStudies([
    {
      sid: 'Rep0Mix0',
      kind: 'repertoire',
      chapters: [chapter('Ch1Ruyxx', '1. e4 e5 2. Nf3 Nc6 3. Bb5'), chapter('Ch2Sicil', '1. e4 c5 2. c3'), chapter('Ch3Known', '1. e4 e6 2. d4 d5 3. Nc3', '[RepworksKnown "true"]\n')],
    },
  ]);
  const [E4, NF3, BB5, C3] = [card('e4'), card('e4 e5 Nf3'), card('e4 e5 Nf3 Nc6 Bb5'), card('e4 c5 c3')];
  const replay = new Replay();
  replay.add([
    // e4 reviewed three days ago: due today. Bb5 suspended.
    ev(today - 3 * DAY + HOUR, { k: 'review', card: E4, g: 3 }),
    ev(today - 3 * DAY, { k: 'suspend', card: BB5 }),
  ]);
  assert.ok(index.lines.some((l) => l.known), 'the third chapter is read as known');
  const base = { now, ahead: days(14), taughtToday: 0 };
  const started = reviewsAhead(index, replay.states, DEFAULT_TRAIN, { ...base, params: DEFAULT_PARAMS }).map((d) => d.due);
  assert.equal(started[0], 1);
  // Left: Nf3 and c3. Not e4 (started), Bb5 (suspended), nor the known chapter's d4 and Nc3.
  const left = movesLeft(index, replay.states);
  assert.equal(left, 2);
  assert.ok(index.cards.has(NF3) && index.cards.has(C3));
  // No new moves: the reviews are the started moves' alone. With them: both, day for day.
  const none = newMovesForecast(index, replay.states, settings(0), base);
  assert.deepEqual(none.reviews, started);
  const some = newMovesForecast(index, replay.states, settings(20), base);
  const fresh = newMovesForecast(index, new Map([[BB5, replay.states.get(BB5)!]]), settings(20), base);
  assert.equal(fresh.left, left);
  assert.deepEqual(
    some.reviews,
    started.map((r, i) => r + fresh.reviews[i]!),
  );
  assert.equal(some.reviews[0], 1 + left);
  // The c3 line paused: c3 is held back, e4 (on other lines too) is not.
  const paused = { ...index, lines: index.lines.map((l) => (l.cid === 'Ch2Sicil' ? { ...l, paused: true as const } : l)) };
  assert.equal(movesLeft(paused, replay.states), left - 1);
});
