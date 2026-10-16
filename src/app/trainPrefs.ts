// The training settings kept per device (PLAN.md §5.17), beside the pace and speech: none of them
// changes a card's state, so none needs syncing. In localStorage, read once and written on change.
import { signal } from '@preact/signals';
import { AUTO_PLAYS, COMMENT_QUIZZES, LINE_STARTS, type AutoPlay, type CommentQuiz, type LineStart } from '../core/train/trainer.ts';

export interface TrainPrefs {
  /**
   * New moves: shown with their arrow, tried first (the arrow after a wrong move or Hint), or
   * shown as a sequence of `sequenceLength` new moves, then replayed from its start (Chessable's way).
   */
  newMoves: 'show' | 'try' | 'sequence';
  sequenceLength: number;
  /** At a line's end (a line picked, Learn): wait for "Next line", or go on by itself. */
  lineEnd: 'wait' | 'go';
  /** Where a line starts in the day's queue, and in a line picked or learned. */
  startQueue: LineStart;
  startLearn: LineStart;
  /** Auto-play in the day's queue (and show and grade), and in a line picked or learned (§5.113). */
  autoPlayQueue: AutoPlay;
  autoPlayLearn: AutoPlay;
  /** How many times a line is walked when a move on it is learned (1–5): the owner's request, 2026-10-08. */
  repetitions: number;
  /** At a line's end, each move missed on it is asked until right this many times in a row (0–5; 0: not). */
  mistakeRetries: number;
  /** In review, the lines from the comments quizzed at a line's end (the owner's request, 2026-10-12). */
  comments: CommentQuiz;
}

export const DEFAULT_PREFS: TrainPrefs = { newMoves: 'show', sequenceLength: 5, lineEnd: 'wait', startQueue: 'first', startLearn: 'start', autoPlayQueue: 'due', autoPlayLearn: 'off', repetitions: 2, mistakeRetries: 2, comments: 'all' };

const KEY = 'repworks.trainPrefs';

/**
 * The stored settings, each field checked: an unknown value is the default. Settings stored before
 * §5.113: one `autoPlay` for both, and a line starting from the start `auto` (played) or `ask`
 * (asked), now "from the start" with auto-play off.
 */
export function parsePrefs(raw: string | null): TrainPrefs {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') v = parsed as Record<string, unknown>;
  } catch {
    // The defaults.
  }
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
  const start = (value: unknown, fallback: LineStart): LineStart => (value === 'auto' || value === 'ask' ? 'start' : pick(value, LINE_STARTS, fallback));
  const whole = (value: unknown, min: number, max: number, fallback: number) => (Number.isInteger(value) && (value as number) >= min && (value as number) <= max ? (value as number) : fallback);
  return {
    newMoves: pick(v.newMoves, ['show', 'try', 'sequence'], DEFAULT_PREFS.newMoves),
    sequenceLength: whole(v.sequenceLength, 1, 50, DEFAULT_PREFS.sequenceLength),
    lineEnd: pick(v.lineEnd, ['wait', 'go'], DEFAULT_PREFS.lineEnd),
    startQueue: start(v.startQueue, DEFAULT_PREFS.startQueue),
    startLearn: start(v.startLearn, DEFAULT_PREFS.startLearn),
    autoPlayQueue: v.startQueue === 'ask' ? 'off' : pick(v.autoPlayQueue ?? v.autoPlay, AUTO_PLAYS, DEFAULT_PREFS.autoPlayQueue),
    autoPlayLearn: v.startLearn === 'ask' ? 'off' : pick(v.autoPlayLearn ?? v.autoPlay, AUTO_PLAYS, DEFAULT_PREFS.autoPlayLearn),
    repetitions: whole(v.repetitions, 1, 5, DEFAULT_PREFS.repetitions),
    mistakeRetries: whole(v.mistakeRetries, 0, 5, DEFAULT_PREFS.mistakeRetries),
    comments: pick(v.comments, COMMENT_QUIZZES, DEFAULT_PREFS.comments),
  };
}

function read(): TrainPrefs {
  try {
    return parsePrefs(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export const trainPrefs = signal<TrainPrefs>(read());

export function saveTrainPrefs(next: TrainPrefs): void {
  trainPrefs.value = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Kept for this page only.
  }
}
