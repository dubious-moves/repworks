// Storm answers in the progress log (PLAN.md §5.41): the event kind, what is done and missed, the
// deal order, and the record. lichessable's retention rule (dev/check-storm.js section 15) and its
// record's denominators (section 9 of its second half), read from events.
//
// Controls re-run on this port (2026-10-07), each failing exactly the named assertions:
// - the draw sorting misses first (hardest first, the rule §14.15 reversed) → "the deal order";
// - `unknown` counted as graded → "the record's denominators".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEvent, parseLog, type KnownEvent } from '../../../../src/core/progress/events.ts';
import { toDeviceEvents, type DeviceEvent } from '../../../../src/core/progress/replay.ts';
import { stormCard, puzzleCard } from '../../../../src/core/progress/cards.ts';
import type { PositionKey } from '../../../../src/core/chess/positionKey.ts';
import { STORM as C } from '../../../../src/core/storm/config.ts';
import { drawOrder, stormAnswer, stormHistories, stormHistory } from '../../../../src/core/storm/store.ts';
import { averageWp, foundShare, stormRecord } from '../../../../src/core/storm/record.ts';

const DAY = 86_400_000;
const KEY = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq -' as PositionKey;

test('the storm kind: read, written in a fixed order, bad fields refused, an old reader skipping it', () => {
  const line = '{"v":1,"n":4,"t":"2026-10-07T10:00:00.000Z","k":"storm","card":"s|' + KEY + '","b":"good","u":"g1f3","wp":34,"m":"set","c":"S1/c1"}';
  const { lines, problems } = parseLog(line);
  assert.deepEqual(problems, []);
  const e = lines[0]!.event as KnownEvent;
  assert.deepEqual(e, { v: 1, n: 4, t: '2026-10-07T10:00:00.000Z', k: 'storm', card: 's|' + KEY, b: 'good', u: 'g1f3', wp: 34, m: 'set', c: 'S1/c1' });
  assert.equal(formatEvent(e), line);
  const bad = (fields: string) => parseLog('{"v":1,"n":1,"t":"2026-10-07T10:00:00.000Z","k":"storm",' + fields + '}').problems.length;
  assert.equal(bad('"card":"r|x|e2e4","b":"good"'), 1);
  assert.equal(bad('"card":"z|AbC12","b":"fine"'), 1);
  assert.equal(bad('"card":"z|AbC12","b":"good","u":"e9e4"'), 1);
  assert.equal(bad('"card":"z|AbC12","b":"good","wp":2.5'), 1);
  assert.equal(bad('"card":"z|AbC12","b":"good","m":"storm"'), 1);
  assert.equal(bad('"card":"z|AbC12","b":"good","c":"nochapter"'), 1);
  assert.equal(bad('"card":"z|AbC12","b":"blunder"'), 0);
  // A reader that doesn't know the kind (v 2, say) keeps the line and skips it.
  const later = parseLog('{"v":2,"n":5,"t":"2026-10-07T10:00:00.000Z","k":"storm","card":"s|x","b":"new"}');
  assert.deepEqual([later.problems.length, later.lines[0]!.event], [0, undefined]);
  assert.deepEqual(stormAnswer(stormCard(KEY), 'bad', { uci: 'a2a3', wp: 12.34, chapter: 'S1/c1' }), { k: 'storm', card: 's|' + KEY, b: 'bad', u: 'a2a3', wp: 123, c: 'S1/c1' });
  assert.deepEqual(stormAnswer(puzzleCard('AbC12'), 'great', { set: true }), { k: 'storm', card: 'z|AbC12', b: 'great', m: 'set' });
});

let n = 0;
const ev = (device: string, card: string, b: string, t: number, extra = ''): DeviceEvent =>
  toDeviceEvents(device, parseLog(`{"v":1,"n":${++n},"t":"${new Date(t).toISOString()}","k":"storm","card":"${card}","b":"${b}"${extra}}`).lines)[0]!;

test('done: answered well on any device, for 60 days; a later miss brings it back', () => {
  const now = Date.UTC(2026, 9, 7);
  const card = stormCard(KEY);
  assert.deepEqual(stormHistory([ev('phone', card, 'great', now - DAY)], now, C), { done: true, misses: 0, answers: 1, last: now - DAY });
  assert.equal(stormHistory([ev('phone', card, 'good', now - 61 * DAY)], now, C).done, false);
  assert.equal(stormHistory([ev('desk', card, 'good', now - 2 * DAY), ev('phone', card, 'blunder', now - DAY)], now, C).done, false);
  assert.equal(stormHistory([ev('desk', card, 'ok', now - 2 * DAY)], now, C).done, false);
  // Near the epoch: a clean answer at t 0 is no answer (lichessable's zero-tombstone trap, §29).
  assert.equal(stormHistory([ev('desk', card, 'good', 0)], 1000, C).done, false);
});

test('misses: answers since the last clean one, unknown aside', () => {
  const now = Date.UTC(2026, 9, 7);
  const card = puzzleCard('AbC12');
  const h = stormHistory([ev('d', card, 'blunder', now - 5), ev('d', card, 'unknown', now - 4), ev('d', card, 'ok', now - 3)], now, C);
  assert.deepEqual([h.done, h.misses, h.answers], [false, 2, 3]);
  const all = stormHistories([card, 'r|x|e2e4', stormCard(KEY)], (c) => (c === card ? [ev('d', card, 'bad', now - 1)] : []), now, C);
  assert.deepEqual([...all.keys()], [card, stormCard(KEY)]);
});

test('the deal order: done left out, unseen first, misses to the back, then deepened, then reach', () => {
  const h = new Map([
    ['s|done', { done: true, misses: 0, answers: 1 }],
    ['s|missed2', { done: false, misses: 2, answers: 2 }],
    ['s|missed1', { done: false, misses: 1, answers: 1 }],
  ]);
  const items = [{ card: 's|done' }, { card: 's|missed2' }, { card: 's|missed1' }, { card: 's|new' }, { card: 's|newdeep', deep: true }, { card: 's|newreach', games: 5000 }];
  assert.deepEqual(
    drawOrder(items, h, () => 0.5).map((i) => i.card),
    ['s|newdeep', 's|newreach', 's|new', 's|missed1', 's|missed2'],
  );
});

test('the record’s denominators: positions and puzzles apart, unknown out, by chapter, sets marked', () => {
  const t = Date.UTC(2026, 9, 7);
  const events = [
    ev('d', 's|a', 'great', t, ',"wp":0,"c":"S1/c1"'),
    ev('d', 's|b', 'ok', t, ',"wp":80,"c":"S1/c1"'),
    ev('d', 's|c', 'unknown', t, ',"c":"S1/c2"'),
    ev('d', 's|d', 'good', t, ',"wp":40,"m":"set","c":"S1/c2"'),
    ev('d', 'z|P1', 'blunder', t, ',"c":"S1/c1"'),
    ev('d', 'z|P2', 'great', t - DAY),
  ];
  const r = stormRecord(events);
  assert.deepEqual([r.positions.answered, r.positions.graded, r.positions.found, r.positions.set], [4, 3, 2, 1]);
  assert.equal(foundShare(r.positions)!.toFixed(1), '66.7');
  assert.equal(averageWp(r.positions), 4);
  assert.deepEqual([r.puzzles.answered, r.puzzles.found], [2, 1]);
  assert.deepEqual(r.chapters.get('S1/c1')!.positions.bands, { great: 1, good: 0, ok: 1, bad: 0, blunder: 0, unknown: 0 });
  assert.equal(r.chapters.get('S1/c1')!.puzzles.answered, 1);
  assert.equal(stormRecord(events, t).puzzles.answered, 1);
  assert.equal(foundShare(stormRecord([]).positions), null);
});
