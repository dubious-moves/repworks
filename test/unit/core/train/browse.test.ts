// The training screen's line list (PLAN.md §5.16): each line's state, a line picked and trained
// whatever the queue says (due moves graded, new ones taught, the rest practised ungraded), a
// chapter's new lines learned past the limit, and show and grade switched on mid-session.
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
import { indexStudies, type Line } from '../../../../src/core/repertoire/index.ts';
import { chapterRows, findLine, learnPlan, lineThrough, pickedPlan } from '../../../../src/core/train/browse.ts';
import type { SessionPlan } from '../../../../src/core/train/plan.ts';
import type { Day } from '../../../../src/core/train/queue.ts';
import { DEFAULT_TRAIN } from '../../../../src/core/train/settings.ts';
import { ShowGrade } from '../../../../src/core/train/showGrade.ts';
import { Trainer, type TrainerEffect } from '../../../../src/core/train/trainer.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { startPosition } from '../../../../src/core/study/tree.ts';
import { DAY } from '../../../support/reviewHistory.ts';

const HOUR = 3_600_000;
const start = Date.UTC(2026, 9, 5, 22);
const day: Day = { start, end: start + DAY, now: start + 9 * HOUR };

function chapter(cid: string, moves: string, known = false): Chapter {
  const parsed = parseChapterFile(`[Orientation "white"]\n${known ? '[RepworksKnown "true"]\n' : ''}[ChapterName "${cid}"]\n\n${moves} *\n`, cid);
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
const learning: CardState = { card: newCard(), suspended: false, reviews: 0, taught: day.now - HOUR };
const suspended: CardState = { ...notDue, suspended: true };

const MAIN = chapter('Chapter1', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 (4. Bxc6 dxc6 5. O-O) 4... Nf6 5. O-O');
const ix = indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters: [MAIN, chapter('Chapter2', '1. d4 d5 2. c4', true)] }]);

/** Runs a trainer to its end, answering every ask with `answer` (the expected move by default). */
function run(t: Trainer, answer: (n: number) => 'right' | 'wrong' = () => 'right') {
  const effects: TrainerEffect[] = [];
  let wait: number | undefined;
  let now = day.now;
  const send = (c: Parameters<Trainer['send']>[0]) => {
    const out = t.send(c);
    effects.push(...out);
    for (const e of out) if (e.type === 'wait') wait = e.id;
  };
  send({ type: 'start', now });
  let n = 0;
  for (let guard = 0; guard < 1000 && t.view.phase !== 'sessionDone'; guard++) {
    const v = t.view;
    now += 1000;
    if (v.phase === 'ask' || v.phase === 'teach' || v.phase === 'wrong' || v.phase === 'shown') {
      const line = v.line!.line;
      const pos = v.position!;
      const uci = standardUci(pos, parseSan(pos, line.path[v.path.length]!) as NormalMove);
      const how = v.phase === 'ask' ? answer(n++) : 'right';
      send({ type: 'move', uci: how === 'right' ? uci : pos.turn === 'white' ? 'h2h3' : 'h7h6', now });
    } else send({ type: 'tick', id: wait!, now });
  }
  return { effects, records: effects.flatMap((e) => (e.type === 'record' ? [e.event] : [])), answers: effects.flatMap((e) => (e.type === 'answer' ? [e.card] : [])) };
}

const trainer = (plan: SessionPlan, states: Map<string, CardState>, extra: { practice?: boolean; selfGrade?: boolean } = {}) =>
  new Trainer({ index: ix, plan, states, startOf: (l: Line) => startPosition(l.cid === 'Chapter1' ? MAIN : chapter('Chapter2', '1. d4 d5 2. c4', true)), paceMs: 600, ...extra });

test('each chapter lists its lines in order, numbered, with their state and where each leaves the one before', () => {
  const states = new Map<string, CardState>([
    [card('e4'), notDue],
    [card('e4 e5 Nf3'), dueNow],
    [card('e4 e5 Nf3 Nc6 Bb5'), learning],
  ]);
  const rows = chapterRows(ix, states, DEFAULT_TRAIN, day);
  assert.deepEqual(
    rows.map((g) => [g.cid, g.learned, g.dueLines, g.lines.map((r) => [r.number, r.state, r.fresh, r.due, r.fork])]),
    [
      // Ba4 and Bxc6 are new; Nf3 is due on both lines.
      ['Chapter1', 0, 2, [[1, 'new', 2, 1, 0], [2, 'new', 2, 1, 6]]],
      // A known chapter's moves never answered are reviewed, not learned: due.
      ['Chapter2', 1, 1, [[1, 'due', 0, 2, 0]]],
    ],
  );
  // The earliest due time of a line's answered moves: the due move's.
  assert.equal(rows[0]!.lines[0]!.next, dueNow.card.due);
  assert.deepEqual(chapterRows(ix, states, DEFAULT_TRAIN, day, 'Nowhere0'), []);

  // Everything answered and not due: learned, due on its earliest move's day.
  const done = new Map<string, CardState>([...ix.cards.keys()].map((c) => [c, notDue]));
  done.set(card('e4 e5 Nf3 Nc6 Bb5'), learning);
  const after = chapterRows(ix, done, DEFAULT_TRAIN, day)[0]!;
  assert.deepEqual(after.lines.map((r) => r.state), ['learning', 'learning']);
  done.delete(card('e4 e5 Nf3 Nc6 Bb5'));
  done.set(card('e4 e5 Nf3 Nc6 Bb5'), notDue);
  assert.deepEqual(chapterRows(ix, done, DEFAULT_TRAIN, day)[0]!.lines.map((r) => [r.state, r.next]), [
    ['learned', notDue.card.due],
    ['learned', notDue.card.due],
  ]);
});

test('the line through a study\'s move: the topmost through it, or the one sharing most of it (§5.83)', () => {
  const path = (sans: string) => (sans ? sans.split(' ') : []);
  const through = (at: string) => lineThrough(ix, 'Study001', 'Chapter1', path(at))?.path.join(' ');
  const main = 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O';
  const side = 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O';
  // Before the fork, and at the chapter's start: the topmost line, as the list shows it first.
  assert.equal(through('e4 e5 Nf3'), main);
  assert.equal(through(''), main);
  // On a branch: that branch's line, at any of its moves.
  assert.equal(through('e4 e5 Nf3 Nc6 Bb5 a6 Bxc6'), side);
  assert.equal(through(side), side);
  // A move on no line (cut, or gone since): the line sharing most of it.
  assert.equal(through('e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 bxc6'), side);
  assert.equal(lineThrough(ix, 'Study001', 'Chapter2', ['d4'])?.path.join(' '), 'd4 d5 c4');
  assert.equal(lineThrough(ix, 'Study001', 'Nowhere1', ['e4']), undefined);
});

test('a picked line: due moves graded, new ones taught, the rest asked with no record, suspended ones played', () => {
  const line = findLine(ix, 'Study001', 'Chapter1', ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6', 'dxc6', 'O-O'])!;
  assert.ok(line);
  assert.equal(findLine(ix, 'Study001', 'Chapter1', ['e4', 'e5']), undefined);
  const states = new Map<string, CardState>([
    [card('e4'), notDue],
    [card('e4 e5 Nf3'), dueNow],
    [card('e4 e5 Nf3 Nc6 Bb5'), learning],
    [card('e4 e5 Nf3 Nc6 Bb5 a6 Bxc6'), suspended],
  ]);
  const plan = pickedPlan(ix, states, DEFAULT_TRAIN, day, line);
  assert.deepEqual(plan.lines.map((l) => [l.kind, l.end, l.ask, l.teach]), [['pick', 9, [card('e4 e5 Nf3')], [card('e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O')]]]);
  // e4 (not due) answered wrong first: asked again, nothing recorded for it.
  const { effects, records, answers } = run(trainer(plan, states, { practice: true }), (n) => (n === 0 ? 'wrong' : 'right'));
  assert.deepEqual(answers, [card('e4'), card('e4 e5 Nf3'), card('e4 e5 Nf3 Nc6 Bb5')]);
  assert.deepEqual(
    records.map((r) => [r.k, r.card, r.k === 'review' ? r.g : undefined]),
    [
      ['review', card('e4 e5 Nf3'), 3],
      ['taught', card('e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O'), undefined],
    ],
  );
  assert.ok(effects.some((e) => e.type === 'play' && e.by === 'auto' && e.san === 'Bxc6'));
});

test('learning a chapter takes every line with new moves, past the limit, each new move taught once', () => {
  const plan = learnPlan(ix, new Map(), 'Study001', 'Chapter1');
  assert.deepEqual(
    plan.lines.map((l) => [l.kind, l.line.path.length, l.teach.length]),
    [
      ['new', 9, 5],
      ['new', 9, 2],
    ],
  );
  // A known chapter has nothing to learn: its moves are reviewed.
  assert.deepEqual(learnPlan(ix, new Map(), 'Study001', 'Chapter2').lines, []);
  // Nothing left once every move is answered.
  assert.deepEqual(learnPlan(ix, new Map([...ix.cards.keys()].map((c) => [c, notDue])), 'Study001', 'Chapter1').lines, []);
});

test('show and grade switched on mid-session: the move asked is shown and told; a move tried wrong first stays failed', () => {
  const line = findLine(ix, 'Study001', 'Chapter1', ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'])!;
  const states = new Map<string, CardState>([...ix.cards.keys()].map((c) => [c, notDue]));
  states.set(card('e4'), dueNow);
  states.set(card('e4 e5 Nf3'), dueNow);
  const t = trainer(pickedPlan(ix, states, DEFAULT_TRAIN, day, line), states);
  const records: TrainerEffect[] = [];
  const keep = (out: TrainerEffect[]) => records.push(...out.filter((e) => e.type === 'record'));
  keep(t.send({ type: 'start', now: day.now }));
  assert.equal(t.view.phase, 'ask');
  // A wrong move, then the keys take over: shown, told "knew it", graded Again all the same.
  keep(t.send({ type: 'move', uci: 'a2a3', now: day.now }));
  assert.equal(t.view.phase, 'wrong');
  t.setSelfGrade(true);
  const keys = new ShowGrade(t);
  keep(keys.press('next', day.now) as TrainerEffect[]);
  assert.equal(t.view.phase, 'shown');
  assert.ok(t.awaitingGrade);
  keep(keys.press('next', day.now) as TrainerEffect[]);
  assert.equal(t.awaitingGrade, false);
  assert.deepEqual(
    records.map((e) => (e.type === 'record' && e.event.k === 'review' ? [e.event.card, e.event.g] : [])),
    [[card('e4'), 1]],
  );
  // Switched off again: moves on the board answer as before.
  t.setSelfGrade(false);
  assert.equal(t.send({ type: 'show' }).length, 0);
});
