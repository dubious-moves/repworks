// The migration from mistake-lab (PLAN.md §5.64) on a fixture in the shape mistake-lab writes
// (test/fixtures/mistake-lab/README.md): the report's numbers, the events, the two studies, and the
// cards replayed after the run as mistake-lab had them, with the same number due.
//
// Controls re-run on this port (2026-10-07), each failing exactly the named assertions:
// - plan keys kept as mistake-lab wrote them (no re-key) → "the report" and "the events";
// - `r_` states migrated as game cards → "the report".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrate, type NewEvent } from '../../../../src/core/games/migrate.ts';
import { formatEvent, parseLog, type KnownEvent } from '../../../../src/core/progress/events.ts';
import { Replay, toDeviceEvents } from '../../../../src/core/progress/replay.ts';
import { readImport } from '../../../../src/core/import/plan.ts';

const DIR = join(import.meta.dirname, '..', '..', '..', 'fixtures', 'mistake-lab');
const progress: unknown = JSON.parse(readFileSync(join(DIR, 'progress.json'), 'utf8'));
const reviews: unknown = JSON.parse(readFileSync(join(DIR, 'reviews.json'), 'utf8'));
const NOW = Date.parse('2026-10-07T12:00:00.000Z');
const LEGACY = '8/6K1/8/3pP3/8/2b5/8/k7 w - d6';
const PLAN_KEY = '8/6K1/8/3pP3/8/2b5/8/k7 w - -';

const run = () => migrate({ progress, reviews, gameIds: new Set(['GameOne1']), gameTimes: new Map([['GameTwo2', Date.parse('2026-09-20T18:00:00.000Z')]]), evalCache: true, now: NOW, today: '2026-10-07' });

test('the report', () => {
  const r = run().report;
  assert.deepEqual(r.cards, { game: 5, plan: 1, repertoireLeft: 1, corrupt: 1, neverReviewed: 1, unknown: ['nonsense'] });
  assert.deepEqual(r.rekeyed, [{ from: LEGACY, to: PLAN_KEY }]);
  assert.deepEqual(r.unreadableKeys, []);
  assert.deepEqual(r.missingGames, ['chesscom_1234']);
  assert.equal(r.drops, 1);
  assert.equal(r.lineDrops, 1);
  assert.equal(r.relapses, 1);
  assert.equal(r.plans, 1);
  assert.equal(r.plansRemoved, 1);
  assert.equal(r.dismissed, 1);
  assert.deepEqual(r.saved, { mistakes: 1, tactics: 1, unreadable: 1 });
  assert.equal(r.practice, 2);
  assert.equal(r.played, 2);
  assert.deepEqual(r.notes, { kept: 1, fromStudies: 1, deleted: 1 });
  assert.equal(r.deviations, 1);
  // Due on or before 2026-10-07 in mistake-lab: t9, a31, chesscom_15 and the plan card.
  assert.equal(r.dueBefore, 4);
  assert.equal(r.leftBehind.length, 3);
});

test('the events: each one the log reads back as written', () => {
  const { events } = run();
  const lines = events.map((e, i) => formatEvent({ ...e, v: 1, n: i + 1 } as KnownEvent));
  const read = parseLog(lines.join('\n'));
  assert.deepEqual(read.problems, []);
  assert.equal(read.lines.filter((l) => l.event).length, events.length);
  const of = (k: string) => events.filter((e) => e.k === k);
  assert.equal(of('snapshot').length, 6);
  assert.ok(of('snapshot').some((e) => e.card === `p|${PLAN_KEY}`));
  assert.deepEqual(of('plan'), [{ t: '2026-10-07T12:00:00.000Z', k: 'plan', card: `p|${PLAN_KEY}`, on: true, side: 'white' }]);
  assert.deepEqual(
    of('drop').map((e) => [e.card, (e as NewEvent & { line?: string }).line]),
    [
      ['m|GameOne1_t9', 'c4f7,e8f8,f3g5'],
      ['m|GameOne1_a31', undefined],
    ],
  );
  const relapse = of('relapse')[0] as NewEvent & { g: string; at: string };
  assert.deepEqual([relapse.card, relapse.g, relapse.at], ['m|GameOne1_7', 'GameTwo2', '2026-09-20T18:00:00.000Z']);
  const saved = of('saved') as (NewEvent & { item: Record<string, unknown> })[];
  assert.deepEqual(
    saved.map((e) => e.card),
    ['m|_practice_1790000000000_12', 'm|_practice_tactic_1790000000000_ab12_t9'],
  );
  assert.equal(saved[0]!.item['uci'], 'f3g5');
  assert.equal((saved[1]!.item['lines'] as unknown[]).length, 2);
  // Practice results oldest first, cp rounded, the preset kept.
  assert.deepEqual(
    of('practice').map((e) => [(e as NewEvent & { res: string }).res, (e as NewEvent & { cp?: number }).cp, (e as NewEvent & { preset?: string }).preset]),
    [
      ['loss', 512, undefined],
      ['win', -1012, 'easy'],
    ],
  );
  assert.deepEqual(
    of('played').map((e) => e.card),
    ['h|rev_1', 'h|rev_2'],
  );
  assert.equal(of('dismiss')[0]!.card, 'd|rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b KQkq -');
});

test('the studies: the notes with their shapes, and the custom deviation with its move', () => {
  const { notesPgn, deviationsPgn } = run();
  const notes = readImport(notesPgn!);
  assert.equal(notes.chapters.length, 1);
  assert.deepEqual(notes.refused, []);
  const c = notes.chapters[0]!;
  assert.equal(c.side, 'black');
  const root = c.chapter.root;
  assert.match(root.comments.join(' '), /the plan is c5 and d6\.\nKeep the knight on f6\./);
  assert.deepEqual(
    root.shapes.map((s) => `${s.brush}:${s.orig}${s.dest ?? ''}`).sort(),
    ['blue:d7d6', 'green:c7c5', 'red:e4'],
  );
  const devs = readImport(deviationsPgn!);
  assert.equal(devs.chapters.length, 1);
  assert.equal(devs.chapters[0]!.side, 'black');
  assert.equal(devs.chapters[0]!.chapter.root.children[0]!.san, 'd6');
});

test('replayed after the run: the cards as mistake-lab had them, the same number due', () => {
  const { events } = run();
  const lines = events.map((e, i) => formatEvent({ ...e, v: 1, n: i + 1 } as KnownEvent)).join('\n');
  const r = new Replay();
  r.add(toDeviceEvents('Migrate1', parseLog(lines).lines));
  const s = r.states.get('m|GameOne1_7')!;
  assert.equal(s.card.stability, 9.4);
  assert.equal(s.card.reps, 4);
  assert.equal(s.firstReview, Date.parse('2026-08-01T09:00:00.000Z'));
  // mistake-lab's due is a local date; here it is the last review plus the interval: within a day.
  assert.ok(Math.abs(s.card.due! - Date.parse('2026-10-08T00:00:00.000Z')) <= 86_400_000);
  // The relapse marks its game and changes nothing (the game was before the last review).
  assert.equal(s.card.lapses, 1);
  const endOfDay = Date.parse('2026-10-08T00:00:00.000Z');
  const due = [...r.states.entries()].filter(([card, st]) => /^[mp]\|/.test(card) && st.card.state !== 0 && st.card.due! < endOfDay);
  assert.equal(due.length, run().report.dueBefore);
});
