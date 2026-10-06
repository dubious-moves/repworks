// Alternative moves (PLAN.md §5.18): the `alt` event, its replay, and the trainer's free retry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';
import { positionKeyOf } from '../../../../src/core/chess/positionKey.ts';
import { standardUci } from '../../../../src/core/chess/uci.ts';
import { repertoireCard, type CardId } from '../../../../src/core/progress/cards.ts';
import { formatEvent, parseLog, type KnownEvent } from '../../../../src/core/progress/events.ts';
import { newCard, State } from '../../../../src/core/progress/fsrs.ts';
import { Replay, type CardState, type DeviceEvent } from '../../../../src/core/progress/replay.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { indexStudies } from '../../../../src/core/repertoire/index.ts';
import { alternativesAt, alternativesOf } from '../../../../src/core/train/alternatives.ts';
import { planSession } from '../../../../src/core/train/plan.ts';
import { todaysQueue, type Day } from '../../../../src/core/train/queue.ts';
import { DEFAULT_TRAIN } from '../../../../src/core/train/settings.ts';
import { Trainer, type TrainerEffect } from '../../../../src/core/train/trainer.ts';
import { startPosition } from '../../../../src/core/study/tree.ts';
import { mulberry32 } from '../../../support/random.ts';
import { asDevice, DAY, iso } from '../../../support/reviewHistory.ts';

const HOUR = 3_600_000;
const start = Date.UTC(2026, 9, 5, 22);
const day: Day = { start, end: start + DAY, now: start + 9 * HOUR };

/** The card of the last move of `sans` from the start. */
function card(sans: string): CardId {
  const pos = Chess.default();
  const moves = sans.split(' ');
  for (const san of moves.slice(0, -1)) pos.play(parseSan(pos, san)!);
  return repertoireCard(positionKeyOf(pos), standardUci(pos, parseSan(pos, moves.at(-1)!) as NormalMove));
}

let n = 0;
type Bare<T> = T extends unknown ? Omit<T, 'v' | 'n' | 't'> : never;
const ev = (t: number, e: Bare<KnownEvent>, device = 'Desktop1'): DeviceEvent => asDevice(device, [{ ...e, v: 1, n: ++n, t: iso(t) } as KnownEvent])[0]!;

test('alt events round-trip, and are refused when malformed', () => {
  const on: KnownEvent = { v: 1, n: 1, t: '2026-10-05T10:00:00.000Z', k: 'alt', card: 'r|x|g1f3', on: true };
  const off: KnownEvent = { v: 1, n: 2, t: '2026-10-05T10:01:00.000Z', k: 'alt', card: 'r|x|g1f3', on: false };
  assert.equal(formatEvent(on), '{"v":1,"n":1,"t":"2026-10-05T10:00:00.000Z","k":"alt","card":"r|x|g1f3","on":true}');
  assert.deepEqual(parseLog([on, off].map(formatEvent).join('\n')).lines.map((l) => l.event), [on, off]);
  const bad = parseLog(
    [
      '{"v":1,"n":3,"t":"2026-10-05T10:00:00.000Z","k":"alt","card":"r|x|g1f3","on":"yes"}',
      '{"v":1,"n":4,"t":"2026-10-05T10:00:00.000Z","k":"alt","card":"p|x","on":true}',
    ].join('\n'),
  );
  assert.deepEqual(
    bad.problems.map((p) => p.reason),
    ['on must be true or false', 'card must be a move: r|<position>|<uci>'],
  );
});

test('alternatives: the last event of a move decides, from every device in any order; schedules untouched', () => {
  const nf3 = card('e4 e5 Nf3');
  const nc3 = card('e4 e5 Nc3');
  const events = [
    ev(start, { k: 'alt', card: nf3, on: true }, 'Desktop1'),
    ev(start + HOUR, { k: 'alt', card: nc3, on: true }, 'Phone001'),
    ev(start + 2 * HOUR, { k: 'alt', card: nf3, on: false }, 'Phone001'),
    ev(start + 3 * HOUR, { k: 'alt', card: nf3, on: true }, 'Desktop1'),
    ev(start + 4 * HOUR, { k: 'alt', card: nc3, on: false }, 'Desktop1'),
  ];
  const random = mulberry32(3);
  for (let i = 0; i < 20; i++) {
    const r = new Replay();
    for (const e of [...events].sort(() => random() - 0.5)) r.add([e]);
    assert.deepEqual([...alternativesOf(r.states.keys(), (k) => r.eventsOf(k))], [nf3]);
    // A move only saved as an alternative is a fresh card: never reviewed, never taught.
    assert.deepEqual(r.states.get(nf3), { card: newCard(), suspended: false, reviews: 0 });
  }
  const after = Chess.default();
  after.play(parseSan(after, 'e4')!);
  after.play(parseSan(after, 'e5')!);
  assert.deepEqual(alternativesAt([nf3, nc3, card('d4')], positionKeyOf(after)), ['b1c3', 'g1f3']);
  // Never counted as a move gone from the repertoire.
  const ix = indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters: [] }]);
  const r = new Replay();
  r.add([ev(start, { k: 'alt', card: nf3, on: true })]);
  assert.deepEqual(todaysQueue(ix, r.states, DEFAULT_TRAIN, day).orphaned, []);
});

// 1. e4 e5 2. Nf3 Nc6 3. Bb5, White: 2. Nf3 and 3. Bb5 due.
const parsed = parseChapterFile('[Orientation "white"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 *\n', 'Chapter1');
if (!parsed.ok) throw new Error(parsed.reason);
const chapter = parsed.chapter;
const ix = indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters: [chapter] }]);
const reviewed = (due: number): CardState => ({ card: { ...newCard(), state: State.review, stability: 3, difficulty: 5, reps: 1, lastReview: due - 3 * DAY, due }, suspended: false, reviews: 1 });
const states = new Map<string, CardState>([
  [card('e4'), reviewed(start + 5 * DAY)],
  [card('e4 e5 Nf3'), reviewed(start - DAY)],
  [card('e4 e5 Nf3 Nc6 Bb5'), reviewed(start - DAY)],
]);
const plan = planSession(ix, todaysQueue(ix, states, DEFAULT_TRAIN, day), states);
const trainerWith = (alternatives: CardId[] = [], record = true) =>
  new Trainer({ index: ix, plan, states, startOf: () => startPosition(chapter), paceMs: 600, record, alternatives, lineStart: 'first' });
const records = (effects: TrainerEffect[]) => effects.flatMap((e) => (e.type === 'record' ? [e.event] : []));
const notes = (effects: TrainerEffect[]) => effects.flatMap((e) => (e.type === 'note' ? [e.note] : []));

/** Starts, and ticks until 2. Nf3 is asked. */
function atNf3(t: Trainer): TrainerEffect[] {
  let out = t.send({ type: 'start', now: day.now });
  for (let i = 0; i < 5 && t.view.phase !== 'ask'; i++) {
    const wait = out.filter((e) => e.type === 'wait').at(-1) as { id: number };
    out = t.send({ type: 'tick', id: wait.id, now: day.now });
  }
  assert.equal(t.view.phase, 'ask');
  assert.deepEqual(t.view.path, ['e4', 'e5']);
  return out;
}

test('an alternative played is taken back for free, twice; another wrong move after it counts', () => {
  const t = trainerWith([card('e4 e5 Nc3')]);
  atNf3(t);
  for (let i = 0; i < 2; i++) {
    const out = t.send({ type: 'move', uci: 'b1c3', now: day.now + 1 });
    assert.deepEqual(notes(out), [{ kind: 'alternative', san: 'Nc3' }]);
    assert.ok(out.some((e) => e.type === 'takeback'));
    assert.equal(t.view.phase, 'ask');
    assert.equal(t.view.wrongMove, undefined, 'nothing to save');
  }
  const wrong = t.send({ type: 'move', uci: 'd2d4', now: day.now + 2 });
  assert.deepEqual(notes(wrong), [{ kind: 'wrong' }]);
  const right = t.send({ type: 'move', uci: 'g1f3', now: day.now + 3 });
  assert.deepEqual(records(right).map((r) => (r.k === 'review' ? [r.g, r.w] : r.k)), [[1, ['d2d4']]]);
});

test('an alternative alone, then the right move: Good', () => {
  const t = trainerWith([card('e4 e5 Nc3')]);
  atNf3(t);
  t.send({ type: 'move', uci: 'b1c3', now: day.now + 1 });
  const right = t.send({ type: 'move', uci: 'g1f3', now: day.now + 2 });
  assert.deepEqual(records(right).map((r) => (r.k === 'review' ? r.g : r.k)), [3]);
});

test('a wrong move saved as an alternative mid-ask: out of `w`, Good when right next; saved for the next time', () => {
  const t = trainerWith();
  atNf3(t);
  t.send({ type: 'move', uci: 'b1c3', now: day.now + 1 });
  assert.equal(t.view.phase, 'wrong');
  assert.deepEqual(t.view.wrongMove, { uci: 'b1c3', san: 'Nc3' });
  const saved = t.send({ type: 'saveAlt', now: day.now + 2 });
  assert.deepEqual(records(saved), [{ k: 'alt', card: card('e4 e5 Nc3'), on: true }]);
  assert.deepEqual(notes(saved), [{ kind: 'altSaved', san: 'Nc3' }]);
  assert.equal(t.view.phase, 'ask');
  assert.deepEqual(t.view.savedAlt, { uci: 'b1c3', san: 'Nc3' });
  // Now free.
  assert.deepEqual(notes(t.send({ type: 'move', uci: 'b1c3', now: day.now + 3 })), [{ kind: 'alternative', san: 'Nc3' }]);
  assert.equal(t.view.savedAlt, undefined, 'the undo ends with the next move');
  const right = t.send({ type: 'move', uci: 'g1f3', now: day.now + 4 });
  assert.deepEqual(records(right).map((r) => (r.k === 'review' ? [r.g, r.w] : r.k)), [[3, undefined]]);
});

test('saved after a second wrong move: the arrow goes and the ask goes on with one wrong move; the undo puts both back', () => {
  const t = trainerWith();
  atNf3(t);
  t.send({ type: 'move', uci: 'd2d4', now: day.now + 1 });
  t.send({ type: 'move', uci: 'b1c3', now: day.now + 2 });
  assert.equal(t.view.phase, 'shown');
  const saved = t.send({ type: 'saveAlt', now: day.now + 3 });
  assert.deepEqual(saved.find((e) => e.type === 'arrow'), { type: 'arrow' });
  assert.equal(t.view.phase, 'wrong');
  assert.equal(t.view.shown, undefined);
  const undone = t.send({ type: 'unsaveAlt', now: day.now + 4 });
  assert.deepEqual(records(undone), [{ k: 'alt', card: card('e4 e5 Nc3'), on: false }]);
  assert.equal(t.view.phase, 'shown');
  assert.deepEqual(undone.find((e) => e.type === 'arrow'), { type: 'arrow', uci: 'g1f3' });
  // Nc3 is wrong again.
  const right = t.send({ type: 'move', uci: 'g1f3', now: day.now + 5 });
  assert.deepEqual(records(right).map((r) => (r.k === 'review' ? [r.g, r.w] : r.k)), [[1, ['d2d4', 'b1c3']]]);
});

test('saving is recorded with grading off (a retry or the Interactive view): the owner’s choice about the position', () => {
  const t = trainerWith([], false);
  atNf3(t);
  t.send({ type: 'move', uci: 'b1c3', now: day.now + 1 });
  assert.deepEqual(records(t.send({ type: 'saveAlt', now: day.now + 2 })), [{ k: 'alt', card: card('e4 e5 Nc3'), on: true }]);
});
