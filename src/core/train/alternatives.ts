// Alternative moves (PLAN.md §5.18, Chessable's): a move saved for a position as good but not the
// repertoire's. Played where the repertoire's own move is asked, it is taken back for free.
// Progress events (`alt`, `on` true or false) keyed as repertoire cards are, by position and move,
// so one saved once holds in every chapter and transposition reaching that position, for that
// side. The last event of a move, in replay's order, decides; events come from every device.
import type { PositionKey } from '../chess/positionKey.ts';
import { parseCard, type CardId } from '../progress/cards.ts';
import type { DeviceEvent } from '../progress/replay.ts';

/** The moves saved as alternatives, from a replay's events per card. */
export function alternativesOf(cards: Iterable<string>, eventsOf: (card: string) => readonly DeviceEvent[]): Set<CardId> {
  const out = new Set<CardId>();
  for (const card of cards) {
    let on: boolean | undefined;
    for (const { event } of eventsOf(card)) if (event?.k === 'alt') on = event.on;
    if (on) out.add(card as CardId);
  }
  return out;
}

/** The alternatives saved at a position, as UCI moves, in order. */
export function alternativesAt(alts: Iterable<CardId>, key: PositionKey): string[] {
  const out: string[] = [];
  for (const card of alts) {
    const parsed = parseCard(card);
    if (parsed?.kind === 'repertoire' && parsed.key === key) out.push(parsed.uci);
  }
  return out.sort();
}
