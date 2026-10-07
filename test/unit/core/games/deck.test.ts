// Phase 5's events (PLAN.md §5.53), their replay, the game cards' deck and queue, and the grades
// of §5.55 (mistake-lab's rules).
//
// Controls re-run on this port (2026-10-07), each failing exactly the named assertions:
// - a snapshot taken after a review → "a snapshot: taken by a card never reviewed, ignored after a review";
// - "Hide time trouble" leaving out every item flagged, a tactic's or an advantage's flag included
//   (mistake-lab's filter is on mistakes only) → "Hide time trouble: …".
// (A relapse applied twice for one game fails nothing: the second one's game is never after the
// last review, which the first just set, so the guard holds it; the once-per-game rule stays for
// events that disagree on the game's time.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEvent, parseLog, type KnownEvent } from '../../../../src/core/progress/events.ts';
import { Replay, toDeviceEvents, type DeviceEvent } from '../../../../src/core/progress/replay.ts';
import { gameCard, planCard } from '../../../../src/core/progress/cards.ts';
import type { PositionKey } from '../../../../src/core/chess/positionKey.ts';
import { deckOf, dropsOf, gameQueue, lineFingerprint, withoutTimeTrouble } from '../../../../src/core/games/deck.ts';
import { readFileSync } from 'node:fs';
import { readGamesFile } from '../../../../src/core/games/record.ts';
import { extractGame } from '../../../../src/core/games/extract.ts';
import type { GameItem, MistakeItem, TacticItem } from '../../../../src/core/games/extract.ts';
import { classifyWpDrop, judgeMove, mistakeGrade, tacticGrade } from '../../../../src/core/games/grade.ts';

const DAY = 86_400_000;
const T0 = Date.parse('2026-10-07T10:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const KEY = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -' as PositionKey;

let n = 0;
function ev(e: Record<string, unknown>, t = T0): DeviceEvent {
  const line = JSON.stringify({ v: 1, n: ++n, t: iso(t), ...e });
  const { lines, problems } = parseLog(line);
  assert.deepEqual(problems, [], line);
  return toDeviceEvents('dev1', lines)[0]!;
}

test('each kind read, written in a fixed order, and refused when malformed', () => {
  const lines = [
    '{"v":1,"n":1,"t":"2026-10-07T10:00:00.000Z","k":"snapshot","card":"m|abc_17","st":2,"stab":12.5,"diff":5.1,"reps":3,"lapses":1,"sched":13,"last":"2026-09-30T08:00:00.000Z","first":"2026-08-01T08:00:00.000Z"}',
    '{"v":1,"n":2,"t":"2026-10-07T10:00:00.000Z","k":"drop","card":"m|abc_t23","on":true,"line":"e2e4,e7e5,g1f3"}',
    '{"v":1,"n":3,"t":"2026-10-07T10:00:00.000Z","k":"relapse","card":"m|abc_17","g":"zzzzzzzz","at":"2026-10-06T20:00:00.000Z"}',
    '{"v":1,"n":4,"t":"2026-10-07T10:00:00.000Z","k":"plan","card":"p|' + KEY + '","on":true,"side":"black"}',
    '{"v":1,"n":5,"t":"2026-10-07T10:00:00.000Z","k":"dismiss","card":"d|' + KEY + '","on":true}',
    '{"v":1,"n":6,"t":"2026-10-07T10:00:00.000Z","k":"saved","card":"m|_practice_1","item":{"kind":"mistake","fenBefore":"x"}}',
    '{"v":1,"n":7,"t":"2026-10-07T10:00:00.000Z","k":"played","card":"h|r1","game":{"moves":["e2e4"]}}',
    '{"v":1,"n":8,"t":"2026-10-07T10:00:00.000Z","k":"practice","card":"x|' + KEY + '","res":"win","preset":"easy","cp":250,"mv":31}',
  ];
  const { lines: read, problems } = parseLog(lines.join('\n'));
  assert.deepEqual(problems, []);
  read.forEach((l, i) => {
    assert.ok(l.event, `line ${i + 1} known`);
    assert.equal(formatEvent(l.event as KnownEvent), lines[i]);
  });
  const bad = (fields: string) => parseLog('{"v":1,"n":1,"t":"2026-10-07T10:00:00.000Z",' + fields + '}').problems.length;
  assert.equal(bad('"k":"snapshot","card":"r|x|e2e4","st":2,"stab":1,"diff":5,"reps":1,"lapses":0,"sched":1,"last":"2026-10-07T10:00:00.000Z"'), 1);
  assert.equal(bad('"k":"snapshot","card":"m|a_1","st":5,"stab":1,"diff":5,"reps":1,"lapses":0,"sched":1,"last":"2026-10-07T10:00:00.000Z"'), 1);
  assert.equal(bad('"k":"snapshot","card":"m|a_1","st":2,"stab":-1,"diff":5,"reps":1,"lapses":0,"sched":1,"last":"2026-10-07T10:00:00.000Z"'), 1);
  assert.equal(bad('"k":"drop","card":"m|a_1","on":"yes"'), 1);
  assert.equal(bad('"k":"drop","card":"m|a_1","on":true,"line":"Nf3"'), 1);
  assert.equal(bad('"k":"relapse","card":"m|a_1","g":"x","at":"yesterday"'), 1);
  assert.equal(bad('"k":"plan","card":"p|' + KEY + '","on":true,"side":"red"'), 1);
  assert.equal(bad('"k":"dismiss","card":"m|a_1","on":true'), 1);
  assert.equal(bad('"k":"saved","card":"m|a_1","item":[1]'), 1);
  assert.equal(bad('"k":"played","card":"m|a_1","game":{}'), 1);
  assert.equal(bad('"k":"practice","card":"x|k","res":"won"'), 1);
  // A later version of a kind is carried, unread, as any unknown line.
  const later = parseLog('{"v":2,"n":1,"t":"2026-10-07T10:00:00.000Z","k":"snapshot","card":"m|a_1"}');
  assert.deepEqual(later.problems, []);
  assert.equal(later.lines[0]!.event, undefined);
});

const snapshot = (card: string, t: number) => ev({ k: 'snapshot', card, st: 2, stab: 10, diff: 5, reps: 4, lapses: 1, sched: 10, last: iso(T0 - 3 * DAY), first: iso(T0 - 60 * DAY) }, t);

test('a snapshot: taken by a card never reviewed, ignored after a review', () => {
  const r = new Replay();
  r.add([snapshot('m|a_1', T0)]);
  const s = r.states.get('m|a_1')!;
  assert.equal(s.card.state, 2);
  assert.equal(s.card.stability, 10);
  assert.equal(s.card.lastReview, T0 - 3 * DAY);
  assert.equal(s.card.due, T0 + 7 * DAY);
  assert.equal(s.firstReview, T0 - 60 * DAY);
  assert.equal(s.snapshot, true);

  const r2 = new Replay();
  r2.add([ev({ k: 'review', card: 'm|a_2', g: 3 }, T0 - DAY), snapshot('m|a_2', T0)]);
  const s2 = r2.states.get('m|a_2')!;
  assert.equal(s2.snapshot, undefined);
  assert.equal(s2.card.lastReview, T0 - DAY);
  // A review after the snapshot builds on it.
  const r3 = new Replay();
  r3.add([snapshot('m|a_3', T0), ev({ k: 'review', card: 'm|a_3', g: 3 }, T0 + 8 * DAY)]);
  assert.equal(r3.states.get('m|a_3')!.card.reps, 5);
});

test('a relapse: an Again at the game’s time, once per game, never before the last review', () => {
  const r = new Replay();
  r.add([
    ev({ k: 'review', card: 'm|a_1', g: 4 }, T0 - 10 * DAY),
    ev({ k: 'relapse', card: 'm|a_1', g: 'G1', at: iso(T0 - 2 * DAY) }, T0),
    ev({ k: 'relapse', card: 'm|a_1', g: 'G1', at: iso(T0 - 2 * DAY) }, T0 + 1000),
  ]);
  const s = r.states.get('m|a_1')!;
  assert.equal(s.card.lastReview, T0 - 2 * DAY);
  assert.equal(s.card.lapses, 1);
  assert.equal(s.lastGrade, 1);
  // A game before the last review, and a card never reviewed, are left alone.
  const r2 = new Replay();
  r2.add([ev({ k: 'review', card: 'm|a_2', g: 4 }, T0), ev({ k: 'relapse', card: 'm|a_2', g: 'G2', at: iso(T0 - DAY) }, T0 + 1)]);
  assert.equal(r2.states.get('m|a_2')!.card.lapses, 0);
  const r3 = new Replay();
  r3.add([ev({ k: 'relapse', card: 'm|a_3', g: 'G3', at: iso(T0 - DAY) }, T0)]);
  assert.equal(r3.states.get('m|a_3')!.card.state, 0);
});

const mistake = (pid: string, wpDrop: number): MistakeItem => ({ kind: 'mistake', pid, gameId: pid.split('_')[0]!, ply: 9, fenBefore: '', key: KEY, color: 'white', san: 'e4', uci: 'e2e4', cpBefore: 0, cpAfter: -300, cpLoss: 300, wpDrop, timeTrouble: false });
const line = (...ucis: string[]) => ucis.map((uci, i) => ({ uci, san: uci, user: i % 2 === 0 }));
const tactic = (pid: string): TacticItem => ({ kind: 'tactic', pid, gameId: 'g', ply: 11, fenBefore: '', color: 'white', lines: [line('a2a3', 'a7a6', 'b2b3'), line('a2a3', 'h7h6', 'b2b3')], wpSwing: 30, wpDrop: 30, found: false });

test('drops: the item, a tactic’s lines, the latest event deciding; a tactic with no line left goes', () => {
  const evs = new Map<string, DeviceEvent[]>();
  const add = (card: string, e: DeviceEvent) => evs.set(card, [...(evs.get(card) ?? []), e]);
  const t = tactic('g_t11');
  add(gameCard('g_1'), ev({ k: 'drop', card: gameCard('g_1'), on: true }));
  add(gameCard('g_2'), ev({ k: 'drop', card: gameCard('g_2'), on: true }));
  add(gameCard('g_2'), ev({ k: 'drop', card: gameCard('g_2'), on: false }, T0 + 1));
  add(gameCard('g_t11'), ev({ k: 'drop', card: gameCard('g_t11'), on: true, line: lineFingerprint(t.lines[0]!) }));
  const eventsOf = (c: string) => evs.get(c) ?? [];
  assert.deepEqual([...dropsOf(eventsOf(gameCard('g_t11'))).lines], ['a2a3,a7a6,b2b3']);
  const items: GameItem[] = [mistake('g_1', 20), mistake('g_2', 15), t];
  assert.deepEqual(deckOf([items], [], eventsOf).map((c) => c.card), ['m|g_2', 'm|g_t11']);
  add(gameCard('g_t11'), ev({ k: 'drop', card: gameCard('g_t11'), on: true, line: lineFingerprint(t.lines[1]!) }, T0 + 2));
  assert.deepEqual(deckOf([items], [mistake('_practice_1', 12)], eventsOf).map((c) => c.card), ['m|g_2', 'm|_practice_1']);
});

test('the queue: due first by time, new by the drop, the daily limit counting cards started today', () => {
  const deck = ['a_1', 'a_2', 'a_3', 'a_4', 'a_5'].map((pid, i) => ({ card: gameCard(pid), item: mistake(pid, 10 + i) }));
  const r = new Replay();
  r.add([
    ev({ k: 'review', card: 'm|a_1', g: 3 }, T0 - 30 * DAY), // due long ago
    ev({ k: 'review', card: 'm|a_2', g: 1 }, T0 - 2 * DAY), // due a day ago
    ev({ k: 'review', card: 'm|a_3', g: 3 }, T0 - 3600_000), // started today, due later
  ]);
  const day = { start: T0 - 10 * 3600_000, end: T0 + 14 * 3600_000 };
  const q = gameQueue(deck, r.states, day, 2);
  assert.deepEqual(q.due.map((c) => c.card), ['m|a_1', 'm|a_2']);
  assert.equal(q.startedToday, 1);
  assert.deepEqual(q.fresh.map((c) => c.card), ['m|a_5']);
  assert.equal(q.waiting, 1);
  // Plan cards ride the same queue.
  const plan = { card: planCard(KEY) };
  assert.equal(gameQueue([plan], r.states, day, 10).fresh.length, 1);
});

test('the grades: mistake-lab’s bands, a hint or a failed first try Again; tactics', () => {
  assert.equal(mistakeGrade({ wpDrop: 0, exactBest: true }), 4);
  assert.equal(mistakeGrade({ wpDrop: 2, exactBest: false }), 4);
  assert.equal(mistakeGrade({ wpDrop: 5, exactBest: false }), 3);
  assert.equal(mistakeGrade({ wpDrop: 10, exactBest: false }), 2);
  assert.equal(mistakeGrade({ wpDrop: 10.1, exactBest: false }), 1);
  assert.equal(mistakeGrade({ wpDrop: 0, exactBest: true, hint: true }), 1);
  assert.equal(mistakeGrade({ wpDrop: 0, exactBest: true, failedBefore: true }), 1);
  assert.equal(tacticGrade({ wrong: 0, hint: false }), 4);
  assert.equal(tacticGrade({ wrong: 0, hint: true }), 2);
  assert.equal(tacticGrade({ wrong: 1, hint: false }), 1);
  assert.equal(classifyWpDrop(0.4, false), 'best');
  assert.equal(classifyWpDrop(15, false), 'mistake');
  assert.equal(classifyWpDrop(15.1, false), 'blunder');
});

test('a move judged from the lines, or from the position after it; great and miss', () => {
  const lines = [
    { move: 'e2e4', cp: 50 },
    { move: 'd2d4', cp: 40 },
  ];
  assert.equal(judgeMove(lines, 'e2e4', undefined)!.classification, 'best');
  const d4 = judgeMove(lines, 'd2d4', undefined)!;
  assert.equal(d4.cpLoss, 10);
  assert.equal(d4.classification, 'excellent');
  const blunder = judgeMove(lines, 'g2g4', -400)!;
  assert.equal(blunder.classification, 'blunder');
  assert.equal(judgeMove(lines, 'g2g4', undefined), undefined);
  // The only good move: great.
  assert.equal(judgeMove([{ move: 'a', cp: 200 }, { move: 'b', cp: -200 }], 'a', undefined)!.classification, 'great');
  // An inaccuracy that let a clear win go: miss.
  const miss = judgeMove([{ move: 'a', cp: 500 }, { move: 'b', cp: 200 }], 'c', 330)!;
  assert.equal(miss.classification, 'miss');
  // A mate delivered that the lines missed is the best.
  assert.equal(judgeMove(lines, 'h5f7', 10000)!.classification, 'best');
});

test('Hide time trouble: the mistakes flagged left out, as mistake-lab’s applyFilters; tactics and advantages kept', () => {
  const file = JSON.parse(readFileSync(new URL('../../../fixtures/games/analyzed_games.json', import.meta.url), 'utf8')) as unknown;
  const items = readGamesFile(file).games.flatMap((g) => extractGame(g).items);
  const flagged = items.filter((i) => i.kind === 'mistake' && i.timeTrouble);
  assert.ok(flagged.length > 0, 'the fixture games have mistakes made in time trouble');
  assert.equal(withoutTimeTrouble(items, false), items);
  assert.deepEqual(withoutTimeTrouble(items, true), items.filter((i) => !flagged.includes(i)));
  // Only a mistake's flag counts (an item of another kind carrying one is kept).
  const odd = [{ kind: 'tactic', timeTrouble: true }, { kind: 'advantage', timeTrouble: true }, { kind: 'mistake', timeTrouble: true }, { kind: 'mistake', timeTrouble: false }];
  assert.deepEqual(withoutTimeTrouble(odd, true).map((i) => i.kind), ['tactic', 'advantage', 'mistake']);
});
