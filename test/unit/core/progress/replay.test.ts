// Replay and progress files (PLAN.md §4.8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEvent, type KnownEvent } from '../../../../src/core/progress/events.ts';
import { compactions, dayFiles, readProgress, unionLogs } from '../../../../src/core/progress/files.ts';
import { foldCard, Replay, type DeviceEvent } from '../../../../src/core/progress/replay.ts';
import { State } from '../../../../src/core/progress/fsrs.ts';
import { mulberry32 } from '../../../support/random.ts';

const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const t0 = Date.UTC(2026, 9, 1, 8);

function reviewEvent(n: number, t: number, card: string, g: 1 | 2 | 3 | 4): KnownEvent {
  return { v: 1, n, t: iso(t), k: 'review', card, g };
}
const asDevice = (device: string, events: KnownEvent[]): DeviceEvent[] =>
  events.map((e) => ({ device, n: e.n, t: Date.parse(e.t), k: e.k, event: e, raw: formatEvent(e) }));

function randomHistory(seed: number, count: number, cards: number) {
  const random = mulberry32(seed);
  const events: { t: number; card: string; g: 1 | 2 | 3 | 4 }[] = [];
  let t = t0;
  for (let i = 0; i < count; i++) {
    t += Math.floor(random() * DAY * 0.3);
    events.push({ t, card: `r|card${Math.floor(random() * cards)}|e2e4`, g: (1 + Math.floor(random() * 4)) as 1 | 2 | 3 | 4 });
  }
  return events;
}

const statesOf = (r: Replay) => new Map([...r.states].sort(([a], [b]) => (a < b ? -1 : 1)));

test('shuffled input gives the same states', () => {
  const history = randomHistory(1, 2000, 60);
  const events = asDevice('Desktop1', history.map((h, i) => reviewEvent(i + 1, h.t, h.card, h.g)));
  const a = new Replay();
  a.add(events);
  const shuffled = [...events];
  const random = mulberry32(2);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  const b = new Replay();
  // Added in five batches, out of order: old events arriving late re-fold their cards.
  for (let i = 0; i < 5; i++) b.add(shuffled.slice(i * 400, (i + 1) * 400));
  assert.deepEqual(statesOf(b), statesOf(a));
});

test('two devices interleaved by time give the same states as one device doing all the reviews', () => {
  const history = randomHistory(3, 1500, 40);
  const one = new Replay();
  one.add(asDevice('Desktop1', history.map((h, i) => reviewEvent(i + 1, h.t, h.card, h.g))));
  const desktop: KnownEvent[] = [];
  const phone: KnownEvent[] = [];
  history.forEach((h, i) => (i % 3 === 0 ? phone : desktop).push(reviewEvent((i % 3 === 0 ? phone : desktop).length + 1, h.t, h.card, h.g)));
  const two = new Replay();
  two.add(asDevice('Phone001', phone));
  two.add(asDevice('Desktop1', desktop));
  assert.deepEqual(statesOf(two), statesOf(one));
});

test('a duplicate is applied once; a clash is reported; unknown kinds are skipped', () => {
  const e = asDevice('Desktop1', [reviewEvent(1, t0, 'r|k|e2e4', 3)]);
  const r = new Replay();
  r.add(e);
  r.add(e);
  assert.equal(r.states.get('r|k|e2e4')!.reviews, 1);
  r.add([{ ...e[0]!, raw: `${e[0]!.raw} ` }]);
  assert.deepEqual(r.clashes, [{ device: 'Desktop1', n: 1 }]);
  r.add([{ device: 'Desktop1', n: 2, t: t0 + 1, k: 'storm', raw: '{"v":1,"n":2,"t":"x","k":"storm"}' }]);
  assert.equal(r.states.size, 1);
});

test('suspend, unsuspend and forget', () => {
  const card = 'r|k|e2e4';
  const events = asDevice('Desktop1', [
    reviewEvent(1, t0, card, 4),
    { v: 1, n: 2, t: iso(t0 + DAY), k: 'suspend', card },
    reviewEvent(3, t0 + 2 * DAY, card, 3),
  ]);
  const s = foldCard(events);
  assert.equal(s.suspended, true);
  assert.equal(s.reviews, 2);
  assert.equal(s.firstReview, t0);
  const forgotten = foldCard([...events, ...asDevice('Desktop1', [{ v: 1, n: 4, t: iso(t0 + 3 * DAY), k: 'forget', card }, { v: 1, n: 5, t: iso(t0 + 4 * DAY), k: 'unsuspend', card }])]);
  assert.equal(forgotten.card.state, State.new);
  assert.equal(forgotten.suspended, false);
  assert.equal(forgotten.lastGrade, undefined);
});

test('a review whose clock is behind the last one (another device) counts as no time passed', () => {
  const card = 'r|k|e2e4';
  const s = foldCard([...asDevice('Phone001', [reviewEvent(1, t0 + 5 * DAY, card, 4)]), ...asDevice('Desktop1', [reviewEvent(1, t0 + 5 * DAY, card, 3)])]);
  assert.equal(s.card.elapsedDays, 0);
  assert.ok(Number.isFinite(s.card.stability));
});

test('day files by UTC day; compaction keeps every line byte for byte, unknown kinds included', () => {
  const late = Date.UTC(2026, 8, 30, 23, 59, 59);
  const files = dayFiles('Desktop1', [reviewEvent(2, late + 2000, 'r|a|e2e4', 3), reviewEvent(1, late, 'r|a|e2e4', 4), reviewEvent(3, Date.UTC(2026, 9, 2), 'r|b|d2d4', 1)]);
  assert.deepEqual([...files.keys()], ['progress/Desktop1/2026-09-30.jsonl', 'progress/Desktop1/2026-10-01.jsonl', 'progress/Desktop1/2026-10-02.jsonl']);
  const unknown = '{"v":1,"n":9,"t":"2026-09-30T10:00:00.000Z","k":"storm","extra":[1,2]}';
  files.set('progress/Desktop1/2026-09-30.jsonl', `${files.get('progress/Desktop1/2026-09-30.jsonl')}${unknown}\n`);
  files.set('progress/Phone001/2026-09-29.jsonl', '{"v":1,"n":1,"t":"2026-09-29T10:00:00.000Z","k":"review","card":"r|a|e2e4","g":2}\n');
  const [only, ...rest] = compactions('Desktop1', files, '2026-10');
  assert.deepEqual(rest, []);
  assert.equal(only!.path, 'progress/Desktop1/2026-09.jsonl');
  assert.deepEqual(only!.remove, ['progress/Desktop1/2026-09-30.jsonl']);
  assert.ok(only!.text.endsWith(`${unknown}\n`));
  // Readers take day and month files alike, and every device's.
  files.delete('progress/Desktop1/2026-09-30.jsonl');
  files.set(only!.path, only!.text);
  const { events, problems } = readProgress(files);
  assert.deepEqual(problems, []);
  assert.deepEqual(events.map((e) => `${e.device}:${e.n}`).sort(), ['Desktop1:1', 'Desktop1:2', 'Desktop1:3', 'Desktop1:9', 'Phone001:1']);
});

test('an own file that differs from the remote copy: the union of lines by n', () => {
  const a = '{"v":1,"n":1,"t":"2026-10-01T10:00:00.000Z","k":"review","card":"r|a|e2e4","g":2}\n';
  const b = '{"v":1,"n":2,"t":"2026-10-01T11:00:00.000Z","k":"review","card":"r|a|e2e4","g":3}\nbroken\n';
  const u = unionLogs([b, a]);
  assert.equal(u.text, a + b.split('\n')[0] + '\n');
  assert.equal(u.problems.length, 1);
});

test('100,000 events replay in under 200 ms', () => {
  const history = randomHistory(4, 100_000, 3000);
  const events = asDevice('Desktop1', history.map((h, i) => reviewEvent(i + 1, h.t, h.card, h.g)));
  let best = Infinity;
  for (let run = 0; run < 3; run++) {
    const start = performance.now();
    new Replay().add(events);
    best = Math.min(best, performance.now() - start);
  }
  console.log(`replay of 100,000 events: ${best.toFixed(1)} ms (best of 3)`);
  assert.ok(best < 200, `${best.toFixed(1)} ms`);
});
