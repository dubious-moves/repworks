// The device's calendar, as the spans core counts over (core has no clock or calendar): local
// days from midnight to midnight, a day of 23 or 25 hours where the clocks change; and the frame
// of the progress page's calendar (PLAN.md §5.167), a column a week with Monday first.
import type { Span } from '../core/train/stats.ts';

const DAY_MS = 86_400_000;
/** No log is older: a time before this is a bad record, not a day to count from. */
const MOST_DAYS = 366 * 30;

/** `count` local days from the day `offset` days from now's, by the device's calendar. */
export function localDays(now: number, offset: number, count: number): Span[] {
  const d = new Date(now);
  return Array.from({ length: count }, (_, i) => ({
    start: new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset + i).getTime(),
    end: new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset + i + 1).getTime(),
  }));
}

/** A time's weekday on the device, Monday first: 0 for a Monday, 6 for a Sunday. */
export const weekdayOf = (ms: number): number => (new Date(ms).getDay() + 6) % 7;

/**
 * The days a calendar of `weeks` columns holds when its last column is the week of `now` and its
 * last square today: whole weeks before it, then Monday to today.
 */
export const calendarDays = (now: number, weeks: number): number => (weeks - 1) * 7 + weekdayOf(now) + 1;

/** A time's local date as a count of days, so two dates' difference is in calendar days. */
const dateNumber = (ms: number): number => {
  const d = new Date(ms);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS);
};

/** The local days from `first`'s day to now's, both counted: 1 when they are the same day. */
export function daysSince(now: number, first: number): number {
  return Math.min(MOST_DAYS, Math.max(1, dateNumber(now) - dateNumber(first) + 1));
}
