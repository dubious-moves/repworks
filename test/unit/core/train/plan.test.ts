// The line planner (PLAN.md §5.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';
import { positionKeyOf } from '../../../../src/core/chess/positionKey.ts';
import { standardUci } from '../../../../src/core/chess/uci.ts';
import { repertoireCard, type CardId } from '../../../../src/core/progress/cards.ts';
import { newCard, State } from '../../../../src/core/progress/fsrs.ts';
import type { CardState } from '../../../../src/core/progress/replay.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { indexStudies, type RepertoireIndex } from '../../../../src/core/repertoire/index.ts';
import { planSession, type SessionPlan } from '../../../../src/core/train/plan.ts';
import { knownCardsOf, statusOf, todaysQueue, type DailyQueue, type Day } from '../../../../src/core/train/queue.ts';
import { DEFAULT_TRAIN } from '../../../../src/core/train/settings.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { mulberry32 } from '../../../support/random.ts';
import { randomChapter } from '../../../support/randomTree.ts';
import { DAY } from '../../../support/reviewHistory.ts';

const HOUR = 3_600_000;
const start = Date.UTC(2026, 9, 5, 22);
const day: Day = { start, end: start + DAY, now: start + 9 * HOUR };

function chapter(cid: string, side: string, moves: string, known = false): Chapter {
  const parsed = parseChapterFile(`[Orientation "${side}"]\n${known ? '[RepworksKnown "true"]\n' : ''}\n${moves} *\n`, cid);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.chapter;
}

function card(sans: string): CardId {
  const pos = Chess.default();
  const moves = sans.split(' ');
  for (const san of moves.slice(0, -1)) pos.play(parseSan(pos, san)!);
  return repertoireCard(positionKeyOf(pos), standardUci(pos, parseSan(pos, moves.at(-1)!) as NormalMove));
}

const reviewed = (due: number): CardState => ({
  card: { ...newCard(), state: State.review, stability: 3, difficulty: 5, reps: 1, lastReview: due - 3 * DAY, due },
  suspended: false,
  reviews: 1,
});
const notDue = reviewed(start + 5 * DAY);
const dueNow = reviewed(start - DAY);

const index = (...chapters: Chapter[]) => indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters }]);
const plan = (ix: RepertoireIndex, states: Map<string, CardState>, newPerDay = 0) => {
  const queue = todaysQueue(ix, states, { ...DEFAULT_TRAIN, newPerDay }, day);
  return { queue, plan: planSession(ix, queue, states) };
};
const show = (p: SessionPlan) => p.lines.map((l) => `${l.kind}: ${l.line.path.slice(0, l.end).join(' ')} | ask ${l.ask.length} teach ${l.teach.length}`);

test('review lines in the index order, each ending at its last due card', () => {
  const ix = index(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 (4. Bxc6) 4... Nf6 5. O-O'));
  const all = [...ix.cards.keys()];
  const states = new Map<string, CardState>(all.map((c) => [c, notDue]));
  states.set(card('e4 e5 Nf3'), dueNow);
  states.set(card('e4 e5 Nf3 Nc6 Bb5 a6 Bxc6'), dueNow);
  const { plan: p } = plan(ix, states);
  // Nf3 is on the first line, which ends there; Bxc6 is on the second.
  assert.deepEqual(show(p), ['review: e4 e5 Nf3 | ask 1 teach 0', 'review: e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 | ask 1 teach 0']);
});

test('a due card on a transposition is asked once, on the first line that reaches it', () => {
  const ix = index(chapter('Chapter1', 'white', '1. d4 Nf6 2. c4 e6 3. Nf3'), chapter('Chapter2', 'white', '1. c4 Nf6 2. d4 e6 3. Nf3 b6'));
  const states = new Map<string, CardState>([...ix.cards.keys()].map((c) => [c, notDue]));
  states.set(card('d4 Nf6 c4 e6 Nf3'), dueNow);
  const { plan: p } = plan(ix, states);
  assert.deepEqual(show(p), ['review: d4 Nf6 c4 e6 Nf3 | ask 1 teach 0']);
});

test('a move never answered on a review line is taught there, and not again on a new line', () => {
  const ix = index(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'), chapter('Chapter2', 'white', '1. e4 e5 2. Nf3 d6 3. d4'));
  // e4 and Bb5 reviewed, Bb5 due; Nf3 was added to the line later and was never answered.
  const states = new Map<string, CardState>([
    [card('e4'), notDue],
    [card('e4 e5 Nf3 Nc6 Bb5'), dueNow],
  ]);
  const { queue, plan: p } = plan(ix, states, 20);
  assert.deepEqual(queue.newCards, [card('e4 e5 Nf3'), card('e4 e5 Nf3 d6 d4')]);
  assert.deepEqual(show(p), ['review: e4 e5 Nf3 Nc6 Bb5 | ask 1 teach 1', 'new: e4 e5 Nf3 d6 d4 | ask 0 teach 1']);
  assert.deepEqual(p.lines[0]!.teach, [card('e4 e5 Nf3')]);
});

test('reviews first, then new lines walked whole, then the known pool up to its last unanswered card', () => {
  const ix = index(
    chapter('Chapter1', 'white', '1. d4 d5 2. c4 e6 3. Nc3'),
    chapter('Known001', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6', true),
    chapter('Chapter3', 'white', '1. e4 c5 2. Nf3 d6 3. d4 cxd4'),
  );
  const states = new Map<string, CardState>([
    [card('d4'), dueNow],
    [card('e4 e5 Nf3 Nc6 Bb5'), notDue],
  ]);
  const { plan: p } = plan(ix, states, 20);
  assert.deepEqual(show(p), [
    'review: d4 | ask 1 teach 0',
    // The new line walks to its leaf; it meets e4, known from the known chapter: asked, not taught.
    'new: d4 d5 c4 e6 Nc3 | ask 0 teach 2',
    'new: e4 c5 Nf3 d6 d4 cxd4 | ask 1 teach 2',
    // The known line: Nf3 is all that's left (e4 was asked above, Bb5 is reviewed).
    'known: e4 e5 Nf3 | ask 1 teach 0',
  ]);
  assert.deepEqual(p.lines[2]!.ask, [card('e4')]);
});

test('a plan of nothing due and no room is empty', () => {
  const ix = index(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3'));
  assert.deepEqual(plan(ix, new Map()).plan, { lines: [] });
});

/** Random states for an index: fresh, learning, reviewed (due or not), some suspended. */
function randomStates(ix: RepertoireIndex, random: () => number): Map<string, CardState> {
  const states = new Map<string, CardState>();
  for (const c of ix.cards.keys()) {
    const r = random();
    if (r < 0.3) continue;
    let state: CardState;
    if (r < 0.45) state = { card: newCard(), suspended: false, reviews: 0, taught: start - Math.floor(random() * 2 * DAY) };
    else state = reviewed(start + Math.floor((random() * 6 - 3) * DAY));
    if (random() < 0.08) state.suspended = true;
    states.set(c, state);
  }
  return states;
}

const covers = (queue: DailyQueue, p: SessionPlan) => {
  const asked = p.lines.flatMap((l) => l.ask);
  const taught = p.lines.flatMap((l) => l.teach);
  return { asked, taught, all: [...asked, ...taught] };
};

test('random repertoires: every due card asked exactly once, on a review line; no line asks nothing', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const random = mulberry32(seed);
    const chapters = Array.from({ length: 1 + Math.floor(random() * 4) }, (_, i) => {
      const c = randomChapter(random, `Rand000${i}`, { maxDepth: 10, maxChildren: 3 });
      if (random() < 0.3) c.headers.push(['RepworksKnown', 'true']);
      return c;
    });
    const ix = indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters }]);
    const states = randomStates(ix, random);
    const queue = todaysQueue(ix, states, { ...DEFAULT_TRAIN, newPerDay: Math.floor(random() * 15) }, day);
    const p = planSession(ix, queue, states);
    assert.deepEqual(planSession(ix, queue, states), p, `seed ${seed}: deterministic`);
    const { asked, taught, all } = covers(queue, p);
    // Each card asked or taught at most once.
    assert.equal(new Set(all).size, all.length, `seed ${seed}`);
    // Every due card, on a review line.
    const reviewAsks = p.lines.filter((l) => l.kind === 'review').flatMap((l) => l.ask);
    for (const d of queue.due) assert.ok(reviewAsks.includes(d.card), `seed ${seed}: due ${d.card}`);
    // Every new card of the queue is taught somewhere; nothing is taught that is known.
    for (const c of queue.newCards) assert.ok(taught.includes(c), `seed ${seed}: new ${c}`);
    const known = knownCardsOf(ix);
    for (const c of taught) assert.ok(!known.has(c) && statusOf(states.get(c)) === 'fresh' && !states.get(c)?.suspended, `seed ${seed}`);
    // Asks are due cards or known ones never answered.
    const due = new Set(queue.due.map((d) => d.card));
    for (const c of asked) assert.ok(due.has(c) || (known.has(c) && statusOf(states.get(c)) === 'fresh'), `seed ${seed}`);
    for (const l of p.lines) {
      assert.ok(l.ask.length + l.teach.length > 0, `seed ${seed}: a line asks nothing`);
      assert.ok(l.end >= 1 && l.end <= l.line.path.length, `seed ${seed}`);
      // Every ask and teach lies on the walked part of the line.
      const walked = new Set(l.line.cards.filter((_, i) => l.line.plies[i]! < l.end));
      for (const c of [...l.ask, ...l.teach]) assert.ok(walked.has(c), `seed ${seed}`);
      // A review or known line ends at a card it asks.
      if (l.kind !== 'new') {
        const last = l.line.cards.findLastIndex((c, i) => l.line.plies[i]! < l.end);
        assert.ok(l.ask.includes(l.line.cards[last]!), `seed ${seed}: ${l.kind} line ends past its last ask`);
      }
    }
  }
});
