// Show and grade (PLAN.md §5.9): the two-key table, the press queue, the key mapping and speech.
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
import { indexStudies } from '../../../../src/core/repertoire/index.ts';
import { planSession } from '../../../../src/core/train/plan.ts';
import { todaysQueue, type Day } from '../../../../src/core/train/queue.ts';
import { DEFAULT_TRAIN } from '../../../../src/core/train/settings.ts';
import { pressOf, QUEUE_MS, ShowGrade, spokenMove, type Press, type ShowGradeEffect } from '../../../../src/core/train/showGrade.ts';
import { Trainer } from '../../../../src/core/train/trainer.ts';
import { startPosition } from '../../../../src/core/study/tree.ts';
import { DAY } from '../../../support/reviewHistory.ts';

const HOUR = 3_600_000;
const start = Date.UTC(2026, 9, 5, 22);
const day: Day = { start, end: start + DAY, now: start + 9 * HOUR };

const chapter = (moves: string) => {
  const parsed = parseChapterFile(`[Orientation "white"]\n\n${moves} *\n`, 'Chapter1');
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.chapter;
};
function card(sans: string): CardId {
  const pos = Chess.default();
  const moves = sans.split(' ');
  for (const san of moves.slice(0, -1)) pos.play(parseSan(pos, san)!);
  return repertoireCard(positionKeyOf(pos), standardUci(pos, parseSan(pos, moves.at(-1)!) as NormalMove));
}
const reviewed = (due: number): CardState => ({ card: { ...newCard(), state: State.review, stability: 3, difficulty: 5, reps: 1, lastReview: due - 3 * DAY, due }, suspended: false, reviews: 1 });
const dueNow = reviewed(start - DAY);
const notDue = reviewed(start + 5 * DAY);

const ch = chapter('1. e4 e5 2. Nf3 Nc6 3. Bb5');
const ix = indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters: [ch] }]);

function world(states: Map<string, CardState>, options: { speech?: boolean; newPerDay?: number } = {}) {
  const queue = todaysQueue(ix, states, { ...DEFAULT_TRAIN, newPerDay: options.newPerDay ?? 0 }, day);
  const trainer = new Trainer({ index: ix, plan: planSession(ix, queue, states), states, startOf: () => startPosition(ch), paceMs: 600, selfGrade: true });
  const sg = new ShowGrade(trainer, options.speech ? { speech: true } : {});
  const effects: ShowGradeEffect[] = [];
  let wait: { id: number } | undefined;
  let now = day.now;
  const take = (out: ShowGradeEffect[]) => {
    effects.push(...out);
    for (const e of out) if (e.type === 'wait') wait = e;
    return out;
  };
  return {
    trainer,
    effects,
    phase: () => trainer.view.phase,
    press: (p: Press, after = 1000) => take(sg.press(p, (now += after))),
    begin: () => take(sg.start(now)),
    /** Plays every move the board owes, until it asks again or the session ends. */
    run: (step = 600) => {
      for (let i = 0; i < 100 && ['opponent', 'auto', 'lineDone'].includes(trainer.view.phase); i++) take(sg.tick(wait!.id, (now += step)));
      return effects;
    },
    stop: () => take(sg.send({ type: 'stop', now: (now += 10) })),
    records: () => effects.flatMap((e) => (e.type === 'record' ? [e.event] : [])),
    plays: () => effects.flatMap((e) => (e.type === 'play' ? [`${e.by}:${e.san}`] : [])),
  };
}

test('two presses grade a move known: the first plays it, the second grades it and plays the reply', () => {
  const states = new Map<string, CardState>([[card('e4'), dueNow], [card('e4 e5 Nf3'), dueNow]]);
  const w = world(states);
  w.begin();
  assert.equal(w.phase(), 'ask');
  w.press('next');
  assert.equal(w.phase(), 'shown');
  assert.deepEqual(w.plays(), ['user:e4']);
  assert.deepEqual(w.records(), []);
  w.press('next');
  // The reply comes with the press, then the board asks the next move.
  assert.deepEqual(w.plays(), ['user:e4', 'opponent:e5']);
  // The time counts from the move being asked to the grade: both presses.
  assert.deepEqual(w.records(), [{ k: 'review', card: card('e4'), g: 3, ms: 2000 }]);
  assert.equal(w.phase(), 'ask');
  w.press('next');
  w.press('next');
  w.run();
  assert.deepEqual(w.records().map((r) => [r.k, r.k === 'review' && r.g]), [['review', 3], ['review', 3]]);
  assert.equal(w.phase(), 'sessionDone');
});

test('the wrong key grades Again, whether it comes first or after the move is shown', () => {
  const states = new Map<string, CardState>([[card('e4'), dueNow], [card('e4 e5 Nf3'), dueNow]]);
  const w = world(states);
  w.begin();
  // 4 shows the move and marks it failed; the next press grades Again.
  w.press('wrong');
  assert.equal(w.phase(), 'shown');
  assert.deepEqual(w.records(), []);
  w.press('next');
  assert.deepEqual(w.records(), [{ k: 'review', card: card('e4'), g: 1, ms: 2000 }]);
  // 2 then 4: shown as known, then marked failed: Again.
  w.press('next');
  w.press('wrong');
  assert.deepEqual(w.records().map((r) => r.k === 'review' && r.g), [1, 1]);
});

test('a new move is taught by two presses and records no review', () => {
  const w = world(new Map(), { newPerDay: 20 });
  w.begin();
  assert.equal(w.phase(), 'teach');
  w.press('next');
  w.press('next');
  assert.deepEqual(w.records(), [{ k: 'taught', card: card('e4') }]);
  // A wrong press on a new move teaches it all the same: nothing is graded.
  w.press('wrong');
  w.press('next');
  assert.deepEqual(w.records(), [{ k: 'taught', card: card('e4') }, { k: 'taught', card: card('e4 e5 Nf3') }]);
});

test('a next press while the board is playing waits for it, for three seconds; wrong clears it', () => {
  const states = new Map<string, CardState>([[card('e4'), notDue], [card('e4 e5 Nf3'), dueNow]]);
  const w = world(states);
  w.begin();
  // The board plays 1. e4 e5 itself; a press lands in between.
  assert.equal(w.phase(), 'auto');
  w.press('next');
  assert.deepEqual(w.plays(), []);
  w.run();
  // The queued press showed Nf3 as soon as it was asked.
  assert.equal(w.phase(), 'shown');
  assert.deepEqual(w.plays(), ['auto:e4', 'opponent:e5', 'user:Nf3']);

  // A press the board keeps waiting for longer than three seconds is dropped.
  const late = world(states);
  late.begin();
  late.press('next');
  late.run(QUEUE_MS);
  assert.equal(late.phase(), 'ask');

  // A wrong press clears what was waiting, and isn't queued itself.
  const cleared = world(states);
  cleared.begin();
  cleared.press('next');
  cleared.press('wrong');
  cleared.run();
  assert.equal(cleared.phase(), 'ask');
});

test('keys: 2 and 4, the media keys of a ring, and 1 to hear the move again', () => {
  assert.deepEqual(['2', 'MediaTrackNext'].map(pressOf), ['next', 'next']);
  assert.deepEqual(['4', 'MediaTrackPrevious'].map(pressOf), ['wrong', 'wrong']);
  assert.equal(pressOf('1'), 'repeat');
  for (const key of ['3', 'a', 'Enter', ' ', 'ArrowRight']) assert.equal(pressOf(key), undefined, key);
});

test('speech: each move shown is spoken when speech is on, and 1 repeats it', () => {
  const states = new Map<string, CardState>([[card('e4'), dueNow]]);
  const quiet = world(states);
  quiet.begin();
  quiet.press('next');
  assert.deepEqual(quiet.effects.filter((e) => e.type === 'say'), []);
  // 1 before anything is shown says nothing.
  const w = world(states, { speech: true });
  assert.deepEqual(w.press('repeat'), []);
  w.begin();
  w.press('next');
  assert.deepEqual(w.effects.filter((e) => e.type === 'say'), [{ type: 'say', text: 'e4' }]);
  assert.deepEqual(w.press('repeat'), [{ type: 'say', text: 'e4' }]);
});

test('moves are spoken as they are read aloud', () => {
  const cases: [string, string][] = [
    ['e4', 'e4'],
    ['Nf3', 'knight f3'],
    ['Nxe5', 'knight takes e5'],
    ['exd5', 'e takes d5'],
    ['Qxh7#', 'queen takes h7, mate'],
    ['Bb5+', 'bishop b5, check'],
    ['O-O', 'castles kingside'],
    ['O-O-O+', 'castles queenside, check'],
    ['Rad1', 'rook a d1'],
    ['R1xd4', 'rook 1 takes d4'],
    ['e8=Q+', 'e8 promotes to queen, check'],
    ['bxa8=N', 'b takes a8 promotes to knight'],
    ['Ngf3', 'knight g f3'],
  ];
  for (const [san, said] of cases) assert.equal(spokenMove(san), said, san);
});
