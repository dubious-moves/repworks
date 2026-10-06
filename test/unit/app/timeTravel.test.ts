// Time travel and the per-device training settings (PLAN.md §5.17).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';
import { positionKeyOf } from '../../../src/core/chess/positionKey.ts';
import { standardUci } from '../../../src/core/chess/uci.ts';
import { repertoireCard } from '../../../src/core/progress/cards.ts';
import type { KnownEvent } from '../../../src/core/progress/events.ts';
import { Replay } from '../../../src/core/progress/replay.ts';
import { parseChapterFile } from '../../../src/core/pgn/parse.ts';
import { indexStudies } from '../../../src/core/repertoire/index.ts';
import { todaysQueue } from '../../../src/core/train/queue.ts';
import { DEFAULT_TRAIN } from '../../../src/core/train/settings.ts';
import { dayOf, optionsFor, type SessionKind } from '../../../src/app/train.ts';
import { decidingNow, offsetLabel, setTimeOffset, timeOffset } from '../../../src/app/time.ts';
import { DEFAULT_PREFS, parsePrefs } from '../../../src/app/trainPrefs.ts';
import { shiftedClock } from '../../../src/platform/browser.ts';
import { asDevice, iso } from '../../support/reviewHistory.ts';

const HOUR = 3_600_000;

test('the deciding clock runs the offset ahead of the real one; sleeps are real', () => {
  setTimeOffset(4 * HOUR);
  assert.equal(timeOffset.peek(), 4 * HOUR);
  const before = Date.now();
  const now = decidingNow();
  assert.ok(now - before >= 4 * HOUR && now - Date.now() <= 4 * HOUR);
  setTimeOffset(-5);
  assert.equal(timeOffset.peek(), 0, 'never behind now');
  setTimeOffset(0);
  let offset = 1000;
  const clock = shiftedClock(() => offset);
  assert.ok(Math.abs(clock.now() - Date.now() - 1000) < 50);
  offset = 0;
  assert.ok(Math.abs(clock.now() - Date.now()) < 50);
});

test('the banner says the offset as it was chosen', () => {
  assert.equal(offsetLabel(HOUR), '+1 hour');
  assert.equal(offsetLabel(24 * HOUR), '+1 day');
  assert.equal(offsetLabel(168 * HOUR), '+1 week');
  assert.equal(offsetLabel(72 * HOUR), '+3 days');
  assert.equal(offsetLabel(5 * HOUR), '+5 hours');
  assert.equal(offsetLabel(1.5 * HOUR), '+90 minutes');
});

test('time travel: a move taught now is due at +4 hours, and its review recorded at the real time is an early one', () => {
  const parsed = parseChapterFile('[Orientation "white"]\n\n1. e4 e5 *\n', 'Chapter1');
  assert.ok(parsed.ok);
  const ix = indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters: [parsed.chapter] }]);
  const e4 = repertoireCard(positionKeyOf(Chess.default()), standardUci(Chess.default(), parseSan(Chess.default(), 'e4') as NormalMove));
  const real = Date.UTC(2026, 11, 1, 9);
  const taught: KnownEvent = { v: 1, n: 1, t: iso(real), k: 'taught', card: e4 };
  const replay = new Replay();
  replay.add(asDevice('dev1', [taught]));
  // At the real time the move waits for its step; at +4 hours, the day's bounds and the step move.
  assert.equal(todaysQueue(ix, replay.states, DEFAULT_TRAIN, dayOf(real + 60_000)).due.length, 0);
  const ahead = dayOf(real + 60_000 + 4 * HOUR);
  assert.deepEqual(todaysQueue(ix, replay.states, DEFAULT_TRAIN, ahead).due.map((d) => d.card), [e4]);
  // A day ahead, the move taught counts to the real day only: the shifted day has room again.
  assert.equal(todaysQueue(ix, replay.states, DEFAULT_TRAIN, dayOf(real + 24 * HOUR)).taughtToday, 0);
  // Answered right a minute after it was taught (the real time): stability is FSRS's first Good.
  const early = new Replay();
  early.add(asDevice('dev1', [taught, { v: 1, n: 2, t: iso(real + 60_000), k: 'review', card: e4, g: 3 }]));
  const onTime = new Replay();
  onTime.add(asDevice('dev1', [taught, { v: 1, n: 2, t: iso(real + 4 * HOUR), k: 'review', card: e4, g: 3 }]));
  const a = early.states.get(e4)!.card;
  const b = onTime.states.get(e4)!.card;
  assert.equal(a.lastReview, real + 60_000);
  assert.ok(a.due! < b.due!, 'scheduled from the real time of the answer');
});

test('the per-device settings: defaults, each field checked', () => {
  assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('not json'), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs(JSON.stringify({ newMoves: 'sequence', sequenceLength: 8, lineEnd: 'go', startQueue: 'ask', startLearn: 'first', autoPlay: 'session' })), {
    newMoves: 'sequence',
    sequenceLength: 8,
    lineEnd: 'go',
    startQueue: 'ask',
    startLearn: 'first',
    autoPlay: 'session',
  });
  assert.deepEqual(parsePrefs(JSON.stringify({ autoPlay: 'always', startQueue: 3, sequenceLength: 0 })), DEFAULT_PREFS);
});

test('each session kind runs with its settings: the queue starts as set for it, Learn waits or goes on, retry and the views keep their walk', () => {
  const prefs = { ...DEFAULT_PREFS, newMoves: 'try' as const, startQueue: 'ask' as const };
  assert.deepEqual(optionsFor({ kind: 'queue' }, prefs), { autoPlay: 'due', tryNew: true, sequence: 0, lineStart: 'ask' });
  assert.deepEqual(optionsFor({ kind: 'show', scope: 's' }, prefs), { autoPlay: 'due', tryNew: true, sequence: 0, lineStart: 'ask' });
  assert.deepEqual(optionsFor({ kind: 'line', sid: 's', cid: 'c', at: ['e4'] }, prefs), { autoPlay: 'due', tryNew: true, sequence: 0, lineStart: 'auto' });
  assert.deepEqual(optionsFor({ kind: 'learn', sid: 's', cid: 'c' }, prefs), { autoPlay: 'due', tryNew: true, sequence: 0, lineStart: 'auto', holdLineEnd: true, lineEndPaces: 4 });
  assert.deepEqual(optionsFor({ kind: 'learn', sid: 's', cid: 'c' }, { ...prefs, lineEnd: 'go' }).holdLineEnd, false);
  const sequence = optionsFor({ kind: 'queue' }, { ...prefs, newMoves: 'sequence', sequenceLength: 3 });
  assert.equal(sequence.tryNew, false);
  assert.equal(sequence.sequence, 3);
  const kinds: SessionKind[] = [{ kind: 'retry' }, { kind: 'drill' }, { kind: 'pinned', all: true }, { kind: 'play', sid: 's', cid: 'c', at: [] }];
  for (const kind of kinds) assert.deepEqual(optionsFor(kind, prefs), {});
});
