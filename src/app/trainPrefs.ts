// The training settings kept per device (PLAN.md §5.17), beside the pace and speech: none of them
// changes a card's state, so none needs syncing. In localStorage, read once and written on change.
import { signal } from '@preact/signals';
import { AUTO_PLAYS, LINE_STARTS, type AutoPlay, type LineStart } from '../core/train/trainer.ts';

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
  autoPlay: AutoPlay;
}

export const DEFAULT_PREFS: TrainPrefs = { newMoves: 'show', sequenceLength: 5, lineEnd: 'wait', startQueue: 'first', startLearn: 'auto', autoPlay: 'due' };

const KEY = 'repworks.trainPrefs';

/** The stored settings, each field checked: an unknown value is the default. */
export function parsePrefs(raw: string | null): TrainPrefs {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') v = parsed as Record<string, unknown>;
  } catch {
    // The defaults.
  }
  const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(value as T) ? (value as T) : fallback);
  return {
    newMoves: pick(v.newMoves, ['show', 'try', 'sequence'], DEFAULT_PREFS.newMoves),
    sequenceLength: Number.isInteger(v.sequenceLength) && (v.sequenceLength as number) >= 1 && (v.sequenceLength as number) <= 50 ? (v.sequenceLength as number) : DEFAULT_PREFS.sequenceLength,
    lineEnd: pick(v.lineEnd, ['wait', 'go'], DEFAULT_PREFS.lineEnd),
    startQueue: pick(v.startQueue, LINE_STARTS, DEFAULT_PREFS.startQueue),
    startLearn: pick(v.startLearn, LINE_STARTS, DEFAULT_PREFS.startLearn),
    autoPlay: pick(v.autoPlay, AUTO_PLAYS, DEFAULT_PREFS.autoPlay),
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
