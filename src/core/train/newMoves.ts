// What a day's new moves will cost (PLAN.md §5.170), for the field "New moves a day": the reviews
// a day two weeks on, and the day the moves left are all learned.
// - New moves: `perDay` a day from today (today less the ones already taught), until none is
//   left. Each is answered right every time: its first review after the learning step, then at
//   the scheduler's own intervals for a move answered Good, at the retention set.
// - The moves already started: §5.122's forecast (`reviewsAhead`), each answered right on its day.
// Misses are left out of both, so the figure is the least the days will hold.
// Core has no clock or calendar: the app passes in now and the days ahead.
import { DEFAULT_PARAMS, newCard, type FsrsParams } from '../progress/fsrs.ts';
import type { CardState } from '../progress/replay.ts';
import type { RepertoireIndex } from '../repertoire/index.ts';
import { heldCards } from './paused.ts';
import { knownCardsOf, statusOf } from './queue.ts';
import type { TrainSettings } from './settings.ts';
import { addReviews, reviewsAhead, type Span } from './stats.ts';

const HOUR_MS = 3_600_000;
/** The days the reviews are averaged over: the week that ends two weeks from today. */
export const FORECAST_FROM = 7;
export const FORECAST_DAYS = 14;

/**
 * The moves left to learn: never taught or reviewed, in a chapter not marked known (a known
 * chapter's moves skip teaching and the limit), not suspended, not on paused lines only.
 */
export function movesLeft(index: RepertoireIndex, states: ReadonlyMap<string, CardState>): number {
  const held = heldCards(index);
  const known = knownCardsOf(index);
  let left = 0;
  for (const card of index.cards.keys()) {
    const state = states.get(card);
    if (statusOf(state) === 'fresh' && !state?.suspended && !held.has(card) && !known.has(card)) left++;
  }
  return left;
}

export interface NewMovesOptions {
  now: number;
  /** The days ahead, today first: `FORECAST_DAYS` of them or more. */
  ahead: readonly Span[];
  /** New moves already taught today, on any device: they come off today's share. */
  taughtToday: number;
  params?: FsrsParams;
}

export interface NewMovesForecast {
  /** The moves left to learn now. */
  left: number;
  /** The new moves taught on each day ahead at this limit, today first. */
  taught: number[];
  /** The reviews due on each day ahead: the moves started now, and the new ones. */
  reviews: number[];
  /** The mean reviews a day over the second week ahead. */
  perDay: number;
  /**
   * The day the last move left is taught, counted from today (0); undefined when none is left,
   * or none is ever taught (a limit of 0).
   */
  doneIn?: number;
}

/** What `settings.newPerDay` new moves a day cost: see the file's head. */
export function newMovesForecast(index: RepertoireIndex, states: ReadonlyMap<string, CardState>, settings: TrainSettings, options: NewMovesOptions): NewMovesForecast {
  const { now, ahead } = options;
  const params = options.params ?? { ...DEFAULT_PARAMS, retention: settings.retention };
  const forecast = reviewsAhead(index, states, settings, { now, ahead, params });
  const left = movesLeft(index, states);
  const perDay = Math.max(0, Math.floor(settings.newPerDay));
  const today = Math.max(0, perDay - options.taughtToday);

  // Each day's new moves are taught at this time of day, and reviewed as one move is.
  const taught: number[] = [];
  let remaining = left;
  const sinceMidnight = ahead.length ? now - ahead[0]!.start : 0;
  ahead.forEach((day, i) => {
    const n = Math.min(remaining, i === 0 ? today : perDay);
    taught.push(n);
    remaining -= n;
    if (n === 0) return;
    const at = i === 0 ? now : Math.min(day.start + sinceMidnight, day.end - 1);
    addReviews(forecast, newCard(), at + settings.learnStepHours * HOUR_MS, now, params, n);
  });

  const reviews = forecast.map((d) => d.due);
  const week = reviews.slice(FORECAST_FROM, FORECAST_DAYS);
  const out: NewMovesForecast = { left, taught, reviews, perDay: week.length ? week.reduce((s, r) => s + r, 0) / week.length : 0 };
  if (left > 0 && perDay > 0) out.doneIn = left <= today ? 0 : Math.ceil((left - today) / perDay);
  return out;
}
