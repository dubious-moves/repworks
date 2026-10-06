// The line planner (PLAN.md §5.4): which lines today's session walks, and what each one asks.
// - Review lines first: going through the lines in the index's order, each line that holds a due
//   card not yet covered is taken, up to its last such card (nothing after it would be asked).
//   Consecutive lines then share prefixes, so the board's positions follow on from each other.
// - Then today's new lines (§5.3), walked whole; then the known pool, line by line, each up to
//   its last card never reviewed.
// On the way, a card never answered is taught where it is first met (§5.6), or asked if it is
// known; every card is asked or taught at most once in a plan. A line left with nothing to ask or
// teach is dropped. The plan is data: the trainer may still change course when a conflict move
// is played.
import type { CardId } from '../progress/cards.ts';
import type { CardState } from '../progress/replay.ts';
import type { Line, RepertoireIndex } from '../repertoire/index.ts';
import { knownCardsOf, statusOf, type DailyQueue } from './queue.ts';

export type PlannedKind = 'review' | 'new' | 'known';

export interface PlannedLine {
  kind: PlannedKind;
  line: Line;
  /** How many of the line's moves are walked: the line's `path.slice(0, end)`. */
  end: number;
  /** Cards graded here: due cards, and known cards never reviewed. */
  ask: CardId[];
  /** Cards never answered, shown here and then played (§5.6). */
  teach: CardId[];
  /** Where the walk starts, as a number of moves already on the board (drill's lead-in, §5.8). */
  from?: number;
}

export interface SessionPlan {
  lines: PlannedLine[];
}

export function planSession(index: RepertoireIndex, queue: DailyQueue, states: ReadonlyMap<string, CardState>): SessionPlan {
  const lines = index.lines.filter((l) => queue.scope === undefined || l.sid === queue.scope);
  const due = new Set<CardId>(queue.due.map((d) => d.card));
  const known = knownCardsOf(index);
  const handled = new Set<CardId>();
  const out: PlannedLine[] = [];

  const unanswered = (card: CardId) => {
    const state = states.get(card);
    return statusOf(state) === 'fresh' && !state?.suspended;
  };
  /** The asks and teaches of a line's first `end` moves, for cards not handled yet. */
  const walk = (kind: PlannedKind, line: Line, end: number) => {
    const ask: CardId[] = [];
    const teach: CardId[] = [];
    line.cards.forEach((card, i) => {
      if (line.plies[i]! >= end || handled.has(card)) return;
      if (due.has(card) || (unanswered(card) && known.has(card))) ask.push(card);
      else if (unanswered(card)) teach.push(card);
      else return;
      handled.add(card);
    });
    if (ask.length + teach.length > 0) out.push({ kind, line, end, ask, teach });
  };
  /** One past the ply of the line's last card that `wanted` picks and that isn't handled yet. */
  const endAt = (line: Line, wanted: (card: CardId) => boolean) => {
    let end = 0;
    line.cards.forEach((card, i) => {
      if (wanted(card) && !handled.has(card)) end = line.plies[i]! + 1;
    });
    return end;
  };

  for (const line of lines) {
    const end = endAt(line, (c) => due.has(c));
    if (end > 0) walk('review', line, end);
  }
  for (const line of queue.newLines) walk('new', line, line.path.length);
  for (const line of queue.knownLines) {
    const end = endAt(line, (c) => known.has(c) && unanswered(c));
    if (end > 0) walk('known', line, end);
  }
  return { lines: out };
}
