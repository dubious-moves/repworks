// The day's mistakes (PLAN.md §5.8): the day's reviews graded Again, read from the log, so they
// are the same on every device and survive a reload. Each is shown with the move asked, the
// moves tried, and a line it is met on. Retry walks that line from its start, playing everything
// up to the failed move, and asks it; drill starts at the position before the opponent's last
// move (lichessable's lead-in). Neither grades the card again: it was graded Again today.
import type { CardId } from '../progress/cards.ts';
import type { DeviceEvent } from '../progress/replay.ts';
import type { Line, Occurrence, RepertoireIndex } from '../repertoire/index.ts';
import type { PlannedLine } from './plan.ts';
import type { Day } from './queue.ts';

export interface Mistake {
  card: CardId;
  /** The latest Again of the day. */
  t: number;
  /** Wrong moves tried, in UCI. */
  wrong: string[];
  hint: boolean;
  /** Where the move is played, and a line through it with the move's index in its path. */
  at: Occurrence;
  line: Line;
  ply: number;
}

/** A line through an occurrence: the first in the index's order whose path passes its move. */
export function lineThrough(index: RepertoireIndex, at: Occurrence): { line: Line; ply: number } | undefined {
  const ply = at.path.length - 1;
  const line = index.lines.find((l) => l.sid === at.sid && l.cid === at.cid && l.path.length > ply && at.path.every((san, i) => l.path[i] === san));
  return line ? { line, ply } : undefined;
}

/** A card's line: through its first occurrence in the index. */
export function cardLine(index: RepertoireIndex, card: CardId): { at: Occurrence; line: Line; ply: number } | undefined {
  const at = index.cards.get(card)?.[0];
  const through = at && lineThrough(index, at);
  return at && through ? { at, ...through } : undefined;
}

/** The day's reviews graded Again, one per card (its latest), the earliest first. */
export function todaysMistakes(index: RepertoireIndex, eventsOf: (card: string) => readonly DeviceEvent[], day: Day): Mistake[] {
  const out: Mistake[] = [];
  for (const card of index.cards.keys()) {
    let last: Mistake | undefined;
    for (const { event, t } of eventsOf(card)) {
      if (event?.k !== 'review' || event.g !== 1 || t < day.start || t >= day.end) continue;
      const where = cardLine(index, card);
      if (!where) continue;
      last = { card, t, wrong: event.w ?? [], hint: event.h === 1, ...where };
    }
    if (last) out.push(last);
  }
  return out.sort((a, b) => a.t - b.t || (a.card < b.card ? -1 : 1));
}

/** Retry: each card's line from its start up to the move, which is asked. */
export function retryLines(items: readonly { card: CardId; line: Line; ply: number }[]): PlannedLine[] {
  return items.map((m) => ({ kind: 'review', line: m.line, end: m.ply + 1, ask: [m.card], teach: [] }));
}

/** Drill: from the position before the opponent's last move, that move played, then the ask. */
export function drillLines(items: readonly { card: CardId; line: Line; ply: number }[]): PlannedLine[] {
  return items.map((m) => ({ kind: 'review', line: m.line, end: m.ply + 1, ask: [m.card], teach: [], from: Math.max(0, m.ply - 1) }));
}
