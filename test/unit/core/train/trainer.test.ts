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
import { planSession, type PlannedLine, type SessionPlan } from '../../../../src/core/train/plan.ts';
import { statusOf, todaysQueue, type Day } from '../../../../src/core/train/queue.ts';
import { DEFAULT_TRAIN } from '../../../../src/core/train/settings.ts';
import { MIN_PACE_MS, Trainer, type TrainerCommand, type TrainerEffect, type TrainerRecord, type TrainerView } from '../../../../src/core/train/trainer.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { startPosition } from '../../../../src/core/study/tree.ts';
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
const trainer = (w: World, plan: SessionPlan, states: Map<string, CardState>, extra: { record?: boolean; askAll?: boolean; paceMs?: number } = {}) =>
  new Trainer({ index: w.ix, plan, states, startOf: startOf(w), paceMs: extra.paceMs ?? 600, ...extra });

/** Who answers an ask or a teach: a command, or undefined to stop the session. */
type Answerer = (view: TrainerView, asked: number) => TrainerCommand | undefined;

/** Runs a session to its end: ticks every wait, lets `answer` answer every ask and teach. */
function run(t: Trainer, answer: Answerer, now = day.now) {
  const effects: TrainerEffect[] = [];
  let pendingWait: { ms: number; id: number } | undefined;
  const send = (c: TrainerCommand) => {
    const out = t.send(c);
    effects.push(...out);
    for (const e of out) if (e.type === 'wait') pendingWait = e;
  };
  send({ type: 'start', now });
  let asked = 0;
  for (let guard = 0; guard < 10_000 && t.view.phase !== 'sessionDone'; guard++) {
    const phase = t.view.phase;
    if (phase === 'ask' || phase === 'teach' || phase === 'wrong' || phase === 'shown') {
      now += 1000;
      const c = answer(t.view, asked++);
      if (!c) send({ type: 'stop', now });
      else send({ ...c, now } as TrainerCommand);
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
  assert.deepEqual(plays(effects), ['auto:e4', 'opponent:e5', 'user:Nf3']);
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

test('a card in its learning step is played for the user, with its arrow first', () => {
  const w = world(chapter('Chapter1', 'white', '1. e4 e5 2. Nf3'));
  const states = new Map<string, CardState>([[card('e4'), learning], [card('e4 e5 Nf3'), dueNow]]);
  const { effects } = run(trainer(w, planOf(w, states), states), right);
  const arrow = effects.findIndex((e) => e.type === 'arrow' && e.uci === 'e2e4');
  const e4 = effects.findIndex((e) => e.type === 'play' && e.san === 'e4');
  assert.ok(arrow >= 0 && arrow < e4);
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
