// Replay (PLAN.md §4.8): every device's events, duplicates (device, n) dropped, ordered by
// (t, device, n), folded per card. Card state is never stored or merged: it is this fold, so a
// review made offline on one device can't be lost to another, and two devices that hold the same
// events compute the same states.
import type { KnownEvent, LogLine, RelapseEvent, SnapshotEvent } from './events.ts';
import { DEFAULT_PARAMS, newCard, review, validCard, type FsrsCard, type FsrsGrade, type FsrsParams } from './fsrs.ts';

export interface DeviceEvent {
  device: string;
  n: number;
  /** The event's time, ms since the epoch. */
  t: number;
  k: string;
  /** Set for the kinds this code knows; others are carried but skipped. */
  event?: KnownEvent;
  raw: string;
}

export interface CardState {
  card: FsrsCard;
  suspended: boolean;
  reviews: number;
  firstReview?: number;
  lastGrade?: FsrsGrade;
  /** When the move was first taught (§5.2); a card taught and never reviewed is in learning. */
  taught?: number;
  /** Set when a migrated state (§5.64) was taken. */
  snapshot?: true;
  /** The games whose relapse (§5.59) was folded, so each counts once. */
  relapses?: Set<string>;
}

const DAY_MS = 86_400_000;

export const order = (a: DeviceEvent, b: DeviceEvent) => a.t - b.t || (a.device < b.device ? -1 : a.device > b.device ? 1 : 0) || a.n - b.n;

export function toDeviceEvents(device: string, lines: readonly LogLine[]): DeviceEvent[] {
  return lines.map((l) => {
    const e: DeviceEvent = { device, n: l.n, t: Date.parse(l.t), k: l.k, raw: l.raw };
    if (l.event) e.event = l.event;
    return e;
  });
}

export function foldCard(events: readonly DeviceEvent[], params: FsrsParams = DEFAULT_PARAMS): CardState {
  const state: CardState = { card: newCard(), suspended: false, reviews: 0 };
  for (const { event, t } of events) {
    if (!event) continue;
    switch (event.k) {
      case 'review':
        state.card = review(state.card, event.g, t, params);
        state.reviews++;
        state.firstReview ??= t;
        state.lastGrade = event.g;
        break;
      case 'suspend':
        state.suspended = true;
        break;
      case 'unsuspend':
        state.suspended = false;
        break;
      case 'forget':
        state.card = newCard();
        delete state.lastGrade;
        delete state.taught;
        break;
      case 'taught':
        state.taught ??= t;
        break;
      // Pins and drills (§5.8) never change a card's schedule: core/train/pins.ts reads them.
      // Nor do alternatives (§5.18): core/train/alternatives.ts reads them; nor storm answers
      // (§5.41): core/storm/store.ts. Phase 5's kinds (§5.53) go to one function kept out of line,
      // so this loop stays as small as it was (the replay's timing test).
      default:
        if (event.k === 'snapshot' || event.k === 'relapse') foldPhase5(state, event, params);
    }
  }
  return state;
}

/**
 * mistake-lab's state (D15, §5.64), taken only by a card the site hasn't reviewed: its own
 * reviews win. A corrupt state starts new, as mistake-lab's SRS-8 rule does.
 */
function takeSnapshot(state: CardState, event: SnapshotEvent): void {
  if (state.reviews > 0 || state.snapshot) return;
  const last = Date.parse(event.last);
  const card: FsrsCard = { state: event.st, stability: event.stab, difficulty: event.diff, reps: event.reps, lapses: event.lapses, elapsedDays: 0, scheduledDays: event.sched };
  if (event.st !== 0) {
    card.lastReview = last;
    card.due = last + event.sched * DAY_MS;
  }
  state.card = validCard(card);
  state.snapshot = true;
  if (event.first !== undefined) state.firstReview = Date.parse(event.first);
  else if (event.st !== 0) state.firstReview ??= last;
}

/**
 * An Again at the game's time (§5.59), once per game, and never before the card's last review
 * or on a card never reviewed (mistake-lab's guards).
 */
function applyRelapse(state: CardState, event: RelapseEvent, params: FsrsParams): void {
  const games = (state.relapses ??= new Set<string>());
  if (games.has(event.g)) return;
  games.add(event.g);
  const at = Date.parse(event.at);
  const lastReview = state.card.lastReview;
  if (state.card.state === 0 || lastReview === undefined || lastReview >= at) return;
  state.card = review(state.card, 1, at, params);
  state.lastGrade = 1;
}

function foldPhase5(state: CardState, event: SnapshotEvent | RelapseEvent, params: FsrsParams): void {
  if (event.k === 'snapshot') takeSnapshot(state, event);
  else applyRelapse(state, event, params);
}

export interface DuplicateClash {
  device: string;
  n: number;
}

/**
 * The replayed state of every card, kept per card so that new events re-fold only the cards
 * they touch. Events of kinds this code doesn't know are kept (by device and n) but fold into
 * nothing.
 */
export class Replay {
  private readonly byCard = new Map<string, DeviceEvent[]>();
  private readonly seen = new Map<string, Map<number, string>>();
  readonly states = new Map<string, CardState>();
  /** The same (device, n) seen twice with different text: the first is kept. */
  readonly clashes: DuplicateClash[] = [];

  private readonly params: FsrsParams;

  constructor(params: FsrsParams = DEFAULT_PARAMS) {
    this.params = params;
  }

  /** Adds events; returns the cards whose state was recomputed. */
  add(events: Iterable<DeviceEvent>): Set<string> {
    const touched = new Set<string>();
    for (const e of events) {
      let ofDevice = this.seen.get(e.device);
      if (!ofDevice) this.seen.set(e.device, (ofDevice = new Map()));
      const before = ofDevice.get(e.n);
      if (before !== undefined) {
        if (before !== e.raw) this.clashes.push({ device: e.device, n: e.n });
        continue;
      }
      ofDevice.set(e.n, e.raw);
      if (!e.event) continue;
      const card = e.event.card;
      let list = this.byCard.get(card);
      if (!list) this.byCard.set(card, (list = []));
      // Usually the newest event: append; an older one (a device syncing late) goes in its place.
      if (list.length === 0 || order(list[list.length - 1]!, e) <= 0) list.push(e);
      else list.splice(list.findIndex((x) => order(x, e) > 0), 0, e);
      touched.add(card);
    }
    for (const card of touched) this.states.set(card, foldCard(this.byCard.get(card)!, this.params));
    return touched;
  }

  eventsOf(card: string): readonly DeviceEvent[] {
    return this.byCard.get(card) ?? [];
  }
}
