// The trainer (PLAN.md §5.6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';
import { positionKeyOf } from '../../../../src/core/chess/positionKey.ts';
import { standardUci } from '../../../../src/core/chess/uci.ts';
import { repertoireCard, type CardId } from '../../../../src/core/progress/cards.ts';
import { newCard, State } from '../../../../src/core/progress/fsrs.ts';
import type { CardState } from '../../../../src/core/progress/replay.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { indexStudies, type Line, type RepertoireIndex } from '../../../../src/core/repertoire/index.ts';
import { interactivePlan, planSession, type PlannedLine, type SessionPlan } from '../../../../src/core/train/plan.ts';
import { statusOf, todaysQueue, type Day } from '../../../../src/core/train/queue.ts';
import { DEFAULT_TRAIN } from '../../../../src/core/train/settings.ts';
import { quizLinesOf } from '../../../../src/core/train/commentQuiz.ts';
import { AUTO_PLAYS, LINE_STARTS, MIN_PACE_MS, Trainer, type CommentQuiz, type TrainerCommand, type TrainerEffect, type TrainerOptions, type TrainerRecord, type TrainerView } from '../../../../src/core/train/trainer.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { lineThrough, startPosition } from '../../../../src/core/study/tree.ts';
import { mulberry32 } from '../../../support/random.ts';
import { randomChapter } from '../../../support/randomTree.ts';
import { DAY } from '../../../support/reviewHistory.ts';

const HOUR = 3_600_000;
const start = Date.UTC(2026, 9, 5, 22);
const day: Day = { start, end: start + DAY, now: start + 9 * HOUR };

function chapter(cid: string, side: string, moves: string, opts: { known?: boolean; fen?: string } = {}): Chapter {
  const headers = [`[Orientation "${side}"]`];
  if (opts.known) headers.push('[RepworksKnown "true"]');
  if (opts.fen) headers.push(`[SetUp "1"]`, `[FEN "${opts.fen}"]`);
  const parsed = parseChapterFile(`${headers.join('\n')}\n\n${moves} *\n`, cid);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.chapter;
}

function card(sans: string, fen?: string): CardId {
  const pos = fen ? Chess.fromSetup(parseFen(fen).unwrap()).unwrap() : Chess.default();
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

interface World {
  ix: RepertoireIndex;
  chapters: Map<string, Chapter>;
}
const world = (...chapters: Chapter[]): World => ({
  ix: indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters }]),
  chapters: new Map(chapters.map((c) => [c.id, c])),
});
const startOf = (w: World) => (line: Line) => {
  const c = w.chapters.get(line.cid);
  return c ? startPosition(c) : undefined;
};
const planOf = (w: World, states: Map<string, CardState>, newPerDay = 0) => planSession(w.ix, todaysQueue(w.ix, states, { ...DEFAULT_TRAIN, newPerDay }, day), states);
const trainer = (w: World, plan: SessionPlan, states: Map<string, CardState>, extra: { record?: boolean; askAll?: boolean; follow?: boolean; paceMs?: number; selfGrade?: boolean } & TrainerOptions = {}) =>
  new Trainer({ index: w.ix, plan, states, startOf: startOf(w), paceMs: extra.paceMs ?? 600, ...extra });

/** Who answers an ask or a teach: a command, or undefined to stop the session. */
type Answerer = (view: TrainerView, asked: number) => TrainerCommand | undefined;

/** Runs a session to its end: ticks every wait, lets `answer` answer every ask and teach, and `atEnd` a line's end held ("Next line" by default). */
function run(t: Trainer, answer: Answerer, now = day.now, prior: readonly TrainerEffect[] = [], atEnd: (view: TrainerView) => TrainerCommand | undefined = () => undefined) {
  const effects: TrainerEffect[] = [];
  // A session already under way: its last timer, if it is still pending.
  let pendingWait = prior.filter((e) => e.type === 'wait').at(-1) as { ms: number; id: number } | undefined;
  const send = (c: TrainerCommand) => {
    const out = t.send(c);
    effects.push(...out);
    for (const e of out) if (e.type === 'wait') pendingWait = e;
  };
  send({ type: 'start', now });
  let asked = 0;
  for (let guard = 0; guard < 10_000 && t.view.phase !== 'sessionDone'; guard++) {
    const phase = t.view.phase;
    // Show sequence: watched to its end, then replayed.
    if (phase === 'previewed') {
      send({ type: 'ready', now });
      continue;
    }
    if (phase === 'ask' || phase === 'teach' || phase === 'wrong' || phase === 'shown') {
      now += 1000;
      const c = answer(t.view, asked++);
      if (!c) send({ type: 'stop', now });
      else send({ ...c, now } as TrainerCommand);
      continue;
    }
    // A line's end held for "Next line" (§5.17).
    if (phase === 'lineDone' && !pendingWait) {
      send({ ...(atEnd(t.view) ?? { type: 'next' }), now } as TrainerCommand);
      continue;
    }
    assert.ok(pendingWait, `waiting in ${phase} with no timer`);
    const w: { ms: number; id: number } = pendingWait;
    pendingWait = undefined;
    now += w.ms;
    send({ type: 'tick', id: w.id, now });
  }
  assert.equal(t.view.phase, 'sessionDone');
  return { effects, records: effects.flatMap((e) => (e.type === 'record' ? [e.event] : [])) };
}

/** Plays the move shown or expected: the trainer's own move in the line. */
const expected = (view: TrainerView) => {
  const ply = view.path.length;
  const line = view.line!.line;
  const pos = view.position!;
  return standardUci(pos, parseSan(pos, line.path[ply]!) as NormalMove);
};
const right: Answerer = (view) => ({ type: 'move', uci: expected(view), now: 0 });
const plays = (effects: TrainerEffect[]) => effects.flatMap((e) => (e.type === 'play' ? [`${e.by}:${e.san}`] : []));

test('a line with nothing to ask auto-plays to its end and records nothing, at no less than the floor pace', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6'));
  const line = w.ix.lines[0]!;
  const plan: SessionPlan = { lines: [{ kind: 'review', line, end: line.path.length, ask: [], teach: [] }] };
  const states = new Map<string, CardState>([...w.ix.cards.keys()].map((c) => [c, notDue]));
  const { effects, records } = run(trainer(w, plan, states, { paceMs: 100 }), () => assert.fail('nothing is asked'));
  assert.deepEqual(plays(effects), ['auto:e4', 'opponent:e5', 'auto:Nf3', 'opponent:Nc6']);
  assert.deepEqual(records, []);
  for (const e of effects) if (e.type === 'wait') assert.ok(e.ms >= MIN_PACE_MS);
  // No arrow for a reviewed card played for the user.
  assert.ok(!effects.some((e) => e.type === 'arrow' && e.uci));
});

test('a due card is asked; right first time is Good, with the time taken', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'));
  const states = new Map<string, CardState>([...w.ix.cards.keys()].map((c) => [c, notDue]));
  states.set(card('e4 e5 Nf3'), dueNow);
  const { effects, records } = run(trainer(w, planOf(w, states), states), right);
  // The line goes on to its end past its last due move (§5.106); Bb5, not due, is played.
  assert.deepEqual(plays(effects), ['auto:e4', 'opponent:e5', 'user:Nf3', 'opponent:Nc6', 'auto:Bb5']);
  assert.deepEqual(records, [{ k: 'review', card: card('e4 e5 Nf3'), g: 3, ms: 1000 }]);
  assert.ok(effects.some((e) => e.type === 'note' && e.note.kind === 'correct'));
});

test('a wrong move is taken back and asked again; then right records Again with the move tried', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3'));
  const states = new Map<string, CardState>([[card('e4'), notDue], [card('e4 e5 Nf3'), dueNow]]);
  const t = trainer(w, planOf(w, states), states);
  const { effects, records } = run(t, (view, n) => (n === 0 ? { type: 'move', uci: 'd2d4', now: 0 } : right(view, n)));
  const back = effects.findIndex((e) => e.type === 'takeback');
  assert.deepEqual(effects[back], { type: 'takeback', path: ['e4', 'e5'] });
  assert.ok(effects.some((e) => e.type === 'note' && e.note.kind === 'wrong'));
  assert.deepEqual(records, [{ k: 'review', card: card('e4 e5 Nf3'), g: 1, ms: 2000, w: ['d2d4'] }]);
});

test('a second wrong move shows the move with an arrow', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3'));
  const states = new Map<string, CardState>([[card('e4'), notDue], [card('e4 e5 Nf3'), dueNow]]);
  const t = trainer(w, planOf(w, states), states);
  const moves = ['d2d4', 'd2d4', 'c2c3'];
  const views: TrainerView[] = [];
  const { effects, records } = run(t, (view, n) => {
    views.push(view);
    return n < moves.length ? { type: 'move', uci: moves[n]!, now: 0 } : right(view, n);
  });
  assert.deepEqual(views.map((v) => v.phase), ['ask', 'wrong', 'wrong', 'shown']);
  assert.deepEqual(views[3]!.shown, { uci: 'g1f3', san: 'Nf3' });
  assert.ok(effects.some((e) => e.type === 'arrow' && e.uci === 'g1f3'));
  assert.deepEqual(records, [{ k: 'review', card: card('e4 e5 Nf3'), g: 1, ms: 4000, w: ['d2d4', 'c2c3'] }]);
});

test('Hint shows the move and records Again with h', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3'));
  const states = new Map<string, CardState>([[card('e4'), notDue], [card('e4 e5 Nf3'), dueNow]]);
  const { records } = run(trainer(w, planOf(w, states), states), (view, n) => (n === 0 ? { type: 'hint', now: 0 } : right(view, n)));
  assert.deepEqual(records, [{ k: 'review', card: card('e4 e5 Nf3'), g: 1, ms: 2000, h: 1 }]);
});

test('a card never answered on a review line is taught: one taught event, no review', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'));
  // Nf3 was added to a reviewed line later and never answered.
  const states = new Map<string, CardState>([[card('e4'), notDue], [card('e4 e5 Nf3 Nc6 Bb5'), dueNow]]);
  const views: TrainerView[] = [];
  const { effects, records } = run(trainer(w, planOf(w, states), states), (view, n) => (views.push(view), right(view, n)));
  assert.deepEqual(views.map((v) => v.phase), ['teach', 'ask']);
  assert.ok(effects.some((e) => e.type === 'note' && e.note.kind === 'newMove' && e.note.san === 'Nf3'));
  assert.deepEqual(records, [
    { k: 'taught', card: card('e4 e5 Nf3') },
    { k: 'review', card: card('e4 e5 Nf3 Nc6 Bb5'), g: 3, ms: 1000 },
  ]);
});

test('teaching: a wrong move is taken back with no record; each new card taught once, and played with its arrow after', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 (2. Bc4 Nf6) 2... Nc6'));
  const states = new Map<string, CardState>();
  const plan = planOf(w, states, 20);
  assert.deepEqual(plan.lines.map((l) => l.kind), ['new', 'new']);
  const { effects, records } = run(trainer(w, plan, states), (view, n) => (n === 0 ? { type: 'move', uci: 'd2d4', now: 0 } : right(view, n)));
  assert.deepEqual(records, [{ k: 'taught', card: card('e4') }, { k: 'taught', card: card('e4 e5 Nf3') }, { k: 'taught', card: card('e4 e5 Bc4') }]);
  // The second line starts where the board already is (after 1. e4 e5, the shared moves): e4
  // was taught on the first line and is not shown again.
  const lines = effects.filter((e) => e.type === 'line');
  assert.deepEqual(lines.map((l) => l.type === 'line' && l.path), [[], ['e4', 'e5']]);
  assert.deepEqual(plays(effects), ['user:e4', 'opponent:e5', 'user:Nf3', 'opponent:Nc6', 'user:Bc4', 'opponent:Nf6']);
});

test('a card in its learning step is played for the user, with no arrow (§5.110)', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3'));
  const states = new Map<string, CardState>([[card('e4'), learning], [card('e4 e5 Nf3'), dueNow]]);
  const { effects } = run(trainer(w, planOf(w, states), states), right);
  assert.ok(!effects.some((e) => e.type === 'arrow' && e.uci === 'e2e4'));
  assert.deepEqual(plays(effects), ['auto:e4', 'opponent:e5', 'user:Nf3']);
});

test('a suspended card is played for the user; suspending the move asked records it and plays on', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'));
  const states = new Map<string, CardState>([
    [card('e4'), { ...dueNow, suspended: true }],
    [card('e4 e5 Nf3'), dueNow],
    [card('e4 e5 Nf3 Nc6 Bb5'), dueNow],
  ]);
  const { effects, records } = run(trainer(w, planOf(w, states), states), (view, n) => (n === 0 ? { type: 'suspend', now: 0 } : right(view, n)));
  assert.deepEqual(plays(effects), ['auto:e4', 'opponent:e5', 'auto:Nf3', 'opponent:Nc6', 'user:Bb5']);
  assert.deepEqual(records, [
    { k: 'suspend', card: card('e4 e5 Nf3') },
    { k: 'review', card: card('e4 e5 Nf3 Nc6 Bb5'), g: 3, ms: 1000 },
  ]);
});

test('conflicting moves: the other repertoire move is accepted and graded, then the line move is asked', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 (2. Bc4)'));
  const states = new Map<string, CardState>([[card('e4'), notDue], [card('e4 e5 Nf3'), dueNow], [card('e4 e5 Bc4'), dueNow]]);
  const plan = planOf(w, states);
  assert.equal(plan.lines.length, 2);
  const views: TrainerView[] = [];
  const { effects, records } = run(trainer(w, plan, states), (view, n) => {
    views.push(view);
    return n === 0 ? { type: 'move', uci: 'f1c4', now: 0 } : right(view, n);
  });
  assert.ok(effects.some((e) => e.type === 'note' && e.note.kind === 'alsoPlays'));
  assert.deepEqual(records, [
    { k: 'review', card: card('e4 e5 Bc4'), g: 3, ms: 1000 },
    { k: 'review', card: card('e4 e5 Nf3'), g: 3, ms: 1000 },
  ]);
  // Bc4 was answered, so its line is passed over.
  assert.equal(effects.filter((e) => e.type === 'line').length, 1);
  assert.equal(views.length, 2);
});

test('conflicting moves: a sibling not due is accepted without a record; played again, it counts as wrong', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 (2. Bc4)'));
  const states = new Map<string, CardState>([[card('e4'), notDue], [card('e4 e5 Nf3'), dueNow], [card('e4 e5 Bc4'), notDue]]);
  const moves = ['f1c4', 'f1c4'];
  const { records } = run(trainer(w, planOf(w, states), states), (view, n) => (n < moves.length ? { type: 'move', uci: moves[n]!, now: 0 } : right(view, n)));
  assert.deepEqual(records, [{ k: 'review', card: card('e4 e5 Nf3'), g: 1, ms: 2000, w: ['f1c4'] }]);
});

test('a known move answered wrong is reviewed Again and never taught', () => {
  const w = world(chapter('Known001', 'white', '1. e4 e5 2. Nf3', { known: true }));
  const states = new Map<string, CardState>([[card('e4'), notDue]]);
  const plan = planOf(w, states, 20);
  assert.deepEqual(plan.lines.map((l) => [l.kind, l.ask.length, l.teach.length]), [['known', 1, 0]]);
  const { records } = run(trainer(w, plan, states), (view, n) => (n === 0 ? { type: 'move', uci: 'd2d4', now: 0 } : right(view, n)));
  assert.deepEqual(records, [{ k: 'review', card: card('e4 e5 Nf3'), g: 1, ms: 2000, w: ['d2d4'] }]);
});

test('a promotion needs its piece: without one nothing is answered, a wrong piece is wrong', () => {
  const fen = '8/4P3/8/8/8/k7/8/K7 w - - 0 1';
  const w = world(chapter('Chapter1', 'white', '1. e8=Q Ka2', { fen }));
  const states = new Map<string, CardState>([[card('e8=Q', fen), dueNow]]);
  const moves = ['e7e8', 'e7e8n', 'e7e8q'];
  const { effects, records } = run(trainer(w, planOf(w, states), states), (_, n) => ({ type: 'move', uci: moves[n]!, now: 0 }));
  assert.equal(effects.filter((e) => e.type === 'takeback').length, 2);
  assert.deepEqual(records, [{ k: 'review', card: card('e8=Q', fen), g: 1, ms: 3000, w: ['e7e8n'] }]);
});

test('castling may be played as king takes rook', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O'));
  const states = new Map<string, CardState>([...w.ix.cards.keys()].map((c) => [c, notDue]));
  states.set(card('e4 e5 Nf3 Nc6 Bc4 Bc5 O-O'), dueNow);
  const { records } = run(trainer(w, planOf(w, states), states), () => ({ type: 'move', uci: 'e1h1', now: 0 }));
  assert.deepEqual(records.map((r) => r.k === 'review' && r.g), [3]);
});

test('a stale tick is ignored; skipping a line moves to the next; stopping ends the session', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 (2. Bc4)'));
  const states = new Map<string, CardState>([[card('e4'), notDue], [card('e4 e5 Nf3'), dueNow], [card('e4 e5 Bc4'), dueNow]]);
  const t = trainer(w, planOf(w, states), states);
  const first = t.send({ type: 'start', now: 0 });
  const wait = first.find((e) => e.type === 'wait')!;
  assert.ok(wait.type === 'wait');
  assert.deepEqual(t.send({ type: 'tick', id: wait.id + 1, now: 1 }), []);
  assert.equal(t.view.phase, 'auto');
  const skipped = t.send({ type: 'skipLine', now: 2 });
  assert.deepEqual(skipped.find((e) => e.type === 'line'), { type: 'line', line: w.ix.lines[1], number: 2, total: 2, kind: 'review', path: [] });
  // The old timer's tick no longer counts.
  assert.deepEqual(t.send({ type: 'tick', id: wait.id, now: 3 }), []);
  // A move while the trainer is playing is taken back.
  assert.deepEqual(t.send({ type: 'move', uci: 'e2e4', now: 4 }), [{ type: 'takeback', path: [] }]);
  const done = t.send({ type: 'stop', now: 5 });
  assert.deepEqual(done, [{ type: 'done', summary: { lines: 2, reviews: 0, good: 0, taught: 0, suspended: 0 } }]);
  assert.deepEqual(t.send({ type: 'start', now: 6 }), []);
});

test('with recording off nothing is graded or taught on record; askAll asks every own move', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'));
  const states = new Map<string, CardState>([...w.ix.cards.keys()].map((c) => [c, notDue]));
  const line = w.ix.lines[0]!;
  const plan: SessionPlan = { lines: [{ kind: 'review', line, end: line.path.length, ask: [], teach: [] }] };
  const views: TrainerView[] = [];
  const { records, effects } = run(trainer(w, plan, states, { record: false, askAll: true }), (view, n) => (views.push(view), n === 1 ? { type: 'move', uci: 'a2a3', now: 0 } : right(view, n)));
  assert.deepEqual(records, []);
  assert.deepEqual(plays(effects), ['user:e4', 'opponent:e5', 'user:Nf3', 'opponent:Nc6', 'user:Bb5']);
  assert.deepEqual(views.map((v) => v.phase), ['ask', 'ask', 'wrong', 'ask']);
});

test('Interactive view: every own move asked, nothing recorded, and the walk follows the line the user chooses', () => {
  const c = chapter('Chapter1', 'black', '1. e4 c5 2. Nf3 d6 (2... Nc6 3. d4) 3. d4 cxd4');
  const w = world(c);
  const plan = interactivePlan(w.ix.lines, lineThrough(c, [])!, 0)!;
  assert.deepEqual(plan.lines[0]!.line.path, ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4']);
  // Played with no card states at all: nothing is suspended, known or due.
  const t = trainer(w, plan, new Map(), { record: false, askAll: true, follow: true });
  const { records, effects } = run(t, (view, n) => {
    if (n === 0) return { type: 'move', uci: 'd7d5', now: 0 };
    // 2... Nc6 is the other line's move: right, and the walk goes on along it.
    if (n === 2) return { type: 'move', uci: 'b8c6', now: 0 };
    return right(view, n);
  });
  assert.deepEqual(records, []);
  assert.deepEqual(plays(effects), ['opponent:e4', 'user:c5', 'opponent:Nf3', 'user:Nc6', 'opponent:d4']);
  assert.deepEqual(
    effects.flatMap((e) => (e.type === 'answer' ? [e.ok] : [])),
    [false, true],
  );
  assert.ok(!effects.some((e) => e.type === 'note' && e.note.kind === 'alsoPlays'));

  // Without `follow`, the same move is the conflict rule's: accepted, then the line's move asked.
  const strict = trainer(w, interactivePlan(w.ix.lines, lineThrough(c, [])!, 0)!, new Map(), { record: false, askAll: true });
  const second = run(strict, (view, n) => (n === 1 ? { type: 'move', uci: 'b8c6', now: 0 } : right(view, n)));
  assert.ok(second.effects.some((e) => e.type === 'note' && e.note.kind === 'alsoPlays'));
  assert.deepEqual(plays(second.effects), ['opponent:e4', 'user:c5', 'opponent:Nf3', 'user:d6', 'opponent:d4', 'user:cxd4']);
});

test('Interactive view: walked from the move shown, or from the start at the line\'s end', () => {
  const c = chapter('Chapter1', 'black', '1. e4 c5 2. Nf3 d6 (2... Nc6 3. d4) 3. d4 cxd4');
  const w = world(c);
  const from = (path: string[]) => {
    const plan = interactivePlan(w.ix.lines, lineThrough(c, path)!, path.length)!;
    return plays(run(trainer(w, plan, new Map(), { record: false, askAll: true, follow: true }), right).effects);
  };
  assert.deepEqual(from(['e4', 'c5', 'Nf3']), ['user:d6', 'opponent:d4', 'user:cxd4']);
  assert.deepEqual(from(['e4', 'c5', 'Nf3', 'Nc6']), ['opponent:d4']);
  assert.deepEqual(from(['e4', 'c5', 'Nf3', 'Nc6', 'd4']), ['opponent:e4', 'user:c5', 'opponent:Nf3', 'user:Nc6', 'opponent:d4']);
  assert.equal(interactivePlan(w.ix.lines, ['e4', 'c5', 'Nf3'], 0), undefined);
  assert.deepEqual(lineThrough(c, ['e4', 'c5', 'Nf3', 'Nc6']), ['e4', 'c5', 'Nf3', 'Nc6', 'd4']);
  assert.equal(lineThrough(c, ['e4', 'e5']), undefined);
});

test('random repertoires: every planned ask graded once, every teach taught once, the same effects twice', () => {
  let asks = 0;
  let teaches = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const random = mulberry32(seed);
    const chapters = Array.from({ length: 1 + Math.floor(random() * 3) }, (_, i) => {
      const c = randomChapter(random, `Rand000${i}`, { maxDepth: 9, maxChildren: 3 });
      if (random() < 0.3) c.headers.push(['RepworksKnown', 'true']);
      return c;
    });
    const w: World = { ix: indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters }]), chapters: new Map(chapters.map((c) => [c.id, c])) };
    const states = new Map<string, CardState>();
    for (const c of w.ix.cards.keys()) {
      const r = random();
      if (r < 0.3) continue;
      const s = r < 0.4 ? { ...learning } : reviewed(start + Math.floor((random() * 6 - 3) * DAY));
      if (random() < 0.05) s.suspended = true;
      states.set(c, s);
    }
    const plan = planOf(w, states, Math.floor(random() * 12));
    const answers = Array.from({ length: 500 }, () => random());
    const answerer: Answerer = (view, n) => {
      const r = answers[n % answers.length]!;
      if (view.phase === 'teach' || view.phase === 'shown' || r < 0.7) return right(view, n);
      if (r < 0.8) return { type: 'hint', now: 0 };
      // Any legal move: wrong, or another repertoire move.
      const pos = view.position!;
      const all = [...pos.allDests()].flatMap(([from, tos]) => [...tos].map((to) => ({ from, to })));
      const m = all[Math.floor(r * 1000) % all.length]!;
      const promo = pos.board.getRole(m.from) === 'pawn' && (m.to >> 3 === 7 || m.to >> 3 === 0) ? 'q' : '';
      const sq = (s: number) => `${'abcdefgh'[s & 7]}${(s >> 3) + 1}`;
      return { type: 'move', uci: `${sq(m.from)}${sq(m.to)}${promo}`, now: 0 };
    };
    const a = run(trainer(w, plan, states), answerer);
    const b = run(trainer(w, plan, states), answerer);
    assert.deepEqual(a.effects, b.effects, `seed ${seed}: deterministic`);
    const reviewsOf = (r: TrainerRecord[]) => r.filter((e) => e.k === 'review').map((e) => e.card);
    const reviewed_ = reviewsOf(a.records);
    const taught = a.records.filter((e) => e.k === 'taught').map((e) => e.card);
    assert.equal(new Set(reviewed_).size, reviewed_.length, `seed ${seed}: a card reviewed twice`);
    assert.equal(new Set(taught).size, taught.length, `seed ${seed}: a card taught twice`);
    for (const c of plan.lines.flatMap((l) => l.ask)) assert.ok(reviewed_.includes(c), `seed ${seed}: ask ${c} not graded`);
    for (const c of plan.lines.flatMap((l) => l.teach)) assert.ok(taught.includes(c), `seed ${seed}: teach ${c} not taught`);
    for (const c of taught) assert.ok(statusOf(states.get(c)) === 'fresh', `seed ${seed}`);
    for (const e of a.effects) if (e.type === 'wait') assert.ok(e.ms >= MIN_PACE_MS);
    asks += reviewed_.length;
    teaches += taught.length;
  }
  // The seeds exercise both.
  assert.ok(asks > 200 && teaches > 200, `${asks} asks, ${teaches} teaches`);
});

test('the planned line kinds come through to the line effect', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5'));
  const line = w.ix.lines[0]!;
  const pl: PlannedLine = { kind: 'new', line, end: 1, ask: [], teach: [card('e4')] };
  const t = trainer(w, { lines: [pl] }, new Map());
  const out = t.send({ type: 'start', now: 0 });
  assert.deepEqual(out[0], { type: 'line', line, number: 1, total: 1, kind: 'new', path: [] });
  assert.equal(t.view.phase, 'teach');
});

// ---- §5.17: the owner's second testing notes ------------------------------------------------

/** Plays a wrong move (one not in the line) the first time each of `sans` is asked, else the line's move. */
const wrongFirstOn = (...sans: string[]): Answerer => {
  const missed = new Set<string>();
  return (view, n) => {
    const san = view.line!.line.path[view.path.length]!;
    if (sans.includes(san) && !missed.has(san) && view.phase !== 'shown') {
      missed.add(san);
      return { type: 'move', uci: view.position!.turn === 'white' ? 'h2h3' : 'h7h6', now: 0 };
    }
    return right(view, n);
  };
};
const notes = (effects: TrainerEffect[]) => effects.flatMap((e) => (e.type === 'note' ? [e.note] : []));

{
  // Two lines sharing 1. e4 e5 2. Nf3 Nc6, every own move due: e4 answered right on the first line,
  // Nf3 answered wrong; the second line meets both again.
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5 4. c3) *'));
  const states = () => new Map<string, CardState>([...w.ix.cards.keys()].map((c) => [c, dueNow]));
  const second = (effects: TrainerEffect[]) => plays(effects.slice(effects.findIndex((e, i) => i > 0 && e.type === 'line')));
  const cases: [string, string[]][] = [
    // Every own move asked again (ungraded), so the line starts at the chapter's start.
    ['off', ['user:e4', 'opponent:e5', 'user:Nf3', 'opponent:Nc6', 'user:Bc4', 'opponent:Bc5', 'user:c3']],
    // The move answered right is played; the one answered wrong is asked again.
    ['session', ['user:Nf3', 'opponent:Nc6', 'user:Bc4', 'opponent:Bc5', 'user:c3']],
    // Both answered: the line starts where the board is, at its first due move.
    ['due', ['user:Bc4', 'opponent:Bc5', 'user:c3']],
    // The move answered wrong is difficult: asked again; the one answered right is played.
    ['difficult', ['user:Nf3', 'opponent:Nc6', 'user:Bc4', 'opponent:Bc5', 'user:c3']],
  ];
  for (const [mode, expectedPlays] of cases) {
    test(`auto-play ${mode}: a move answered right and one answered wrong, met again on the next line`, () => {
      const s = states();
      const { effects, records } = run(trainer(w, planOf(w, s), s, { autoPlay: mode as TrainerOptions['autoPlay'] }), wrongFirstOn('Nf3'));
      assert.deepEqual(second(effects), expectedPlays);
      // Each card graded once: e4 Good, Nf3 Again, Bb5, Bc4 and c3 Good; the second asks are practice.
      const graded = records.filter((r) => r.k === 'review');
      assert.equal(graded.length, 5);
      assert.deepEqual(new Set(graded.map((r) => r.card)).size, 5);
      assert.deepEqual(graded.map((r) => (r.k === 'review' ? r.g : 0)), [3, 1, 3, 3, 3]);
    });
  }
}

{
  // Three lines sharing 1. e4 e5 2. Nf3, every own move due; Nf3 missed on the first line.
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4 Bc5 4. c3) (3. d4) *'));
  const states = () => new Map<string, CardState>([...w.ix.cards.keys()].map((c) => [c, dueNow]));
  const lineStarts = (effects: TrainerEffect[]) => effects.flatMap((e, i) => (e.type === 'line' ? [i] : []));
  test('auto-play session: a miss answered right on a later line is played after it', () => {
    const s = states();
    const { effects } = run(trainer(w, planOf(w, s), s, { autoPlay: 'session' }), wrongFirstOn('Nf3'));
    const [, second, third] = lineStarts(effects);
    assert.deepEqual(plays(effects.slice(second, third)), ['user:Nf3', 'opponent:Nc6', 'user:Bc4', 'opponent:Bc5', 'user:c3']);
    assert.deepEqual(plays(effects.slice(third)), ['user:d4']);
  });
  test('auto-play session: a miss answered right when retried is played on the next line', () => {
    const s = states();
    const { effects, records } = run(trainer(w, planOf(w, s), s, { autoPlay: 'session', retryMistakes: 1 }), wrongFirstOn('Nf3'));
    const [, second, third] = lineStarts(effects);
    assert.deepEqual(plays(effects.slice(second, third)), ['user:Bc4', 'opponent:Bc5', 'user:c3']);
    // Still graded once, Again.
    assert.deepEqual(records.filter((r) => r.k === 'review' && r.card === card('e4 e5 Nf3')).map((r) => (r.k === 'review' ? r.g : 0)), [1]);
  });
}

test('auto-play difficult: a move with lapses is asked even when not due; an easy one is played', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'));
  const hard: CardState = { ...notDue, card: { ...notDue.card, lapses: 2 } };
  const states = new Map<string, CardState>([
    [card('e4'), notDue],
    [card('e4 e5 Nf3'), hard],
    [card('e4 e5 Nf3 Nc6 Bb5'), dueNow],
  ]);
  const plan = planOf(w, states);
  const easy = run(trainer(w, plan, states, { autoPlay: 'due' }), right);
  assert.deepEqual(plays(easy.effects), ['auto:e4', 'opponent:e5', 'auto:Nf3', 'opponent:Nc6', 'user:Bb5']);
  const { effects, records } = run(trainer(w, plan, states, { autoPlay: 'difficult' }), right);
  assert.deepEqual(plays(effects), ['auto:e4', 'opponent:e5', 'user:Nf3', 'opponent:Nc6', 'user:Bb5']);
  // Nf3, reviewed and asked, is graded too (§5.106).
  assert.deepEqual(records.map((r) => r.card), [card('e4 e5 Nf3'), card('e4 e5 Nf3 Nc6 Bb5')]);
});

test('auto-play session: a move taught is asked when met again; one found unaided is played', () => {
  // A new line taught, then a second sharing its start: Nf3 taught with its arrow, e4 found first try.
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4) *'));
  const plan = planOf(w, new Map(), 20);
  let tries = 0;
  const answerer: Answerer = (view, n) => {
    const san = view.line!.line.path[view.path.length]!;
    // Nf3 is first asked with no arrow: a wrong move shows nothing yet, Hint shows it.
    if (san === 'Nf3' && tries++ === 0) return { type: 'hint', now: 0 };
    return right(view, n);
  };
  const { effects, records } = run(trainer(w, plan, new Map(), { autoPlay: 'session', tryNew: true }), answerer);
  const after = plays(effects.slice(effects.findIndex((e, i) => i > 0 && e.type === 'line')));
  assert.deepEqual(after, ['user:Nf3', 'opponent:Nc6', 'user:Bc4']);
  assert.deepEqual(records.map((r) => r.k), ['taught', 'taught', 'taught', 'taught']);
  const taughtNotes = notes(effects).filter((n) => n.kind === 'taught');
  assert.deepEqual(taughtNotes.map((n) => (n.kind === 'taught' ? `${n.san}${n.found ? ' found' : ''}` : '')), ['e4 found', 'Nf3', 'Bb5 found', 'Bc4 found']);
});

test('try first: a new move is asked with no arrow; a wrong move then Hint show it; one taught, no review', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5'));
  const plan = planOf(w, new Map(), 20);
  const t = trainer(w, plan, new Map(), { tryNew: true });
  const first = t.send({ type: 'start', now: 0 });
  assert.equal(t.view.phase, 'ask');
  assert.equal(t.view.shown, undefined);
  assert.ok(!first.some((e) => e.type === 'arrow' && e.uci));
  assert.deepEqual(notes(first), [{ kind: 'newTry' }]);
  const wrong = t.send({ type: 'move', uci: 'd2d4', now: 1 });
  assert.deepEqual(notes(wrong), [{ kind: 'wrong' }]);
  assert.ok(!wrong.some((e) => e.type === 'arrow' && e.uci));
  const hint = t.send({ type: 'hint', now: 2 });
  assert.deepEqual(hint.find((e) => e.type === 'arrow'), { type: 'arrow', uci: 'e2e4' });
  assert.deepEqual(t.view.shown, { uci: 'e2e4', san: 'e4' });
  const done = t.send({ type: 'move', uci: 'e2e4', now: 3 });
  assert.deepEqual(done.flatMap((e) => (e.type === 'record' ? [e.event] : [])), [{ k: 'taught', card: card('e4') }]);
  assert.deepEqual(notes(done)[0], { kind: 'taught', san: 'e4' });
});

test('show sequence: new moves are watched up to the n-th, stepped through, then replayed with no arrow', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O'));
  const plan = planOf(w, new Map(), 20);
  const t = trainer(w, plan, new Map(), { sequence: 2 });
  const first = t.send({ type: 'start', now: 0 });
  assert.equal(t.view.phase, 'preview');
  assert.deepEqual(notes(first), [{ kind: 'sequence', count: 2 }]);
  assert.deepEqual(t.view.sequence, { from: 0, to: 3 });
  const watched: TrainerEffect[] = [];
  for (let i = 0; i < 3; i++) {
    const wait = [...first, ...watched].filter((e) => e.type === 'wait').at(-1) as { id: number; ms: number };
    assert.equal(wait.ms, 1200, 'twice the pace');
    watched.push(...t.send({ type: 'tick', id: wait.id, now: i }));
  }
  assert.deepEqual(plays(watched), ['preview:e4', 'preview:e5', 'preview:Nf3']);
  assert.equal(t.view.phase, 'previewed');
  assert.ok(!watched.slice(watched.findLastIndex((e) => e.type === 'play')).some((e) => e.type === 'wait'), 'it waits for the user');
  // Stepping stays within the sequence; nothing is recorded.
  t.send({ type: 'seek', ply: 1, now: 5 });
  assert.deepEqual(t.view.path, ['e4']);
  t.send({ type: 'seek', ply: 9, now: 6 });
  assert.deepEqual(t.view.path, ['e4', 'e5', 'Nf3']);
  // Replayed: from its start, the new move asked with no arrow.
  const replay = t.send({ type: 'ready', now: 7 });
  assert.deepEqual(t.view.path, []);
  assert.equal(t.view.phase, 'ask');
  assert.equal(t.view.sequence, undefined);
  assert.ok(!replay.some((e) => e.type === 'arrow' && e.uci));
  assert.deepEqual(notes(replay), [{ kind: 'newTry' }]);
  const e4 = t.send({ type: 'move', uci: 'e2e4', now: 8 });
  assert.deepEqual(e4.flatMap((e) => (e.type === 'record' ? [e.event] : [])), [{ k: 'taught', card: card('e4') }]);
  assert.deepEqual(notes(e4)[0], { kind: 'taught', san: 'e4', found: true });
  // The sequence's second new move after the opponent's; then the third new move starts another.
  const { effects, records } = run(t, right, day.now, e4);
  assert.deepEqual(records.map((r) => r.k), ['taught', 'taught', 'taught', 'taught']);
  assert.deepEqual(plays(effects).filter((p) => p.startsWith('preview')), ['preview:Bb5', 'preview:a6', 'preview:Ba4', 'preview:O-O']);
});

test('show sequence: a due move ends the sequence before it, so it is not given away', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'));
  const states = new Map<string, CardState>([[card('e4 e5 Nf3'), dueNow]]);
  const plan = planOf(w, states, 20);
  const t = trainer(w, plan, states, { sequence: 5, lineStart: 'start' });
  const shown: unknown[] = [];
  const { effects, records } = run(t, (view, n) => (shown.push(view.sequence), right(view, n)));
  assert.deepEqual(plays(effects).filter((p) => p.startsWith('preview')), ['preview:e4', 'preview:e5', 'preview:Bb5']);
  assert.deepEqual(shown.filter(Boolean), [], 'no sequence is shown while a move is asked');
  assert.deepEqual(records.map((r) => `${r.k}:${r.card === card('e4 e5 Nf3') ? 'Nf3' : r.card === card('e4') ? 'e4' : 'Bb5'}`), ['taught:e4', 'review:Nf3', 'taught:Bb5']);
});

{
  // 1. e4 and 2. Nf3 not due, 3. Bb5 and 4. Ba4 due.
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4'));
  const states = new Map<string, CardState>([
    [card('e4'), notDue],
    [card('e4 e5 Nf3'), notDue],
    [card('e4 e5 Nf3 Nc6 Bb5'), dueNow],
    [card('e4 e5 Nf3 Nc6 Bb5 a6 Ba4'), dueNow],
  ]);
  const asked = ['user:e4', 'opponent:e5', 'user:Nf3', 'opponent:Nc6', 'user:Bb5', 'opponent:a6', 'user:Ba4'];
  const cases: [TrainerOptions, string[], string[]][] = [
    // One move before the first due one, so the opponent's move is seen; whatever the mode.
    [{ lineStart: 'first' }, ['e4', 'e5', 'Nf3'], ['opponent:Nc6', 'user:Bb5', 'opponent:a6', 'user:Ba4']],
    [{ lineStart: 'first', autoPlay: 'session' }, ['e4', 'e5', 'Nf3'], ['opponent:Nc6', 'user:Bb5', 'opponent:a6', 'user:Ba4']],
    // From the start, the mode decides each move before the first due one too (§5.113).
    [{ lineStart: 'start' }, [], ['auto:e4', 'opponent:e5', 'auto:Nf3', 'opponent:Nc6', 'user:Bb5', 'opponent:a6', 'user:Ba4']],
    [{ lineStart: 'start', autoPlay: 'off' }, [], asked],
    // The owner's report (2026-10-16): with "answered right this session", a move not answered yet is asked.
    [{ lineStart: 'start', autoPlay: 'session' }, [], asked],
  ];
  for (const [options, path, expectedPlays] of cases) {
    test(`a line starts ${options.lineStart === 'first' ? 'at its first due move' : 'from the start'}, auto-play ${options.autoPlay ?? 'due'}`, () => {
      const { effects, records } = run(trainer(w, planOf(w, states), states, options), right);
      assert.deepEqual(effects.find((e) => e.type === 'line')?.type === 'line' && (effects.find((e) => e.type === 'line') as { path: string[] }).path, path);
      assert.deepEqual(plays(effects), expectedPlays);
      // The due moves are graded; the reviewed moves asked before them too (§5.106).
      const before = expectedPlays === asked ? [card('e4'), card('e4 e5 Nf3')] : [];
      assert.deepEqual(records.map((r) => r.card), [...before, card('e4 e5 Nf3 Nc6 Bb5'), card('e4 e5 Nf3 Nc6 Bb5 a6 Ba4')]);
    });
  }

  test('a line started from the start goes back to the chapter\'s start even when the board shares its moves', () => {
    const w2 = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4) *'));
    const s = new Map<string, CardState>([...w2.ix.cards.keys()].map((c) => [c, dueNow]));
    const { effects } = run(trainer(w2, planOf(w2, s), s, { lineStart: 'start' }), right);
    const lines = effects.filter((e) => e.type === 'line');
    assert.equal(lines.length, 2);
    assert.deepEqual((lines[1] as { path: string[] }).path, []);
    assert.deepEqual(plays(effects.slice(effects.indexOf(lines[1]!))), ['auto:e4', 'opponent:e5', 'auto:Nf3', 'opponent:Nc6', 'user:Bc4']);
  });
}

// ---- A line starting where it branches from the last (the owner's request, 2026-10-18, §5.121) ----

{
  // Two lines branching after 1... e5: 2. Nf3 Nc6 3. Bb5, and 2. Bc4 Nf6 3. d3. Bb5 and d3 due.
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 (2. Bc4 Nf6 3. d3) 2... Nc6 3. Bb5'));
  const states = new Map<string, CardState>([
    [card('e4'), notDue],
    [card('e4 e5 Nf3'), notDue],
    [card('e4 e5 Nf3 Nc6 Bb5'), dueNow],
    [card('e4 e5 Bc4'), notDue],
    [card('e4 e5 Bc4 Nf6 d3'), dueNow],
  ]);
  const linePaths = (effects: TrainerEffect[]) => effects.flatMap((e) => (e.type === 'line' ? [e.path] : []));

  test('where it branches: the chapter\'s first line from the start, the next from the last move the two share, the mode deciding each move', () => {
    const { effects, records } = run(trainer(w, planOf(w, states), states, { lineStart: 'branch' }), right);
    assert.deepEqual(linePaths(effects), [[], ['e4', 'e5']]);
    assert.deepEqual(plays(effects), ['auto:e4', 'opponent:e5', 'auto:Nf3', 'opponent:Nc6', 'user:Bb5', 'auto:Bc4', 'opponent:Nf6', 'user:d3']);
    assert.deepEqual(records.map((r) => r.card), [card('e4 e5 Nf3 Nc6 Bb5'), card('e4 e5 Bc4 Nf6 d3')]);
    // With auto-play off, the moves from where it branches are asked.
    const off = run(trainer(w, planOf(w, states), states, { lineStart: 'branch', autoPlay: 'off' }), right);
    assert.deepEqual(plays(off.effects).slice(5), ['user:Bc4', 'opponent:Nf6', 'user:d3']);
    // At its first due move, the second line skips 2. Bc4 (one move before d3).
    const first = run(trainer(w, planOf(w, states), states, { lineStart: 'first' }), right);
    assert.deepEqual(linePaths(first.effects)[1], ['e4', 'e5', 'Bc4']);
  });

  test('where it branches: a line of another chapter starts from its start', () => {
    const w2 = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3'), chapter('Chapter2', 'white', '1. e4 c5 2. Nf3'));
    const s = new Map<string, CardState>([[card('e4'), notDue], [card('e4 e5 Nf3'), dueNow], [card('e4 c5 Nf3'), dueNow]]);
    const { effects } = run(trainer(w2, planOf(w2, s), s, { lineStart: 'branch' }), right);
    assert.deepEqual(linePaths(effects), [[], []]);
    assert.deepEqual(plays(effects), ['auto:e4', 'opponent:e5', 'user:Nf3', 'auto:e4', 'opponent:c5', 'user:Nf3']);
  });

  test('where it branches: a later pass starts where the first did', () => {
    // 3. d3 never answered: taught, then asked on the second pass.
    const s = new Map(states);
    s.delete(card('e4 e5 Bc4 Nf6 d3'));
    const { effects } = run(trainer(w, planOf(w, s, 20), s, { lineStart: 'branch', repetitions: 2 }), right);
    assert.deepEqual(effects.find((e) => e.type === 'takeback'), { type: 'takeback', path: ['e4', 'e5'] });
    assert.deepEqual(plays(effects).slice(5), ['auto:Bc4', 'opponent:Nf6', 'user:d3', 'auto:Bc4', 'opponent:Nf6', 'user:d3']);
  });

  test('where it branches: only as far as the last walk went, so a line skipped short of the split shares less', () => {
    // The first line skipped at 2. Nf3 (due): the next shares only 1. e4 e5 with what was walked.
    const w3 = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4)'));
    const s = new Map<string, CardState>([[card('e4'), notDue], [card('e4 e5 Nf3'), dueNow], [card('e4 e5 Nf3 Nc6 Bb5'), dueNow], [card('e4 e5 Nf3 Nc6 Bc4'), dueNow]]);
    let skipped = false;
    const { effects } = run(trainer(w3, planOf(w3, s), s, { lineStart: 'branch' }), (view, n) => {
      if (skipped) return right(view, n);
      skipped = true;
      return { type: 'skipLine', now: 0 };
    });
    assert.deepEqual(linePaths(effects), [[], ['e4', 'e5']]);
    // 2. Nf3, never answered in the session, is asked on the next line.
    assert.deepEqual(plays(effects), ['auto:e4', 'opponent:e5', 'user:Nf3', 'opponent:Nc6', 'user:Bc4']);
  });
}

test('a line\'s end held: no timer, the next line named, and `next` goes on; the last line ends the session at once', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 (2. Nc3) *'));
  const plan = planOf(w, new Map(), 20);
  assert.equal(plan.lines.length, 2);
  const t = trainer(w, plan, new Map(), { holdLineEnd: true });
  let out = t.send({ type: 'start', now: 0 });
  /** Ticks the timers and plays the moves taught until the phase is not one of those. */
  const drive = () => {
    for (let guard = 0; guard < 20; guard++) {
      const wait = out.find((e) => e.type === 'wait');
      if (t.view.phase === 'teach') out = t.send({ type: 'move', uci: expected(t.view), now: 1 });
      else if (wait?.type === 'wait') out = t.send({ type: 'tick', id: wait.id, now: 1 });
      else return;
    }
  };
  drive();
  assert.equal(t.view.phase, 'lineDone');
  assert.ok(!out.some((e) => e.type === 'wait'));
  assert.equal(t.view.upcoming, plan.lines[1]);
  assert.deepEqual(t.send({ type: 'tick', id: 99, now: 5 }), []);
  out = t.send({ type: 'next', now: 6 });
  assert.equal(out[0]!.type, 'line');
  assert.equal(t.view.phase, 'teach');
  out = t.send({ type: 'move', uci: 'b1c3', now: 7 });
  assert.deepEqual(out.slice(-2).map((e) => e.type), ['lineDone', 'done']);
  assert.ok(!out.some((e) => e.type === 'wait'));
  assert.equal(t.view.phase, 'sessionDone');
  // The board stays on the last line's end.
  assert.deepEqual(t.view.path, ['e4', 'e5', 'Nc3']);
});

test('a line\'s end goes on after the paces asked', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 (2. Nc3) *'));
  const { effects } = run(trainer(w, planOf(w, new Map(), 20), new Map(), { lineEndPaces: 4 }), right);
  const i = effects.findIndex((e) => e.type === 'lineDone');
  assert.deepEqual(effects[i + 1], { type: 'wait', ms: 2400, id: (effects[i + 1] as { id: number }).id });
});

test('random repertoires under every auto-play mode, line start, repetitions and retries: every planned ask graded once, every teach taught once', () => {
  for (let seed = 1; seed <= 120; seed++) {
    const random = mulberry32(seed * 7919);
    const chapters = Array.from({ length: 1 + Math.floor(random() * 3) }, (_, i) => {
      const c = randomChapter(random, `Rand000${i}`, { maxDepth: 9, maxChildren: 3 });
      if (random() < 0.3) c.headers.push(['RepworksKnown', 'true']);
      return c;
    });
    const w: World = { ix: indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters }]), chapters: new Map(chapters.map((c) => [c.id, c])) };
    const states = new Map<string, CardState>();
    for (const c of w.ix.cards.keys()) {
      const r = random();
      if (r < 0.3) continue;
      const s = r < 0.4 ? { ...learning } : reviewed(start + Math.floor((random() * 6 - 3) * DAY));
      if (random() < 0.15) s.card = { ...s.card, lapses: 2 };
      if (random() < 0.05) s.suspended = true;
      states.set(c, s);
    }
    const plan = planOf(w, states, Math.floor(random() * 12));
    const options: TrainerOptions = {
      autoPlay: AUTO_PLAYS[seed % 4]!,
      lineStart: LINE_STARTS[Math.floor(seed / 4) % LINE_STARTS.length]!,
      tryNew: random() < 0.5,
      sequence: random() < 0.3 ? 1 + Math.floor(random() * 5) : 0,
      holdLineEnd: random() < 0.5,
      repetitions: 1 + (seed % 3),
      retryMistakes: Math.floor(seed / 3) % 3,
    };
    const answers = Array.from({ length: 500 }, () => random());
    const answerer: Answerer = (view, n) => {
      const r = answers[n % answers.length]!;
      if (view.phase === 'teach' || view.phase === 'shown' || r < 0.7) return right(view, n);
      if (r < 0.8) return { type: 'hint', now: 0 };
      const pos = view.position!;
      const all = [...pos.allDests()].flatMap(([from, tos]) => [...tos].map((to) => ({ from, to })));
      const m = all[Math.floor(r * 1000) % all.length]!;
      const promo = pos.board.getRole(m.from) === 'pawn' && (m.to >> 3 === 7 || m.to >> 3 === 0) ? 'q' : '';
      const sq = (x: number) => `${'abcdefgh'[x & 7]}${(x >> 3) + 1}`;
      return { type: 'move', uci: `${sq(m.from)}${sq(m.to)}${promo}`, now: 0 };
    };
    const a = run(trainer(w, plan, states, options), answerer);
    const b = run(trainer(w, plan, states, options), answerer);
    const what = `seed ${seed} ${JSON.stringify(options)}`;
    assert.deepEqual(a.effects, b.effects, `${what}: deterministic`);
    const reviewed_ = a.records.filter((e) => e.k === 'review').map((e) => e.card);
    const taught = a.records.filter((e) => e.k === 'taught').map((e) => e.card);
    assert.equal(new Set(reviewed_).size, reviewed_.length, `${what}: a card reviewed twice`);
    assert.equal(new Set(taught).size, taught.length, `${what}: a card taught twice`);
    for (const c of plan.lines.flatMap((l) => l.ask)) assert.ok(reviewed_.includes(c), `${what}: ask ${c} not graded`);
    for (const c of plan.lines.flatMap((l) => l.teach)) assert.ok(taught.includes(c), `${what}: teach ${c} not taught`);
    // Nothing in its learning step is graded unless the plan asks it (§5.106).
    for (const c of reviewed_) assert.ok(plan.lines.some((l) => l.ask.includes(c)) || statusOf(states.get(c)) !== 'learning' || [...w.ix.positions.values()].some((p) => p.own.size > 1), `${what}: ${c} graded though not asked`);
    for (const e of a.effects) if (e.type === 'wait') assert.ok(e.ms >= MIN_PACE_MS, what);
  }
});

// ---- Repetitions, mistakes retried, missed moves again (the owner's requests, 2026-10-08) ----

const answersOf = (effects: TrainerEffect[]) => effects.flatMap((e) => (e.type === 'answer' ? [e] : []));

test('repetitions: a line on which moves were taught is walked again, the moves taught asked and nothing recorded twice', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'));
  const views: TrainerView[] = [];
  const { effects, records } = run(trainer(w, planOf(w, new Map(), 20), new Map(), { repetitions: 2 }), (view, n) => (views.push(view), right(view, n)));
  assert.deepEqual(views.map((v) => v.phase), ['teach', 'teach', 'teach', 'ask', 'ask', 'ask']);
  assert.deepEqual(views.map((v) => v.pass?.n ?? 1), [1, 1, 1, 2, 2, 2]);
  assert.deepEqual(views[3]!.pass, { n: 2, of: 2 });
  assert.deepEqual(records.map((r) => r.k), ['taught', 'taught', 'taught']);
  assert.deepEqual(plays(effects), ['user:e4', 'opponent:e5', 'user:Nf3', 'opponent:Nc6', 'user:Bb5', 'user:e4', 'opponent:e5', 'user:Nf3', 'opponent:Nc6', 'user:Bb5']);
  assert.ok(notes(effects).some((n) => n.kind === 'repeat' && n.pass === 2 && n.of === 2));
  // The second pass's answers are repeats, and no arrow shows them.
  assert.deepEqual(answersOf(effects).map((a) => a.repeat ?? false), [true, true, true]);
  const second = effects.findIndex((e) => e.type === 'takeback');
  assert.deepEqual(effects[second], { type: 'takeback', path: [] });
  assert.ok(!effects.slice(second).some((e) => e.type === 'arrow' && e.uci));
  assert.equal(effects.filter((e) => e.type === 'line').length, 1);
});

test('repetitions: once by default, three when asked; a line with nothing taught is walked once; never in show and grade', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3'));
  const asks = (opts: TrainerOptions & { selfGrade?: boolean }, states = new Map<string, CardState>()) => {
    let n = 0;
    run(new Trainer({ index: w.ix, plan: planOf(w, states, 20), states, startOf: startOf(w), paceMs: 600, ...opts }), (view, k) => {
      n++;
      if (opts.selfGrade) return view.phase === 'shown' ? { type: 'tell', knew: true, now: 0 } : { type: 'show' };
      return right(view, k);
    });
    return n;
  };
  assert.equal(asks({}), 2);
  assert.equal(asks({ repetitions: 3 }), 6);
  assert.equal(asks({ repetitions: 2 }, new Map([[card('e4'), dueNow], [card('e4 e5 Nf3'), dueNow]])), 2);
  // Show and grade: each move shown, then told.
  assert.equal(asks({ repetitions: 2, selfGrade: true }), 4);
});

test('repetitions: the next pass starts as a line does, at its first move taught with the opponent\'s move before it', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'));
  const states = new Map<string, CardState>([[card('e4'), notDue], [card('e4 e5 Nf3'), notDue]]);
  const { effects } = run(trainer(w, planOf(w, states, 20), states, { repetitions: 2, lineStart: 'first' }), right);
  const back = effects.find((e) => e.type === 'takeback');
  assert.deepEqual(back, { type: 'takeback', path: ['e4', 'e5', 'Nf3'] });
  assert.deepEqual(plays(effects), ['opponent:Nc6', 'user:Bb5', 'opponent:Nc6', 'user:Bb5']);
});

test('from the start with auto-play off: every own move is asked on every pass; each graded once', () => {
  // The owner's report (2026-10-09): the second pass auto-played the moves answered on the first.
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'));
  const states = new Map<string, CardState>([[card('e4'), notDue], [card('e4 e5 Nf3'), notDue]]);
  const user = ['user:e4', 'opponent:e5', 'user:Nf3', 'opponent:Nc6', 'user:Bb5'];
  const { effects, records } = run(trainer(w, planOf(w, states, 20), states, { repetitions: 2, lineStart: 'start', autoPlay: 'off' }), right);
  assert.deepEqual(plays(effects), [...user, ...user]);
  // e4 and Nf3, reviewed, are graded on their first ask (§5.106); Bb5 is taught.
  assert.deepEqual(records.map((r) => [r.k, r.card]), [['review', card('e4')], ['review', card('e4 e5 Nf3')], ['taught', card('e4 e5 Nf3 Nc6 Bb5')]]);
  // Answered right this session (§5.113): asked on the first pass, played on the second; Bb5 taught, then asked.
  const session = run(trainer(w, planOf(w, states, 20), states, { repetitions: 2, lineStart: 'start', autoPlay: 'session' }), right);
  assert.deepEqual(plays(session.effects), [...user, 'auto:e4', 'opponent:e5', 'auto:Nf3', 'opponent:Nc6', 'user:Bb5']);
});

test('mistakes retried: at the line\'s end the missed move is asked again from the opponent\'s move, until right twice in a row; graded once', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'));
  const states = new Map<string, CardState>([[card('e4'), notDue], [card('e4 e5 Nf3'), dueNow], [card('e4 e5 Nf3 Nc6 Bb5'), dueNow]]);
  const views: TrainerView[] = [];
  // Nf3 missed, Bb5 right; then the retries: wrong (and right), right, right.
  const moves: (string | undefined)[] = ['d2d4', undefined, undefined, 'd2d4', undefined, undefined, undefined];
  const { effects, records } = run(trainer(w, planOf(w, states), states, { retryMistakes: 2 }), (view, n) => {
    views.push(view);
    const m = moves[n];
    return m ? { type: 'move', uci: m, now: 0 } : right(view, n);
  });
  assert.deepEqual(records, [
    { k: 'review', card: card('e4 e5 Nf3'), g: 1, ms: 2000, w: ['d2d4'] },
    { k: 'review', card: card('e4 e5 Nf3 Nc6 Bb5'), g: 3, ms: 1000 },
  ]);
  assert.ok(notes(effects).some((n) => n.kind === 'retryMistakes' && n.count === 1 && n.need === 2));
  // Each retry starts before the opponent's move: the board goes back to 1. e4, then e5 is played.
  const retries = views.slice(3);
  assert.deepEqual(retries.map((v) => v.retry?.streak), [0, 0, 0, 1]);
  assert.deepEqual(retries.map((v) => v.path), [['e4', 'e5'], ['e4', 'e5'], ['e4', 'e5'], ['e4', 'e5']]);
  assert.deepEqual(effects.filter((e) => e.type === 'takeback' && e.path.length === 1).length, 3);
  assert.deepEqual(answersOf(effects).map((a) => [a.ok, a.repeat ?? false]), [[false, false], [true, false], [false, true], [true, true], [true, true]]);
  // Back to the line's end when the retries are done.
  assert.deepEqual(effects.slice(-3), [{ type: 'takeback', path: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] }, { type: 'lineDone' }, effects.at(-1)]);
  assert.equal(effects.at(-1)!.type, 'done');
  assert.ok(notes(effects).some((n) => n.kind === 'retry' && n.streak === 1 && n.need === 2));
});

test('mistakes retried take turns; a hint is a miss; a practice ask counts; not retried when off, nor in show and grade', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'));
  const states = new Map<string, CardState>([[card('e4'), notDue], [card('e4 e5 Nf3'), dueNow], [card('e4 e5 Nf3 Nc6 Bb5'), notDue]]);
  const asked: string[] = [];
  // A line picked, auto-play off: e4 right (a practice ask); Nf3 hinted; Bb5 (practice) wrong, then right.
  const line = w.ix.lines[0]!;
  const picked: SessionPlan = { lines: [{ kind: 'pick', line, end: line.path.length, ask: [card('e4 e5 Nf3')], teach: [] }] };
  run(trainer(w, picked, states, { retryMistakes: 2, autoPlay: 'off' }), (view, n) => {
    asked.push(`${view.phase}:${view.line!.line.path[view.path.length]}`);
    if (n === 1) return { type: 'hint', now: 0 };
    if (n === 3) return { type: 'move', uci: 'd2d4', now: 0 };
    return right(view, n);
  });
  assert.deepEqual(asked, ['ask:e4', 'ask:Nf3', 'shown:Nf3', 'ask:Bb5', 'wrong:Bb5', 'ask:Nf3', 'ask:Bb5', 'ask:Nf3', 'ask:Bb5']);
  const plain = (opts: TrainerOptions & { selfGrade?: boolean }) => {
    let n = 0;
    run(new Trainer({ index: w.ix, plan: planOf(w, states), states, startOf: startOf(w), paceMs: 600, ...opts }), (view, k) => {
      n++;
      if (opts.selfGrade) return view.phase === 'shown' ? { type: 'tell', knew: false, now: 0 } : { type: 'show' };
      return view.phase === 'shown' ? right(view, k) : { type: 'hint', now: 0 };
    });
    return n;
  };
  assert.equal(plain({ retryMistakes: 0 }), 2);
  assert.equal(plain({ retryMistakes: 2, selfGrade: true }), 2);
});

test('show and grade with retryShown: a walk\'s failed moves shown again at its end from the move before, each until known once; nothing graded twice', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'));
  const states = new Map<string, CardState>([[card('e4'), notDue], [card('e4 e5 Nf3'), dueNow], [card('e4 e5 Nf3 Nc6 Bb5'), dueNow]]);
  const views: TrainerView[] = [];
  // Nf3 failed, Bb5 known; then Nf3's retries: failed, known.
  const tells = [false, true, false, true];
  let told = 0;
  const { effects, records } = run(trainer(w, planOf(w, states), states, { retryMistakes: 2, retryShown: true, selfGrade: true }), (view) => {
    views.push(view);
    return view.phase === 'shown' ? { type: 'tell', knew: tells[told++]!, now: 0 } : { type: 'show' };
  });
  assert.equal(told, 4);
  assert.deepEqual(records.map((r) => [r.card, r.k === 'review' && r.g]), [[card('e4 e5 Nf3'), 1], [card('e4 e5 Nf3 Nc6 Bb5'), 3]]);
  // One known show is enough: the note says once, and the streak needs one.
  assert.ok(notes(effects).some((n) => n.kind === 'retryMistakes' && n.count === 1 && n.need === 1));
  assert.ok(notes(effects).some((n) => n.kind === 'retry' && n.need === 1));
  // The retries are on the same line, from 1. e4 e5: no new line starts.
  assert.equal(effects.filter((e) => e.type === 'line').length, 1);
  const retries = views.filter((v) => v.retry);
  assert.ok(retries.length > 0 && retries.every((v) => v.number === 1 && v.path.slice(0, 2).join(' ') === 'e4 e5'));
  assert.deepEqual(answersOf(effects).map((a) => [a.ok, a.repeat ?? false]), [[false, false], [true, false], [false, true], [true, true]]);
  assert.equal(effects.at(-1)!.type, 'done');
  // Without retryShown (Learn), or with retries off, nothing is shown again.
  const shows = (opts: TrainerOptions) => {
    let n = 0;
    run(new Trainer({ index: w.ix, plan: planOf(w, states), states, startOf: startOf(w), paceMs: 600, selfGrade: true, ...opts }), (view) => {
      n++;
      return view.phase === 'shown' ? { type: 'tell', knew: false, now: 0 } : { type: 'show' };
    });
    return n;
  };
  assert.equal(shows({ retryMistakes: 2 }), 4);
  assert.equal(shows({ retryMistakes: 0, retryShown: true }), 4);
});

test('mistakes retried after a pass of repetitions: missed moves of the second pass are asked again before the next line', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 (2. Nc3) *'));
  const asked: string[] = [];
  let missed = false;
  run(trainer(w, planOf(w, new Map(), 20), new Map(), { repetitions: 2, retryMistakes: 1 }), (view, n) => {
    const v = view.pass ? `p${view.pass.n}` : view.retry ? 'r' : 'p1';
    asked.push(`${v}:${view.phase}:${view.line!.line.path[view.path.length]}`);
    // Nf3 missed once on the second pass.
    if (!missed && view.pass?.n === 2 && view.path.length === 2) {
      missed = true;
      return { type: 'move', uci: 'd2d4', now: 0 };
    }
    return right(view, n);
  });
  assert.deepEqual(asked, [
    'p1:teach:e4', 'p1:teach:Nf3', 'p2:ask:e4', 'p2:ask:Nf3', 'p2:wrong:Nf3', 'p2:ask:Nf3',
    // The second line: Nc3 taught (e4 already answered and played), then its own second pass.
    'p1:teach:Nc3', 'p2:ask:Nc3',
  ]);
});

test('mistakes retried when learning: a new move tried wrong, or played after a hint, is asked again at the walk\'s end; nothing recorded twice (§5.110)', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'));
  const asked: string[] = [];
  const { records } = run(trainer(w, planOf(w, new Map(), 20), new Map(), { tryNew: true, retryMistakes: 1 }), (view, n) => {
    asked.push(`${view.retry ? 'r' : 'p1'}:${view.phase}:${view.line!.line.path[view.path.length]}`);
    // e4 tried wrong, Nf3 hinted, Bb5 found.
    if (n === 0) return { type: 'move', uci: 'd2d4', now: 0 };
    if (n === 2) return { type: 'hint', now: 0 };
    return right(view, n);
  });
  assert.deepEqual(asked, ['p1:ask:e4', 'p1:wrong:e4', 'p1:ask:Nf3', 'p1:shown:Nf3', 'p1:ask:Bb5', 'r:ask:e4', 'r:ask:Nf3']);
  assert.deepEqual(records.map((r) => [r.k, r.card]), [['taught', card('e4')], ['taught', card('e4 e5 Nf3')], ['taught', card('e4 e5 Nf3 Nc6 Bb5')]]);
});

test('missed again (drill): a move answered wrong is asked again after the others, until each is right', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5'));
  const line = w.ix.lines[0]!;
  const items = [
    { card: card('e4 e5 Nf3'), line, ply: 2 },
    { card: card('e4 e5 Nf3 Nc6 Bb5'), line, ply: 4 },
  ];
  const plan: SessionPlan = { lines: items.map((m) => ({ kind: 'review', line: m.line, end: m.ply + 1, ask: [m.card], teach: [], from: Math.max(0, m.ply - 1) })) };
  const asked: string[] = [];
  // Nf3 missed, Bb5 right, Nf3 missed again, then right.
  const { effects, records } = run(new Trainer({ index: w.ix, plan, states: new Map(), startOf: startOf(w), paceMs: 450, record: false, askOnly: true, repeatMissed: true }), (view, n) => {
    asked.push(`${view.phase}:${view.line!.line.path[view.path.length]}`);
    return n === 0 || n === 3 ? { type: 'hint', now: 0 } : right(view, n);
  });
  assert.deepEqual(asked, ['ask:Nf3', 'shown:Nf3', 'ask:Bb5', 'ask:Nf3', 'shown:Nf3', 'ask:Nf3']);
  assert.deepEqual(records, []);
  assert.deepEqual(answersOf(effects).map((a) => [a.ok, a.repeat ?? false]), [[false, false], [true, false], [false, true], [true, true]]);
  assert.ok(notes(effects).some((n) => n.kind === 'missedAgain'));
  const lines = effects.flatMap((e) => (e.type === 'line' ? [[e.number, e.total]] : []));
  assert.deepEqual(lines, [[1, 2], [2, 3], [3, 3], [4, 4]]);
  const done = effects.at(-1);
  assert.ok(done?.type === 'done' && done.summary.lines === 2);
});

test('repetitions on a line picked: the next pass plays the moves before the first move taught, as the first did', () => {
  const w = world(chapter('Chapter1', 'black', '1. e4 c5 2. c3 Nf6'));
  const states = new Map<string, CardState>([[card('e4 c5'), dueNow]]);
  const line = w.ix.lines[0]!;
  // A paused line picked: nothing asked or taught on record; c5, not due, played.
  const plan: SessionPlan = { lines: [{ kind: 'pick', line, end: line.path.length, ask: [], teach: [] }] };
  const asked: string[] = [];
  run(trainer(w, plan, states, { record: false, lineStart: 'start', repetitions: 2 }), (view, n) => {
    asked.push(`${view.phase}:${view.line!.line.path[view.path.length]}`);
    return right(view, n);
  });
  assert.deepEqual(asked, ['teach:Nf6', 'ask:Nf6']);
});

// ---- Lines from the comments quizzed in review (the owner's request, 2026-10-12) ----------------

/** A queue's trainer with the lines from the comments of a Black repertoire, quizzed as `comments` says. */
const quizzing = (w: World, plan: SessionPlan, states: Map<string, CardState>, extra: TrainerOptions = {}) =>
  new Trainer({
    index: w.ix,
    plan,
    states,
    startOf: startOf(w),
    paceMs: 600,
    lineStart: 'first',
    comments: 'all' satisfies CommentQuiz,
    commentLines: (line) => quizLinesOf(w.chapters.get(line.cid)!, line.path, 'black', w.ix),
    ...extra,
  });
/** "Quiz lines" at a line's end, when there are any. */
const quizEnd = (view: TrainerView): TrainerCommand | undefined => (view.endQuiz ? { type: 'quizComments', now: 0 } : undefined);
/** A session run with "Quiz lines" pressed at each line's end. */
const runQuiz = (t: Trainer, answer: Answerer) => run(t, answer, day.now, [], quizEnd);
/** The repertoire's move, or the comment's line's on the board. */
const either: Answerer = (view, n) => (view.aside ? { type: 'move', uci: view.aside.line.ucis[view.aside.ply]!, now: 0 } : right(view, n));
const due = (w: World) => new Map<string, CardState>([...w.ix.cards.keys()].map((c) => [c, dueNow]));
const SICILIAN = '1. e4 c5 2. Nf3 { White can also play (2. c3 Nf6 3. e5 Nd5) } 2... d6 3. d4 cxd4';

test('comment lines: offered as the walk reaches them, quizzed on the board by "Quiz lines" at its end, nothing recorded', () => {
  const w = world(chapter('Chapter1', 'black', SICILIAN));
  const states = due(w);
  const t = quizzing(w, planOf(w, states), states);
  const views: TrainerView[] = [];
  const ends: TrainerView[] = [];
  const { effects, records } = run(t, (view, n) => (views.push(view), either(view, n)), day.now, [], (view) => (ends.push(view), quizEnd(view)));
  // The line's end waits for "Quiz lines" (1 line) or "Next line"; after the quiz, the session's end.
  assert.deepEqual(ends.map((v) => v.endQuiz), [1]);
  assert.ok(ends[0]!.canQuiz);
  // Asked: c5 (before the branch: nothing offered yet), d6 and cxd4 (offered), then Nf6 and Nd5.
  assert.deepEqual(views.map((v) => v.comments?.map((c) => `${c.line.label}:${c.on}`)), [undefined, ['2. c3:true'], ['2. c3:true'], ['2. c3:true'], ['2. c3:true']]);
  assert.deepEqual(views.map((v) => v.aside && `${v.aside.n}/${v.aside.of} ${v.path.join(' ')}`), [undefined, undefined, undefined, '1/1 e4 c5', '1/1 e4 c5']);
  assert.deepEqual(views[3]!.comments!.map((c) => c.done), [true]);
  assert.deepEqual(plays(effects), ['opponent:e4', 'user:c5', 'opponent:Nf3', 'user:d6', 'opponent:d4', 'user:cxd4', 'opponent:c3', 'user:Nf6', 'opponent:e5', 'user:Nd5']);
  // The board goes back to where the line starts, and to the line's end after it.
  const backs = effects.flatMap((e) => (e.type === 'takeback' ? [e.path.join(' ')] : []));
  assert.deepEqual(backs, ['e4 c5', 'e4 c5 Nf3 d6 d4 cxd4']);
  assert.deepEqual(records.map((r) => r.k), ['review', 'review', 'review']);
  assert.deepEqual(notes(effects).filter((n) => n.kind === 'aside')[0], { kind: 'aside', n: 1, of: 1, important: false });
  assert.deepEqual(t.view.asides, { lines: 1, moves: 2, right: 2 });
  // The session's own numbers count the repertoire's moves alone.
  assert.equal(effects.filter((e) => e.type === 'answer').length, 3);
});

test('comment lines: off offers none; important quizzes the ones marked ! or !!; pick only those picked', () => {
  const w = world(chapter('Chapter1', 'black', '1. e4 c5 2. Nf3 { (2. c3 Nf6 3. e5 Nd5) (2. Nc3! Nc6 3. g3) } 2... d6 3. d4 cxd4'));
  const states = due(w);
  const off = runQuiz(quizzing(w, planOf(w, states), states, { comments: 'off' }), (view, n) => {
    assert.equal(view.comments, undefined);
    return either(view, n);
  });
  assert.deepEqual(plays(off.effects).slice(6), []);
  const important = quizzing(w, planOf(w, states), states, { comments: 'important' });
  const offered: string[][] = [];
  const quiz = runQuiz(important, (view, n) => (offered.push(view.comments?.map((c) => `${c.line.label}:${c.on}`) ?? []), either(view, n)));
  assert.deepEqual(offered[1], ['2. c3:false', '2. Nc3!:true']);
  assert.deepEqual(plays(quiz.effects).slice(6), ['opponent:Nc3', 'user:Nc6', 'opponent:g3']);
  // Pick: the first one picked from the offer, while the walk goes on.
  const pick = quizzing(w, planOf(w, states), states, { comments: 'pick' });
  const picked = runQuiz(pick, (view, n) => {
    if (n === 1) pick.send({ type: 'pickComment', key: view.comments![0]!.line.key, on: true });
    return either(view, n);
  });
  assert.deepEqual(plays(picked.effects).slice(6), ['opponent:c3', 'user:Nf6', 'opponent:e5', 'user:Nd5']);
});

test('comment lines: none on a walk that teaches a move (learning, not review)', () => {
  const w = world(chapter('Chapter1', 'black', SICILIAN));
  const states = new Map<string, CardState>();
  const { effects } = runQuiz(quizzing(w, planOf(w, states, 20), states), (view, n) => {
    assert.equal(view.comments, undefined);
    return either(view, n);
  });
  assert.deepEqual(plays(effects), ['opponent:e4', 'user:c5', 'opponent:Nf3', 'user:d6', 'opponent:d4', 'user:cxd4']);
});

test('comment lines: met only from where the user is first asked, from the start too', () => {
  const w = world(chapter('Chapter1', 'black', '1. e4 { (1. d4 Nf6 2. c4 e6) } 1... c5 2. Nf3 d6 3. d4 cxd4'));
  const states = due(w);
  states.set(card('e4 c5'), notDue);
  states.set(card('e4 c5 Nf3 d6'), notDue);
  const first = runQuiz(quizzing(w, planOf(w, states), states), either);
  assert.deepEqual(plays(first.effects), ['opponent:d4', 'user:cxd4']);
  const fromStart = runQuiz(quizzing(w, planOf(w, states), states, { lineStart: 'start', autoPlay: 'off' }), either);
  assert.deepEqual(plays(fromStart.effects).slice(6), ['opponent:d4', 'user:Nf6', 'opponent:c4', 'user:e6']);
});

test('comment lines: a wrong move is taken back, a second shows the move, Hint shows it; another line\'s move there is not wrong', () => {
  const w = world(chapter('Chapter1', 'black', '1. e4 c5 2. Nf3 { (2. c3 Nf6 3. e5 Nd5) (2. c3 d5 3. exd5 Qxd5) } 2... d6'));
  const states = due(w);
  const t = quizzing(w, planOf(w, states), states);
  const views: TrainerView[] = [];
  // In the first line: d5 (the other line's), e5, a6 (wrong twice: shown), then Nf6; Hint at Nd5.
  const answers: (TrainerCommand | undefined)[] = [undefined, undefined, { type: 'move', uci: 'd7d5', now: 0 }, { type: 'move', uci: 'e7e5', now: 0 }, { type: 'move', uci: 'a7a6', now: 0 }, undefined, { type: 'hint', now: 0 }];
  const { effects, records } = runQuiz(t, (view, n) => (views.push(view), answers[n] ?? either(view, n)));
  assert.deepEqual(views.map((v) => v.phase), ['ask', 'ask', 'ask', 'ask', 'wrong', 'shown', 'ask', 'shown', 'ask', 'ask']);
  const said = notes(effects).map((n) => n.kind).filter((k) => k.startsWith('aside') || k === 'shown');
  assert.deepEqual(said, ['aside', 'asideAlso', 'asideWrong', 'shown', 'aside', 'shown', 'aside', 'aside', 'aside', 'aside']);
  assert.ok(effects.some((e) => e.type === 'arrow' && e.uci === 'g8f6'));
  assert.deepEqual(records.map((r) => r.k), ['review', 'review']);
  assert.deepEqual(t.view.asides, { lines: 2, moves: 4, right: 2 });
});

test('comment lines: quizzed once a session; Skip moves on from the one on the board', () => {
  const w = world(chapter('Chapter1', 'black', '1. e4 c5 2. Nf3 { (2. c3 Nf6 3. e5 Nd5) (2. Nc3 Nc6 3. g3 g6) } 2... d6 (2... Nc6 3. d4) 3. d4 cxd4'));
  const states = due(w);
  const plan = planOf(w, states);
  assert.equal(plan.lines.length, 2);
  const once = runQuiz(quizzing(w, plan, states), either);
  assert.equal(plays(once.effects).filter((p) => p === 'opponent:c3').length, 1);
  const t = quizzing(w, plan, states);
  const skipped = runQuiz(t, (view, n) => {
    if (view.aside?.line.sans[0] === 'c3') return { type: 'skipComment', now: 0 };
    return either(view, n);
  });
  assert.ok(!plays(skipped.effects).includes('user:Nf6'));
  assert.ok(plays(skipped.effects).includes('user:g6'));
});

test('comment lines: "Next line" at the line\'s end leaves them, and the end waits for it even at the session\'s last line', () => {
  const w = world(chapter('Chapter1', 'black', SICILIAN));
  const states = due(w);
  // The line's end goes on by itself (`holdLineEnd` off): not with lines to quiz.
  const t = quizzing(w, planOf(w, states), states, { holdLineEnd: false });
  const ends: TrainerView[] = [];
  const { effects } = run(t, either, day.now, [], (view) => void ends.push(view));
  assert.deepEqual(ends.map((v) => [v.phase, v.endQuiz, v.upcoming]), [['lineDone', 1, undefined]]);
  assert.ok(!plays(effects).includes('opponent:c3'));
  assert.equal(t.view.asides, undefined);
});

test('comment lines: show and grade turned on at the line\'s end leaves them', () => {
  const w = world(chapter('Chapter1', 'black', SICILIAN));
  const states = due(w);
  const t = quizzing(w, planOf(w, states), states);
  const { effects } = run(t, either, day.now, [], (view) => {
    assert.equal(view.endQuiz, 1);
    t.setSelfGrade(true);
    assert.equal(t.view.canQuiz, undefined);
    // "Quiz lines" does nothing now; "Next line" ends the session.
    assert.deepEqual(t.send({ type: 'quizComments', now: 0 }), []);
    return undefined;
  });
  assert.ok(!plays(effects).includes('opponent:c3'));
});

test('comment lines: "Quiz now" plays one from where it starts, mid-walk, and the walk resumes at the move asked', () => {
  const w = world(chapter('Chapter1', 'black', SICILIAN));
  const states = due(w);
  const t = quizzing(w, planOf(w, states), states);
  const views: TrainerView[] = [];
  const ends: TrainerView[] = [];
  // At 3... cxd4 asked: "Quiz now" on 2. c3; then its moves, then cxd4.
  const { effects, records } = run(
    t,
    (view, n) => {
      views.push(view);
      if (n === 2) {
        assert.ok(view.canQuiz);
        return { type: 'quizComments', key: view.comments![0]!.line.key, now: 0 };
      }
      return either(view, n);
    },
    day.now,
    [],
    (view) => (ends.push(view), quizEnd(view)),
  );
  assert.deepEqual(plays(effects), ['opponent:e4', 'user:c5', 'opponent:Nf3', 'user:d6', 'opponent:d4', 'opponent:c3', 'user:Nf6', 'opponent:e5', 'user:Nd5', 'user:cxd4']);
  const backs = effects.flatMap((e) => (e.type === 'takeback' ? [e.path.join(' ')] : []));
  assert.deepEqual(backs, ['e4 c5', 'e4 c5 Nf3 d6 d4']);
  assert.deepEqual(views.map((v) => `${v.phase}:${v.aside ? 'aside' : v.path.length}`), ['ask:1', 'ask:3', 'ask:5', 'ask:aside', 'ask:aside', 'ask:5']);
  assert.ok(notes(effects).some((n) => n.kind === 'yourMove'));
  // Quizzed already: the line's end has nothing left for "Quiz lines", and doesn't wait.
  assert.deepEqual(ends, []);
  assert.deepEqual(views.at(-1)!.comments!.map((c) => c.done), [true]);
  assert.deepEqual(records.map((r) => r.k), ['review', 'review', 'review']);
});

test('comment lines: "Quiz now" after a wrong move keeps the move\'s miss', () => {
  const w = world(chapter('Chapter1', 'black', SICILIAN));
  const states = due(w);
  const wrong = { type: 'move', uci: 'a7a6', now: 0 } as const;
  const plain = run(quizzing(w, planOf(w, states), states), (view, n) => (n === 2 ? wrong : either(view, n)));
  const t = quizzing(w, planOf(w, states), states);
  const phases: string[] = [];
  const quizzed = run(t, (view, n) => {
    phases.push(view.phase);
    if (n === 2) return wrong;
    if (n === 3) return { type: 'quizComments', key: view.comments![0]!.line.key, now: 0 };
    return either(view, n);
  });
  // Back from the line in the phase it left: after a wrong move.
  assert.deepEqual(phases, ['ask', 'ask', 'ask', 'wrong', 'ask', 'ask', 'wrong']);
  assert.ok(plays(quizzed.effects).includes('user:Nd5'));
  const grades = (r: typeof plain) => r.records.map((e) => JSON.stringify(e).replace(/"ms":\d+,?/, ''));
  assert.deepEqual(grades(quizzed), grades(plain));
});

test('comment lines: "Quiz now" at the line\'s end plays the one picked; "Quiz lines" the rest', () => {
  const w = world(chapter('Chapter1', 'black', '1. e4 c5 2. Nf3 { (2. c3 Nf6 3. e5 Nd5) (2. Nc3 Nc6 3. g3 g6) } 2... d6 3. d4 cxd4'));
  const states = due(w);
  const t = quizzing(w, planOf(w, states), states);
  const ends: (number | undefined)[] = [];
  const { effects } = run(t, either, day.now, [], (view) => {
    ends.push(view.endQuiz);
    if (ends.length === 1) return { type: 'quizComments', key: view.comments![1]!.line.key, now: 0 };
    return quizEnd(view);
  });
  assert.deepEqual(ends, [2, 1]);
  assert.deepEqual(plays(effects).slice(6), ['opponent:Nc3', 'user:Nc6', 'opponent:g3', 'user:g6', 'opponent:c3', 'user:Nf6', 'opponent:e5', 'user:Nd5']);
});
