// Time travel (PLAN.md §5.17): the time that decides what is due, shifted ahead for this tab.
// Everything that reads the clock to decide (the day's bounds, what is due, the learning step,
// the queue, the line list's "Due …", the pins) reads `decidingNow()`; events are still recorded
// at the real time, so a review made ahead is an early review, and nothing from a future that
// never happened reaches the log. Kept per tab (sessionStorage): a reload keeps it, a new tab
// starts at now.
import { signal } from '@preact/signals';
import { shiftedClock } from '../platform/browser.ts';

const KEY = 'repworks.timeOffset';
const HOUR_MS = 3_600_000;

/** The choices the settings offer, in hours ahead. */
export const TIME_STEPS: readonly { hours: number; label: string }[] = [
  { hours: 0, label: 'Now' },
  { hours: 1, label: '+1 hour' },
  { hours: 4, label: '+4 hours' },
  { hours: 24, label: '+1 day' },
  { hours: 168, label: '+1 week' },
];

function read(): number {
  try {
    const v = Number(sessionStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

/** How far ahead the deciding time is, in ms; 0 is now. */
export const timeOffset = signal(read());

export function setTimeOffset(ms: number): void {
  const v = Number.isFinite(ms) && ms > 0 ? Math.round(ms) : 0;
  timeOffset.value = v;
  try {
    if (v) sessionStorage.setItem(KEY, String(v));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Kept for this page only.
  }
}

/** The clock that decides; read in a component, it redraws when the offset changes. */
export const deciding = shiftedClock(() => timeOffset.value);
export const decidingNow = (): number => deciding.now();

/** "+1 day", "+5 hours", "+90 minutes": the offset as the banner says it. */
export function offsetLabel(ms: number): string {
  const step = TIME_STEPS.find((s) => s.hours * HOUR_MS === ms);
  if (step) return step.label;
  const hours = ms / HOUR_MS;
  if (hours >= 48 && Number.isInteger(hours / 24)) return `+${hours / 24} days`;
  if (Number.isInteger(hours)) return `+${hours} hours`;
  return `+${Math.round(ms / 60_000)} minutes`;
}
