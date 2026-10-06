// The daily queue (PLAN.md §5.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';
import { positionKeyOf } from '../../../../src/core/chess/positionKey.ts';
import { standardUci } from '../../../../src/core/chess/uci.ts';
import { repertoireCard, type CardId } from '../../../../src/core/progress/cards.ts';
import type { KnownEvent } from '../../../../src/core/progress/events.ts';
import { newCard, State } from '../../../../src/core/progress/fsrs.ts';
import { Replay, type CardState } from '../../../../src/core/progress/replay.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { indexStudies } from '../../../../src/core/repertoire/index.ts';
import { todaysQueue, type Day } from '../../../../src/core/train/queue.ts';
import { DEFAULT_TRAIN } from '../../../../src/core/train/settings.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { mulberry32 } from '../../../support/random.ts';
import { asDevice, DAY, iso, reviewEvent } from '../../../support/reviewHistory.ts';

const HOUR = 3_600_000;

function chapter(cid: string, side: string, moves: string, known = false): Chapter {
  const parsed = parseChapterFile(`[Orientation "${side}"]\n${known ? '[RepworksKnown "true"]\n' : ''}\n${moves} *\n`, cid);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.chapter;
}

/** The card of the last move of `sans`, from the standard start. */
function card(sans: string): CardId {
  const pos = Chess.default();
  const moves = sans.split(' ');
  for (const san of moves.slice(0, -1)) pos.play(parseSan(pos, san)!);
  const move = parseSan(pos, moves.at(-1)!)!;
  return repertoireCard(positionKeyOf(pos), standardUci(pos, move as NormalMove));
}

// Today in a time zone two hours ahead of UTC: local midnight is 22:00 UTC the day before.
const start = Date.UTC(2026, 9, 5, 22);
const day = (now = start + 9 * HOUR): Day => ({ start, end: start + DAY, now });

const reviewed = (due: number, extra: Partial<CardState> = {}): CardState => ({
  card: { ...newCard(), state: State.review, stability: 3, difficulty: 5, reps: 1, lastReview: due - 3 * DAY, due },
  suspended: false,
  reviews: 1,
  ...extra,
});
const taught = (at: number): CardState => ({ card: newCard(), suspended: false, reviews: 0, taught: at });

const index = (...studies: { sid: string; chapters: Chapter[] }[]) => indexStudies(studies.map((s) => ({ ...s, kind: 'repertoire' as const })));

test('due today by local day: 23:59 counts, 00:01 the next day does not', () => {
  const ix = index({ sid: 'Study001', chapters: [chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5')] });
  const [e4, nf3, bb5] = [card('e4'), card('e4 e5 Nf3'), card('e4 e5 Nf3 Nc6 Bb5')];
  const states = new Map<string, CardState>([
    [e4, reviewed(start + DAY - 60_000)],
    [nf3, reviewed(start + DAY + 60_000)],
    [bb5, reviewed(start - 5 * DAY)],
  ]);
  const q = todaysQueue(ix, states, DEFAULT_TRAIN, day());
  // The earliest first; the card due tomorrow is left out, even though it is less than a UTC day away.
  assert.deepEqual(q.due.map((d) => d.card), [bb5, e4]);
  assert.ok(q.due.every((d) => !d.learning));
});

test('a taught card comes due when its learning step has passed, and waits in `later` until then', () => {
  const ix = index({ sid: 'Study001', chapters: [chapter('Chapter1', 'white', '1. e4 e5 2. Nf3')] });
  const e4 = card('e4');
  const states = new Map([[e4, taught(start + 10 * HOUR)]]);
  const before = todaysQueue(ix, states, DEFAULT_TRAIN, day(start + 14 * HOUR - 1));
  assert.deepEqual([before.due.length, before.later.map((d) => d.card)], [0, [e4]]);
  const after = todaysQueue(ix, states, DEFAULT_TRAIN, day(start + 14 * HOUR));
  assert.deepEqual(after.due, [{ card: e4, due: start + 14 * HOUR, learning: true }]);
  assert.equal(after.later.length, 0);
  // Taught late in the evening: due tomorrow, not later today.
  const late = todaysQueue(ix, new Map([[e4, taught(start + 22 * HOUR)]]), DEFAULT_TRAIN, day(start + 23 * HOUR));
  assert.deepEqual([late.due.length, late.later.length], [0, 0]);
  // The step is a setting.
  const short = todaysQueue(ix, states, { ...DEFAULT_TRAIN, learnStepHours: 1 }, day(start + 11 * HOUR));
  assert.equal(short.due.length, 1);
});

test('cards taught today use the room; cards taught yesterday do not', () => {
  const ix = index({ sid: 'Study001', chapters: [chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5 4. c3) 3... a6 4. Ba4')] });
  const states = new Map<string, CardState>([
    [card('e4'), taught(start - HOUR)],
    [card('e4 e5 Nf3'), taught(start + HOUR)],
  ]);
  const q = todaysQueue(ix, states, { ...DEFAULT_TRAIN, newPerDay: 3 }, day());
  assert.equal(q.taughtToday, 1);
  assert.equal(q.room, 2);
  // The first line still brings Bb5 and Ba4: two, which fills the room.
  assert.deepEqual(q.newLines.map((l) => l.path.join(' ')), ['e4 e5 Nf3 Nc6 Bb5 a6 Ba4']);
  assert.deepEqual(q.newCards, [card('e4 e5 Nf3 Nc6 Bb5'), card('e4 e5 Nf3 Nc6 Bb5 a6 Ba4')]);
});

test('a line once taken is taken whole, past the limit; a shared prefix counts once', () => {
  const ix = index({
    sid: 'Study001',
    chapters: [chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5 4. c3 Nf6 5. d4) 3... a6'), chapter('Chapter2', 'white', '1. d4 d5 2. c4')],
  });
  // Line 1 brings e4, Nf3, Bb5 (3); line 2 shares e4 and Nf3 and brings Bc4, c3, d4 (3).
  const one = todaysQueue(ix, new Map(), { ...DEFAULT_TRAIN, newPerDay: 4 }, day());
  assert.deepEqual(one.newLines.map((l) => l.path.length), [6, 9]);
  assert.equal(one.newCards.length, 6);
  assert.equal(new Set(one.newCards).size, 6);
  // A limit the first line fills takes only that line.
  const two = todaysQueue(ix, new Map(), { ...DEFAULT_TRAIN, newPerDay: 3 }, day());
  assert.deepEqual(two.newCards.length, 3);
  // A limit of 0: nothing new.
  assert.equal(todaysQueue(ix, new Map(), { ...DEFAULT_TRAIN, newPerDay: 0 }, day()).newLines.length, 0);
  // A line whose new cards an earlier line already brings is not taken.
  const twin = index({ sid: 'Study001', chapters: [chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 (2... d6)')] });
  assert.equal(todaysQueue(twin, new Map(), DEFAULT_TRAIN, day()).newLines.length, 1);
});

test('lines with nothing new are passed over, and the next line with something new is taken', () => {
  const ix = index({ sid: 'Study001', chapters: [chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 (2. Bc4)')] });
  const states = new Map<string, CardState>([
    [card('e4'), reviewed(start + 3 * DAY)],
    [card('e4 e5 Nf3'), reviewed(start + 3 * DAY)],
  ]);
  const q = todaysQueue(ix, states, DEFAULT_TRAIN, day());
  assert.deepEqual(q.newLines.map((l) => l.path.join(' ')), ['e4 e5 Bc4']);
  assert.deepEqual(q.newCards, [card('e4 e5 Bc4')]);
});

test('known chapters go to their own pool: never taught first, never using the limit', () => {
  const ix = index({
    sid: 'Study001',
    chapters: [chapter('Known001', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5', true), chapter('Chapter2', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3')],
  });
  const q = todaysQueue(ix, new Map(), { ...DEFAULT_TRAIN, newPerDay: 1 }, day());
  // e4 and Nf3 are on the known line: known everywhere, so the new line teaches Bc4 and c3 only.
  assert.deepEqual(q.newCards, [card('e4 e5 Nf3 Nc6 Bc4'), card('e4 e5 Nf3 Nc6 Bc4 Bc5 c3')]);
  assert.deepEqual(q.knownLines.map((l) => l.cid), ['Known001']);
  assert.deepEqual(q.knownCards, [card('e4'), card('e4 e5 Nf3'), card('e4 e5 Nf3 Nc6 Bb5')]);
  // The pool is offered whatever the limit, and takes no room.
  const none = todaysQueue(ix, new Map(), { ...DEFAULT_TRAIN, newPerDay: 0 }, day());
  assert.deepEqual([none.knownCards.length, none.newCards.length, none.room], [3, 0, 0]);
  // A known card once reviewed leaves the pool, and becomes an ordinary due card.
  const states = new Map([[card('e4'), reviewed(start + HOUR)]]);
  const after = todaysQueue(ix, states, DEFAULT_TRAIN, day());
  assert.deepEqual(after.knownCards, [card('e4 e5 Nf3'), card('e4 e5 Nf3 Nc6 Bb5')]);
  assert.deepEqual(after.due.map((d) => d.card), [card('e4')]);
});

test('suspended and orphaned cards are left out; orphans are counted', () => {
  const ix = index({ sid: 'Study001', chapters: [chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 (2. Bc4)')] });
  const gone = card('d4');
  const states = new Map<string, CardState>([
    [card('e4'), reviewed(start, { suspended: true })],
    [card('e4 e5 Nf3'), { card: newCard(), suspended: true, reviews: 0 }],
    [gone, reviewed(start)],
    ['p|someplan', reviewed(start)],
  ]);
  const q = todaysQueue(ix, states, DEFAULT_TRAIN, day());
  assert.deepEqual(q.due, []);
  assert.deepEqual(q.orphaned, [gone]);
  // The suspended new card makes its line bring nothing; e4 (suspended, reviewed) is not new.
  assert.deepEqual(q.newCards, [card('e4 e5 Bc4')]);
});

test('a forgotten card comes back as new', () => {
  const ix = index({ sid: 'Study001', chapters: [chapter('Chapter1', 'white', '1. e4 e5 2. Nf3')] });
  const e4 = card('e4');
  const replay = new Replay();
  replay.add(
    asDevice('Desktop1', [
      { v: 1, n: 1, t: iso(start - 5 * DAY), k: 'taught', card: e4 },
      reviewEvent(2, start - 5 * DAY + 4 * HOUR, e4, 3),
      { v: 1, n: 3, t: iso(start - DAY), k: 'forget', card: e4 },
    ]),
  );
  const q = todaysQueue(ix, replay.states, DEFAULT_TRAIN, day());
  assert.deepEqual([q.due.length, q.newCards[0]], [0, e4]);
});

/** Two devices' events: lines taught and reviewed over a few days. */
function history(cards: CardId[]): { desktop: KnownEvent[]; phone: KnownEvent[] } {
  const desktop: KnownEvent[] = [];
  const phone: KnownEvent[] = [];
  const random = mulberry32(7);
  cards.forEach((c, i) => {
    const log = i % 2 ? phone : desktop;
    const t = start - (i % 4) * DAY + 8 * HOUR + i * 60_000;
    log.push({ v: 1, n: log.length + 1, t: iso(t), k: 'taught', card: c });
    if (i % 4 !== 0) log.push(reviewEvent(log.length + 1, t + 5 * HOUR, c, random() < 0.3 ? 1 : 3));
  });
  return { desktop, phone };
}

test('the limit is shared by every device, and the queue does not depend on the order of events', () => {
  const ix = index({
    sid: 'Study001',
    chapters: [chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3'), chapter('Chapter2', 'black', '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3 O-O 5. Bd3 d5 6. Nf3 c5 7. O-O Nc6')],
  });
  const all = [...ix.cards.keys()];
  const { desktop, phone } = history(all.slice(0, 12));
  const events = [...asDevice('Desktop1', desktop), ...asDevice('Phone001', phone)];
  const a = new Replay();
  a.add(events);
  const qa = todaysQueue(ix, a.states, { ...DEFAULT_TRAIN, newPerDay: 5 }, day(start + 20 * HOUR));
  // Cards 0, 4 and 8 were taught today: two on the desktop, one on the phone.
  assert.equal(qa.taughtToday, 3);
  assert.equal(qa.room, 2);
  const random = mulberry32(11);
  for (let run = 0; run < 5; run++) {
    const shuffled = [...events];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    const b = new Replay();
    for (let i = 0; i < shuffled.length; i += 5) b.add(shuffled.slice(i, i + 5));
    assert.deepEqual(todaysQueue(ix, b.states, { ...DEFAULT_TRAIN, newPerDay: 5 }, day(start + 20 * HOUR)), qa);
  }
});

test('a study scope keeps its own cards and lines, and still shares the limit', () => {
  const ix = index(
    { sid: 'Study001', chapters: [chapter('Chapter1', 'white', '1. e4 e5 2. Nf3')] },
    { sid: 'Study002', chapters: [chapter('Chapter2', 'white', '1. e4 c5 2. Nf3 d6 3. d4'), chapter('Chapter3', 'white', '1. d4 d5 2. c4')] },
  );
  const states = new Map<string, CardState>([
    // e4 is in both studies; Nf3 after e5 only in Study001.
    [card('e4'), reviewed(start + HOUR)],
    [card('e4 e5 Nf3'), reviewed(start + HOUR)],
    [card('e4 c5 Nf3'), taught(start + 8 * HOUR)],
  ]);
  const q = todaysQueue(ix, states, { ...DEFAULT_TRAIN, newPerDay: 2 }, day(), { scope: 'Study002' });
  assert.equal(q.scope, 'Study002');
  assert.deepEqual(q.due.map((d) => d.card), [card('e4')]);
  assert.deepEqual(q.later.map((d) => d.card), [card('e4 c5 Nf3')]);
  assert.equal(q.taughtToday, 1);
  assert.deepEqual(q.newLines.map((l) => l.cid), ['Chapter2']);
  assert.ok(q.newLines.every((l) => l.sid === 'Study002'));
});
