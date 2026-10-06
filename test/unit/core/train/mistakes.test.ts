// Mistakes, retry, drill and pins (PLAN.md §5.8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';
import { positionKeyOf } from '../../../../src/core/chess/positionKey.ts';
import { standardUci } from '../../../../src/core/chess/uci.ts';
import { repertoireCard, type CardId } from '../../../../src/core/progress/cards.ts';
import { formatEvent, parseLog, type KnownEvent } from '../../../../src/core/progress/events.ts';
import { Replay, type DeviceEvent } from '../../../../src/core/progress/replay.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { indexStudies } from '../../../../src/core/repertoire/index.ts';
import { drillLines, retryLines, todaysMistakes } from '../../../../src/core/train/mistakes.ts';
import { pinOf, pinsOf, PIN_STEPS_MS } from '../../../../src/core/train/pins.ts';
import type { Day } from '../../../../src/core/train/queue.ts';
import { Trainer, type TrainerEffect } from '../../../../src/core/train/trainer.ts';
import { startPosition } from '../../../../src/core/study/tree.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { mulberry32 } from '../../../support/random.ts';
import { asDevice, DAY, iso } from '../../../support/reviewHistory.ts';

const MIN = 60_000;
const HOUR = 60 * MIN;
const start = Date.UTC(2026, 9, 5, 22);
const day: Day = { start, end: start + DAY, now: start + 9 * HOUR };

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
const ev = (t: number, e: Bare<KnownEvent>, device = 'Desktop1'): DeviceEvent => asDevice(device, [{ ...e, v: 1, n: ++n, t: iso(t) } as KnownEvent])[0]!;

test('pin, unpin and drill events round-trip, and are refused when malformed', () => {
  const events: KnownEvent[] = [
    { v: 1, n: 1, t: '2026-10-05T10:00:00.000Z', k: 'pin', card: 'r|x|e2e4' },
    { v: 1, n: 2, t: '2026-10-05T10:31:00.000Z', k: 'drill', card: 'r|x|e2e4', ok: true },
    { v: 1, n: 3, t: '2026-10-05T10:32:00.000Z', k: 'drill', card: 'r|x|e2e4', ok: false },
    { v: 1, n: 4, t: '2026-10-05T10:33:00.000Z', k: 'unpin', card: 'r|x|e2e4' },
  ];
  const text = events.map(formatEvent).join('\n');
  assert.equal(formatEvent(events[1]!), '{"v":1,"n":2,"t":"2026-10-05T10:31:00.000Z","k":"drill","card":"r|x|e2e4","ok":true}');
  assert.deepEqual(parseLog(text).lines.map((l) => l.event), events);
  const bad = parseLog('{"v":1,"n":5,"t":"2026-10-05T10:33:00.000Z","k":"drill","card":"r|x|e2e4","ok":1}');
  assert.equal(bad.problems.length, 1);
});

test('pins and drills never change a card’s FSRS state', () => {
  const c = card('e4');
  const reviews = [ev(start, { k: 'review', card: c, g: 1 }), ev(start + 2 * DAY, { k: 'review', card: c, g: 3 })];
  const pins = [ev(start + HOUR, { k: 'pin', card: c }), ev(start + 2 * HOUR, { k: 'drill', card: c, ok: true }), ev(start + 3 * HOUR, { k: 'drill', card: c, ok: false }), ev(start + 4 * HOUR, { k: 'unpin', card: c })];
  const a = new Replay();
  a.add(reviews);
  const b = new Replay();
  b.add([...pins, ...reviews]);
  assert.deepEqual(b.states.get(c), a.states.get(c));
});

test('a pin: due 30 minutes after, then 4 hours, then 24 hours; three clean answers retire it', () => {
  const c = 'r|x|e2e4';
  const t0 = start;
  let events = [ev(t0, { k: 'pin', card: c })];
  assert.deepEqual(pinOf(events), { pinned: true, streak: 0, due: t0 + 30 * MIN, pinnedAt: t0, retired: false });
  // Early: drilled on request, no credit.
  events = [...events, ev(t0 + 10 * MIN, { k: 'drill', card: c, ok: true })];
  assert.equal(pinOf(events)!.streak, 0);
  events = [...events, ev(t0 + 31 * MIN, { k: 'drill', card: c, ok: true })];
  assert.deepEqual(pinOf(events), { pinned: true, streak: 1, due: t0 + 31 * MIN + PIN_STEPS_MS[1], pinnedAt: t0, retired: false });
  const t2 = t0 + 31 * MIN + 4 * HOUR;
  events = [...events, ev(t2, { k: 'drill', card: c, ok: true })];
  assert.equal(pinOf(events)!.due, t2 + 24 * HOUR);
  // A miss sends it back to the first step.
  const t3 = t2 + HOUR;
  const missed = pinOf([...events, ev(t3, { k: 'drill', card: c, ok: false })])!;
  assert.deepEqual([missed.streak, missed.due, missed.pinned], [0, t3 + 30 * MIN, true]);
  // The third clean answer in a row, on time, retires it.
  events = [...events, ev(t2 + 24 * HOUR, { k: 'drill', card: c, ok: true })];
  assert.deepEqual(pinOf(events), { pinned: false, streak: 3, due: t2 + 24 * HOUR, pinnedAt: t0, retired: true });
  // Pinned again later: a fresh start.
  const again = pinOf([...events, ev(t2 + 30 * HOUR, { k: 'pin', card: c })])!;
  assert.deepEqual([again.pinned, again.streak, again.retired], [true, 0, false]);
  // Unpinned: drills no longer count.
  assert.equal(pinOf([ev(t0, { k: 'pin', card: c }), ev(t0 + MIN, { k: 'unpin', card: c }), ev(t0 + HOUR, { k: 'drill', card: c, ok: true })])!.pinned, false);
});

test('two devices’ drill events, interleaved and added in any order, give the same pins', () => {
  const c = 'r|x|e2e4';
  const events = [
    ev(start, { k: 'pin', card: c }, 'Desktop1'),
    ev(start + 40 * MIN, { k: 'drill', card: c, ok: true }, 'Phone001'),
    ev(start + 5 * HOUR, { k: 'drill', card: c, ok: false }, 'Desktop1'),
    ev(start + 6 * HOUR, { k: 'drill', card: c, ok: true }, 'Phone001'),
  ];
  const expected = (() => {
    const r = new Replay();
    r.add(events);
    return pinsOf(r.states.keys(), (k) => r.eventsOf(k));
  })();
  assert.deepEqual(expected.get(c)!.streak, 1);
  const random = mulberry32(7);
  for (let i = 0; i < 20; i++) {
    const shuffled = [...events].sort(() => random() - 0.5);
    const r = new Replay();
    for (const e of shuffled) r.add([e]);
    assert.deepEqual(pinsOf(r.states.keys(), (k) => r.eventsOf(k)), expected);
  }
});

const ch = chapter('Chapter1', '1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5) 3... a6');
const ix = indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters: [ch] }]);

test('the day’s mistakes: Again reviews of the day, one per card, with the moves tried and a line', () => {
  const replay = new Replay();
  replay.add([
    ev(start - HOUR, { k: 'review', card: card('e4'), g: 1 }),
    ev(start + HOUR, { k: 'review', card: card('e4 e5 Nf3'), g: 3 }),
    ev(start + 2 * HOUR, { k: 'review', card: card('e4 e5 Nf3 Nc6 Bc4'), g: 1, w: ['f1b5'] }, 'Phone001'),
    ev(start + 3 * HOUR, { k: 'review', card: card('e4 e5 Nf3 Nc6 Bb5'), g: 1, h: 1 }),
    ev(start + 4 * HOUR, { k: 'review', card: card('e4 e5 Nf3 Nc6 Bc4'), g: 1, w: ['d2d4'] }),
  ]);
  const mistakes = todaysMistakes(ix, (c) => replay.eventsOf(c), day);
  assert.deepEqual(
    mistakes.map((m) => [m.at.san, m.wrong, m.hint, m.line.path.join(' '), m.ply]),
    [
      ['Bb5', [], true, 'e4 e5 Nf3 Nc6 Bb5 a6', 4],
      ['Bc4', ['d2d4'], false, 'e4 e5 Nf3 Nc6 Bc4 Bc5', 4],
    ],
  );
});

function run(t: Trainer, moves: (n: number) => string) {
  const effects: TrainerEffect[] = [];
  let wait: { id: number } | undefined;
  let now = day.now;
  let asked = 0;
  const send = (out: TrainerEffect[]) => {
    effects.push(...out);
    for (const e of out) if (e.type === 'wait') wait = e;
  };
  send(t.send({ type: 'start', now }));
  for (let guard = 0; guard < 1000 && t.view.phase !== 'sessionDone'; guard++) {
    now += 1000;
    if (['ask', 'wrong', 'shown'].includes(t.view.phase)) send(t.send({ type: 'move', uci: moves(asked++), now }));
    else send(t.send({ type: 'tick', id: wait!.id, now }));
  }
  return effects;
}

test('retry walks from the start up to the move and asks only it; drill starts with the lead-in; nothing is recorded', () => {
  const items = [{ card: card('e4 e5 Nf3 Nc6 Bc4'), line: ix.lines[1]!, ply: 4 }];
  const setup = { index: ix, states: new Map(), startOf: () => startPosition(ch), paceMs: 450, record: false, askOnly: true };
  const retry = run(new Trainer({ ...setup, plan: { lines: retryLines(items) } }), () => 'f1c4');
  assert.deepEqual(retry.filter((e) => e.type === 'play').map((e) => e.type === 'play' && `${e.by}:${e.san}`), ['auto:e4', 'opponent:e5', 'auto:Nf3', 'opponent:Nc6', 'user:Bc4']);
  assert.deepEqual(retry.filter((e) => e.type === 'record'), []);
  assert.deepEqual(retry.filter((e) => e.type === 'answer'), [{ type: 'answer', card: items[0]!.card, ok: true }]);

  const drill = run(new Trainer({ ...setup, plan: { lines: drillLines(items) } }), (k) => (k === 0 ? 'f1b5' : 'f1c4'));
  assert.deepEqual(drill.find((e) => e.type === 'line'), { type: 'line', line: ix.lines[1], number: 1, total: 1, kind: 'review', path: ['e4', 'e5', 'Nf3'] });
  assert.deepEqual(drill.filter((e) => e.type === 'play').map((e) => e.type === 'play' && `${e.by}:${e.san}`), ['opponent:Nc6', 'user:Bc4']);
  // Bb5 is in the repertoire here too, but drill asks the move it drills.
  assert.deepEqual(drill.filter((e) => e.type === 'answer'), [{ type: 'answer', card: items[0]!.card, ok: true }]);
});
