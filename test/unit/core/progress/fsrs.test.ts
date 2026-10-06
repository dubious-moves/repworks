// FSRS-5 (PLAN.md §4.8): puzzle-explorer's analyzer/fsrs-test.js cases, ported, and agreement
// with puzzle-explorer's lib/fsrs.js on 509 recorded review steps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_PARAMS, Grade, newCard, review, State, validCard, type FsrsCard, type FsrsGrade } from '../../../../src/core/progress/fsrs.ts';

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 0, 1, 12);
const PE = { ...DEFAULT_PARAMS, retention: 0.93 }; // puzzle-explorer's retention

test('a new card', () => {
  const c = newCard();
  assert.deepEqual([c.state, c.stability, c.difficulty, c.reps, c.lapses, c.due, c.lastReview], [State.new, 0, 0, 0, 0, undefined, undefined]);
});

test('first review: each grade', () => {
  const [again, hard, good, easy] = ([1, 2, 3, 4] as FsrsGrade[]).map((g) => review(newCard(), g, t0, PE));
  assert.equal(again!.state, State.learning);
  for (const c of [hard, good, easy]) assert.equal(c!.state, State.review);
  assert.deepEqual([again!.lapses, hard!.lapses, easy!.lapses], [1, 0, 0]);
  assert.equal(again!.reps, 1);
  for (const c of [again, hard, good, easy]) {
    assert.ok(Number.isFinite(c!.stability));
    assert.ok(c!.difficulty >= 1 && c!.difficulty <= 10);
    assert.ok(c!.scheduledDays <= PE.maxInterval);
    assert.equal(c!.due, t0 + c!.scheduledDays * DAY);
    assert.equal(c!.lastReview, t0);
  }
  assert.ok(hard!.scheduledDays < easy!.scheduledDays);
  assert.ok(good!.scheduledDays < easy!.scheduledDays);
  assert.equal(again!.scheduledDays, 1);
});

test('repeated Easy on time: intervals grow to the cap', () => {
  let card = newCard();
  let now = t0;
  const trajectory: number[] = [];
  for (let i = 0; i < 12; i++) {
    card = review(card, Grade.easy, now, PE);
    trajectory.push(card.scheduledDays);
    now += card.scheduledDays * DAY;
  }
  assert.ok(trajectory[0]! >= 1);
  assert.ok(trajectory.every((v, i) => i === 0 || v >= trajectory[i - 1]!), trajectory.join(','));
  assert.equal(trajectory.at(-1), PE.maxInterval);
});

test('repeated Again: lapses grow, the interval stays at one day', () => {
  let card = newCard();
  let now = t0;
  const lapses: number[] = [];
  for (let i = 0; i < 5; i++) {
    card = review(card, Grade.again, now, PE);
    lapses.push(card.lapses);
    assert.equal(card.scheduledDays, 1);
    now += DAY;
  }
  assert.deepEqual(lapses, [1, 2, 3, 4, 5]);
  assert.equal(card.state, State.relearning);
});

test('broken numbers start the card again', () => {
  const ok = review(newCard(), Grade.easy, t0);
  assert.equal(validCard(ok), ok);
  for (const bad of [{ stability: NaN }, { stability: -1 }, { difficulty: 99 }]) assert.equal(validCard({ ...ok, ...bad }).state, State.new);
  assert.equal(validCard(newCard()).state, State.new);
});

test('a review with the clock behind the last one counts as no time passed', () => {
  const card = review(newCard(), Grade.easy, Date.UTC(2026, 5, 1, 12));
  const out = review(card, Grade.good, Date.UTC(2026, 0, 1, 12));
  assert.equal(out.elapsedDays, 0);
  assert.ok(Number.isFinite(out.stability));
  assert.ok(out.difficulty >= 1 && out.difficulty <= 10);
});

test('a card survives JSON and goes on', () => {
  const c = JSON.parse(JSON.stringify(review(newCard(), Grade.easy, t0))) as FsrsCard;
  const next = review(c, Grade.good, t0 + 10 * DAY);
  assert.ok(Number.isFinite(next.stability));
  assert.equal(next.state, State.review);
});

test("the same numbers as puzzle-explorer's lib/fsrs.js, at retention 0.9 and 0.93", () => {
  const golden = JSON.parse(readFileSync(join(import.meta.dirname, '../../../fixtures/fsrs/golden.json'), 'utf8')) as {
    cases: { retention: number; steps: { t: string; grade: FsrsGrade; state: number; stability: number; difficulty: number; reps: number; lapses: number; elapsedDays: number; scheduledDays: number }[] }[];
  };
  // The golden numbers were recorded on Node 22. Math.pow and Math.exp may differ in the last
  // bit between JavaScript engines (Node 24 does at one step of 509), so the real numbers are
  // compared to 1e-12 of their size; the counts and the scheduled days exactly.
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b));
  let steps = 0;
  for (const { retention, steps: expected } of golden.cases) {
    let card = newCard();
    for (const step of expected) {
      card = review(card, step.grade, Date.parse(step.t), { ...DEFAULT_PARAMS, retention });
      const where = `retention ${retention}, step ${steps}`;
      assert.deepEqual([card.state, card.reps, card.lapses, card.scheduledDays], [step.state, step.reps, step.lapses, step.scheduledDays], where);
      for (const key of ['stability', 'difficulty', 'elapsedDays'] as const) assert.ok(close(card[key], step[key]), `${where}: ${key} ${card[key]}, recorded ${step[key]}`);
      steps++;
    }
  }
  assert.equal(steps, 509);
});
