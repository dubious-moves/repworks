// What the progress log says about storm positions and puzzles (PLAN.md §5.41), lichessable's
// retention rule (§14.11, §14.15, §14.16) read from events instead of a synced store: a position
// answered well is done, on every device, for `goneDays`; one missed stays, queued behind the
// positions never seen (§14.15: misses go to the back). And the store's draw order
// (`stormStoreDraw`). Pure.
import type { DeviceEvent } from '../progress/replay.ts';
import type { StormEvent } from '../progress/events.ts';
import type { StormConfig } from './config.ts';

const DAY = 24 * 60 * 60 * 1000;

export interface StormHistory {
  /** Answered well within `goneDays`: not dealt again. */
  done: boolean;
  /** Answers since the last clean one that weren't clean (unknown aside). */
  misses: number;
  answers: number;
  /** The latest answer's time. */
  last?: number;
}

/** One card's history from its events in replay order. */
export function stormHistory(events: readonly DeviceEvent[], now: number, c: StormConfig): StormHistory {
  let lastClean: number | undefined;
  let misses = 0;
  let answers = 0;
  let last: number | undefined;
  for (const { event, t } of events) {
    if (event?.k !== 'storm') continue;
    answers++;
    last = t;
    if (c.storeDropOn.includes(event.b)) {
      lastClean = t;
      misses = 0;
    } else if (event.b !== 'unknown') misses++;
  }
  // A position missed after it was answered well is back: the latest clean answer must be the latest graded one.
  const done = lastClean !== undefined && misses === 0 && lastClean > 0 && now - lastClean < c.goneDays * DAY;
  const out: StormHistory = { done, misses, answers };
  if (last !== undefined) out.last = last;
  return out;
}

/** Every storm card's history (`s|…` and `z|…`), from a replay's cards and events. */
export function stormHistories(cards: Iterable<string>, eventsOf: (card: string) => readonly DeviceEvent[], now: number, c: StormConfig): Map<string, StormHistory> {
  const out = new Map<string, StormHistory>();
  for (const card of cards) {
    if (!card.startsWith('s|') && !card.startsWith('z|')) continue;
    out.set(card, stormHistory(eventsOf(card), now, c));
  }
  return out;
}

export interface Drawable {
  card: string;
  /** Scored by a Stockfish list at the standard depth (§23.8: dealt first among equals). */
  deep?: boolean;
  /** How often the line is reached, in games (§14.19), when known. */
  games?: number | null;
}

/**
 * The deal order (§14.15, §23.8, §14.19): done positions left out; then by misses, fewest first
 * (never seen first, the most missed last), then deepened, then reach, then at random.
 */
export function drawOrder<T extends Drawable>(items: readonly T[], histories: ReadonlyMap<string, StormHistory>, rnd: () => number): T[] {
  const keyed = items
    .filter((it) => !histories.get(it.card)?.done)
    .map((it) => {
      const h = histories.get(it.card);
      return { it, misses: h?.misses ?? 0, deep: it.deep ? 1 : 0, reach: typeof it.games === 'number' ? it.games : -1, r: rnd() };
    });
  keyed.sort((a, b) => a.misses - b.misses || b.deep - a.deep || b.reach - a.reach || a.r - b.r);
  return keyed.map((k) => k.it);
}

/** The event an answer writes (without its device fields). */
export function stormAnswer(card: string, b: StormEvent['b'], o: { uci?: string; wp?: number | null; set?: boolean; chapter?: string } = {}): Omit<StormEvent, 'v' | 'n' | 't'> {
  const e: Omit<StormEvent, 'v' | 'n' | 't'> = { k: 'storm', card, b };
  if (o.uci) e.u = o.uci;
  if (typeof o.wp === 'number' && Number.isFinite(o.wp)) e.wp = Math.max(0, Math.min(1000, Math.round(o.wp * 10)));
  if (o.set) e.m = 'set';
  if (o.chapter) e.c = o.chapter;
  return e;
}
