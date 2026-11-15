// FSRS fitted to the log, as a report (PLAN.md §5.183, scripts/fsrs-fit.ts): the histories read
// from progress files as the replay folds them, the script's model held to the app's own
// scheduler, how a fit is measured, and the whole report on a simulated learner whose memory
// isn't the defaults'.
//
// Controls run on this file (2026-11-15), each failing the named test:
// - the script's model without the difficulty's pull back to its mean (weight 7 left out) →
//   "the model is the app's scheduler";
// - a "forget" not starting the card again → "histories";
// - the test on unseen cards judging a group by weights fitted to that same group (not to the
//   others) → "the report: too few answers …" (the stand-in optimizer is asked for one group's
//   weights, not four's);
// - "young" never said (the two tests' verdicts not put together) → the same test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { repertoireCard } from '../../../src/core/progress/cards.ts';
import type { KnownEvent } from '../../../src/core/progress/events.ts';
import { dayFiles, readProgress } from '../../../src/core/progress/files.ts';
import { DEFAULT_PARAMS, FSRS5_WEIGHTS } from '../../../src/core/progress/fsrs.ts';
import { foldCard } from '../../../src/core/progress/replay.ts';
import { answersOf } from '../../../src/core/train/stats.ts';
import type { PositionKey } from '../../../src/core/chess/positionKey.ts';
import { asTwentyOne, compare, cutoffAt, fitOf, goodIntervals, historiesOf, intervalFor, predictions, recall, step, trainingItems, type History } from '../../../scripts/fsrs-fit-lib.ts';
import { ENOUGH_ANSWERS, LEAST_ANSWERS, loadOptimizer, reportOf, reportText } from '../../../scripts/fsrs-fit.ts';
import { readTree } from '../../../scripts/read-tree.ts';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 0, 5, 18);
const DEFAULTS = asTwentyOne(FSRS5_WEIGHTS);
const card = (i: number) => repertoireCard(`k${i}` as PositionKey, 'e2e4');

/** A seeded random source (mulberry32): the tests are the same every run. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let n = 0;
const review = (c: string, t: number, g: 1 | 2 | 3 | 4): KnownEvent => ({ v: 1, n: ++n, t: new Date(t).toISOString(), k: 'review', card: c, g });
const eventsOf = (device: string, events: readonly KnownEvent[]) => readProgress(dayFiles(device, events)).events;

test('histories: a card’s answers in time order across devices, a forget starting it again, a migrated card left out', () => {
  const a = card(1);
  const b = card(2);
  const phone = eventsOf('Phone001', [review(a, T0 + 3 * DAY, 3), review(b, T0, 1), { v: 1, n: ++n, t: new Date(T0 + 9 * DAY).toISOString(), k: 'forget', card: a }]);
  const desktop = eventsOf('Desktop1', [
    review(a, T0, 3),
    review(a, T0 + 10 * DAY, 2),
    review(a, T0 + 12 * DAY, 3),
    review('m|game1_12', T0, 3),
    review('m|game1_12', T0 + 2 * DAY, 3),
    // A game card migrated from mistake-lab (§5.64): its state is taken, its earlier answers aren't in the log.
    { v: 1, n: ++n, t: new Date(T0).toISOString(), k: 'snapshot', card: 'm|game2_30', st: 2, stab: 5, diff: 5, reps: 3, lapses: 0, sched: 5, last: new Date(T0 - DAY).toISOString() },
    review('m|game2_30', T0 + 5 * DAY, 3),
  ]);
  // The same events read twice (a day file and its month's): once.
  const found = historiesOf([...phone, ...desktop, ...phone]);
  assert.deepEqual(
    found.histories.map((h) => h.map((x) => `${(x.t - T0) / DAY}:${x.g}`).join(' ')).sort(),
    ['0:1', '0:3 3:3', '10:2 12:3'],
  );
  assert.equal(found.snapshots, 0);
  assert.equal(found.otherKinds, 2);
  // The game cards when asked for: the migrated one left out, and counted.
  const games = historiesOf([...phone, ...desktop], ['m']);
  assert.deepEqual(games.histories.map((h) => h.map((x) => x.g)), [[3, 3]]);
  assert.equal(games.snapshots, 1);
  assert.equal(historiesOf([...phone, ...desktop], ['r', 'm']).histories.length, 4);
});

test('the model is the app’s scheduler: with its 19 weights, its predictions and its states to the last digit', () => {
  const rnd = seeded(7);
  const events: KnownEvent[] = [];
  const cards = Array.from({ length: 60 }, (_, i) => card(100 + i));
  for (const c of cards) {
    let t = T0 + Math.floor(rnd() * 20) * DAY;
    const count = 3 + Math.floor(rnd() * 9);
    for (let i = 0; i < count; i++) {
      events.push(review(c, t, ([1, 2, 3, 3, 3, 4] as const)[Math.floor(rnd() * 6)]!));
      // Minutes, hours, days and months apart: same-day answers and long gaps both.
      t += Math.floor(Math.pow(rnd(), 3) * 120 * DAY) + 60_000;
    }
  }
  const all = eventsOf('Desktop1', events);
  assert.equal(historiesOf(all).histories.length, cards.length);
  let compared = 0;
  for (const c of cards) {
    const ofCard = all.filter((e) => e.event?.card === c);
    const { histories } = historiesOf(ofCard);
    assert.equal(histories.length, 1);
    // Every answer but the card's first, as the app's own fold predicts it.
    const mine = predictions(histories, DEFAULTS, 0);
    const apps = answersOf(ofCard).filter((x) => !x.first);
    assert.equal(mine.length, apps.length);
    for (const [i, p] of mine.entries()) {
      assert.equal(p.t, apps[i]!.t);
      assert.equal(p.right, apps[i]!.right);
      assert.ok(Math.abs(p.p - apps[i]!.predicted!) < 1e-12, `${c} ${i}: ${p.p} against ${apps[i]!.predicted}`);
      compared++;
    }
    // The memory after the last answer is the replay's card.
    const state = foldCard(ofCard).card;
    let m: { stability: number; difficulty: number } | undefined;
    let last = 0;
    for (const x of histories[0]!) {
      m = step(DEFAULTS, m, x.g, m ? (x.t - last) / DAY : 0);
      last = x.t;
    }
    assert.ok(Math.abs(m!.stability - state.stability) < 1e-9 * state.stability, `${c}: ${m!.stability} against ${state.stability}`);
    assert.ok(Math.abs(m!.difficulty - state.difficulty) < 1e-12);
  }
  assert.ok(compared > 300, String(compared));
  // The app's first gaps for Good each time (§5.178 names them: about 3, 11, 35, 100 days).
  assert.deepEqual(goodIntervals(DEFAULTS, 0.9, 4), [3, 11, 35, 101]);
  // On to the longest gap the app allows, a year.
  assert.deepEqual(goodIntervals(DEFAULTS, 0.9, 7, 365).slice(4), [270, 365, 365]);
});

test('the curve with a decay of its own: 90% at the stability whatever the decay, flatter with a smaller one', () => {
  for (const decay of [0.1, 0.3, 0.5, 0.8]) {
    assert.ok(Math.abs(recall(10, 10, decay) - 0.9) < 1e-12);
    assert.ok(Math.abs(intervalFor(0.9, 10, decay) - 10) < 1e-9);
    assert.ok(Math.abs(recall(intervalFor(0.8, 10, decay), 10, decay) - 0.8) < 1e-12);
  }
  // Long after the stability a flatter curve has forgotten less.
  assert.ok(recall(100, 10, 0.2) > recall(100, 10, 0.5));
  // The 19 weights as 21: the same-day weights out, the decay FSRS-5's.
  assert.deepEqual(DEFAULTS.slice(17), [0, 0, 0, 0.5]);
  assert.deepEqual(asTwentyOne([...FSRS5_WEIGHTS.slice(0, 17), 0.5, 0.6, 0.2, 0.15]).slice(17), [0, 0, 0, 0.15]);
});

test('how a fit is measured: the log loss, the calibration by band, same-day answers folded but not judged', () => {
  const fit = fitOf([
    { t: 1, p: 0.95, right: true, days: 3 },
    { t: 2, p: 0.95, right: true, days: 3 },
    { t: 3, p: 0.95, right: false, days: 3 },
    { t: 4, p: 0.55, right: true, days: 30 },
  ]);
  assert.equal(fit.n, 4);
  assert.equal(fit.right, 0.75);
  assert.ok(Math.abs(fit.logLoss - (-2 * Math.log(0.95) - Math.log(0.05) - Math.log(0.55)) / 4) < 1e-12);
  assert.deepEqual(fit.bands.map((b) => [b.from, b.n]), [[0.5, 1], [0.9, 3]]);
  // Bands: 0.55 predicted and 1 right; 0.95 predicted and 2/3 right.
  assert.ok(Math.abs(fit.calibration - Math.sqrt((1 * 0.45 ** 2 + 3 * (0.95 - 2 / 3) ** 2) / 4)) < 1e-12);
  assert.equal(fitOf([]).logLoss, 0);
  // A certain prediction that fails costs much, not everything.
  assert.ok(Number.isFinite(fitOf([{ t: 1, p: 1, right: false, days: 1 }]).logLoss));
  // Two sets of weights on the same answers: the mean gap between their losses, against chance's.
  const answers = Array.from({ length: 200 }, (_, i) => ({ t: i, right: i % 10 !== 0, days: 5 }));
  const good = answers.map((x) => ({ ...x, p: 0.9 }));
  const off = answers.map((x) => ({ ...x, p: 0.6 }));
  const better = compare(off, good);
  assert.equal(better.verdict, 'better');
  assert.ok(Math.abs(better.gain - (fitOf(off).logLoss - fitOf(good).logLoss)) < 1e-12);
  assert.ok(better.error > 0 && better.gain > 2 * better.error);
  assert.equal(compare(good, off).verdict, 'worse');
  assert.deepEqual(compare(good, good), { gain: 0, error: 0, verdict: 'same' });
  // A gap chance could give: the same.
  assert.equal(compare(good.slice(0, 12), good.slice(0, 12).map((x, i) => ({ ...x, p: i % 2 ? 0.88 : 0.93 }))).verdict, 'same');
  assert.deepEqual(compare([], []), { gain: 0, error: 0, verdict: 'same' });

  // An answer two hours after the one before changes the memory and isn't judged; the next day's is.
  const h: History = [{ t: T0, g: 3 }, { t: T0 + 2 * 3_600_000, g: 1 }, { t: T0 + 5 * DAY, g: 3 }];
  const judged = predictions([h], DEFAULTS);
  assert.deepEqual(judged.map((p) => [p.t, p.days]), [[T0 + 5 * DAY, 4]]);
  const without = predictions([[h[0]!, h[2]!]], DEFAULTS);
  assert.ok(judged[0]!.p < without[0]!.p, 'the same-day miss lowered what was expected');
  assert.equal(cutoffAt(judged, 0.7), T0 + 5 * DAY);
  assert.equal(cutoffAt([], 0.7), undefined);

  // Training items: one for each answer after the first, the days between local days from 4 o'clock.
  const evening: History = [{ t: Date.UTC(2026, 0, 5, 22), g: 3 }, { t: Date.UTC(2026, 0, 6, 2), g: 3 }, { t: Date.UTC(2026, 0, 6, 9), g: 1 }, { t: Date.UTC(2026, 0, 9, 9), g: 3 }];
  assert.deepEqual(trainingItems([evening]).map((i) => i.reviews), [
    [[3, 0], [3, 0]],
    [[3, 0], [3, 0], [1, 1]],
    [[3, 0], [3, 0], [1, 1], [3, 3]],
  ]);
  // Two hours east, 02:00 UTC is 04:00: the next day already.
  assert.deepEqual(trainingItems([evening], 120).at(-1)!.reviews, [[3, 0], [3, 1], [1, 0], [3, 3]]);
});

/** A learner whose first stabilities are `times` the defaults', scheduled by the defaults as the app would. */
function simulated(cardCount: number, seed: number, times = 3): History[] {
  const rnd = seeded(seed);
  const truth = [...DEFAULTS];
  for (const i of [0, 1, 2, 3]) truth[i]! *= times;
  const out: History[] = [];
  for (let c = 0; c < cardCount; c++) {
    let t = T0 + Math.floor(rnd() * 60) * DAY;
    let mTrue: ReturnType<typeof step> | undefined;
    let mApp: ReturnType<typeof step> | undefined;
    let last = 0;
    const h: { t: number; g: 1 | 3 }[] = [];
    for (let i = 0; i < 8 && t < T0 + 400 * DAY; i++) {
      const elapsed = mTrue ? (t - last) / DAY : 0;
      const g = rnd() < (mTrue ? recall(elapsed, mTrue.stability, 0.5) : 0.8) ? 3 : 1;
      h.push({ t, g });
      mTrue = step(truth, mTrue, g, elapsed);
      mApp = step(DEFAULTS, mApp, g, elapsed);
      last = t;
      // Due by the app's weights, answered from half as late to twice as late, as a real log is.
      t += Math.max(1, Math.round((g === 1 ? 1 : mApp.stability) * (0.5 + 1.5 * rnd()))) * DAY + Math.floor(rnd() * 3_600_000);
    }
    out.push(h);
  }
  return out;
}

test('the report: a learner who remembers longer than the defaults say is found, on cards the fit has not seen', async () => {
  const histories = simulated(1500, 2);
  const report = await reportOf(histories, 2, await loadOptimizer());
  assert.equal(report.cards, 1500);
  assert.ok(report.predicted >= ENOUGH_ANSWERS && report.sameDay === 0, `${report.predicted} judged, ${report.sameDay} same-day`);
  // The defaults expect less than this learner remembers.
  assert.ok(report.defaults.fit.predicted < report.defaults.fit.right - 0.01);
  const fitted = report.fitted!;
  assert.equal(fitted.weights.length, 21);
  assert.deepEqual(fitted.weights.slice(17, 20), [0, 0, 0]);
  assert.ok(fitted.fit.logLoss < report.defaults.fit.logLoss);
  assert.ok(fitted.fit.calibration < report.defaults.fit.calibration / 2, `${fitted.fit.calibration} against ${report.defaults.fit.calibration}`);
  // Longer first gaps, as the truth has.
  assert.ok(fitted.intervals[0]! >= 2 * report.defaults.intervals[0]!, fitted.intervals.join());
  // Cards the fit has not seen: every judged answer, each by weights fitted without its card.
  const u = report.unseen!;
  assert.equal(u.defaults.n, report.predicted);
  assert.equal(u.fitted.n, report.predicted);
  assert.equal(u.verdict, 'better');
  assert.ok(u.gain > 2 * u.error && u.fitted.calibration < u.defaults.calibration);
  // Later answers: the last 30% by time, judged by weights fitted to what came before.
  const h = report.holdout!;
  assert.ok(Math.abs(h.defaults.n / report.predicted - 0.3) < 0.01, `${h.defaults.n} of ${report.predicted}`);
  assert.equal(h.defaults.n, h.fitted.n);
  assert.ok(h.trainedOn < report.predicted);
  // Better on unseen cards; "young" when the early answers' fit misjudged the later ones.
  assert.equal(report.verdict, h.verdict === 'worse' ? 'young' : 'better');
  const text = reportText(report);
  assert.match(text, /^1500 cards, \d+ answers over \d+ days/);
  assert.match(text, /2 cards left out: they start from a migrated state/);
  assert.match(text, /Cards the fit has not seen \(the cards in 5 groups/);
  assert.match(text, /Later answers \(fitted to the \d+ before 2026-\d\d-\d\d, judged on the \d+ from then on\)/);
  assert.match(text, /(fitting is worth considering|Wait, and run this again)\.$/);
});

test('the report: too few answers to fit says so and fits nothing; weights no different gain nothing; a young log', async () => {
  const few = await reportOf(simulated(40, 3), 0, () => assert.fail('nothing to fit'));
  assert.ok(few.predicted < LEAST_ANSWERS);
  assert.equal(few.fitted, undefined);
  assert.equal(few.verdict, undefined);
  assert.match(reportText(few), /Too few answers to fit: \d+, and a fit needs 400 at least/);

  // The optimizer handing back the defaults: the same predictions, so "about as well".
  const asked: number[] = [];
  const same = await reportOf(simulated(400, 5), 0, async (items) => {
    asked.push(new Set(items.map((item) => item.h % 5)).size);
    return [...DEFAULTS];
  });
  // Seven fits: the whole log's, one for each group of cards from the other four groups, the early answers'.
  assert.deepEqual(asked, [5, 4, 4, 4, 4, 4, 5]);
  assert.equal(same.unseen?.verdict, 'same');
  assert.equal(same.verdict, 'same');
  assert.match(reportText(same), /nothing to gain yet\./);
  assert.equal(same.retention, DEFAULT_PARAMS.retention);
  assert.ok(same.predicted < ENOUGH_ANSWERS || /this can change as the log grows/.test(reportText(same)) === false);

  // Weights right about the cards when fitted to them all; fitted to the early answers alone, wrong
  // about how memory grows (they haven't seen a long gap): young.
  const histories = simulated(400, 6);
  const truth = [...DEFAULTS];
  for (const i of [0, 1, 2, 3]) truth[i]! *= 3;
  const cut = cutoffAt(predictions(histories, DEFAULTS), 0.7)!;
  const young = await reportOf(histories, 0, async (items) => (items.every((item) => item.t < cut) ? DEFAULTS.map((w, i) => (i === 8 ? w - 2 : w)) : truth));
  assert.equal(young.unseen?.verdict, 'better');
  assert.equal(young.holdout?.verdict, 'worse');
  assert.equal(young.verdict, 'young');
  assert.match(reportText(young), /the log is too young for the long gaps\. Wait, and run this again\./);
});

test('from a data repo’s checkout: the progress files of every device, as the script reads them', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fsrs-fit-'));
  const files = new Map([...dayFiles('Phone001', [review(card(900), T0, 3), review(card(900), T0 + 4 * DAY, 3)]), ...dayFiles('Desktop1', [review(card(900), T0 + 9 * DAY, 1)])]);
  for (const [path, text] of files) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  const { events, problems } = readProgress(readTree(dir));
  assert.equal(problems.length, 0);
  assert.deepEqual(historiesOf(events).histories.map((h) => h.map((x) => x.g)), [[3, 3, 1]]);
});
