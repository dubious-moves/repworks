#!/usr/bin/env node
// FSRS fitted to the owner's own answers, as a report (PLAN.md §5.183): does a scheduler whose
// weights are fitted to the progress log predict the answers better than the default weights the
// app runs on? Nothing is written and the app is unchanged: this answers whether §5.167's waiting
// idea (fitted weights in the settings file) is worth its cost.
//
//   node scripts/fsrs-fit.ts <data-repo checkout> [--kinds r,m] [--offset-minutes 60] [--json]
//
// It reads every device's progress files, takes the repertoire's moves' answers (`--kinds`: the
// card ids' first letters; r alone by default), fits FSRS-6's weights to them with the
// optimizer of the FSRS project (@open-spaced-repetition/binding, fsrs-rs underneath: the
// long-term weights and the curve's decay; the app's scheduler has no same-day step), and reports:
// - the whole log: how well the default weights and the fitted ones predicted each answer given a
//   day or more after the one before (the fitted ones have seen these answers);
// - cards the fit has not seen: the cards in five groups, each group's answers predicted by
//   weights fitted to the other four, and by the defaults; the two compared answer by answer (the
//   mean gap between their losses, against what chance gives: two standard errors);
// - later answers: weights fitted to the first 70% of the answers by time, both sets judged on
//   the last 30%. A young log fails this one even when the fit is right about the cards: the late
//   answers are all long gaps, which the early ones don't show;
// - what the fitted weights would do: the gaps of a move answered Good each time it comes due.
// `--offset-minutes` is the user's UTC offset, for counting days (a day starts at 4 o'clock).
import { DEFAULT_PARAMS } from '../src/core/progress/fsrs.ts';
import { readProgress } from '../src/core/progress/files.ts';
import { asTwentyOne, compare, cutoffAt, fitOf, goodIntervals, historiesOf, predictions, trainingItems, type Comparison, type Fit, type History, type Prediction, type TrainingItem } from './fsrs-fit-lib.ts';
import { readTree } from './read-tree.ts';

/** Fewer predicted answers than this and a fit is noise: the FSRS project's own floor for fitting. */
export const LEAST_ANSWERS = 400;
/** From this many on a fit is usually steady. */
export const ENOUGH_ANSWERS = 1000;
/** The groups the cards are put in for the test on cards the fit has not seen. */
const GROUPS = 5;

export interface Report {
  cards: number;
  answers: number;
  /** Answers a day or more after the one before: the ones a prediction is judged on. */
  predicted: number;
  sameDay: number;
  snapshots: number;
  days: number;
  defaults: { weights: number[]; fit: Fit; intervals: number[] };
  /** Absent when there are too few answers to fit. */
  fitted?: { weights: number[]; fit: Fit; intervals: number[] };
  /**
   * Cards the fit has not seen: the cards in five groups, each group's answers predicted by
   * weights fitted to the other four, so every answer is judged by weights that never saw its card.
   */
  unseen?: { groups: number; defaults: Fit; fitted: Fit } & Comparison;
  /** Later answers: weights fitted to the answers before `cutoff`, and both sets judged on the answers from it on. */
  holdout?: { cutoff: number; trainedOn: number; defaults: Fit; fitted: Fit } & Comparison;
  /** What the two tests say together. */
  verdict?: 'better' | 'worse' | 'same' | 'young';
  retention: number;
}

type Optimizer = (items: readonly TrainingItem[]) => Promise<number[]>;

/** The FSRS project's optimizer, loaded when the script runs (a native addon, or WebAssembly where there is none). */
export async function loadOptimizer(): Promise<Optimizer> {
  const binding = await import('@open-spaced-repetition/binding');
  // Each item is handed over once, however many fits it is part of (the whole log's, the groups', the early answers').
  const made = new WeakMap<TrainingItem, InstanceType<typeof binding.FSRSBindingItem>>();
  return async (items) => {
    const set = items.map((item) => {
      let one = made.get(item);
      if (!one) made.set(item, (one = new binding.FSRSBindingItem(item.reviews.map(([g, days]) => new binding.FSRSBindingReview(g, days)))));
      return one;
    });
    // The long-term weights and the decay only: the app's scheduler has no same-day step to fit.
    return binding.computeParameters(set, { modelVersion: 'FSRS-6', enableShortTerm: false });
  };
}

/** The report for a set of histories; `optimize` fits weights to training items. */
export async function reportOf(histories: readonly History[], snapshots: number, optimize: Optimizer, retention = DEFAULT_PARAMS.retention, offsetMinutes = 0): Promise<Report> {
  const defaults = asTwentyOne(DEFAULT_PARAMS.weights);
  const ps = predictions(histories, defaults);
  const answers = histories.reduce((n, h) => n + h.length, 0);
  const times = histories.flatMap((h) => h.map((a) => a.t));
  const report: Report = {
    cards: histories.length,
    answers,
    predicted: ps.length,
    sameDay: answers - histories.length - ps.length,
    snapshots,
    days: times.length ? Math.round((Math.max(...times) - Math.min(...times)) / 86_400_000) : 0,
    defaults: { weights: defaults, fit: fitOf(ps), intervals: goodIntervals(defaults, retention) },
    retention,
  };
  if (ps.length < LEAST_ANSWERS) return report;
  const items = trainingItems(histories, offsetMinutes);
  // The optimizer leaves the same-day weights at its own defaults: the app's model has none.
  const fitted = asTwentyOne(await optimize(items));
  report.fitted = { weights: fitted, fit: fitOf(predictions(histories, fitted)), intervals: goodIntervals(fitted, retention) };
  // Cards the fit has not seen, five ways.
  const [d, f]: [Prediction[], Prediction[]] = [[], []];
  for (let group = 0; group < GROUPS; group++) {
    const inGroup = histories.filter((_, i) => i % GROUPS === group);
    const weights = asTwentyOne(await optimize(items.filter((item) => item.h % GROUPS !== group)));
    d.push(...predictions(inGroup, defaults));
    f.push(...predictions(inGroup, weights));
  }
  report.unseen = { groups: GROUPS, defaults: fitOf(d), fitted: fitOf(f), ...compare(d, f) };
  report.verdict = report.unseen.verdict;
  const cutoff = cutoffAt(ps, 0.7);
  const early = cutoff === undefined ? [] : items.filter((item) => item.t < cutoff);
  if (cutoff !== undefined && early.length >= LEAST_ANSWERS / 2) {
    const fromEarly = asTwentyOne(await optimize(early));
    const late = (weights: readonly number[]) => predictions(histories, weights).filter((p) => p.t >= cutoff);
    const [d, f] = [late(defaults), late(fromEarly)];
    report.holdout = { cutoff, trainedOn: early.length, defaults: fitOf(d), fitted: fitOf(f), ...compare(d, f) };
    // Better on cards it hasn't seen, but weights fitted then would have misjudged what came after: the log is young.
    if (report.verdict === 'better' && report.holdout.verdict === 'worse') report.verdict = 'young';
  }
  return report;
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const fitLine = (name: string, f: Fit) => `  ${name.padEnd(16)} log loss ${f.logLoss.toFixed(4)}   calibration error ${pct(f.calibration)}   predicted ${pct(f.predicted)} right, ${pct(f.right)} were`;

/** The report as text. */
export function reportText(r: Report): string {
  const out: string[] = [];
  out.push(`${r.cards} cards, ${r.answers} answers over ${r.days} days; ${r.predicted} of them a day or more after the one before (the ones judged), ${r.sameDay} on the same day.`);
  if (r.snapshots) out.push(`${r.snapshots} cards left out: they start from a migrated state, so their first answers aren't in the log.`);
  out.push('', 'The whole log:', fitLine('default weights', r.defaults.fit));
  if (!r.fitted) {
    out.push('', `Too few answers to fit: ${r.predicted}, and a fit needs ${LEAST_ANSWERS} at least (${ENOUGH_ANSWERS} to be steady). The default weights stay the best guess.`);
    return out.join('\n');
  }
  out.push(fitLine('fitted weights', r.fitted.fit), '  (the fitted weights have seen these answers: the two tests below are the ones that count)');
  const gap = (c: Comparison) => `  the fitted weights' log loss is ${c.gain >= 0 ? 'lower' : 'higher'} by ${Math.abs(c.gain).toFixed(4)}, answer by answer; chance alone moves that by about ${(2 * c.error).toFixed(4)}: ${c.verdict === 'same' ? 'no difference' : c.verdict}`;
  if (r.unseen) {
    out.push('', `Cards the fit has not seen (the cards in ${r.unseen.groups} groups, each judged by weights fitted to the others):`, fitLine('default weights', r.unseen.defaults), fitLine('fitted weights', r.unseen.fitted), gap(r.unseen));
  }
  if (r.holdout) {
    const h = r.holdout;
    out.push('', `Later answers (fitted to the ${h.trainedOn} before ${new Date(h.cutoff).toISOString().slice(0, 10)}, judged on the ${h.defaults.n} from then on):`, fitLine('default weights', h.defaults), fitLine('fitted weights', h.fitted), gap(h));
  }
  out.push('', 'Predicted recall against the share answered right, by band (the whole log):', '  predicted    answers   default weights   fitted weights');
  for (const b of r.defaults.fit.bands) {
    const f = r.fitted.fit.bands.find((x) => x.from === b.from);
    out.push(`  ${`${Math.round(b.from * 100)}–${Math.round(b.to * 100)}%`.padEnd(10)} ${String(b.n).padStart(8)}   ${pct(b.right).padStart(6)} right       ${f ? `${String(f.n).padStart(6)} answers, ${pct(f.right)} right` : '     none'}`);
  }
  out.push('', `A move answered Good each time it comes due, at ${pct(r.retention)} recall (days between answers):`, `  default weights  ${r.defaults.intervals.join(', ')}`, `  fitted weights   ${r.fitted.intervals.join(', ')}`);
  out.push('', `Fitted weights (FSRS-6: 17 long-term weights, three same-day ones the app doesn't use, and the curve's decay, ${r.fitted.weights[20]!.toFixed(4)} against the default 0.5):`, `  ${r.fitted.weights.map((w) => +w.toFixed(4)).join(', ')}`);
  out.push('');
  const few = r.predicted < ENOUGH_ANSWERS ? ` With ${r.predicted} answers judged (under ${ENOUGH_ANSWERS}) this can change as the log grows.` : '';
  const words = {
    better: 'The fitted weights predicted the answers of cards they had not seen better than the defaults, and later answers no worse: fitting is worth considering.',
    young: 'The fitted weights describe the cards better than the defaults, but weights fitted to the earlier answers predicted the later ones worse: the log is too young for the long gaps. Wait, and run this again.',
    worse: 'The fitted weights predicted the answers of cards they had not seen worse than the defaults: stay on the defaults.',
    same: 'The fitted weights predicted the answers of cards they had not seen about as well as the defaults (the gap is within what chance gives): nothing to gain yet.',
  }[r.verdict ?? 'same'];
  out.push(words + few);
  return out.join('\n');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args.splice(i, 2)[1] : undefined;
  };
  const kinds = (flag('--kinds') ?? 'r').split(',').filter(Boolean);
  const offset = Number(flag('--offset-minutes') ?? 0);
  const json = args.includes('--json');
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir || !Number.isFinite(offset)) {
    console.error('usage: node scripts/fsrs-fit.ts <data-repo checkout> [--kinds r,m] [--offset-minutes 60] [--json]');
    process.exit(2);
  }
  const { events, problems } = readProgress(readTree(dir));
  if (problems.length) console.error(`${problems.length} line(s) of the progress files couldn't be read and were left out.`);
  const { histories, snapshots } = historiesOf(events, kinds);
  let optimize: Optimizer;
  try {
    optimize = await loadOptimizer();
  } catch (e) {
    console.error(`The optimizer (@open-spaced-repetition/binding) didn't load: ${e instanceof Error ? e.message : String(e)}\nRun npm ci first; Node 24 gives its native build.`);
    process.exit(1);
  }
  const report = await reportOf(histories, snapshots, optimize, DEFAULT_PARAMS.retention, offset);
  console.log(json ? JSON.stringify(report, null, 2) : reportText(report));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
