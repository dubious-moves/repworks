// The game cards' deck and the day's queue (PLAN.md §5.53): every item the games give, less the
// ones dropped (and a tactic whose lines are all dropped), with the saved items and the plan
// cards; due cards first, then new ones by the size of the drop, as mistake-lab's queue orders
// them, with a daily limit of new cards. A card's rank (§5.171: high, normal, low) comes before
// both orders. Pure.
import { gameCard, type CardId } from '../progress/cards.ts';
import type { CardRank } from '../progress/events.ts';
import type { CardState, DeviceEvent } from '../progress/replay.ts';
import { shownItems, type GameItem, type TacticItem } from './extract.ts';
import type { PlanItem } from './plans.ts';

export interface DropState {
  /** The item is out of the deck. */
  dropped: boolean;
  /** A tactic's lines taken out, by their UCI moves joined with commas. */
  lines: Set<string>;
}

/** The drops of one card, the latest event deciding each (the item, or each line). */
export function dropsOf(events: readonly DeviceEvent[]): DropState {
  let dropped = false;
  const lines = new Map<string, boolean>();
  for (const { event } of events) {
    if (event?.k !== 'drop') continue;
    if (event.line === undefined) dropped = event.on;
    else lines.set(event.line, event.on);
  }
  return { dropped, lines: new Set([...lines].filter(([, on]) => on).map(([l]) => l)) };
}

export const lineFingerprint = (line: readonly { uci: string }[]) => line.map((m) => m.uci).join(',');

/** A tactic's lines still in play. */
export function liveLines(item: TacticItem, drops: DropState): TacticItem['lines'] {
  return item.lines.filter((l) => !drops.lines.has(lineFingerprint(l)));
}

export interface DeckCard {
  card: CardId;
  item: GameItem | PlanItem;
}

/**
 * "Hide time trouble" (§6, item 5; mistake-lab's `hideTimeTrouble` in `applyFilters`): the
 * mistakes made in time trouble left out of the list and the deck, tactics and advantages kept.
 */
export function withoutTimeTrouble<I extends { kind: string; timeTrouble?: boolean }>(items: readonly I[], hide: boolean): readonly I[] {
  return hide ? items.filter((i) => !(i.kind === 'mistake' && i.timeTrouble)) : items;
}

/** The deck: the games' items as mistake-lab shows them, less the dropped, with saved items. */
export function deckOf(itemsByGame: Iterable<readonly GameItem[]>, saved: readonly GameItem[], eventsOf: (card: string) => readonly DeviceEvent[]): DeckCard[] {
  const out: DeckCard[] = [];
  const dropCache = new Map<string, DropState>();
  const drops = (pid: string) => {
    let d = dropCache.get(pid);
    if (!d) dropCache.set(pid, (d = dropsOf(eventsOf(gameCard(pid)))));
    return d;
  };
  const isDropped = (it: GameItem) => {
    const d = drops(it.pid);
    if (d.dropped) return true;
    return it.kind === 'tactic' && liveLines(it, d).length === 0;
  };
  for (const items of itemsByGame) {
    const byPid = new Map(items.map((it) => [it.pid, it]));
    for (const it of shownItems(items, (pid) => isDropped(byPid.get(pid)!))) out.push({ card: gameCard(it.pid), item: it });
  }
  for (const it of saved) if (!isDropped(it)) out.push({ card: gameCard(it.pid), item: it });
  return out;
}

/** A card's rank: its latest `rank` event, `normal` when it has none. */
export function rankOf(events: readonly DeviceEvent[]): CardRank {
  let rank: CardRank = 'normal';
  for (const { event } of events) if (event?.k === 'rank') rank = event.p;
  return rank;
}

const RANK_ORDER: Record<CardRank, number> = { high: 0, normal: 1, low: 2 };

export interface GameQueue {
  due: DeckCard[];
  /** New cards for today, within the limit. */
  fresh: DeckCard[];
  /** New cards past today's limit. */
  waiting: number;
  /** New cards already started today. */
  startedToday: number;
}

export interface QueueDay {
  start: number;
  end: number;
}

/** Whether a card has been reviewed (or carried over with a state). */
const isNew = (s: CardState | undefined) => !s || s.card.state === 0;

/**
 * The day's queue: due cards by rank, then by when they fell due; new cards by rank, then by the
 * drop, the high ones first within the daily limit. `rank` is `normal` for every card when left out.
 */
export function gameQueue<T extends { card: CardId; item?: { wpDrop?: number } }>(
  deck: readonly T[],
  states: ReadonlyMap<string, CardState>,
  day: QueueDay,
  newPerDay: number,
  rank?: (card: CardId) => CardRank,
): { due: T[]; fresh: T[]; waiting: number; startedToday: number } {
  const order = (c: T) => (rank ? RANK_ORDER[rank(c.card)] : 1);
  const due: { c: T; at: number; r: number }[] = [];
  const fresh: { c: T; r: number }[] = [];
  let startedToday = 0;
  for (const c of deck) {
    const s = states.get(c.card);
    if (isNew(s)) {
      fresh.push({ c, r: order(c) });
      continue;
    }
    if (s!.firstReview !== undefined && s!.firstReview >= day.start && s!.firstReview < day.end && !s!.snapshot) startedToday++;
    if (s!.suspended) continue;
    const at = s!.card.due ?? 0;
    if (at < day.end) due.push({ c, at, r: order(c) });
  }
  due.sort((a, b) => a.r - b.r || a.at - b.at);
  fresh.sort((a, b) => a.r - b.r || (b.c.item?.wpDrop ?? 0) - (a.c.item?.wpDrop ?? 0));
  const room = Math.max(0, newPerDay - startedToday);
  return { due: due.map((d) => d.c), fresh: fresh.slice(0, room).map((f) => f.c), waiting: Math.max(0, fresh.length - room), startedToday };
}
