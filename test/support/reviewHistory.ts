// Review events for the progress tests and the replay benchmark: one device's events, and a
// random history of reviews over many cards, every few hours.
import { formatEvent, type KnownEvent } from '../../src/core/progress/events.ts';
import type { DeviceEvent } from '../../src/core/progress/replay.ts';
import { mulberry32 } from './random.ts';

export const DAY = 86_400_000;
export const iso = (ms: number) => new Date(ms).toISOString();
export const t0 = Date.UTC(2026, 9, 1, 8);

export function reviewEvent(n: number, t: number, card: string, g: 1 | 2 | 3 | 4): KnownEvent {
  return { v: 1, n, t: iso(t), k: 'review', card, g };
}
export const asDevice = (device: string, events: KnownEvent[]): DeviceEvent[] =>
  events.map((e) => ({ device, n: e.n, t: Date.parse(e.t), k: e.k, event: e, raw: formatEvent(e) }));

export function randomHistory(seed: number, count: number, cards: number) {
  const random = mulberry32(seed);
  const events: { t: number; card: string; g: 1 | 2 | 3 | 4 }[] = [];
  let t = t0;
  for (let i = 0; i < count; i++) {
    t += Math.floor(random() * DAY * 0.3);
    events.push({ t, card: `r|card${Math.floor(random() * cards)}|e2e4`, g: (1 + Math.floor(random() * 4)) as 1 | 2 | 3 | 4 });
  }
  return events;
}
