// FSRS-5, long-term scheduler (PLAN.md §4.8), ported from puzzle-explorer's lib/fsrs.js, the
// tested extraction of mistake-lab's: the same weights and formulas. Changes:
// - pure: the time of a review is passed in, in milliseconds;
// - `due` is an instant (last review plus the interval), not a local date, so replaying the same
//   events gives the same state on every device whatever its time zone; "due today" is the app's
//   question, asked with the device's calendar;
// - the retention, weights and longest interval are parameters (retention is a setting: 0.9 in
//   mistake-lab, 0.93 in puzzle-explorer);
// - no fuzz, so replay is deterministic.

export const FSRS5_WEIGHTS: readonly number[] = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698,
  0.2315, 2.9898, 0.51655, 0.6621,
];

export interface FsrsParams {
  /** 19 weights; the last two (short-term) are unused by this long-term scheduler. */
  weights: readonly number[];
  /** The recall probability at which a card comes due. */
  retention: number;
  /** The longest interval, in days. */
  maxInterval: number;
}

export const DEFAULT_PARAMS: FsrsParams = { weights: FSRS5_WEIGHTS, retention: 0.9, maxInterval: 365 };

export const Grade = { again: 1, hard: 2, good: 3, easy: 4 } as const;
export type FsrsGrade = 1 | 2 | 3 | 4;
export const State = { new: 0, learning: 1, review: 2, relearning: 3 } as const;
export type FsrsState = 0 | 1 | 2 | 3;

export interface FsrsCard {
  state: FsrsState;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  /** When it was last reviewed (ms since the epoch); undefined for a new card. */
  lastReview?: number;
  /** When it comes due (ms); undefined for a new card. */
  due?: number;
  elapsedDays: number;
  scheduledDays: number;
}

const DAY_MS = 86_400_000;
const F = 19 / 81;
const C = -0.5;

export const newCard = (): FsrsCard => ({ state: State.new, stability: 0, difficulty: 0, reps: 0, lapses: 0, elapsedDays: 0, scheduledDays: 0 });

export const retrievability = (elapsedDays: number, stability: number) => Math.pow(1 + F * (elapsedDays / stability), C);
const nextInterval = (retention: number, stability: number) => (stability / F) * (Math.pow(retention, 1 / C) - 1);

// The formulas, with the weights passed in (kept out of `review` so a replay of many events
// doesn't build them again for each one).
const wt = (w: readonly number[], i: number) => w[i] ?? 0;
const s0 = (w: readonly number[], g: FsrsGrade) => wt(w, g - 1);
const d0 = (w: readonly number[], g: FsrsGrade) => Math.min(10, Math.max(1, wt(w, 4) - Math.exp(wt(w, 5) * (g - 1)) + 1));
function nextDifficulty(w: readonly number[], d: number, g: FsrsGrade): number {
  const dp = d + -wt(w, 6) * (g - 3) * ((10 - d) / 9);
  return Math.min(10, Math.max(1, wt(w, 7) * d0(w, Grade.easy) + (1 - wt(w, 7)) * dp));
}
function stabilityAfterSuccess(w: readonly number[], d: number, s: number, r: number, g: FsrsGrade): number {
  const hard = g === Grade.hard ? wt(w, 15) : 1;
  const easy = g === Grade.easy ? wt(w, 16) : 1;
  return s * (1 + (11 - d) * Math.pow(s, -wt(w, 9)) * (Math.exp(wt(w, 10) * (1 - r)) - 1) * hard * easy * Math.exp(wt(w, 8)));
}
const stabilityAfterFailure = (w: readonly number[], d: number, s: number, r: number) =>
  Math.min(Math.pow(d, -wt(w, 12)) * (Math.pow(s + 1, wt(w, 13)) - 1) * Math.exp(wt(w, 14) * (1 - r)) * wt(w, 11), s);

/** Reviews a card at `now` with `grade`; a review before the last one counts as no time passed. */
export function review(card: FsrsCard, grade: FsrsGrade, now: number, params: FsrsParams = DEFAULT_PARAMS): FsrsCard {
  const w = params.weights;
  const c: FsrsCard = { ...card };
  // A clock behind the last review (another device's, or a reset) counts as no time passed,
  // as mistake-lab's fsrs_review does.
  c.elapsedDays = c.lastReview === undefined ? 0 : Math.max(0, (now - c.lastReview) / DAY_MS);
  if (c.state === State.new) {
    c.stability = s0(w, grade);
    c.difficulty = d0(w, grade);
    c.reps = 1;
    if (grade === Grade.again) {
      c.state = State.learning;
      c.lapses = 1;
    } else c.state = State.review;
  } else {
    const r = retrievability(c.elapsedDays, c.stability);
    c.difficulty = nextDifficulty(w, c.difficulty, grade);
    if (grade === Grade.again) {
      c.stability = stabilityAfterFailure(w, c.difficulty, c.stability, r);
      c.lapses++;
      c.state = State.relearning;
    } else {
      c.stability = stabilityAfterSuccess(w, c.difficulty, c.stability, r, grade);
      c.reps++;
      c.state = State.review;
    }
  }
  // Again: half the stability, at least a day (no same-day repeat). Otherwise the interval at
  // which recall falls to the retention. Never beyond the longest interval.
  const interval = grade === Grade.again ? Math.max(1, Math.round(c.stability * 0.5)) : Math.max(1, Math.round(nextInterval(params.retention, c.stability)));
  c.scheduledDays = Math.min(interval, params.maxInterval);
  c.lastReview = now;
  c.due = now + c.scheduledDays * DAY_MS;
  return c;
}

/** A card whose numbers are broken (NaN, out of range) starts again as new, rather than vanish. */
export function validCard(card: FsrsCard): FsrsCard {
  if (card.state === State.new) return card;
  const ok = Number.isFinite(card.stability) && card.stability > 0 && Number.isFinite(card.difficulty) && card.difficulty >= 1 && card.difficulty <= 10;
  return ok ? card : newCard();
}
