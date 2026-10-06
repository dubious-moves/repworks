// Undo and redo for the editing session (PLAN.md §4.11): every edit returns a new chapter
// (§4.6), so a step back is keeping the old value. Each entry carries the move shown with it.

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

/** How many steps back are kept. */
export const UNDO_LIMIT = 200;

export const startHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] });

export function record<T>(history: History<T>, next: T): History<T> {
  return { past: [...history.past, history.present].slice(-UNDO_LIMIT), present: next, future: [] };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1];
  if (previous === undefined) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}
