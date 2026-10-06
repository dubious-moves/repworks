// Pinned mistakes (PLAN.md §5.8), lichessable's design as progress events: `pin`, `unpin`, and
// a `drill` for each drill answer on a pinned card. Replay derives each pin's streak:
// - a pin is due 30 minutes after it is made;
// - a clean answer when due moves it to the next step, 4 hours, then 24 hours; the third clean
//   answer in a row retires it;
// - a miss, early or not, sends it back to the first step, due 30 minutes later;
// - a clean answer before the pin is due earns nothing (drilled on request, no credit).
// Pins never touch a card's FSRS state. Events come in replay's order, from every device.
import type { DeviceEvent } from '../progress/replay.ts';

const MINUTE = 60_000;
/** After the pin or a miss, then after each clean answer. */
export const PIN_STEPS_MS = [30 * MINUTE, 4 * 60 * MINUTE, 24 * 60 * MINUTE] as const;
export const CLEAN_TO_RETIRE = 3;

export interface PinState {
  pinned: boolean;
  /** Clean answers in a row, when due. */
  streak: number;
  /** When it is next due (while pinned). */
  due: number;
  /** When it was pinned (the latest pin). */
  pinnedAt: number;
  /** Retired by three clean answers in a row. */
  retired: boolean;
}

/** One card's pin, from its events in replay order; undefined if it was never pinned. */
export function pinOf(events: readonly DeviceEvent[]): PinState | undefined {
  let pin: PinState | undefined;
  for (const { event, t } of events) {
    if (!event) continue;
    switch (event.k) {
      case 'pin':
        if (!pin?.pinned) pin = { pinned: true, streak: 0, due: t + PIN_STEPS_MS[0], pinnedAt: t, retired: false };
        break;
      case 'unpin':
        if (pin) pin.pinned = false;
        break;
      case 'drill':
        if (!pin?.pinned) break;
        if (!event.ok) {
          pin.streak = 0;
          pin.due = t + PIN_STEPS_MS[0];
        } else if (t >= pin.due) {
          pin.streak++;
          if (pin.streak >= CLEAN_TO_RETIRE) {
            pin.pinned = false;
            pin.retired = true;
          } else pin.due = t + PIN_STEPS_MS[pin.streak]!;
        }
        break;
    }
  }
  return pin;
}

/** Every pinned card's state, from a replay's events per card. */
export function pinsOf(cards: Iterable<string>, eventsOf: (card: string) => readonly DeviceEvent[]): Map<string, PinState> {
  const out = new Map<string, PinState>();
  for (const card of cards) {
    const events = eventsOf(card);
    if (!events.some((e) => e.event?.k === 'pin')) continue;
    const pin = pinOf(events);
    if (pin) out.set(card, pin);
  }
  return out;
}
