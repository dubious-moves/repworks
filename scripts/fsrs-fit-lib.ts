// The pure half of scripts/fsrs-fit.ts (PLAN.md §5.183): the review histories in a data repo's
// progress log, the app's scheduler with its weights and its forgetting curve's decay as
// parameters, and how well a set of weights predicted the answers.
//
// The model here is src/core/progress/fsrs.ts's, formula for formula, with one more parameter:
// the curve's decay, 0.5 in FSRS-5 and a fitted weight (the 21st) in FSRS-6. With the app's 19
// weights it gives the app's own numbers (test/unit/scripts/fsrsFit.test.ts holds it to that), so
// what the script reports for "the defaults" is what the app does today.
import { parseCard } from '../src/core/progress/cards.ts';
import type { DeviceEvent } from '../src/core/progress/replay.ts';
import { order } from '../src/core/progress/replay.ts';

const DAY_MS = 86_400_000;

export interface Answer {
  /** When, ms since the epoch. */
  t: number;
  /** 1 again, 2 hard, 3 good, 4 easy. */
  g: 1 | 2 | 3 | 4;
}

/** One card's answers from its first (or from the first after a "forget"), oldest first. */
export type History = readonly Answer[];

export interface Histories {
  histories: History[];
  /** Cards left out because they start from a migrated state (§5.64): what came before isn't in the log. */
  snapshots: number;
  /** Cards of other kinds than those asked for. */
  otherKinds: number;
}

/**
 * The histories of the cards whose id starts with one of `kinds` ("r" the repertoire's moves, "m"
 * the game cards, …), folded as the replay folds them: duplicates of (device, n) dropped, in
 * (t, device, n) order, a "forget" starting the card again, a relapse (§5.59) an Again at its
 * game's time under the replay's own guards. A card that took a snapshot is left out whole.
 */
export function historiesOf(events: readonly DeviceEvent[], kinds: readonly string[] = ['r']): Histories {
  const seen = new Set<string>();
  const byCard = new Map<string, DeviceEvent[]>();
  let otherKinds = 0;
  const others = new Set<string>();
  for (const e of [...events].sort(order)) {
    const id = `${e.device}\0${e.n}`;
    if (seen.has(id)) continue;
    seen.add(id);
    if (!e.event) continue;
    const card = e.event.card;
    const letter = parseCard(card)?.kind === 'repertoire' ? 'r' : card.slice(0, card.indexOf('|'));
    if (!kinds.includes(letter)) {
      if (!others.has(card)) {
        others.add(card);
        otherKinds++;
      }
      continue;
    }
    let list = byCard.get(card);
    if (!list) byCard.set(card, (list = []));
    list.push(e);
  }
  const histories: History[] = [];
  let snapshots = 0;
  for (const list of byCard.values()) {
    if (list.some((e) => e.event?.k === 'snapshot')) {
      snapshots++;
      continue;
    }
    let current: Answer[] = [];
    const relapsed = new Set<string>();
    const close = () => {
      if (current.length) histories.push(current);
      current = [];
    };
    for (const { event, t } of list) {
      if (!event) continue;
      if (event.k === 'review') current.push({ t, g: event.g });
      else if (event.k === 'forget') close();
      else if (event.k === 'relapse') {
        if (relapsed.has(event.g)) continue;
        relapsed.add(event.g);
        const at = Date.parse(event.at);
        const last = current[current.length - 1];
        if (last && last.t < at) current.push({ t: at, g: 1 });
      }
    }
    close();
  }
  return { histories, snapshots, otherKinds };
}

/** The app's FSRS-5 weights (src/core/progress/fsrs.ts) as 21: no same-day terms, the decay 0.5. */
export const asTwentyOne = (weights: readonly number[]): number[] => {
  const w = weights.slice(0, 21);
  while (w.length < 17) w.push(0);
  // The app's scheduler has no same-day (short-term) step: weights 17 to 19 play no part in it.
  return [...w.slice(0, 17), 0, 0, 0, weights[20] ?? 0.5];
};

export const decayOf = (weights: readonly number[]) => weights[20] ?? 0.5;
/** The curve's factor for a decay: recall is 0.9 when the days elapsed equal the stability. */
const factorOf = (decay: number) => Math.pow(0.9, -1 / decay) - 1;

export const recall = (elapsedDays: number, stability: number, decay: number) => Math.pow(1 + factorOf(decay) * (elapsedDays / stability), -decay);
/** The days after which recall falls to `retention`, unrounded. */
export const intervalFor = (retention: number, stability: number, decay: number) => (stability / factorOf(decay)) * (Math.pow(retention, -1 / decay) - 1);

interface Memory {
  stability: number;
  difficulty: number;
}

const clampD = (d: number) => Math.min(10, Math.max(1, d));
const d0 = (w: readonly number[], g: number) => clampD(w[4]! - Math.exp(w[5]! * (g - 1)) + 1);

/** A card's memory after an answer `elapsedDays` after the last (undefined: its first), as fsrs.ts's `review`. */
export function step(w: readonly number[], m: Memory | undefined, g: number, elapsedDays: number): Memory {
  if (!m) return { stability: w[g - 1]!, difficulty: d0(w, g) };
  const r = recall(elapsedDays, m.stability, decayOf(w));
  const dp = m.difficulty + -w[6]! * (g - 3) * ((10 - m.difficulty) / 9);
  const d = clampD(w[7]! * d0(w, 4) + (1 - w[7]!) * dp);
  if (g === 1) {
    const s = Math.min(Math.pow(d, -w[12]!) * (Math.pow(m.stability + 1, w[13]!) - 1) * Math.exp(w[14]! * (1 - r)) * w[11]!, m.stability);
    return { stability: s, difficulty: d };
  }
  const hard = g === 2 ? w[15]! : 1;
  const easy = g === 4 ? w[16]! : 1;
  const s = m.stability * (1 + (11 - d) * Math.pow(m.stability, -w[9]!) * (Math.exp(w[10]! * (1 - r)) - 1) * hard * easy * Math.exp(w[8]!));
  return { stability: s, difficulty: d };
}

export interface Prediction {
  /** When the answer was given. */
  t: number;
  /** The recall the weights gave the answer, from the card's memory before it. */
  p: number;
  right: boolean;
  /** Whole days since the answer before (the days between the two instants, rounded down). */
  days: number;
}

/**
 * Every answer but a card's first, with the recall `weights` predicted for it. Same-day answers
 * (less than `minDays` after the one before) are folded into the memory but not predicted: the
 * app asks a move again within a sitting, and those say little of what is remembered.
 */
export function predictions(histories: readonly History[], weights: readonly number[], minDays = 1): Prediction[] {
  const out: Prediction[] = [];
  const decay = decayOf(weights);
  for (const h of histories) {
    let m: Memory | undefined;
    let last = 0;
    for (const a of h) {
      const elapsed = m ? Math.max(0, (a.t - last) / DAY_MS) : 0;
      if (m && elapsed >= minDays) out.push({ t: a.t, p: recall(elapsed, m.stability, decay), right: a.g > 1, days: Math.floor(elapsed) });
      m = step(weights, m, a.g, elapsed);
      last = a.t;
    }
  }
  return out;
}

export interface Fit {
  /** The answers predicted. */
  n: number;
  /** The share answered right. */
  right: number;
  /** The mean recall predicted. */
  predicted: number;
  /** The mean of −ln of the probability given to what happened: lower is better; 0.693 is a coin. */
  logLoss: number;
  /** The calibration error: the root of the mean squared gap between predicted and actual recall over ten bands of predicted recall, weighted by their answers. */
  calibration: number;
  bands: { from: number; to: number; n: number; predicted: number; right: number }[];
}

/** How well predictions matched the answers. */
export function fitOf(ps: readonly Prediction[]): Fit {
  const bands = Array.from({ length: 10 }, (_, i) => ({ from: i / 10, to: (i + 1) / 10, n: 0, sumP: 0, sumRight: 0 }));
  let loss = 0;
  let right = 0;
  let predicted = 0;
  for (const one of ps) {
    const { p, right: ok } = one;
    loss += lossOf(one);
    right += ok ? 1 : 0;
    predicted += p;
    const band = bands[Math.min(9, Math.floor(p * 10))]!;
    band.n++;
    band.sumP += p;
    band.sumRight += ok ? 1 : 0;
  }
  const n = ps.length;
  let squared = 0;
  for (const b of bands) if (b.n) squared += b.n * (b.sumP / b.n - b.sumRight / b.n) ** 2;
  return {
    n,
    right: n ? right / n : 0,
    predicted: n ? predicted / n : 0,
    logLoss: n ? loss / n : 0,
    calibration: n ? Math.sqrt(squared / n) : 0,
    bands: bands.filter((b) => b.n).map((b) => ({ from: b.from, to: b.to, n: b.n, predicted: b.sumP / b.n, right: b.sumRight / b.n })),
  };
}

/** The gaps, in days, of a move answered Good each time it comes due at `retention`: what the weights mean in practice. */
export function goodIntervals(weights: readonly number[], retention: number, count = 6, maxInterval = 365): number[] {
  const out: number[] = [];
  let m: Memory | undefined;
  let elapsed = 0;
  for (let i = 0; i < count; i++) {
    m = step(weights, m, 3, elapsed);
    elapsed = Math.min(maxInterval, Math.max(1, Math.round(intervalFor(retention, m.stability, decayOf(weights)))));
    out.push(elapsed);
  }
  return out;
}

export interface TrainingItem {
  /** The card's answers up to this one: [grade, whole days since the one before] (0 for the first). */
  reviews: [number, number][];
  /** When this answer was given. */
  t: number;
  /** Which of the histories it is from (its index). */
  h: number;
}

/**
 * The histories as the optimizer's training items: one for each answer after a card's first,
 * holding the card's answers up to it. Days are counted between local days that start at
 * `dayStartsAt` o'clock at UTC offset `offsetMinutes`, as FSRS-6 counts them, so two sittings on
 * one day are 0 apart and an evening and the next morning 1.
 */
export function trainingItems(histories: readonly History[], offsetMinutes = 0, dayStartsAt = 4): TrainingItem[] {
  const dayOf = (t: number) => Math.floor((t + offsetMinutes * 60_000 - dayStartsAt * 3_600_000) / DAY_MS);
  const items: TrainingItem[] = [];
  for (const [index, h] of histories.entries()) {
    const reviews: [number, number][] = [];
    let last = 0;
    for (const [i, a] of h.entries()) {
      const day = dayOf(a.t);
      reviews.push([a.g, i === 0 ? 0 : Math.max(0, day - last)]);
      last = day;
      if (i > 0) items.push({ reviews: reviews.map((r) => [...r] as [number, number]), t: a.t, h: index });
    }
  }
  return items;
}

/** The instant before which `share` of the predicted answers were given: what came before trains, what came after tests. */
export function cutoffAt(ps: readonly Prediction[], share: number): number | undefined {
  if (!ps.length) return undefined;
  const times = ps.map((p) => p.t).sort((a, b) => a - b);
  return times[Math.min(times.length - 1, Math.floor(times.length * share))];
}

const EPS = 1e-6;
/** −ln of the probability a prediction gave to what happened (a certain one that failed costs much, not everything). */
function lossOf(p: Prediction): number {
  const q = Math.min(1 - EPS, Math.max(EPS, p.p));
  return -(p.right ? Math.log(q) : Math.log(1 - q));
}

export interface Comparison {
  /** The defaults' log loss less the fitted weights', a mean over the same answers: above 0, the fit predicted better. */
  gain: number;
  /** The standard error of that mean: how far chance alone moves it. */
  error: number;
  /** Better or worse when the gain is more than two standard errors from 0; else the same. */
  verdict: 'better' | 'worse' | 'same';
}

/**
 * Two sets of weights on the same answers, in the same order: the mean gap between their losses
 * answer by answer, against what chance gives. Most of a log loss is what no scheduler could
 * know (a move remembered nine times in ten still fails one), so the two totals differ little
 * even when one set is plainly off: the paired gap is what tells them apart.
 */
export function compare(defaults: readonly Prediction[], fitted: readonly Prediction[]): Comparison {
  const n = Math.min(defaults.length, fitted.length);
  if (!n) return { gain: 0, error: 0, verdict: 'same' };
  let sum = 0;
  let squares = 0;
  for (let i = 0; i < n; i++) {
    const d = lossOf(defaults[i]!) - lossOf(fitted[i]!);
    sum += d;
    squares += d * d;
  }
  const gain = sum / n;
  const variance = Math.max(0, squares / n - gain * gain);
  const error = Math.sqrt(variance / n);
  return { gain, error, verdict: Math.abs(gain) <= 2 * error ? 'same' : gain > 0 ? 'better' : 'worse' };
}
