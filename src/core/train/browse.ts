// The training screen's line list (PLAN.md §5.16), after Qchess's Move Trainer: every chapter of
// the repertoire with its lines, each line's state, and the plans for training one line picked
// from the list, or learning a chapter's new lines, whatever the day's queue holds.
// - A line is new while it holds a move never answered (and not known), due when a move on it is
//   due today, learning while a move taught is waiting for its first review, else learned, with
//   the day its earliest move comes due.
// - A picked line asks every own move on it, as Qchess trains any line from its list: due moves
//   are graded as in the queue, moves never answered are taught (the daily limit paces the queue
//   only; a line the owner picks is learned whatever it says), and the rest are asked without a
//   grade, so practising a line ahead of time changes no schedule (Qchess: a line not due, trained,
//   is not saved). Suspended moves are still played for the user.
// - A paused line (§5.70) is listed as paused, outside the chapter's count; picked, it is practised:
//   every own move asked, nothing graded or taught.
import type { CardId } from '../progress/cards.ts';
import type { CardState } from '../progress/replay.ts';
import type { Line, RepertoireIndex } from '../repertoire/index.ts';
import { planSession, type SessionPlan } from './plan.ts';
import { dueAt, knownCardsOf, statusOf, type DailyQueue, type Day } from './queue.ts';
import type { TrainSettings } from './settings.ts';

export type LineState = 'new' | 'due' | 'learning' | 'learned' | 'paused';

export interface LineRow {
  line: Line;
  /** 1-based, within its chapter, in the index's order (Qchess's "Line 14"). */
  number: number;
  state: LineState;
  /** Moves never answered (to teach), and moves due today. */
  fresh: number;
  due: number;
  /** When the line's earliest move comes due (reviewed or learning moves), if any. */
  next?: number;
  /** Where the line leaves the chapter's previous line: its moves from here are its own. */
  fork: number;
}

export interface ChapterRows {
  sid: string;
  cid: string;
  lines: LineRow[];
  /** Active lines with nothing left to learn. */
  learned: number;
  dueLines: number;
  /** Paused lines (§5.70): outside `learned` and the chapter's count. */
  paused: number;
}

type States = ReadonlyMap<string, CardState>;

function isDue(state: CardState | undefined, settings: TrainSettings, day: Day): boolean {
  if (!state || state.suspended) return false;
  const at = dueAt(state, settings);
  if (at === undefined) return false;
  return statusOf(state) === 'learning' ? at <= day.now : at < day.end;
}

const fresh = (state: CardState | undefined) => statusOf(state) === 'fresh' && !state?.suspended;

/** The lines of every chapter in `scope` (one study, or all), grouped by chapter, in order. */
export function chapterRows(index: RepertoireIndex, states: States, settings: TrainSettings, day: Day, scope?: string): ChapterRows[] {
  const known = knownCardsOf(index);
  const out: ChapterRows[] = [];
  let current: ChapterRows | undefined;
  let previous: readonly string[] = [];
  for (const line of index.lines) {
    if (scope !== undefined && line.sid !== scope) continue;
    if (!current || current.sid !== line.sid || current.cid !== line.cid) {
      out.push((current = { sid: line.sid, cid: line.cid, lines: [], learned: 0, dueLines: 0, paused: 0 }));
      previous = [];
    }
    let fork = 0;
    while (fork < previous.length && fork < line.path.length && previous[fork] === line.path[fork]) fork++;
    previous = line.path;
    let freshCount = 0;
    let due = 0;
    let learning = false;
    let next: number | undefined;
    for (const card of new Set(line.cards)) {
      const state = states.get(card);
      if (fresh(state)) {
        // A known move (D19) is reviewed, not learned: it counts as due.
        if (known.has(card)) due++;
        else freshCount++;
        continue;
      }
      if (state?.suspended) continue;
      if (isDue(state, settings, day)) due++;
      if (statusOf(state) === 'learning') learning = true;
      const at = dueAt(state, settings);
      if (at !== undefined && (next === undefined || at < next)) next = at;
    }
    if (line.paused) {
      current.lines.push({ line, number: current.lines.length + 1, state: 'paused', fresh: freshCount, due: 0, fork });
      current.paused++;
      continue;
    }
    const state: LineState = freshCount > 0 ? 'new' : due > 0 ? 'due' : learning ? 'learning' : 'learned';
    const row: LineRow = { line, number: current.lines.length + 1, state, fresh: freshCount, due, fork };
    if (next !== undefined) row.next = next;
    current.lines.push(row);
    if (state !== 'new') current.learned++;
    if (due > 0) current.dueLines++;
  }
  return out;
}

/** The line of the index whose moves are `path`, in that chapter. */
export function findLine(index: RepertoireIndex, sid: string, cid: string, path: readonly string[]): Line | undefined {
  return index.lines.find((l) => l.sid === sid && l.cid === cid && l.path.length === path.length && l.path.every((san, i) => san === path[i]));
}

/**
 * One line picked from the list: walked whole; its due moves (and known moves never answered)
 * asked and graded, its moves never answered taught; the trainer asks the rest ungraded
 * (`practice`).
 */
export function pickedPlan(index: RepertoireIndex, states: States, settings: TrainSettings, day: Day, line: Line): SessionPlan {
  if (line.paused) return { lines: [{ kind: 'pick', line, end: line.path.length, ask: [], teach: [] }] };
  const known = knownCardsOf(index);
  const ask: CardId[] = [];
  const teach: CardId[] = [];
  for (const card of new Set(line.cards)) {
    const state = states.get(card);
    if (fresh(state)) (known.has(card) ? ask : teach).push(card);
    else if (isDue(state, settings, day)) ask.push(card);
  }
  return { lines: [{ kind: 'pick', line, end: line.path.length, ask, teach }] };
}

/**
 * "Learn" on a chapter (Qchess's "Learn 3/12"): the chapter's lines that still hold a move never
 * answered, in order, each walked whole, past the daily limit.
 */
export function learnPlan(index: RepertoireIndex, states: States, sid: string, cid: string): SessionPlan {
  const known = knownCardsOf(index);
  const newLines = index.lines.filter((l) => l.sid === sid && l.cid === cid && !l.known && !l.paused && l.cards.some((c) => !known.has(c) && fresh(states.get(c))));
  const queue: DailyQueue = { due: [], later: [], taughtToday: 0, room: 0, newLines, newCards: [], knownLines: [], knownCards: [], orphaned: [], pausedLines: 0 };
  return planSession(index, queue, states);
}
