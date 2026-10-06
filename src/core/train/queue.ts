// The daily queue (PLAN.md §5.3): what today's training holds.
// - Due: cards reviewed before whose due time falls before the day's end, and cards taught but
//   not yet reviewed whose learning step (§5.2) has passed. The earliest first.
// - New lines: lines of chapters not marked known that still hold a card never taught or
//   reviewed, in the index's order, taken whole while the day's limit of new moves has room.
//   The limit counts the cards taught in the day, from every device's log.
// - Known lines: lines of chapters marked known with a card never reviewed. Those cards skip
//   teaching and the limit; their first answer is an ordinary review.
// Core has no clock: the app passes in the day's bounds (the device's local midnights) and now.
import type { CardId } from '../progress/cards.ts';
import type { CardState } from '../progress/replay.ts';
import type { Line, RepertoireIndex } from '../repertoire/index.ts';
import type { TrainSettings } from './settings.ts';

const HOUR_MS = 3_600_000;

/** Today, by the device's calendar, in ms since the epoch: [start, end), and the time now. */
export interface Day {
  start: number;
  end: number;
  now: number;
}

/**
 * Where a card stands:
 * - `fresh`: never taught, never reviewed (or forgotten since);
 * - `learning`: taught, waiting for its first review;
 * - `review`: reviewed at least once, with a due time.
 */
export type CardStatus = 'fresh' | 'learning' | 'review';

export function statusOf(state: CardState | undefined): CardStatus {
  if (state?.card.due !== undefined) return 'review';
  return state?.taught !== undefined ? 'learning' : 'fresh';
}

/** When a card is due: its FSRS due time, or the end of its learning step; undefined if fresh. */
export function dueAt(state: CardState | undefined, settings: TrainSettings): number | undefined {
  if (state?.card.due !== undefined) return state.card.due;
  return state?.taught !== undefined ? state.taught + settings.learnStepHours * HOUR_MS : undefined;
}

export interface DueCard {
  card: CardId;
  due: number;
  /** Taught and not yet reviewed: this is its first review. */
  learning: boolean;
}

export interface DailyQueue {
  /** The study the queue is for, or undefined for the whole repertoire. */
  scope?: string;
  /** Cards to review now, the earliest due first. */
  due: DueCard[];
  /** Cards whose learning step ends later today: they join `due` then. */
  later: DueCard[];
  /** Cards taught today on any device, in or out of scope: the daily limit counts these. */
  taughtToday: number;
  /** New moves the limit still allows today (never below 0). */
  room: number;
  /** Today's new lines, in the index's order. */
  newLines: Line[];
  /** The cards those lines teach, each once, in order of first appearance. */
  newCards: CardId[];
  /** Lines of known chapters that hold a card never reviewed, in the index's order. */
  knownLines: Line[];
  /** The known pool's cards never reviewed, each once. */
  knownCards: CardId[];
  /** Cards with events whose move is no longer in the repertoire: left out, and counted. */
  orphaned: CardId[];
}

export interface QueueOptions {
  /** One study's sid, or undefined for the whole repertoire. */
  scope?: string;
}

/**
 * A card met on a known chapter's line is known wherever else it is met: its move was learned
 * before, so it is never taught first and never uses the limit.
 */
export function knownCardsOf(index: RepertoireIndex): Set<CardId> {
  const known = new Set<CardId>();
  for (const line of index.lines) if (line.known) for (const card of line.cards) known.add(card);
  return known;
}

export function todaysQueue(index: RepertoireIndex, states: ReadonlyMap<string, CardState>, settings: TrainSettings, day: Day, options: QueueOptions = {}): DailyQueue {
  const { scope } = options;
  const inScope = (card: CardId) => scope === undefined || (index.cards.get(card) ?? []).some((o) => o.sid === scope);
  const fresh = (card: CardId) => {
    const state = states.get(card);
    return statusOf(state) === 'fresh' && !state?.suspended;
  };

  const due: DueCard[] = [];
  const later: DueCard[] = [];
  for (const card of index.cards.keys()) {
    const state = states.get(card);
    if (!state || state.suspended || !inScope(card)) continue;
    const at = dueAt(state, settings);
    if (at === undefined) continue;
    const learning = statusOf(state) === 'learning';
    // A reviewed card is due for the whole of its due day; a learning step ends at its time.
    if (learning ? at <= day.now : at < day.end) due.push({ card, due: at, learning });
    else if (learning && at < day.end) later.push({ card, due: at, learning });
  }
  const byDue = (a: DueCard, b: DueCard) => a.due - b.due || (a.card < b.card ? -1 : a.card > b.card ? 1 : 0);
  due.sort(byDue);
  later.sort(byDue);

  let taughtToday = 0;
  for (const state of states.values()) if (state.taught !== undefined && state.taught >= day.start && state.taught < day.end) taughtToday++;
  const room = Math.max(0, settings.newPerDay - taughtToday);

  const known = knownCardsOf(index);
  const lines = index.lines.filter((l) => scope === undefined || l.sid === scope);

  const newLines: Line[] = [];
  const newCards: CardId[] = [];
  const taken = new Set<CardId>();
  for (const line of lines) {
    if (line.known) continue;
    if (newCards.length >= room) break;
    const brings = [...new Set(line.cards)].filter((c) => !known.has(c) && !taken.has(c) && fresh(c));
    if (brings.length === 0) continue;
    // Taken whole, even past the limit: the day's new material is whole lines.
    newLines.push(line);
    for (const c of brings) {
      taken.add(c);
      newCards.push(c);
    }
  }

  const knownLines: Line[] = [];
  const knownCards: CardId[] = [];
  const pooled = new Set<CardId>();
  for (const line of lines) {
    if (!line.known) continue;
    const brings = [...new Set(line.cards)].filter((c) => !pooled.has(c) && fresh(c));
    if (brings.length === 0) continue;
    knownLines.push(line);
    for (const c of brings) {
      pooled.add(c);
      knownCards.push(c);
    }
  }

  const orphaned: CardId[] = [];
  // Reviewed or taught: a move only ever saved as an alternative (§5.18) was never trained.
  for (const [card, s] of states) if (card.startsWith('r|') && !index.cards.has(card as CardId) && (s.reviews > 0 || s.taught !== undefined)) orphaned.push(card as CardId);
  orphaned.sort();

  const queue: DailyQueue = { due, later, taughtToday, room, newLines, newCards, knownLines, knownCards, orphaned };
  if (scope !== undefined) queue.scope = scope;
  return queue;
}
