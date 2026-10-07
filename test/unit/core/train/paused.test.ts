// Paused and must-learn lines (PLAN.md §5.70): the marks from the log, the lines they cover, the
// cards held back, and the queue, the plan and the line list without them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chessops/chess';
import { parseSan } from 'chessops/san';
import type { NormalMove } from 'chessops/types';
import { positionKeyOf } from '../../../../src/core/chess/positionKey.ts';
import { standardUci } from '../../../../src/core/chess/uci.ts';
import { lineCard, parseLineCard, repertoireCard, type CardId } from '../../../../src/core/progress/cards.ts';
import { formatEvent, parseLog, type KnownEvent, type LineMark } from '../../../../src/core/progress/events.ts';
import { newCard, State } from '../../../../src/core/progress/fsrs.ts';
import { Replay, toDeviceEvents, type CardState } from '../../../../src/core/progress/replay.ts';
import { parseChapterFile } from '../../../../src/core/pgn/parse.ts';
import { indexStudies, type Line, type RepertoireIndex } from '../../../../src/core/repertoire/index.ts';
import { chapterRows, learnPlan, pickedPlan } from '../../../../src/core/train/browse.ts';
import { heldCards, lineMarksOf, markLines } from '../../../../src/core/train/paused.ts';
import { planSession } from '../../../../src/core/train/plan.ts';
import { todaysQueue, type Day } from '../../../../src/core/train/queue.ts';
import { DEFAULT_TRAIN } from '../../../../src/core/train/settings.ts';
import type { Chapter } from '../../../../src/core/study/model.ts';
import { mulberry32 } from '../../../support/random.ts';
import { randomChapter } from '../../../support/randomTree.ts';
import { DAY } from '../../../support/reviewHistory.ts';

const HOUR = 3_600_000;
const start = Date.UTC(2026, 9, 5, 22);
const day: Day = { start, end: start + DAY, now: start + 9 * HOUR };

function chapter(cid: string, side: string, moves: string): Chapter {
  const parsed = parseChapterFile(`[Orientation "${side}"]\n\n${moves} *\n`, cid);
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

const index = (...studies: { sid: string; chapters: Chapter[] }[]) => indexStudies(studies.map((s) => ({ ...s, kind: 'repertoire' as const })));
const marked = (ix: RepertoireIndex, marks: [string, LineMark][]) => markLines(ix, new Map(marks));
const pathOf = (l: Line) => l.path.join(' ');

// A White chapter: 1. e4 e5 2. Nf3 Nc6 3. Bb5 (main), 2... d6 3. d4, and 1... c5 2. Nf3.
const ruy = () => chapter('Chapter1', 'white', '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 (2... d6 3. d4) 3. Bb5');

test('a line card round-trips, and a line event is read and written', () => {
  const c = lineCard('Study001', 'Chapter1', ['e4', 'e5', 'Nf3']);
  assert.equal(c, 'l|Study001|Chapter1|e4 e5 Nf3');
  assert.deepEqual(parseLineCard(c), { sid: 'Study001', cid: 'Chapter1', path: ['e4', 'e5', 'Nf3'] });
  assert.equal(parseLineCard('r|key|e2e4'), undefined);
  const event: KnownEvent = { v: 1, n: 3, t: '2026-10-07T10:00:00.000Z', k: 'line', card: c, mark: 'paused' };
  const text = formatEvent(event);
  assert.equal(text, '{"v":1,"n":3,"t":"2026-10-07T10:00:00.000Z","k":"line","card":"l|Study001|Chapter1|e4 e5 Nf3","mark":"paused"}');
  const { lines, problems } = parseLog(text);
  assert.deepEqual(problems, []);
  assert.deepEqual(lines[0]!.event, event);
  const bad = parseLog(['{"v":1,"n":4,"t":"2026-10-07T10:00:00.000Z","k":"line","card":"l|Study001|Chapter1|e4 e5","mark":"off"}', '{"v":1,"n":5,"t":"2026-10-07T10:00:00.000Z","k":"line","card":"r|x|e2e4","mark":"paused"}'].join('\n'));
  assert.equal(bad.problems.length, 2);
});

test('a mark covers its line and the line extended later, not a branch added earlier along it', () => {
  const before = index({ sid: 'Study001', chapters: [ruy()] });
  const main = before.lines.find((l) => pathOf(l) === 'e4 e5 Nf3 Nc6 Bb5')!;
  const mark: [string, LineMark] = [lineCard('Study001', 'Chapter1', main.path), 'paused'];
  const m1 = marked(before, [mark]);
  assert.deepEqual(m1.index.lines.filter((l) => l.paused).map(pathOf), ['e4 e5 Nf3 Nc6 Bb5']);
  assert.deepEqual(m1.orphans, []);
  // The line extended (3... a6 and 3... Nf6 after it) and a branch added before its end (3. Bc4).
  const after = index({ sid: 'Study001', chapters: [chapter('Chapter1', 'white', '1. e4 e5 (1... c5 2. Nf3) 2. Nf3 Nc6 (2... d6 3. d4) 3. Bb5 (3. Bc4) a6 (3... Nf6 4. O-O) 4. Ba4')] });
  const m2 = marked(after, [mark]);
  assert.deepEqual(m2.index.lines.filter((l) => l.paused).map(pathOf).sort(), ['e4 e5 Nf3 Nc6 Bb5 Nf6 O-O', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4']);
  assert.ok(m2.index.lines.find((l) => pathOf(l) === 'e4 e5 Nf3 Nc6 Bc4' && !l.paused));
  // The parts' own lines are untouched.
  assert.ok(after.lines.every((l) => !l.paused));
});

test('the longest mark decides: one extension unpaused under a paused line; marks covering nothing are orphans', () => {
  const ix = index({ sid: 'Study001', chapters: [chapter('Chapter1', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5 (3. Bc4) a6')] });
  // 3. Bb5 a6 and 3. Bc4 under a mark on the shorter line 1. e4 e5 2. Nf3 Nc6 (the chapter before it grew).
  const m = marked(ix, [
    [lineCard('Study001', 'Chapter1', ['e4', 'e5', 'Nf3', 'Nc6']), 'paused'],
    [lineCard('Study001', 'Chapter1', ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']), 'none'],
    [lineCard('Study001', 'Chapter1', ['e4', 'e5', 'Qh5']), 'paused'],
    [lineCard('Study001', 'Gone0001', ['d4']), 'must'],
    [lineCard('Study001', 'Gone0002', ['d4']), 'none'],
  ]);
  assert.deepEqual(m.index.lines.map((l) => [pathOf(l), !!l.paused]), [
    ['e4 e5 Nf3 Nc6 Bb5 a6', false],
    ['e4 e5 Nf3 Nc6 Bc4', true],
  ]);
  assert.deepEqual(m.orphans, ['l|Study001|Chapter1|e4 e5 Qh5', 'l|Study001|Gone0001|d4']);
});

test('the last event decides, whatever device made it; must-learn is a mark of its own', () => {
  const c = lineCard('Study001', 'Chapter1', ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
  const ev = (n: number, t: string, mark: LineMark) => ({ n, t, k: 'line', raw: '', event: { v: 1 as const, n, t, k: 'line' as const, card: c, mark } });
  const replay = new Replay();
  replay.add(toDeviceEvents('phone', [ev(1, '2026-10-07T10:00:00.000Z', 'paused'), ev(2, '2026-10-07T12:00:00.000Z', 'must')].map((e) => ({ ...e, raw: JSON.stringify(e.event) }))));
  replay.add(toDeviceEvents('desk', [ev(1, '2026-10-07T11:00:00.000Z', 'none')].map((e) => ({ ...e, raw: JSON.stringify(e.event) }))));
  const marks = lineMarksOf(replay.states.keys(), (k) => replay.eventsOf(k));
  assert.deepEqual([...marks], [[c, 'must']]);
  const m = markLines(index({ sid: 'Study001', chapters: [ruy()] }), marks);
  const line = m.index.lines.find((l) => pathOf(l) === 'e4 e5 Nf3 Nc6 Bb5')!;
  assert.equal(line.must, true);
  assert.equal(line.paused, undefined);
});

test('a card is held only when every line through it is paused, in every chapter and study', () => {
  const ix = index(
    { sid: 'Study001', chapters: [ruy()] },
    // Another study reaching 1. e4 e5 2. Nf3 Nc6 3. Bb5 by the same moves.
    { sid: 'Study002', chapters: [chapter('Chapter9', 'white', '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4')] },
  );
  const pauseAll1 = ix.lines.filter((l) => l.sid === 'Study001').map((l): [string, LineMark] => [lineCard(l.sid, l.cid, l.path), 'paused']);
  const held = heldCards(marked(ix, pauseAll1).index);
  // 1. e4, 2. Nf3, 3. Bb5 lie on Study002's active line; 3. d4 (after 2... d6) and 2. Nf3 after 1... c5 don't.
  assert.deepEqual([...held].sort(), [card('e4 c5 Nf3'), card('e4 e5 Nf3 d6 d4')].sort());
});

test('the queue and the plan leave paused lines out; a held card is not due, and is due again when unpaused', () => {
  const ix = index({ sid: 'Study001', chapters: [ruy()] });
  const sicilian = ix.lines.find((l) => pathOf(l) === 'e4 c5 Nf3')!;
  const philidor = ix.lines.find((l) => pathOf(l) === 'e4 e5 Nf3 d6 d4')!;
  const m = marked(ix, [
    [lineCard('Study001', 'Chapter1', sicilian.path), 'paused'],
    [lineCard('Study001', 'Chapter1', philidor.path), 'paused'],
  ]).index;
  // 2. Nf3 against 1... c5 overdue; 1. e4 (shared with the active main line) due.
  const states = new Map<string, CardState>([
    [card('e4 c5 Nf3'), reviewed(start - 2 * DAY)],
    [card('e4'), reviewed(start)],
  ]);
  const q = todaysQueue(m, states, DEFAULT_TRAIN, day);
  assert.deepEqual(q.due.map((d) => d.card), [card('e4')]);
  assert.equal(q.pausedLines, 2);
  // New lines: only the main line; 3. d4 is held.
  assert.deepEqual(q.newLines.map(pathOf), ['e4 e5 Nf3 Nc6 Bb5']);
  assert.ok(!q.newCards.includes(card('e4 e5 Nf3 d6 d4')));
  // The plan walks no paused line, even for 1. e4, which the Sicilian line shares and comes first.
  const p = planSession(m, q, states);
  assert.ok(p.lines.every((l) => !l.line.paused));
  assert.ok(p.lines.some((l) => l.ask.includes(card('e4'))));
  // Unpaused, the overdue card is due again.
  const unpaused = todaysQueue(ix, states, DEFAULT_TRAIN, day);
  assert.ok(unpaused.due.some((d) => d.card === card('e4 c5 Nf3')));
  assert.equal(unpaused.pausedLines, 0);
});

test('the line list shows paused lines outside the count; a picked paused line asks and teaches nothing; Learn skips it', () => {
  const ix = index({ sid: 'Study001', chapters: [ruy()] });
  const sicilian = ix.lines.find((l) => pathOf(l) === 'e4 c5 Nf3')!;
  const m = marked(ix, [[lineCard('Study001', 'Chapter1', sicilian.path), 'paused']]).index;
  const [rows] = chapterRows(m, new Map(), DEFAULT_TRAIN, day);
  assert.deepEqual(rows!.lines.map((r) => r.state), ['new', 'new', 'paused']);
  assert.equal(rows!.paused, 1);
  assert.equal(rows!.learned, 0);
  const line = m.lines.find((l) => pathOf(l) === 'e4 c5 Nf3')!;
  const pick = pickedPlan(m, new Map(), DEFAULT_TRAIN, day, line);
  assert.deepEqual(pick.lines.map((l) => [l.ask.length, l.teach.length]), [[0, 0]]);
  const learn = learnPlan(m, new Map(), 'Study001', 'Chapter1');
  assert.ok(learn.lines.every((l) => !l.line.paused));
  assert.ok(!learn.lines.flatMap((l) => l.teach).includes(card('e4 c5 Nf3')));
});

test('random repertoires with random marks: no held card asked or taught, every due card still asked once', () => {
  for (let seed = 1; seed <= 150; seed++) {
    const random = mulberry32(seed);
    const chapters = Array.from({ length: 1 + Math.floor(random() * 4) }, (_, i) => randomChapter(random, `Rand000${i}`, { maxDepth: 10, maxChildren: 3 }));
    const ix = indexStudies([{ sid: 'Study001', kind: 'repertoire', chapters }]);
    const marks = new Map<string, LineMark>();
    for (const l of ix.lines) {
      const r = random();
      // A mark on the line, or on a shorter part of it (a line that grew since).
      if (r < 0.35) marks.set(lineCard(l.sid, l.cid, l.path.slice(0, Math.max(1, l.path.length - Math.floor(random() * 3)))), random() < 0.85 ? 'paused' : 'none');
    }
    const m = markLines(ix, marks).index;
    const held = heldCards(m);
    const states = new Map<string, CardState>();
    for (const c of m.cards.keys()) {
      const r = random();
      if (r < 0.4) continue;
      states.set(c, r < 0.55 ? { card: newCard(), suspended: false, reviews: 0, taught: start - Math.floor(random() * 2 * DAY) } : reviewed(start + Math.floor((random() * 6 - 3) * DAY)));
    }
    const q = todaysQueue(m, states, { ...DEFAULT_TRAIN, newPerDay: Math.floor(random() * 15) }, day);
    const p = planSession(m, q, states);
    const asked = p.lines.flatMap((l) => l.ask);
    const taught = p.lines.flatMap((l) => l.teach);
    for (const c of [...asked, ...taught]) assert.ok(!held.has(c), `seed ${seed}: held ${c} trained`);
    assert.ok(p.lines.every((l) => !l.line.paused), `seed ${seed}: a paused line walked`);
    for (const d of q.due) assert.equal(asked.filter((c) => c === d.card).length, 1, `seed ${seed}: due ${d.card}`);
    // A card on an active line is never held, and every card held is on a paused line only.
    for (const l of m.lines) if (!l.paused) for (const c of l.cards) assert.ok(!held.has(c), `seed ${seed}`);
  }
});
